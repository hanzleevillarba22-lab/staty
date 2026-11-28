import { type FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { db } from '../db.ts';
import { sanitizeText } from '../security.ts';
import {
  applyCleaningPreview,
  type CleaningOperation,
  type DataType,
  type MeasurementLevel,
  type VariableMetadata,
} from './dataProcessing.ts';
import { recommendStatisticalTest } from './recommendationEngine.ts';
import {
  generateDocxReport,
  generateExcelReport,
  generatePdfReport,
  type ReportSourceData,
} from './reportGenerator.ts';
import {
  calculateSamplePower,
  type PowerProcedure,
  runChiSquareIndependence,
  runCronbachAlpha,
  runIndependentTTest,
  runKruskalWallis,
  runMannWhitneyU,
  runMultipleRegression,
  runOneWayAnova,
  runPairedTTest,
  runPearsonCorrelation,
  runSpearmanCorrelation,
  runWilcoxonSignedRank,
  type StatisticalComputationResult,
} from './statisticalEngine.ts';

export type StatyEmotion =
  | 'idle'
  | 'happy'
  | 'thinking'
  | 'confused'
  | 'excited'
  | 'explaining'
  | 'listening'
  | 'processing'
  | 'success'
  | 'error'
  | 'greeting';

export type StatyGestureName =
  | 'none'
  | 'nod'
  | 'tilt'
  | 'ear-perk'
  | 'bounce'
  | 'shake'
  | 'wave-wink';

export interface StatyActionItem {
  type:
    | 'project_created'
    | 'note_added'
    | 'dataset_created'
    | 'dataset_cleaned'
    | 'analysis_saved'
    | 'report_generated'
    | 'navigate';
  label: string;
  route?: string;
  contextLabel?: string;
  entityId?: number;
}

function isRealKey(key: string | undefined): key is string {
  const k = (key ?? '').trim();
  return k !== '' && k !== 'MY_GEMINI_API_KEY';
}

function resolveApiKey(): string | undefined {
  if (isRealKey(process.env.GEMINI_API_KEY)) return process.env.GEMINI_API_KEY!.trim();
  return undefined;
}

export function isGeminiConfigured(): boolean {
  return Boolean(resolveApiKey());
}

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: resolveApiKey(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractRawErrorMessage(err: unknown): string {
  if (!err) return 'Unknown AI service error.';
  let msg = err instanceof Error ? err.message : String(err);

  // Unwrap nested JSON error payloads emitted by upstream SDK/HTTP responses
  for (let depth = 0; depth < 4; depth += 1) {
    const trimmed = msg.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) break;
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { message?: string; code?: number; status?: string } | string;
        message?: string;
      };
      if (parsed?.error && typeof parsed.error === 'object' && parsed.error.message) {
        msg = String(parsed.error.message);
        continue;
      }
      if (typeof parsed?.error === 'string') {
        msg = parsed.error;
        continue;
      }
      if (parsed?.message) {
        msg = String(parsed.message);
        continue;
      }
      break;
    } catch {
      break;
    }
  }
  return msg;
}

export function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const clean = extractRawErrorMessage(err);
  const lower = `${raw} ${clean}`.toLowerCase();

  if (lower.includes('not configured yet') || lower.includes('api key not valid') || lower.includes('api_key_invalid')) {
    return 'STATY AI is not configured or the API key is invalid. Please check your Gemini API key in Settings > Secrets.';
  }
  if (lower.includes('permission_denied') || lower.includes('403')) {
    return 'STATY AI permission was denied (403). Please verify your API key in Settings > Secrets.';
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return 'STATY AI is temporarily experiencing high server demand (503). Please wait a few seconds and tap Retry.';
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return 'STATY AI rate limit reached (429). Please wait a moment before sending another request.';
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return 'Requested AI model could not be found (404). Please try again shortly.';
  }
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('timeout') || lower.includes('econnreset')) {
    return 'Network connection to STATY AI was interrupted. Check your connection and tap Retry.';
  }

  return clean.length > 260 ? `${clean.slice(0, 260)}...` : clean;
}

function isRetryableGeminiError(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    raw.includes('503') ||
    raw.includes('unavailable') ||
    raw.includes('high demand') ||
    raw.includes('overloaded') ||
    raw.includes('429') ||
    raw.includes('resource_exhausted') ||
    raw.includes('econnreset') ||
    raw.includes('etimedout') ||
    raw.includes('fetch failed')
  );
}

async function withGeminiRetry<T>(
  fn: (attempt: number) => Promise<T>,
  onRetry?: (attempt: number, maxAttempts: number) => void,
  maxAttempts = 2,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetryableGeminiError(err)) {
        throw err;
      }
      onRetry?.(attempt + 1, maxAttempts);
      const baseMs = 650 * Math.pow(2, attempt - 1);
      const jitterMs = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, baseMs + jitterMs));
    }
  }
  throw lastErr;
}

// Fast, listed-and-stable models first. If one is busy/over quota, switch to the next immediately.
const STATY_MODEL_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'] as const;

async function withModelFailover<T>(
  fn: (model: string, attempt: number) => Promise<T>,
  onStatusNotice?: (label: string) => void,
): Promise<T> {
  let lastErr: unknown;
  for (let idx = 0; idx < STATY_MODEL_CHAIN.length; idx += 1) {
    const model = STATY_MODEL_CHAIN[idx];
    try {
      return await withGeminiRetry(
        (attempt) => fn(model, attempt),
        (nextAttempt, maxAttempts) => {
          onStatusNotice?.(`High AI demand — retrying (${nextAttempt}/${maxAttempts})...`);
        },
        // Switch models right away instead of waiting; only the last model gets a second try.
        idx < STATY_MODEL_CHAIN.length - 1 ? 1 : 2,
      );
    } catch (err) {
      lastErr = err;
      const lowerErr = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
      const modelMissing = lowerErr.includes('404') || lowerErr.includes('not_found') || lowerErr.includes('not found');
      const canFallback = idx < STATY_MODEL_CHAIN.length - 1 && (isRetryableGeminiError(err) || modelMissing);
      if (!canFallback) {
        throw err;
      }
      onStatusNotice?.('Switching to secondary STATY engine for faster response...');
    }
  }
  throw lastErr;
}

// ---------- Function Declarations (Everything STATY can do across STATLYTICS) ----------

const getWorkspaceOverviewTool: FunctionDeclaration = {
  name: 'get_workspace_overview',
  description:
    'Retrieve the user’s existing research projects, saved datasets, saved analyses, and generated reports.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      limit: { type: Type.INTEGER, description: 'Max items per category (default 10).' },
    },
  },
};

const createResearchProjectTool: FunctionDeclaration = {
  name: 'create_research_project',
  description: 'Create a new Research Project workspace for the user.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Project title (min 2 chars).' },
      description: { type: Type.STRING, description: 'Brief study summary.' },
      researchQuestion: { type: Type.STRING, description: 'Primary research question.' },
    },
    required: ['title'],
  },
};

const addProjectNoteTool: FunctionDeclaration = {
  name: 'add_project_note',
  description: 'Add a Research Note inside one of the user’s Research Projects.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectId: { type: Type.INTEGER, description: 'Target project ID.' },
      title: { type: Type.STRING, description: 'Note heading.' },
      content: { type: Type.STRING, description: 'Note body content.' },
    },
    required: ['projectId', 'content'],
  },
};

const inspectDatasetTool: FunctionDeclaration = {
  name: 'inspect_dataset',
  description:
    'Inspect columns, data types, measurement levels, missing/duplicate stats, and sample rows of a saved user dataset.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      datasetId: { type: Type.INTEGER, description: 'Numeric ID of the user dataset.' },
    },
    required: ['datasetId'],
  },
};

const createDatasetTool: FunctionDeclaration = {
  name: 'create_dataset',
  description:
    'Create and persist a new dataset in SQLite from structured columns and rows (for example from pasted values or extracted table data). Provide rowsMatrix with each inner array aligned to variables order.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Dataset name.' },
      projectId: { type: Type.INTEGER, description: 'Optional linked project ID.' },
      variables: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            dataType: { type: Type.STRING, description: 'Integer, Decimal, Text, Boolean, or Date' },
            measurementLevel: { type: Type.STRING, description: 'Nominal, Ordinal, Interval, or Ratio' },
          },
          required: ['name'],
        },
      },
      rowsMatrix: {
        type: Type.ARRAY,
        description: '2D array of rows where each row array aligns by index with `variables`.',
        items: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    },
    required: ['name', 'variables', 'rowsMatrix'],
  },
};

const cleanDatasetTool: FunctionDeclaration = {
  name: 'clean_dataset',
  description:
    'Clean a saved dataset (remove_duplicates, drop_missing_rows, remove_empty_columns, impute_missing, rename_variable, or convert_type) and save the result as a new separate cleaned copy.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      datasetId: { type: Type.INTEGER, description: 'Source dataset ID.' },
      operationType: {
        type: Type.STRING,
        description:
          'One of: remove_duplicates, drop_missing_rows, remove_empty_columns, impute_missing, rename_variable, convert_type',
      },
      column: { type: Type.STRING, description: 'Column name for column-specific operations.' },
      strategy: { type: Type.STRING, description: 'For impute_missing: mean, median, or mode.' },
      newName: { type: Type.STRING, description: 'New variable name for rename_variable.' },
      targetType: { type: Type.STRING, description: 'For convert_type: Integer, Decimal, Text, Boolean.' },
      cleanedDatasetName: { type: Type.STRING, description: 'Name for the saved cleaned dataset copy.' },
    },
    required: ['datasetId', 'operationType'],
  },
};

const recommendTestTool: FunctionDeclaration = {
  name: 'recommend_statistical_test',
  description:
    'Recommend an appropriate statistical test based on research objective, measurement levels, group count, and study design.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      researchQuestion: { type: Type.STRING },
      objective: {
        type: Type.STRING,
        description: 'One of: compare_groups, relationship, prediction, association',
      },
      ivMeasurementLevel: {
        type: Type.STRING,
        description: 'Nominal, Ordinal, Interval, Ratio, or None',
      },
      dvMeasurementLevel: {
        type: Type.STRING,
        description: 'Nominal, Ordinal, Interval, or Ratio',
      },
      groupCount: { type: Type.INTEGER },
      design: { type: Type.STRING, description: 'independent, paired, or observational' },
    },
    required: ['researchQuestion', 'objective', 'ivMeasurementLevel', 'dvMeasurementLevel', 'design'],
  },
};

const runStatisticalTestTool: FunctionDeclaration = {
  name: 'run_statistical_test',
  description:
    'Execute a verified statistical test on a saved user dataset in SQLite. Always call this instead of calculating or guessing statistics.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      datasetId: { type: Type.INTEGER, description: 'Numeric ID of the user dataset.' },
      procedure: {
        type: Type.STRING,
        description:
          'One of: one_way_anova, kruskal_wallis, independent_t, mann_whitney, paired_t, wilcoxon, pearson_correlation, spearman, multiple_regression, chi_square, cronbach_alpha',
      },
      columnA: {
        type: Type.STRING,
        description:
          'Grouping column (ANOVA/Kruskal/T-test/Mann-Whitney), first variable (Paired/Wilcoxon/Pearson/Spearman/Chi-Square), dependent variable (Regression), or omitted for cronbach_alpha.',
      },
      columnB: {
        type: Type.STRING,
        description: 'Dependent numeric column (ANOVA/Kruskal/T-test/Mann-Whitney) or second variable (Paired/Wilcoxon/Pearson/Spearman/Chi-Square).',
      },
      predictors: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Predictor column names for multiple_regression, or Likert/survey item column names (3+) for cronbach_alpha.',
      },
      alpha: { type: Type.NUMBER, description: 'Significance level (default 0.05).' },
      researchQuestion: {
        type: Type.STRING,
        description: 'Research question context.',
      },
    },
    required: ['datasetId', 'procedure'],
  },
};

const calculatePowerTool: FunctionDeclaration = {
  name: 'calculate_sample_power',
  description:
    'Calculate required a priori sample size (N) and achieved statistical power for a planned study.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      procedure: {
        type: Type.STRING,
        description:
          'One of: independent_t, paired_t, one_way_anova, pearson_correlation, multiple_regression',
      },
      effectSize: {
        type: Type.NUMBER,
        description: "Expected effect size (Cohen's d/dz, Cohen's f, Pearson |r|, or Cohen's f^2).",
      },
      alpha: { type: Type.NUMBER, description: 'Significance level (default 0.05).' },
      power: { type: Type.NUMBER, description: 'Target statistical power 0.50–0.99 (default 0.80).' },
      groups: { type: Type.INTEGER, description: 'Number of groups for one_way_anova (default 3).' },
      predictors: { type: Type.INTEGER, description: 'Number of predictors for multiple_regression (default 3).' },
    },
    required: ['procedure', 'effectSize'],
  },
};

const saveAnalysisTool: FunctionDeclaration = {
  name: 'save_analysis',
  description:
    'Save the most recently computed statistical test result from this conversation to My Analyses in SQLite so it persists and can generate reports.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Title for the saved analysis.' },
      datasetId: { type: Type.INTEGER, description: 'Dataset ID used for the analysis.' },
      projectId: { type: Type.INTEGER, description: 'Optional project ID to link.' },
    },
    required: ['title'],
  },
};

const generateReportTool: FunctionDeclaration = {
  name: 'generate_report',
  description:
    'Generate a persistent PDF, Word (.docx APA 7 manuscript), or Excel report file for a saved analysis ID and save it under Reports.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      analysisId: {
        type: Type.INTEGER,
        description: 'Saved analysis ID (use the ID from save_analysis or get_workspace_overview).',
      },
      format: { type: Type.STRING, description: 'pdf, docx, or excel' },
      title: { type: Type.STRING, description: 'Optional report title.' },
    },
    required: ['analysisId', 'format'],
  },
};

const navigateAppTool: FunctionDeclaration = {
  name: 'navigate_app',
  description:
    'Navigate the user’s STATLYTICS interface directly to a workspace screen when they ask to go somewhere or open a module.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      route: {
        type: Type.STRING,
        description:
          'One of: dashboard, data-analysis, statistical-tests, ai-assistant, projects, analyses, reports, profile, settings',
      },
      contextLabel: {
        type: Type.STRING,
        description: 'Optional sub-view hint (e.g., "Manual Dataset Encoder", "Upload Dataset", "One-Way ANOVA", "Sample Size & Power", "Test Recommendation Engine").',
      },
    },
    required: ['route'],
  },
};

const ALL_TOOLS = [
  {
    functionDeclarations: [
      getWorkspaceOverviewTool,
      createResearchProjectTool,
      addProjectNoteTool,
      inspectDatasetTool,
      createDatasetTool,
      cleanDatasetTool,
      recommendTestTool,
      runStatisticalTestTool,
      calculatePowerTool,
      saveAnalysisTool,
      generateReportTool,
      navigateAppTool,
    ],
  },
];

// ---------- Tool Status Descriptor & Executor ----------

function describeToolAction(name: string): {
  emotion: StatyEmotion;
  gesture: StatyGestureName;
  label: string;
} {
  switch (name) {
    case 'get_workspace_overview':
      return { emotion: 'thinking', gesture: 'tilt', label: 'Checking your workspace records...' };
    case 'create_research_project':
      return { emotion: 'processing', gesture: 'nod', label: 'Creating research project...' };
    case 'add_project_note':
      return { emotion: 'processing', gesture: 'nod', label: 'Saving research note...' };
    case 'inspect_dataset':
      return { emotion: 'thinking', gesture: 'ear-perk', label: 'Inspecting dataset structure...' };
    case 'create_dataset':
      return { emotion: 'processing', gesture: 'nod', label: 'Saving dataset to workspace...' };
    case 'clean_dataset':
      return { emotion: 'processing', gesture: 'ear-perk', label: 'Cleaning dataset safely as a copy...' };
    case 'recommend_statistical_test':
      return { emotion: 'thinking', gesture: 'tilt', label: 'Evaluating best statistical test...' };
    case 'run_statistical_test':
      return { emotion: 'processing', gesture: 'ear-perk', label: 'Running verified statistical engine...' };
    case 'calculate_sample_power':
      return { emotion: 'processing', gesture: 'tilt', label: 'Computing required sample size & power...' };
    case 'save_analysis':
      return { emotion: 'processing', gesture: 'nod', label: 'Saving analysis to My Analyses...' };
    case 'generate_report':
      return { emotion: 'processing', gesture: 'nod', label: 'Generating persistent report file...' };
    case 'navigate_app':
      return { emotion: 'happy', gesture: 'wave-wink', label: 'Opening workspace view...' };
    default:
      return { emotion: 'processing', gesture: 'ear-perk', label: 'Working on your request...' };
  }
}

interface ExecutionState {
  latestAnalysis: StatisticalComputationResult | null;
  latestDatasetId: number | null;
  latestSavedAnalysisId: number | null;
  actions: StatyActionItem[];
}

async function executeToolCall(
  userId: number,
  name: string,
  args: Record<string, unknown>,
  state: ExecutionState,
): Promise<{ result: unknown; action?: StatyActionItem }> {
  if (name === 'get_workspace_overview') {
    const limit = Math.min(25, Math.max(1, Number(args.limit || 10)));
    const projects = db
      .prepare('SELECT id, title, research_question, updated_at FROM research_projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?')
      .all(userId, limit);
    const datasets = db
      .prepare('SELECT id, name, project_id, source_type, row_count, col_count, updated_at FROM datasets WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?')
      .all(userId, limit);
    const analyses = db
      .prepare('SELECT id, title, procedure_name, dataset_id, project_id, sample_size, created_at FROM statistical_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit);
    const reports = db
      .prepare('SELECT id, title, format, analysis_id, project_id, created_at FROM generated_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit);
    return { result: { projects, datasets, analyses, reports } };
  }

  if (name === 'create_research_project') {
    const title = sanitizeText(args.title, 160);
    const description = sanitizeText(args.description, 1000);
    const researchQuestion = sanitizeText(args.researchQuestion, 500);
    if (title.length < 2) {
      return { result: { error: 'Project title must be at least 2 characters.' } };
    }
    const info = db
      .prepare(
        `INSERT INTO research_projects (user_id, title, description, research_question)
         VALUES (?, ?, ?, ?)`,
      )
      .run(userId, title, description, researchQuestion);
    const projectId = Number(info.lastInsertRowid);
    const action: StatyActionItem = {
      type: 'project_created',
      label: `Created project "${title}"`,
      route: 'projects',
      entityId: projectId,
    };
    state.actions.push(action);
    return { result: { projectId, title, description, researchQuestion }, action };
  }

  if (name === 'add_project_note') {
    const projectId = Number(args.projectId);
    const title = sanitizeText(args.title, 160) || 'STATY Research Note';
    const content = sanitizeText(args.content, 4000);
    const proj = db
      .prepare('SELECT id, title FROM research_projects WHERE id = ? AND user_id = ?')
      .get(projectId, userId) as { id: number; title: string } | undefined;
    if (!proj) return { result: { error: 'Research project not found or access denied.' } };
    if (!content) return { result: { error: 'Note content cannot be empty.' } };

    const info = db
      .prepare('INSERT INTO research_notes (user_id, project_id, title, content) VALUES (?, ?, ?, ?)')
      .run(userId, projectId, title, content);
    db.prepare(`UPDATE research_projects SET updated_at = datetime('now') WHERE id = ?`).run(projectId);
    const action: StatyActionItem = {
      type: 'note_added',
      label: `Added note to "${proj.title}"`,
      route: 'projects',
      entityId: Number(info.lastInsertRowid),
    };
    state.actions.push(action);
    return { result: { noteId: Number(info.lastInsertRowid), projectId, title }, action };
  }

  if (name === 'inspect_dataset') {
    const datasetId = Number(args.datasetId);
    const ds = db
      .prepare('SELECT id, name, row_count, col_count, source_type FROM datasets WHERE id = ? AND user_id = ?')
      .get(datasetId, userId) as
      | { id: number; name: string; row_count: number; col_count: number; source_type: string }
      | undefined;
    if (!ds) return { result: { error: 'Dataset not found or access denied.' } };

    const vars = db
      .prepare('SELECT name, data_type, measurement_level FROM dataset_variables WHERE dataset_id = ? ORDER BY position')
      .all(datasetId);
    const sampleRows = db
      .prepare('SELECT data_json FROM dataset_records WHERE dataset_id = ? ORDER BY row_index LIMIT 8')
      .all(datasetId) as Array<{ data_json: string }>;

    state.latestDatasetId = datasetId;
    return {
      result: {
        dataset: ds,
        variables: vars,
        sampleRows: sampleRows.map((r) => JSON.parse(r.data_json)),
      },
    };
  }

  if (name === 'create_dataset') {
    const nameStr = sanitizeText(args.name, 140) || 'STATY Created Dataset';
    const projectId = args.projectId ? Number(args.projectId) : null;
    const rawVars = Array.isArray(args.variables) ? args.variables : [];
    const rawMatrix = Array.isArray(args.rowsMatrix) ? args.rowsMatrix : [];
    const rawRowsObj = Array.isArray(args.rows) ? args.rows : [];

    if (rawVars.length === 0) {
      return { result: { error: 'At least one variable column is required.' } };
    }
    if (projectId) {
      const proj = db
        .prepare('SELECT id FROM research_projects WHERE id = ? AND user_id = ?')
        .get(projectId, userId);
      if (!proj) return { result: { error: 'Referenced project not found.' } };
    }

    const cleanVars = rawVars.map((v: Record<string, unknown>, idx: number) => ({
      name: sanitizeText(v.name, 80) || `Variable_${idx + 1}`,
      description: sanitizeText(v.description, 300),
      dataType: (['Integer', 'Decimal', 'Text', 'Boolean', 'Date'].includes(String(v.dataType))
        ? v.dataType
        : 'Text') as DataType,
      measurementLevel: (['Nominal', 'Ordinal', 'Interval', 'Ratio'].includes(
        String(v.measurementLevel),
      )
        ? v.measurementLevel
        : 'Nominal') as MeasurementLevel,
    }));

    const coerceCell = (val: unknown, dt: DataType): string | number | boolean | null => {
      if (val === null || val === undefined || val === '') return null;
      if (dt === 'Integer' || dt === 'Decimal') {
        const n = Number(val);
        return Number.isFinite(n) ? n : String(val);
      }
      if (dt === 'Boolean') {
        if (typeof val === 'boolean') return val;
        return String(val).toLowerCase() === 'true';
      }
      return String(val);
    };

    const normalizedRows: Array<Record<string, unknown>> =
      rawMatrix.length > 0
        ? rawMatrix.map((arr) => {
            const cells = Array.isArray(arr) ? arr : [];
            const obj: Record<string, unknown> = {};
            cleanVars.forEach((v, idx) => {
              obj[v.name] = coerceCell(cells[idx], v.dataType);
            });
            return obj;
          })
        : rawRowsObj.map((r: Record<string, unknown>) => {
            const obj: Record<string, unknown> = {};
            cleanVars.forEach((v) => {
              obj[v.name] = coerceCell(r[v.name], v.dataType);
            });
            return obj;
          });

    const tx = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO datasets (user_id, project_id, name, source_type, row_count, col_count)
           VALUES (?, ?, ?, 'manual', ?, ?)`,
        )
        .run(userId, projectId, nameStr, normalizedRows.length, cleanVars.length);
      const datasetId = Number(info.lastInsertRowid);

      const insertVar = db.prepare(
        `INSERT INTO dataset_variables (dataset_id, name, description, data_type, measurement_level, position)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      cleanVars.forEach((v, idx) => {
        insertVar.run(datasetId, v.name, v.description, v.dataType, v.measurementLevel, idx);
      });

      const insertRow = db.prepare(
        `INSERT INTO dataset_records (dataset_id, row_index, data_json)
         VALUES (?, ?, ?)`,
      );
      normalizedRows.forEach((obj, idx) => {
        insertRow.run(datasetId, idx, JSON.stringify(obj));
      });
      return datasetId;
    });

    const newDatasetId = tx();
    state.latestDatasetId = newDatasetId;
    const action: StatyActionItem = {
      type: 'dataset_created',
      label: `Created dataset "${nameStr}" (${normalizedRows.length} rows)`,
      route: 'data-analysis',
      entityId: newDatasetId,
    };
    state.actions.push(action);
    return {
      result: {
        datasetId: newDatasetId,
        name: nameStr,
        rowCount: normalizedRows.length,
        colCount: cleanVars.length,
      },
      action,
    };
  }

  if (name === 'clean_dataset') {
    const datasetId = Number(args.datasetId);
    const ds = db
      .prepare('SELECT * FROM datasets WHERE id = ? AND user_id = ?')
      .get(datasetId, userId) as
      | { id: number; name: string; project_id: number | null }
      | undefined;
    if (!ds) return { result: { error: 'Dataset not found or access denied.' } };

    const vars = db
      .prepare('SELECT * FROM dataset_variables WHERE dataset_id = ? ORDER BY position')
      .all(datasetId) as Array<{
      name: string;
      description: string;
      data_type: DataType;
      measurement_level: MeasurementLevel;
      position: number;
    }>;
    const recs = db
      .prepare('SELECT data_json FROM dataset_records WHERE dataset_id = ? ORDER BY row_index')
      .all(datasetId) as Array<{ data_json: string }>;
    const rows = recs.map((r) => JSON.parse(r.data_json) as Record<string, string | number | boolean | null>);

    const varsMeta: VariableMetadata[] = vars.map((v) => ({
      name: v.name,
      originalName: v.name,
      description: v.description || '',
      dataType: v.data_type,
      measurementLevel: v.measurement_level,
      position: v.position,
      missingCount: 0,
      uniqueCount: 0,
      isUnnamedPlaceholder: false,
      isLikelyIndex: false,
      isEmptyColumn: false,
    }));

    const opType = String(args.operationType || 'remove_duplicates');
    let op: CleaningOperation;
    if (opType === 'drop_missing_rows') op = { type: 'drop_missing_rows' };
    else if (opType === 'remove_empty_columns') op = { type: 'remove_empty_columns' };
    else if (opType === 'impute_missing')
      op = {
        type: 'impute_missing',
        strategy: (args.strategy as 'mean' | 'median' | 'mode') || 'mean',
        column: args.column ? String(args.column) : undefined,
      };
    else if (opType === 'rename_variable')
      op = {
        type: 'rename_variable',
        oldName: String(args.column || ''),
        newName: String(args.newName || ''),
      };
    else if (opType === 'convert_type')
      op = {
        type: 'convert_type',
        column: String(args.column || ''),
        targetType: (args.targetType as DataType) || 'Decimal',
      };
    else op = { type: 'remove_duplicates' };

    try {
      const cleaned = applyCleaningPreview(varsMeta, rows, op);
      const copyName =
        sanitizeText(args.cleanedDatasetName, 140) || `${ds.name} (Cleaned)`;

      const tx = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO datasets (user_id, project_id, name, source_type, row_count, col_count)
             VALUES (?, ?, ?, 'cleaned', ?, ?)`,
          )
          .run(userId, ds.project_id, copyName, cleaned.rows.length, cleaned.variables.length);
        const newId = Number(info.lastInsertRowid);

        const iv = db.prepare(
          `INSERT INTO dataset_variables (dataset_id, name, description, data_type, measurement_level, position)
           VALUES (?, ?, ?, ?, ?, ?)`,
        );
        cleaned.variables.forEach((v, idx) => {
          iv.run(newId, v.name, v.description || '', v.dataType, v.measurementLevel, idx);
        });
        const ir = db.prepare(
          `INSERT INTO dataset_records (dataset_id, row_index, data_json)
           VALUES (?, ?, ?)`,
        );
        cleaned.rows.forEach((r, idx) => {
          ir.run(newId, idx, JSON.stringify(r));
        });
        return newId;
      });

      const newId = tx();
      state.latestDatasetId = newId;
      const action: StatyActionItem = {
        type: 'dataset_cleaned',
        label: `Saved cleaned copy "${copyName}"`,
        route: 'data-analysis',
        entityId: newId,
      };
      state.actions.push(action);
      return {
        result: {
          datasetId: newId,
          name: copyName,
          rowCount: cleaned.rows.length,
          colCount: cleaned.variables.length,
          summary: cleaned.summary,
        },
        action,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : 'Dataset cleaning failed.' } };
    }
  }

  if (name === 'recommend_statistical_test') {
    const rec = recommendStatisticalTest({
      researchQuestion: String(args.researchQuestion || ''),
      objective:
        (args.objective as 'compare_groups' | 'relationship' | 'prediction' | 'association') ||
        'compare_groups',
      ivMeasurementLevel:
        (args.ivMeasurementLevel as 'Nominal' | 'Ordinal' | 'Interval' | 'Ratio' | 'None') ||
        'Nominal',
      dvMeasurementLevel:
        (args.dvMeasurementLevel as 'Nominal' | 'Ordinal' | 'Interval' | 'Ratio') || 'Ratio',
      groupCount: args.groupCount ? Number(args.groupCount) : undefined,
      design: (args.design as 'independent' | 'paired' | 'observational') || 'independent',
    });
    return { result: rec };
  }

  if (name === 'run_statistical_test') {
    const datasetId = Number(args.datasetId);
    const ds = db
      .prepare('SELECT id, name FROM datasets WHERE id = ? AND user_id = ?')
      .get(datasetId, userId) as { id: number; name: string } | undefined;
    if (!ds) return { result: { error: 'Dataset not found or access denied.' } };

    const recordRows = db
      .prepare('SELECT data_json FROM dataset_records WHERE dataset_id = ? ORDER BY row_index')
      .all(datasetId) as Array<{ data_json: string }>;
    const rows = recordRows.map((r) => JSON.parse(r.data_json) as Record<string, unknown>);
    const proc = String(args.procedure || '');
    const colA = String(args.columnA || '');
    const colB = String(args.columnB || '');
    const alpha = args.alpha ? Number(args.alpha) : 0.05;
    const rq = args.researchQuestion ? String(args.researchQuestion) : undefined;

    try {
      let computed: StatisticalComputationResult;
      if (proc === 'one_way_anova') {
        computed = runOneWayAnova({ rows, groupColumn: colA, valueColumn: colB, alpha, researchQuestion: rq });
      } else if (proc === 'kruskal_wallis') {
        computed = runKruskalWallis({ rows, groupColumn: colA, valueColumn: colB, alpha, researchQuestion: rq });
      } else if (proc === 'independent_t') {
        computed = runIndependentTTest({ rows, groupColumn: colA, valueColumn: colB, alpha, researchQuestion: rq });
      } else if (proc === 'mann_whitney') {
        computed = runMannWhitneyU({ rows, groupColumn: colA, valueColumn: colB, alpha, researchQuestion: rq });
      } else if (proc === 'paired_t') {
        computed = runPairedTTest({ rows, columnA: colA, columnB: colB, alpha, researchQuestion: rq });
      } else if (proc === 'wilcoxon') {
        computed = runWilcoxonSignedRank({ rows, columnA: colA, columnB: colB, alpha, researchQuestion: rq });
      } else if (proc === 'pearson_correlation') {
        computed = runPearsonCorrelation({ rows, columnX: colA, columnY: colB, alpha, researchQuestion: rq });
      } else if (proc === 'spearman') {
        computed = runSpearmanCorrelation({ rows, columnX: colA, columnY: colB, alpha, researchQuestion: rq });
      } else if (proc === 'multiple_regression') {
        const preds = Array.isArray(args.predictors)
          ? args.predictors.map(String)
          : colB
            ? [colB]
            : [];
        computed = runMultipleRegression({
          rows,
          dependentColumn: colA,
          predictorColumns: preds,
          alpha,
          researchQuestion: rq,
        });
      } else if (proc === 'chi_square') {
        computed = runChiSquareIndependence({ rows, rowColumn: colA, colColumn: colB, alpha, researchQuestion: rq });
      } else if (proc === 'cronbach_alpha') {
        const items = Array.isArray(args.predictors)
          ? args.predictors.map(String)
          : [colA, colB].filter(Boolean);
        computed = runCronbachAlpha({
          rows,
          itemColumns: items,
          alpha,
          researchQuestion: rq,
        });
      } else {
        return { result: { error: `Unknown procedure "${proc}".` } };
      }

      state.latestAnalysis = computed;
      state.latestDatasetId = datasetId;
      return { result: computed };
    } catch (err) {
      return {
        result: {
          error: err instanceof Error ? err.message : 'Statistical computation failed.',
        },
      };
    }
  }

  if (name === 'calculate_sample_power') {
    try {
      const power = calculateSamplePower({
        procedure: (args.procedure as PowerProcedure) || 'independent_t',
        effectSize: Number(args.effectSize ?? 0.5),
        alpha: args.alpha ? Number(args.alpha) : 0.05,
        power: args.power ? Number(args.power) : 0.8,
        groups: args.groups ? Number(args.groups) : 3,
        predictors: args.predictors ? Number(args.predictors) : 3,
      });
      return { result: power };
    } catch (err) {
      return {
        result: {
          error: err instanceof Error ? err.message : 'Power computation failed.',
        },
      };
    }
  }

  if (name === 'save_analysis') {
    const computed = state.latestAnalysis;
    if (!computed) {
      return {
        result: {
          error: 'No statistical test has been computed yet in this turn. Run `run_statistical_test` first before saving.',
        },
      };
    }
    const title = sanitizeText(args.title, 180) || `${computed.procedure} Analysis`;
    const datasetId = args.datasetId ? Number(args.datasetId) : state.latestDatasetId;
    const projectId = args.projectId ? Number(args.projectId) : null;

    if (datasetId) {
      const ds = db.prepare('SELECT id FROM datasets WHERE id = ? AND user_id = ?').get(datasetId, userId);
      if (!ds) return { result: { error: 'Referenced dataset not found or access denied.' } };
    }
    if (projectId) {
      const proj = db
        .prepare('SELECT id FROM research_projects WHERE id = ? AND user_id = ?')
        .get(projectId, userId);
      if (!proj) return { result: { error: 'Referenced project not found or access denied.' } };
    }

    const analysisId = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO statistical_analyses
           (user_id, project_id, dataset_id, title, procedure_name, research_question, variables_json, sample_size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          projectId,
          datasetId,
          title,
          computed.procedure,
          computed.researchQuestion || '',
          JSON.stringify(computed.variables || {}),
          computed.sampleSize || 0,
        );
      const id = Number(info.lastInsertRowid);
      db.prepare(
        `INSERT INTO analysis_results
         (analysis_id, descriptive_stats_json, test_results_json, effect_size_json,
          confidence_intervals_json, diagnostics_json, technical_interpretation,
          simplified_interpretation, visualization_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        JSON.stringify({
          descriptives: computed.descriptives || [],
          postHoc: computed.postHoc || [],
          alternativeProcedure: computed.alternativeProcedure || null,
          alpha: computed.alpha ?? 0.05,
        }),
        JSON.stringify(computed.testResults),
        JSON.stringify(computed.effectSize),
        JSON.stringify(computed.confidenceInterval),
        JSON.stringify(computed.diagnostics || []),
        computed.technicalInterpretation || '',
        computed.simplifiedInterpretation || '',
        JSON.stringify(computed.visualization || {}),
      );
      return id;
    })();

    state.latestSavedAnalysisId = analysisId;
    const action: StatyActionItem = {
      type: 'analysis_saved',
      label: `Saved analysis "${title}"`,
      route: 'analyses',
      entityId: analysisId,
    };
    state.actions.push(action);
    return { result: { analysisId, title }, action };
  }

  if (name === 'generate_report') {
    const analysisId = Number(args.analysisId || state.latestSavedAnalysisId || 0);
    const rawFmt = String(args.format || 'pdf').toLowerCase();
    const format = rawFmt === 'excel' ? 'excel' : rawFmt === 'docx' ? 'docx' : 'pdf';
    if (!analysisId) {
      return { result: { error: 'Provide a valid saved analysisId (call save_analysis first if needed).' } };
    }

    const analysis = db
      .prepare(
        `SELECT a.*, d.name as dataset_name
         FROM statistical_analyses a
         LEFT JOIN datasets d ON d.id = a.dataset_id
         WHERE a.id = ? AND a.user_id = ?`,
      )
      .get(analysisId, userId) as Record<string, unknown> | undefined;
    if (!analysis) return { result: { error: 'Saved analysis not found or access denied.' } };

    const resultRow = db
      .prepare('SELECT * FROM analysis_results WHERE analysis_id = ?')
      .get(analysisId) as Record<string, unknown> | undefined;
    if (!resultRow) return { result: { error: 'Analysis result details are missing.' } };

    const descPayload = JSON.parse(String(resultRow.descriptive_stats_json || '{}'));
    const computed: StatisticalComputationResult = {
      procedure: String(analysis.procedure_name),
      researchQuestion: String(analysis.research_question || ''),
      variables: JSON.parse(String(analysis.variables_json || '{}')),
      sampleSize: Number(analysis.sample_size || 0),
      alpha: descPayload.alpha ?? 0.05,
      descriptives: descPayload.descriptives ?? [],
      postHoc: descPayload.postHoc ?? [],
      alternativeProcedure: descPayload.alternativeProcedure ?? undefined,
      testResults: JSON.parse(String(resultRow.test_results_json || '{}')),
      effectSize: JSON.parse(String(resultRow.effect_size_json || '{}')),
      confidenceInterval: JSON.parse(String(resultRow.confidence_intervals_json || '{}')),
      diagnostics: JSON.parse(String(resultRow.diagnostics_json || '[]')),
      technicalInterpretation: String(resultRow.technical_interpretation || ''),
      simplifiedInterpretation: String(resultRow.simplified_interpretation || ''),
      visualization: JSON.parse(String(resultRow.visualization_json || '{}')),
    };

    let datasetHeaders: string[] = [];
    let datasetRows: Record<string, unknown>[] = [];
    if (analysis.dataset_id) {
      const vars = db
        .prepare('SELECT name FROM dataset_variables WHERE dataset_id = ? ORDER BY position')
        .all(Number(analysis.dataset_id)) as Array<{ name: string }>;
      datasetHeaders = vars.map((v) => v.name);
      const recs = db
        .prepare('SELECT data_json FROM dataset_records WHERE dataset_id = ? ORDER BY row_index LIMIT 1000')
        .all(Number(analysis.dataset_id)) as Array<{ data_json: string }>;
      datasetRows = recs.map((r) => JSON.parse(r.data_json) as Record<string, unknown>);
    }

    const title =
      sanitizeText(args.title, 180) || `${String(analysis.title)} (${format.toUpperCase()})`;
    const source: ReportSourceData = {
      analysisTitle: String(analysis.title),
      procedureName: String(analysis.procedure_name),
      researchQuestion: String(analysis.research_question || ''),
      datasetName: String(analysis.dataset_name || 'Not linked'),
      createdAt: String(analysis.created_at),
      result: computed,
      datasetHeaders,
      datasetRows,
    };

    const generated =
      format === 'pdf'
        ? await generatePdfReport(source)
        : format === 'docx'
          ? await generateDocxReport(source)
          : generateExcelReport(source);

    const info = db
      .prepare(
        `INSERT INTO generated_reports (user_id, analysis_id, project_id, title, format, file_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        analysisId,
        analysis.project_id ?? null,
        title,
        format,
        generated.filename,
      );

    const reportId = Number(info.lastInsertRowid);
    const action: StatyActionItem = {
      type: 'report_generated',
      label: `Generated ${format.toUpperCase()} report "${title}"`,
      route: 'reports',
      entityId: reportId,
    };
    state.actions.push(action);
    return { result: { reportId, title, format }, action };
  }

  if (name === 'navigate_app') {
    const allowedRoutes = new Set([
      'dashboard',
      'data-analysis',
      'statistical-tests',
      'ai-assistant',
      'projects',
      'analyses',
      'reports',
      'profile',
      'settings',
    ]);
    const route = String(args.route || 'dashboard');
    if (!allowedRoutes.has(route)) {
      return { result: { error: `Unknown workspace route "${route}".` } };
    }
    const contextLabel = args.contextLabel ? String(args.contextLabel) : undefined;
    const action: StatyActionItem = {
      type: 'navigate',
      label: `Open ${route.replace(/-/g, ' ')}`,
      route,
      contextLabel,
    };
    state.actions.push(action);
    return { result: { navigatedTo: route, contextLabel }, action };
  }

  return { result: { error: `Unsupported tool "${name}".` } };
}

export async function extractStructuredContentFromFile(params: {
  mimeType: string;
  buffer: Buffer;
  filename: string;
}): Promise<{
  extractedText: string;
  detectedKind: 'table' | 'document';
  suggestedHeaders?: string[];
  suggestedRows?: Array<Record<string, string | number>>;
  uncertainties?: string[];
}> {
  if (!isGeminiConfigured()) {
    throw new Error(
      'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
    );
  }

  const ai = getGenAIClient();
  const base64 = params.buffer.toString('base64');

  const response = await withModelFailover((model) =>
    ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType,
              data: base64,
            },
          },
          {
            text:
              `Inspect this uploaded file ("${params.filename}"). Extract all readable text accurately. ` +
              `If the image/document contains a statistical table or numerical dataset, preserve the table structure and extract column names and rows into JSON. ` +
              `Also list any blurry, cut-off, or uncertain cells/labels so the researcher can confirm them. ` +
              `Respond strictly as JSON with keys: detectedKind ("table" or "document"), extractedText (string), suggestedHeaders (array of strings, optional), suggestedRows (array of objects, optional), uncertainties (array of strings, optional).`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    }),
  );

  const rawText = (response.text ?? '{}').trim();
  try {
    return JSON.parse(rawText) as {
      extractedText: string;
      detectedKind: 'table' | 'document';
      suggestedHeaders?: string[];
      suggestedRows?: Array<Record<string, string | number>>;
      uncertainties?: string[];
    };
  } catch {
    return {
      detectedKind: 'document',
      extractedText: rawText,
      uncertainties: ['Structured JSON parsing fell back to plain text. Please review the extracted content.'],
    };
  }
}

export async function transcribeAudioWithGemini(params: {
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error(
      'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
    );
  }
  const ai = getGenAIClient();
  const cleanMime = params.mimeType.split(';')[0].trim() || 'audio/webm';

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: params.buffer.toString('base64'),
            },
          },
          {
            text: 'Transcribe this spoken research prompt accurately. Preserve statistical and academic terms cleanly.',
          },
        ],
      },
    }),
  );

  return (response.text ?? '').trim();
}

export async function speakTextWithGemini(text: string): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error(
      'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
    );
  }
  const clipped = text.replace(/[*_`#]/g, '').trim().slice(0, 1400);
  if (!clipped) {
    throw new Error('No text provided to read aloud.');
  }

  // Direct REST call using Google's documented Gemini 3.8 TTS request shape.
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: clipped,
            speech_metadata: { style: 'warm, friendly and relaxed' },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { voice: 'Kore' } },
    },
  };

  const response = await withGeminiRetry(async () => {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': resolveApiKey() as string,
        },
        body: JSON.stringify(body),
      },
    );
    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`${r.status} ${errText}`);
    }
    return (await r.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
    };
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('STATY voice audio could not be generated right now.');
  }
  return base64Audio;
}

export interface StatyChatParams {
  userId: number;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
  currentAppRoute?: string;
  datasetContext?: { id: number; name: string; variables: unknown[] } | null;
  attachmentContext?: Array<{
    filename: string;
    mimeType: string;
    extractedText?: string | null;
    buffer?: Buffer;
  }>;
}

function buildSystemInstruction(currentAppRoute?: string): string {
  return (
    'You are STATY, the friendly, expressive blue-and-white robotic fox AI research companion for STATLYTICS. ' +
    'You are available across the entire STATLYTICS platform and can help the user do EVERYTHING: ' +
    'inspecting workspace projects/datasets/analyses/reports, creating research projects & notes, creating datasets from pasted or extracted numbers, cleaning datasets safely as copies, recommending tests, running parametric & nonparametric statistical procedures (including Cronbach’s Alpha survey reliability and a priori Sample Size/Power calculations), saving analyses, generating PDF, APA 7 Word (.docx), and Excel reports, and navigating the user to any screen. ' +
    (currentAppRoute ? `The user is currently viewing the "${currentAppRoute}" screen. ` : '') +
    'CRITICAL INTEGRITY RULE: You must NEVER invent, estimate, or hallucinate p-values, F-statistics, t-statistics, Cronbach alphas, power estimates, regression coefficients, correlation coefficients, confidence intervals, or sample sizes. ' +
    'Whenever statistical calculations on a saved dataset or sample size estimates are needed, call `inspect_dataset` / `run_statistical_test` / `calculate_sample_power`, and ONLY interpret the exact numbers returned by those tools. ' +
    'PERSONALITY & STYLE: Talk like a warm, relaxed friend who happens to be great at statistics — natural, casual, and human, never like a corporate bot. ' +
    'Use simple everyday words, short sentences, and a friendly tone. Match the user’s energy: if they say "hi" or "hmmm", reply like a real person would (short and easygoing), not with a menu of features. ' +
    'Do NOT use markdown formatting at all: no asterisks, no bold, no headers, no bullet symbols, no numbered-list formatting. Write in plain flowing sentences; if you must list things, use short lines or say them in a sentence. ' +
    'Never open with stiff phrases like "Certainly!" or "As an AI". Use an occasional emoji only when it feels natural. Ask one simple follow-up question when it helps. ' +
    'Stay scientifically accurate and keep answers short unless the user asks for detail.'
  );
}

function buildInitialContents(params: StatyChatParams) {
  const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (params.datasetContext) {
    userParts.push({
      text: `[Active Dataset Context: ID=${params.datasetContext.id}, Name="${params.datasetContext.name}", Variables=${JSON.stringify(params.datasetContext.variables)}]`,
    });
  }

  if (params.attachmentContext && params.attachmentContext.length > 0) {
    for (const att of params.attachmentContext) {
      if (att.extractedText) {
        userParts.push({
          text: `[Confirmed Extracted Content from "${att.filename}"]:\n${att.extractedText}`,
        });
      } else if (
        att.buffer &&
        (att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf')
      ) {
        userParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.buffer.toString('base64'),
          },
        });
      }
    }
  }

  userParts.push({ text: params.userMessage });

  return [
    ...params.history.slice(-12).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: userParts },
  ];
}

export interface StatyStreamCallbacks {
  onStatus?: (status: { emotion: StatyEmotion; gesture: StatyGestureName; label: string }) => void;
  onDelta?: (textChunk: string) => void;
  onAction?: (action: StatyActionItem) => void;
}

export async function runStatyChatStream(
  params: StatyChatParams,
  callbacks: StatyStreamCallbacks = {},
): Promise<{
  reply: string;
  verifiedAnalysis: StatisticalComputationResult | null;
  actions: StatyActionItem[];
  emotion: StatyEmotion;
  gesture: StatyGestureName;
}> {
  if (!isGeminiConfigured()) {
    throw new Error(
      'STATY AI is not configured yet. Please add your API credentials in the application environment settings.',
    );
  }

  const ai = getGenAIClient();
  const systemInstruction = buildSystemInstruction(params.currentAppRoute);
  let currentContents: Array<{ role: string; parts: unknown[] }> = buildInitialContents(params);

  const state: ExecutionState = {
    latestAnalysis: null,
    latestDatasetId: params.datasetContext?.id ?? null,
    latestSavedAnalysisId: null,
    actions: [],
  };

  let fullReply = '';

  callbacks.onStatus?.({
    emotion: 'thinking',
    gesture: 'tilt',
    label: 'STATY is thinking...',
  });

  for (let step = 0; step < 6; step += 1) {
    let stepText = '';
    const collectedParts: unknown[] = [];
    const collectedFnCalls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> = [];
    let streamedFirstToken = false;

    await withModelFailover(
      async (model) => {
        // Reset per-attempt buffers if retrying before tokens were sent
        if (!streamedFirstToken) {
          stepText = '';
          collectedParts.length = 0;
          collectedFnCalls.length = 0;
        }
        const stream = await ai.models.generateContentStream({
          model,
          contents: currentContents as never,
          config: {
            systemInstruction,
            tools: ALL_TOOLS,
          },
        });

        for await (const chunk of stream) {
          const cText = chunk.text;
          if (cText) {
            if (!streamedFirstToken) {
              streamedFirstToken = true;
              callbacks.onStatus?.({
                emotion: 'explaining',
                gesture: 'nod',
                label: 'STATY is replying...',
              });
            }
            stepText += cText;
            fullReply += cText;
            callbacks.onDelta?.(cText);
          }

          const candidateParts = chunk.candidates?.[0]?.content?.parts;
          if (Array.isArray(candidateParts) && candidateParts.length > 0) {
            for (const p of candidateParts) {
              collectedParts.push(p);
            }
          }

          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            for (const fc of chunk.functionCalls) {
              collectedFnCalls.push({
                id: fc.id,
                name: fc.name,
                args: (fc.args as Record<string, unknown>) || {},
              });
            }
          }
        }
      },
      (label) => {
        if (!streamedFirstToken) {
          callbacks.onStatus?.({
            emotion: 'processing',
            gesture: 'ear-perk',
            label,
          });
        }
      },
    );

    if (collectedFnCalls.length === 0) {
      const finalReply =
        fullReply.trim() || 'I completed your request. Let me know what else you would like to do!';
      const hasSuccessAction = state.actions.length > 0 || state.latestAnalysis !== null;
      return {
        reply: finalReply,
        verifiedAnalysis: state.latestAnalysis,
        actions: state.actions,
        emotion: hasSuccessAction ? 'success' : 'happy',
        gesture: hasSuccessAction ? 'bounce' : 'wave-wink',
      };
    }

    if (stepText && !fullReply.endsWith('\n')) {
      fullReply += '\n\n';
      callbacks.onDelta?.('\n\n');
    }

    const responseParts = [];
    for (const fc of collectedFnCalls) {
      const fnName = fc.name || '';
      callbacks.onStatus?.(describeToolAction(fnName));
      const exec = await executeToolCall(params.userId, fnName, fc.args || {}, state);
      if (exec.action) {
        callbacks.onAction?.(exec.action);
      }
      responseParts.push({
        functionResponse: {
          id: fc.id,
          name: fnName,
          response: { result: exec.result },
        },
      });
    }

    currentContents = [
      ...currentContents,
      { role: 'model', parts: collectedParts },
      { role: 'user', parts: responseParts },
    ];
  }

  return {
    reply:
      fullReply.trim() ||
      'I finished running those operations across your workspace. Let me know what to explore next!',
    verifiedAnalysis: state.latestAnalysis,
    actions: state.actions,
    emotion: 'happy',
    gesture: 'nod',
  };
}

export async function runStatyChatTurn(params: StatyChatParams): Promise<{
  reply: string;
  verifiedAnalysis?: StatisticalComputationResult | null;
  actions?: StatyActionItem[];
  emotion: StatyEmotion;
  gesture: StatyGestureName;
}> {
  return runStatyChatStream(params);
}
