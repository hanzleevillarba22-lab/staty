import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FileText,
  FlaskConical,
  Grid3X3,
  Loader2,
  Play,
  Plus,
  Redo2,
  Save,
  Search,
  Sparkles,
  TableProperties,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { datasetsApi, projectsApi, reportsApi, statisticsApi } from '../lib/api.ts';
import { playEnterChime, playTransitionNavigate } from '../lib/soundEffects.ts';
import { showSuccessToast } from '../lib/toast.ts';
import type {
  DatasetSummaryItem,
  DataType,
  MeasurementLevel,
  NavRoute,
  ResearchProject,
  StatisticalComputationResult,
  ThemeMode,
} from '../types/index.ts';
import { StatisticalResultPanel } from './StatisticalResultPanel.tsx';

interface DataAnalysisViewProps {
  theme: ThemeMode;
  initialContext?: string;
  onChanged: () => void;
  onNavigate: (route: NavRoute, contextLabel?: string) => void;
}

interface EditableVariable {
  name: string;
  description: string;
  dataType: DataType;
  measurementLevel: MeasurementLevel;
}

interface EditorSnapshot {
  variables: EditableVariable[];
  rows: Record<string, string>[];
}

type InstrumentProcedure =
  | 'independent_t'
  | 'mann_whitney'
  | 'paired_t'
  | 'wilcoxon'
  | 'one_way_anova'
  | 'kruskal_wallis'
  | 'pearson_correlation'
  | 'spearman'
  | 'multiple_regression'
  | 'chi_square'
  | 'cronbach_alpha';

const INSTRUMENT_OPTIONS: Array<{
  key: InstrumentProcedure;
  label: string;
  instrumentTag: string;
  desc: string;
  template: string;
}> = [
  {
    key: 'independent_t',
    label: 'Two-Group Test / Quiz (Independent T-Test)',
    instrumentTag: '2 Independent Groups',
    desc: 'Compare numeric scores between 2 independent groups.',
    template: `Group, Score\nControl, 72\nControl, 75\nControl, 74\nControl, 76\nExperimental, 85\nExperimental, 88\nExperimental, 87\nExperimental, 90`,
  },
  {
    key: 'mann_whitney',
    label: 'Two-Group Rank Instrument (Mann-Whitney U)',
    instrumentTag: '2 Groups Nonparametric',
    desc: 'Compare skewed or ordinal scores across 2 independent groups.',
    template: `Group, Rating\nControl, 2\nControl, 3\nControl, 2\nControl, 3\nIntervention, 4\nIntervention, 5\nIntervention, 4\nIntervention, 5`,
  },
  {
    key: 'paired_t',
    label: 'Pre-Test / Post-Test Instrument (Paired T-Test)',
    instrumentTag: 'Before & After Paired',
    desc: 'Measure score gain across two repeated observations.',
    template: `PreTest, PostTest\n64, 78\n67, 82\n62, 75\n70, 86\n68, 84\n65, 80`,
  },
  {
    key: 'wilcoxon',
    label: 'Pre-Test / Post-Test Scale (Wilcoxon Signed-Rank)',
    instrumentTag: 'Paired Nonparametric',
    desc: 'Compare paired ordinal or skewed before/after ratings.',
    template: `Before, After\n2, 4\n3, 4\n2, 5\n3, 5\n2, 4\n3, 4`,
  },
  {
    key: 'one_way_anova',
    label: 'Multi-Group Rubric / Experiment (One-Way ANOVA)',
    instrumentTag: '3+ Groups Comparison',
    desc: 'Compare numeric outcomes across 3 or more groups.',
    template: `Method, Score\nLecture, 70\nLecture, 72\nLecture, 69\nHybrid, 80\nHybrid, 82\nHybrid, 79\nLab, 90\nLab, 92\nLab, 89`,
  },
  {
    key: 'kruskal_wallis',
    label: 'Multi-Group Rank Rubric (Kruskal-Wallis H)',
    instrumentTag: '3+ Groups Nonparametric',
    desc: 'Compare ordinal/non-normal scores across 3+ independent groups.',
    template: `Method, Score\nGroupA, 1\nGroupA, 2\nGroupA, 2\nGroupB, 3\nGroupB, 3\nGroupB, 4\nGroupC, 5\nGroupC, 5\nGroupC, 4`,
  },
  {
    key: 'pearson_correlation',
    label: 'Bivariate Numeric Checklist (Pearson r)',
    instrumentTag: '2 Numeric Variables',
    desc: 'Test linear relationship between two continuous measurements.',
    template: `StudyHours, ExamScore\n2.0, 68\n3.0, 74\n4.0, 80\n5.0, 86\n6.0, 91\n6.5, 94`,
  },
  {
    key: 'spearman',
    label: 'Rank / Ordinal Checklist (Spearman rho)',
    instrumentTag: 'Monotonic Correlation',
    desc: 'Evaluate monotonic relationship on ranked or ordinal items.',
    template: `EngagementRank, SatisfactionRank\n1, 2\n2, 2\n3, 3\n4, 4\n5, 4\n6, 5`,
  },
  {
    key: 'multiple_regression',
    label: 'Multi-Factor Predictive Survey (Multiple Regression)',
    instrumentTag: 'Outcome + Predictors',
    desc: 'Predict one numeric outcome from 1 or more predictor columns.',
    template: `Score, StudyHours, Attendance\n68, 2.0, 75\n74, 3.0, 82\n80, 4.0, 88\n86, 5.0, 92\n91, 6.0, 96\n94, 6.5, 98`,
  },
  {
    key: 'chi_square',
    label: 'Categorical Survey Tally (Chi-Square)',
    instrumentTag: '2 Categorical Variables',
    desc: 'Test association between two nominal/categorical survey responses.',
    template: `Track, Passed\nSTEM, Yes\nSTEM, Yes\nSTEM, Yes\nSTEM, No\nABM, No\nABM, Yes\nABM, No\nABM, No`,
  },
  {
    key: 'cronbach_alpha',
    label: "Likert Scale Questionnaire (Cronbach's Alpha)",
    instrumentTag: '3+ Likert Items',
    desc: 'Check internal consistency reliability across 3+ Likert survey items.',
    template: `Q1, Q2, Q3, Q4\n4, 4, 5, 4\n3, 3, 4, 3\n5, 5, 5, 4\n2, 2, 3, 2\n4, 5, 4, 4\n3, 4, 3, 3`,
  },
];

function serializeToQuickTypeText(
  vars: EditableVariable[],
  rowList: Record<string, string>[],
): string {
  const header = vars.map((v) => v.name).join(', ');
  const lines = rowList.map((r) => vars.map((v) => (r[v.name] ?? '').trim()).join(', '));
  return [header, ...lines].join('\n');
}

function parseQuickTypeText(raw: string): {
  variables: EditableVariable[];
  rows: Record<string, string>[];
} {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error('Write or paste at least one row of data before saving or analyzing.');
  }

  const splitRow = (line: string): string[] => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    if (line.includes(',')) return line.split(',').map((c) => c.trim());
    if (line.includes(';')) return line.split(';').map((c) => c.trim());
    if (line.includes('|')) return line.split('|').map((c) => c.trim());
    return line.split(/\s+/).map((c) => c.trim());
  };

  const matrix = lines.map(splitRow);
  const maxCols = Math.max(...matrix.map((r) => r.length));
  if (maxCols === 0) {
    throw new Error('Could not detect any columns in your typed dataset.');
  }

  const isNumericToken = (val: string) => val !== '' && !Number.isNaN(Number(val));
  const firstRow = matrix[0];
  const hasExplicitHeader =
    matrix.length > 1 && firstRow.some((cell) => cell !== '' && !isNumericToken(cell));

  const rawHeaders = hasExplicitHeader
    ? firstRow.map((h, i) => h.replace(/[^a-zA-Z0-9_ -]/g, '').trim() || `Var_${i + 1}`)
    : Array.from({ length: maxCols }, (_, i) => `Var_${i + 1}`);

  // Ensure unique header names
  const seenNames = new Map<string, number>();
  const uniqueHeaders = Array.from({ length: maxCols }, (_, idx) => {
    const base = rawHeaders[idx] || `Var_${idx + 1}`;
    const count = seenNames.get(base) ?? 0;
    seenNames.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });

  const dataLines = hasExplicitHeader ? matrix.slice(1) : matrix;
  if (dataLines.length === 0) {
    throw new Error('Add at least 1 data row beneath your header row.');
  }

  const variables: EditableVariable[] = uniqueHeaders.map((name, colIdx) => {
    const colVals = dataLines.map((r) => (r[colIdx] ?? '').trim()).filter((v) => v !== '');
    const allNum = colVals.length > 0 && colVals.every((v) => isNumericToken(v));
    const allInt = allNum && colVals.every((v) => /^-?\d+$/.test(v));
    const allBool =
      colVals.length > 0 &&
      colVals.every((v) => ['true', 'false'].includes(v.toLowerCase()));

    const dataType: DataType = allBool
      ? 'Boolean'
      : allInt
        ? 'Integer'
        : allNum
          ? 'Decimal'
          : 'Text';
    const measurementLevel: MeasurementLevel =
      dataType === 'Integer' || dataType === 'Decimal' ? 'Ratio' : 'Nominal';

    return {
      name,
      description: '',
      dataType,
      measurementLevel,
    };
  });

  const rows: Record<string, string>[] = dataLines.map((cells) => {
    const obj: Record<string, string> = {};
    uniqueHeaders.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });

  return { variables, rows };
}

export const DataAnalysisView: React.FC<DataAnalysisViewProps> = ({
  theme,
  initialContext,
  onChanged,
  onNavigate,
}) => {
  const [tab, setTab] = useState<'list' | 'upload' | 'manual' | 'inspect'>(() => {
    if (initialContext?.toLowerCase().includes('manual')) return 'manual';
    if (initialContext?.toLowerCase().includes('upload')) return 'upload';
    return 'list';
  });

  const [datasets, setDatasets] = useState<DatasetSummaryItem[]>([]);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    if (!initialContext) return;
    const l = initialContext.toLowerCase();
    if (l.includes('manual')) setTab('manual');
    else if (l.includes('upload')) setTab('upload');
  }, [initialContext]);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadProjectId, setUploadProjectId] = useState<number | ''>('');
  const [uploading, setUploading] = useState(false);
  const [headerWarnings, setHeaderWarnings] = useState<string[]>([]);

  // Inspect & Cleaning state
  const [inspectedId, setInspectedId] = useState<number | null>(null);
  const [inspectedData, setInspectedData] = useState<Awaited<
    ReturnType<typeof datasetsApi.getDetail>
  > | null>(null);
  const [cleanOp, setCleanOp] = useState<string>('remove_duplicates');
  const [cleanCol, setCleanCol] = useState<string>('');
  const [cleanStrategy, setCleanStrategy] = useState<'mean' | 'median' | 'mode'>('mean');
  const [cleanTargetType, setCleanTargetType] = useState<DataType>('Decimal');
  const [cleanNewVarName, setCleanNewVarName] = useState('');
  const [cleanCopyName, setCleanCopyName] = useState('');
  const [cleanPreview, setCleanPreview] = useState<{
    rows: Record<string, unknown>[];
    rowCount: number;
    colCount: number;
    summary: string;
  } | null>(null);
  const [outlierSpotter, setOutlierSpotter] = useState(false);
  const [inlineEditing, setInlineEditing] = useState(false);
  const [inlineDraftRows, setInlineDraftRows] = useState<Record<string, string | number | boolean | null>[]>([]);
  const [savingInline, setSavingInline] = useState(false);

  // Manual Dataset Encoder state
  const [editingDatasetId, setEditingDatasetId] = useState<number | null>(null);
  const [manualName, setManualName] = useState('Manual Research Dataset');
  const [manualProjectId, setManualProjectId] = useState<number | ''>('');
  const [variables, setVariables] = useState<EditableVariable[]>([
    { name: 'Group', description: 'Experimental condition', dataType: 'Text', measurementLevel: 'Nominal' },
    { name: 'Score', description: 'Measured test score', dataType: 'Decimal', measurementLevel: 'Ratio' },
  ]);
  const [rows, setRows] = useState<Record<string, string>[]>([
    { Group: 'Control', Score: '74' },
    { Group: 'Control', Score: '78' },
    { Group: 'Treatment', Score: '86' },
    { Group: 'Treatment', Score: '90' },
  ]);
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorSnapshot[]>([]);
  const [savingManual, setSavingManual] = useState(false);

  // Manual Quick Type + Instant Instrument Output state
  const [manualEntryMode, setManualEntryMode] = useState<'quick-type' | 'grid'>('quick-type');
  const [quickTypeText, setQuickTypeText] = useState<string>(
    INSTRUMENT_OPTIONS[0].template,
  );
  const [instrumentProc, setInstrumentProc] = useState<InstrumentProcedure>('independent_t');
  const [instResearchQuestion, setInstResearchQuestion] = useState('');
  const [instColA, setInstColA] = useState('Group');
  const [instColB, setInstColB] = useState('Score');
  const [instPredictors, setInstPredictors] = useState<string[]>(['Score']);
  const [instCronbachItems, setInstCronbachItems] = useState<string[]>([]);
  const [runningInstrument, setRunningInstrument] = useState(false);
  const [manualResult, setManualResult] = useState<StatisticalComputationResult | null>(null);
  const [manualSavedAnalysisId, setManualSavedAnalysisId] = useState<number | null>(null);

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const [dsRes, prRes] = await Promise.all([
        datasetsApi.list(search, projectFilter ? Number(projectFilter) : null),
        projectsApi.list(),
      ]);
      setDatasets(dsRes.datasets);
      setProjects(prRes.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load datasets.');
    } finally {
      setLoading(false);
    }
  }, [search, projectFilter]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    const handler = () => {
      loadDatasets();
    };
    window.addEventListener('statlytics:workspace-updated', handler);
    return () => window.removeEventListener('statlytics:workspace-updated', handler);
  }, [loadDatasets]);

  const pushUndo = (nextVars: EditableVariable[], nextRows: Record<string, string>[]) => {
    setUndoStack((prev) => [
      ...prev.slice(-19),
      {
        variables: variables.map((v) => ({ ...v })),
        rows: rows.map((r) => ({ ...r })),
      },
    ]);
    setRedoStack([]);
    setVariables(nextVars);
    setRows(nextRows);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [
      ...r,
      { variables: variables.map((v) => ({ ...v })), rows: rows.map((row) => ({ ...row })) },
    ]);
    setUndoStack((u) => u.slice(0, -1));
    setVariables(prev.variables);
    setRows(prev.rows);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [
      ...u,
      { variables: variables.map((v) => ({ ...v })), rows: rows.map((row) => ({ ...row })) },
    ]);
    setRedoStack((r) => r.slice(0, -1));
    setVariables(next.variables);
    setRows(next.rows);
  };

  const outlierFences = useMemo(() => {
    const fences = new Map<string, { lower: number; upper: number; count: number }>();
    if (!inspectedData) return fences;
    for (const v of inspectedData.variables) {
      if (v.data_type !== 'Integer' && v.data_type !== 'Decimal') continue;
      const nums = inspectedData.rows
        .map((r) => {
          const raw = r[v.name];
          if (raw === null || raw === undefined || String(raw).trim() === '') return NaN;
          return Number(raw);
        })
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (nums.length < 4) continue;
      const q = (p: number) => {
        const pos = (nums.length - 1) * p;
        const base = Math.floor(pos);
        const rest = pos - base;
        return nums[base + 1] !== undefined
          ? nums[base] + rest * (nums[base + 1] - nums[base])
          : nums[base];
      };
      const q1 = q(0.25);
      const q3 = q(0.75);
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      const count = nums.filter((n) => n < lower || n > upper).length;
      fences.set(v.name, { lower, upper, count });
    }
    return fences;
  }, [inspectedData]);

  const openInspect = async (id: number) => {
    setError(null);
    setNotice(null);
    setCleanPreview(null);
    setInlineEditing(false);
    const detail = await datasetsApi.getDetail(id);
    setInspectedId(id);
    setInspectedData(detail);
    setInlineDraftRows(detail.rows.map((r) => ({ ...r })));
    setCleanCopyName(`${detail.dataset.name} (Cleaned)`);
    if (detail.variables.length > 0) setCleanCol(detail.variables[0].name);
    setTab('inspect');
  };

  const handleSaveInlineEdits = async () => {
    if (!inspectedData || !inspectedId) return;
    setSavingInline(true);
    setError(null);
    try {
      const normalizedRows = inlineDraftRows.map((row) => {
        const obj: Record<string, string | number | boolean | null> = {};
        for (const v of inspectedData.variables) {
          const raw = row[v.name];
          if (raw === null || raw === undefined || String(raw).trim() === '') {
            obj[v.name] = null;
          } else if (v.data_type === 'Integer' || v.data_type === 'Decimal') {
            const num = Number(raw);
            obj[v.name] = Number.isFinite(num) ? num : String(raw);
          } else if (v.data_type === 'Boolean') {
            obj[v.name] = String(raw).toLowerCase() === 'true' || raw === true;
          } else {
            obj[v.name] = String(raw);
          }
        }
        return obj;
      });
      await datasetsApi.update(inspectedId, {
        name: inspectedData.dataset.name,
        projectId: inspectedData.dataset.project_id,
        variables: inspectedData.variables.map((v) => ({
          name: v.name,
          description: v.description || '',
          dataType: v.data_type,
          measurementLevel: v.measurement_level,
        })),
        rows: normalizedRows,
      });
      const refreshed = await datasetsApi.getDetail(inspectedId);
      setInspectedData(refreshed);
      setInlineDraftRows(refreshed.rows.map((r) => ({ ...r })));
      setInlineEditing(false);
      playTransitionNavigate();
      const msg = `Saved inline cell edits to "${refreshed.dataset.name}".`;
      setNotice(msg);
      showSuccessToast('Dataset Updated', msg);
      await loadDatasets();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save inline cell edits.');
    } finally {
      setSavingInline(false);
    }
  };

  const openInManualEditor = async (id: number) => {
    const detail = await datasetsApi.getDetail(id);
    setEditingDatasetId(id);
    setManualName(detail.dataset.name);
    setManualProjectId(detail.dataset.project_id ?? '');
    const loadedVars: EditableVariable[] = detail.variables.map((v) => ({
      name: v.name,
      description: v.description || '',
      dataType: v.data_type,
      measurementLevel: v.measurement_level,
    }));
    const loadedRows = detail.rows.map((r) => {
      const strRow: Record<string, string> = {};
      detail.variables.forEach((v) => {
        strRow[v.name] = r[v.name] === null || r[v.name] === undefined ? '' : String(r[v.name]);
      });
      return strRow;
    });
    setVariables(loadedVars);
    setRows(loadedRows);
    setQuickTypeText(serializeToQuickTypeText(loadedVars, loadedRows));
    setManualResult(null);
    setManualSavedAnalysisId(null);
    setUndoStack([]);
    setRedoStack([]);
    setTab('manual');
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setError('Select a CSV, XLSX, or XLS file to import.');
      return;
    }
    setUploading(true);
    setError(null);
    setHeaderWarnings([]);
    try {
      const res = await datasetsApi.upload(
        uploadFile,
        uploadName.trim() || undefined,
        uploadProjectId ? Number(uploadProjectId) : null,
      );
      setHeaderWarnings(res.preview.headerWarnings);
      const importMsg = `Imported "${res.name}" (${res.preview.rowCount} rows × ${res.preview.colCount} columns).`;
      setNotice(importMsg);
      showSuccessToast('Dataset Imported', importMsg);
      setUploadFile(null);
      setUploadName('');
      await loadDatasets();
      onChanged();
      await openInspect(res.datasetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const buildCleanOperation = () => {
    if (cleanOp === 'remove_duplicates') return { type: 'remove_duplicates' };
    if (cleanOp === 'drop_missing_rows') return { type: 'drop_missing_rows' };
    if (cleanOp === 'remove_empty_columns') return { type: 'remove_empty_columns' };
    if (cleanOp === 'impute_missing')
      return { type: 'impute_missing', strategy: cleanStrategy, column: cleanCol || undefined };
    if (cleanOp === 'convert_type')
      return { type: 'convert_type', column: cleanCol, targetType: cleanTargetType };
    if (cleanOp === 'rename_variable')
      return { type: 'rename_variable', oldName: cleanCol, newName: cleanNewVarName };
    return { type: 'remove_duplicates' };
  };

  const handlePreviewClean = async () => {
    if (!inspectedId) return;
    setError(null);
    try {
      const res = await datasetsApi.clean(inspectedId, {
        operation: buildCleanOperation(),
        applyAsCopy: false,
      });
      if (res.preview) {
        setCleanPreview({
          rows: res.preview.rows,
          rowCount: res.preview.rowCount,
          colCount: res.preview.colCount,
          summary: res.preview.summary,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleaning preview failed.');
    }
  };

  const handleApplyCleanCopy = async () => {
    if (!inspectedId) return;
    setError(null);
    try {
      const res = await datasetsApi.clean(inspectedId, {
        operation: buildCleanOperation(),
        applyAsCopy: true,
        newName: cleanCopyName.trim(),
      });
      setCleanPreview(null);
      const cleanMsg = `Saved cleaned copy "${res.name}". Original dataset preserved.`;
      setNotice(cleanMsg);
      showSuccessToast('Cleaned Copy Created', cleanMsg);
      await loadDatasets();
      onChanged();
      if (res.datasetId) await openInspect(res.datasetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save cleaned copy.');
    }
  };

  const quickTypePreview = useMemo(() => {
    try {
      const parsed = parseQuickTypeText(quickTypeText);
      return { ok: true as const, ...parsed };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Unable to parse typed data.',
      };
    }
  }, [quickTypeText]);

  const activeManualVars = useMemo(() => {
    if (manualEntryMode === 'quick-type' && quickTypePreview.ok) {
      return quickTypePreview.variables;
    }
    return variables;
  }, [manualEntryMode, quickTypePreview, variables]);

  // Keep instrument column pickers valid whenever active variables change
  useEffect(() => {
    if (activeManualVars.length === 0) return;
    const names = activeManualVars.map((v) => v.name);
    const numericNames = activeManualVars
      .filter((v) => v.dataType === 'Integer' || v.dataType === 'Decimal')
      .map((v) => v.name);

    if (!names.includes(instColA)) {
      setInstColA(names[0]);
    }
    if (!names.includes(instColB)) {
      setInstColB(names[1] ?? names[0]);
    }
    setInstPredictors((prev) => {
      const kept = prev.filter((p) => names.includes(p));
      if (kept.length > 0) return kept;
      return names.length > 1 ? names.slice(1) : [names[0]];
    });
    setInstCronbachItems((prev) => {
      const kept = prev.filter((item) => names.includes(item));
      if (kept.length >= 3) return kept;
      return numericNames.length >= 3 ? numericNames : names;
    });
  }, [activeManualVars, instColA, instColB]);

  const persistCurrentManualDataset = async (): Promise<{
    datasetId: number;
    savedVars: EditableVariable[];
  }> => {
    if (manualName.trim().length < 2) {
      throw new Error('Dataset name must be at least 2 characters.');
    }

    let sourceVars = variables;
    let sourceRows = rows;

    if (manualEntryMode === 'quick-type') {
      const parsed = parseQuickTypeText(quickTypeText);
      sourceVars = parsed.variables;
      sourceRows = parsed.rows;
      setVariables(parsed.variables);
      setRows(parsed.rows);
    }

    const parsedRows = sourceRows.map((r) => {
      const obj: Record<string, string | number | boolean | null> = {};
      for (const v of sourceVars) {
        const raw = (r[v.name] ?? '').trim();
        if (raw === '') {
          obj[v.name] = null;
        } else if (v.dataType === 'Integer' || v.dataType === 'Decimal') {
          const num = Number(raw);
          obj[v.name] = Number.isFinite(num) ? num : raw;
        } else if (v.dataType === 'Boolean') {
          obj[v.name] = raw.toLowerCase() === 'true' || raw === '1';
        } else {
          obj[v.name] = raw;
        }
      }
      return obj;
    });

    let targetId = editingDatasetId;
    if (targetId) {
      await datasetsApi.update(targetId, {
        name: manualName.trim(),
        projectId: manualProjectId ? Number(manualProjectId) : null,
        variables: sourceVars,
        rows: parsedRows,
      });
    } else {
      const res = await datasetsApi.saveManual({
        name: manualName.trim(),
        projectId: manualProjectId ? Number(manualProjectId) : null,
        variables: sourceVars,
        rows: parsedRows,
      });
      targetId = res.datasetId;
      setEditingDatasetId(targetId);
    }

    return { datasetId: targetId, savedVars: sourceVars };
  };

  const handleSaveManualDataset = async () => {
    setError(null);
    setNotice(null);
    setSavingManual(true);
    try {
      const wasEditing = Boolean(editingDatasetId);
      await persistCurrentManualDataset();
      const saveMsg = wasEditing
        ? `Updated "${manualName.trim()}".`
        : `Saved manual dataset "${manualName.trim()}".`;
      setNotice(saveMsg);
      showSuccessToast('Dataset Saved', saveMsg);
      playEnterChime();
      await loadDatasets();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save dataset.');
    } finally {
      setSavingManual(false);
    }
  };

  const executeManualInstrument = async (procToRun: InstrumentProcedure) => {
    setError(null);
    setNotice(null);
    setManualSavedAnalysisId(null);
    setRunningInstrument(true);
    try {
      const { datasetId: savedId, savedVars } = await persistCurrentManualDataset();
      const names = savedVars.map((v) => v.name);
      const col1 = names.includes(instColA) ? instColA : names[0];
      const col2 = names.includes(instColB) ? instColB : (names[1] ?? names[0]);

      const payload: Record<string, unknown> = {
        datasetId: savedId,
        procedure: procToRun,
        researchQuestion: instResearchQuestion.trim(),
        alpha: 0.05,
      };

      if (
        procToRun === 'one_way_anova' ||
        procToRun === 'kruskal_wallis' ||
        procToRun === 'independent_t' ||
        procToRun === 'mann_whitney'
      ) {
        payload.groupColumn = col1;
        payload.valueColumn = col2;
      } else if (procToRun === 'paired_t' || procToRun === 'wilcoxon') {
        payload.columnA = col1;
        payload.columnB = col2;
      } else if (procToRun === 'pearson_correlation' || procToRun === 'spearman') {
        payload.columnX = col1;
        payload.columnY = col2;
      } else if (procToRun === 'multiple_regression') {
        payload.dependentColumn = col1;
        const preds = instPredictors.filter((p) => p !== col1 && names.includes(p));
        payload.predictorColumns = preds.length > 0 ? preds : names.filter((n) => n !== col1);
      } else if (procToRun === 'chi_square') {
        payload.rowColumn = col1;
        payload.colColumn = col2;
      } else if (procToRun === 'cronbach_alpha') {
        const items = instCronbachItems.filter((item) => names.includes(item));
        payload.itemColumns = items.length >= 2 ? items : names;
      }

      const res = await statisticsApi.run(payload);
      setManualResult(res.result);
      const outMsg = `${res.result.procedure} (${res.result.testResults.statisticName} = ${res.result.testResults.statisticValue.toFixed(3)}, p = ${res.result.testResults.pValue.toFixed(4)})`;
      setNotice(`Dataset saved & output ready: ${outMsg}`);
      showSuccessToast('Statistical Output Ready', outMsg);
      playEnterChime();
      await loadDatasets();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate output for selected instrument.');
    } finally {
      setRunningInstrument(false);
    }
  };

  const handleLoadInstrumentTemplate = (proc: InstrumentProcedure) => {
    const found = INSTRUMENT_OPTIONS.find((o) => o.key === proc);
    if (!found) return;
    setQuickTypeText(found.template);
    const parsed = parseQuickTypeText(found.template);
    setVariables(parsed.variables);
    setRows(parsed.rows);
    setInstColA(parsed.variables[0]?.name ?? '');
    setInstColB(parsed.variables[1]?.name ?? parsed.variables[0]?.name ?? '');
    setInstPredictors(parsed.variables.slice(1).map((v) => v.name));
    setInstCronbachItems(parsed.variables.map((v) => v.name));
    playTransitionNavigate();
    showSuccessToast('Template Loaded', `${found.instrumentTag} starter data loaded — edit any values below.`);
  };

  const handlePasteTable = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT') return;
    // Only intercept multi-line / multi-cell spreadsheet paste
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2 && !lines[0].includes('\t')) return;
    e.preventDefault();

    const matrix = lines.map((line) =>
      line.includes('\t') ? line.split('\t') : line.split(','),
    );
    const maxCols = Math.max(...matrix.map((r) => r.length));
    const nextVars: EditableVariable[] = Array.from({ length: maxCols }, (_, idx) =>
      variables[idx] ?? {
        name: `Variable_${idx + 1}`,
        description: '',
        dataType: 'Text',
        measurementLevel: 'Nominal',
      },
    );
    const nextRows = matrix.map((lineCells) => {
      const rowObj: Record<string, string> = {};
      nextVars.forEach((v, idx) => {
        rowObj[v.name] = (lineCells[idx] ?? '').trim();
      });
      return rowObj;
    });
    pushUndo(nextVars, nextRows);
    setNotice(`Pasted ${nextRows.length} rows × ${nextVars.length} columns.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#173B75] dark:text-white">
            Data Analysis & Datasets
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Import CSV/Excel files, inspect headers and missing values, clean safely as copies, or create datasets manually.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer ${
              tab === 'upload'
                ? 'bg-[#2563EB] text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload CSV / Excel</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingDatasetId(null);
              setTab('manual');
            }}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer ${
              tab === 'manual'
                ? 'bg-[#2563EB] text-white'
                : 'bg-[#173B75] text-white hover:bg-[#1e4b94]'
            }`}
          >
            <TableProperties className="w-4 h-4" />
            <span>CREATE DATASET MANUALLY</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {tab === 'upload' && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Import Statistical Dataset
            </h2>
            <button
              type="button"
              onClick={() => setTab('list')}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              View Saved Datasets
            </button>
          </div>

          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Dataset Name (Optional)
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Defaults to uploaded filename"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Assign to Project (Optional)
                </label>
                <select
                  value={uploadProjectId}
                  onChange={(e) =>
                    setUploadProjectId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="">No project assigned</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="block rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-8 text-center cursor-pointer hover:border-[#2563EB] transition-colors">
              <Upload className="w-8 h-8 text-[#2563EB] mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {uploadFile ? uploadFile.name : 'Tap to choose a CSV, XLSX, or XLS file'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Automatic header detection, missing-value scan, and duplicate detection (max 10 MB)
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>

            <button
              type="submit"
              disabled={uploading}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Import & Inspect Dataset</span>
            </button>
          </form>
        </section>
      )}

      {tab === 'manual' && (
        <div className="space-y-6">
        <section
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5"
          onPaste={handlePasteTable}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTab('list')}
                className="min-h-[40px] p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                aria-label="Back to datasets list"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {editingDatasetId ? 'Edit Dataset' : 'CREATE DATASET MANUALLY'}
                </h2>
                <p className="text-xs text-slate-500">
                  Write all data freely in Quick Type or edit cell-by-cell, pick your research instrument, and get verified output immediately.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    if (manualEntryMode !== 'quick-type') {
                      setQuickTypeText(serializeToQuickTypeText(variables, rows));
                      setManualEntryMode('quick-type');
                    }
                  }}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    manualEntryMode === 'quick-type'
                      ? 'bg-[#2563EB] text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Quick Type (Write All)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (manualEntryMode === 'quick-type') {
                      if (quickTypePreview.ok) {
                        setVariables(quickTypePreview.variables);
                        setRows(quickTypePreview.rows);
                      }
                      setManualEntryMode('grid');
                    }
                  }}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    manualEntryMode === 'grid'
                      ? 'bg-[#2563EB] text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  <span>Cell Grid</span>
                </button>
              </div>

              {manualEntryMode === 'grid' && (
                <>
                  <button
                    type="button"
                    disabled={undoStack.length === 0}
                    onClick={handleUndo}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo</span>
                  </button>
                  <button
                    type="button"
                    disabled={redoStack.length === 0}
                    onClick={handleRedo}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                    <span>Redo</span>
                  </button>
                </>
              )}

              <button
                type="button"
                disabled={savingManual}
                onClick={handleSaveManualDataset}
                className="min-h-[40px] px-4 py-1.5 rounded-xl border border-[#2563EB] text-[#2563EB] dark:text-blue-400 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30"
              >
                {savingManual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Only</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Dataset Name
              </label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Research Project (Optional)
              </label>
              <select
                value={manualProjectId}
                onChange={(e) =>
                  setManualProjectId(e.target.value ? Number(e.target.value) : '')
                }
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="">No project linked</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {manualEntryMode === 'quick-type' ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label
                    htmlFor="quick-type-textarea"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                  >
                    Write All Dataset Rows (Comma, Tab, Semicolon, or Space Separated)
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Type headers on row 1 (or just raw numbers — column names and types auto-detect).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadInstrumentTemplate(instrumentProc)}
                  className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-[#173B75] dark:text-blue-300 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Load Instrument Starter Data</span>
                </button>
              </div>

              <textarea
                id="quick-type-textarea"
                rows={8}
                value={quickTypeText}
                onChange={(e) => setQuickTypeText(e.target.value)}
                placeholder={'Group, Score\nControl, 72\nControl, 75\nExperimental, 86\nExperimental, 90'}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-3.5 font-mono text-xs sm:text-sm text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800/60 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                {quickTypePreview.ok ? (
                  <>
                    <div className="text-slate-700 dark:text-slate-200">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        Detected {quickTypePreview.rows.length} rows × {quickTypePreview.variables.length} columns:
                      </span>{' '}
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-300">
                        {quickTypePreview.variables.map((v) => `${v.name} [${v.dataType}]`).join(', ')}
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300">{quickTypePreview.error}</span>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Variable Configuration */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Variable Configuration
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      const nextColName = `Variable_${variables.length + 1}`;
                      const nextVars = [
                        ...variables,
                        {
                          name: nextColName,
                          description: '',
                          dataType: 'Decimal' as DataType,
                          measurementLevel: 'Ratio' as MeasurementLevel,
                        },
                      ];
                      const nextRows = rows.map((r) => ({ ...r, [nextColName]: '' }));
                      pushUndo(nextVars, nextRows);
                    }}
                    className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-[#173B75] dark:text-blue-300 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Column</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {variables.map((v, colIdx) => (
                    <div
                      key={`${colIdx}-${v.name}`}
                      className="rounded-xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={v.name}
                          onChange={(e) => {
                            const oldName = v.name;
                            const newName = e.target.value;
                            const nextVars = variables.map((item, i) =>
                              i === colIdx ? { ...item, name: newName } : item,
                            );
                            const nextRows = rows.map((r) => {
                              const copy = { ...r };
                              const val = copy[oldName] ?? '';
                              delete copy[oldName];
                              copy[newName] = val;
                              return copy;
                            });
                            setVariables(nextVars);
                            setRows(nextRows);
                          }}
                          className="flex-1 min-h-[38px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                          aria-label={`Variable ${colIdx + 1} name`}
                        />
                        {variables.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextVars = variables.filter((_, i) => i !== colIdx);
                              const nextRows = rows.map((r) => {
                                const copy = { ...r };
                                delete copy[v.name];
                                return copy;
                              });
                              pushUndo(nextVars, nextRows);
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label={`Delete column ${v.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={v.dataType}
                          onChange={(e) => {
                            const nextVars = variables.map((item, i) =>
                              i === colIdx ? { ...item, dataType: e.target.value as DataType } : item,
                            );
                            setVariables(nextVars);
                          }}
                          className="min-h-[36px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        >
                          <option value="Integer">Integer</option>
                          <option value="Decimal">Decimal</option>
                          <option value="Text">Text</option>
                          <option value="Boolean">Boolean</option>
                          <option value="Date">Date</option>
                        </select>
                        <select
                          value={v.measurementLevel}
                          onChange={(e) => {
                            const nextVars = variables.map((item, i) =>
                              i === colIdx
                                ? { ...item, measurementLevel: e.target.value as MeasurementLevel }
                                : item,
                            );
                            setVariables(nextVars);
                          }}
                          className="min-h-[36px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        >
                          <option value="Nominal">Nominal</option>
                          <option value="Ordinal">Ordinal</option>
                          <option value="Interval">Interval</option>
                          <option value="Ratio">Ratio</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Spreadsheet Grid */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/80">
                    <tr>
                      <th className="w-10 px-2 py-2 text-xs text-slate-400 font-mono text-center border-b border-slate-200 dark:border-slate-700">
                        #
                      </th>
                      {variables.map((v, idx) => (
                        <th
                          key={`hdr-${idx}-${v.name}`}
                          className="px-3 py-2 text-left text-xs font-bold text-slate-700 dark:text-slate-200 border-b border-l border-slate-200 dark:border-slate-700 min-w-[130px]"
                        >
                          {v.name}
                        </th>
                      ))}
                      <th className="w-12 px-2 py-2 border-b border-l border-slate-200 dark:border-slate-700" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, rIdx) => (
                      <tr key={rIdx} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-1.5 text-center font-mono text-xs text-slate-400">
                          {rIdx + 1}
                        </td>
                        {variables.map((v, cIdx) => (
                          <td
                            key={`cell-${rIdx}-${cIdx}`}
                            className="p-0 border-l border-slate-200 dark:border-slate-800"
                          >
                            <input
                              type="text"
                              value={r[v.name] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRows((prev) =>
                                  prev.map((row, i) =>
                                    i === rIdx ? { ...row, [v.name]: val } : row,
                                  ),
                                );
                              }}
                              className="w-full min-h-[40px] px-3 py-1.5 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none focus:bg-blue-50/40 dark:focus:bg-blue-950/30"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1 text-center border-l border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() =>
                              pushUndo(
                                variables,
                                rows.filter((_, i) => i !== rIdx),
                              )
                            }
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label={`Delete row ${rIdx + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const emptyRow: Record<string, string> = {};
                      variables.forEach((v) => {
                        emptyRow[v.name] = '';
                      });
                      pushUndo(variables, [...rows, emptyRow]);
                    }}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Row</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => pushUndo(variables, [])}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-red-600 cursor-pointer"
                  >
                    Clear Rows
                  </button>
                </div>

                {editingDatasetId && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => datasetsApi.exportFile(editingDatasetId, 'csv', manualName)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => datasetsApi.exportFile(editingDatasetId, 'xlsx', manualName)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Excel</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Selected Instrument & Instant Output Panel */}
          <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-slate-800/70 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-[#2563EB] dark:text-blue-400 shrink-0" />
                <h3 className="font-display text-sm font-bold text-[#173B75] dark:text-white">
                  Selected Research Instrument & Direct Output
                </h3>
              </div>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {INSTRUMENT_OPTIONS.find((o) => o.key === instrumentProc)?.instrumentTag}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Research Instrument / Statistical Procedure
                </label>
                <select
                  value={instrumentProc}
                  onChange={(e) => setInstrumentProc(e.target.value as InstrumentProcedure)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  {INSTRUMENT_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {INSTRUMENT_OPTIONS.find((o) => o.key === instrumentProc)?.desc}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Research Question / Purpose (Optional)
                </label>
                <input
                  type="text"
                  value={instResearchQuestion}
                  onChange={(e) => setInstResearchQuestion(e.target.value)}
                  placeholder="e.g., Is there a significant difference in scores?"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>
            </div>

            {/* Dynamic Variable Role Pickers based on Instrument */}
            {instrumentProc === 'cronbach_alpha' ? (
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  Survey / Likert Items Included ({instCronbachItems.length} selected)
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeManualVars.map((v) => {
                    const checked = instCronbachItems.includes(v.name);
                    return (
                      <button
                        key={v.name}
                        type="button"
                        onClick={() =>
                          setInstCronbachItems((prev) =>
                            checked ? prev.filter((item) => item !== v.name) : [...prev, v.name],
                          )
                        }
                        className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#2563EB] text-white border-[#2563EB]'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : instrumentProc === 'multiple_regression' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Dependent Outcome Variable (Y)
                  </label>
                  <select
                    value={instColA}
                    onChange={(e) => setInstColA(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    {activeManualVars.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Predictor Variables (X)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeManualVars
                      .filter((v) => v.name !== instColA)
                      .map((v) => {
                        const checked = instPredictors.includes(v.name);
                        return (
                          <button
                            key={v.name}
                            type="button"
                            onClick={() =>
                              setInstPredictors((prev) =>
                                checked ? prev.filter((p) => p !== v.name) : [...prev, v.name],
                              )
                            }
                            className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold border cursor-pointer ${
                              checked
                                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {v.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {instrumentProc === 'paired_t' || instrumentProc === 'wilcoxon'
                      ? 'Pre-Test / Baseline Column'
                      : instrumentProc === 'pearson_correlation' || instrumentProc === 'spearman'
                        ? 'Variable X Column'
                        : instrumentProc === 'chi_square'
                          ? 'Row Variable'
                          : 'Grouping Column (IV)'}
                  </label>
                  <select
                    value={instColA}
                    onChange={(e) => setInstColA(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    {activeManualVars.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {instrumentProc === 'paired_t' || instrumentProc === 'wilcoxon'
                      ? 'Post-Test / Follow-Up Column'
                      : instrumentProc === 'pearson_correlation' || instrumentProc === 'spearman'
                        ? 'Variable Y Column'
                        : instrumentProc === 'chi_square'
                          ? 'Column Variable'
                          : 'Outcome Score Column (DV)'}
                  </label>
                  <select
                    value={instColB}
                    onChange={(e) => setInstColB(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    {activeManualVars.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                disabled={runningInstrument || savingManual}
                onClick={() => executeManualInstrument(instrumentProc)}
                className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                {runningInstrument ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Save Dataset & Generate Instrument Output</span>
              </button>

              {manualResult && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Output active below ({manualResult.procedure})
                </span>
              )}
            </div>
          </div>
        </section>

        {manualResult && (
          <StatisticalResultPanel
            result={manualResult}
            theme={theme}
            canSave={Boolean(editingDatasetId)}
            savedAnalysisId={manualSavedAnalysisId}
            onRunAlternative={async (altKey) => {
              const valid = INSTRUMENT_OPTIONS.some((o) => o.key === altKey);
              if (!valid) return;
              const nextProc = altKey as InstrumentProcedure;
              setInstrumentProc(nextProc);
              await executeManualInstrument(nextProc);
            }}
            onSaveAnalysis={async (title) => {
              if (!editingDatasetId) return;
              const res = await statisticsApi.save({
                title,
                datasetId: editingDatasetId,
                projectId: manualProjectId ? Number(manualProjectId) : null,
                result: manualResult,
              });
              setManualSavedAnalysisId(res.analysisId);
              playEnterChime();
              showSuccessToast('Analysis Saved', `"${title}" added to My Analyses.`);
              onChanged();
            }}
            onGenerateReport={async (format) => {
              let targetAnalysisId = manualSavedAnalysisId;
              if (!targetAnalysisId && editingDatasetId) {
                const autoSave = await statisticsApi.save({
                  title: `${manualName.trim()} — ${manualResult.procedure}`,
                  datasetId: editingDatasetId,
                  projectId: manualProjectId ? Number(manualProjectId) : null,
                  result: manualResult,
                });
                targetAnalysisId = autoSave.analysisId;
                setManualSavedAnalysisId(targetAnalysisId);
                onChanged();
              }
              if (!targetAnalysisId) return;
              const gen = await reportsApi.generate({
                analysisId: targetAnalysisId,
                format,
                title: `${manualName.trim()} — ${manualResult.procedure}`,
              });
              const ext = format === 'pdf' ? 'pdf' : format === 'docx' ? 'docx' : 'xlsx';
              const safeFilename = `${gen.report.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
              await reportsApi.download(gen.report.id, safeFilename);
              playEnterChime();
              showSuccessToast(
                'Report Exported',
                `Generated and downloaded ${format.toUpperCase()} report.`,
              );
              onChanged();
            }}
          />
        )}
        </div>
      )}

      {tab === 'inspect' && inspectedData && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setTab('list')}
              className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Datasets</span>
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  datasetsApi.exportFile(
                    inspectedData.dataset.id,
                    'csv',
                    inspectedData.dataset.name,
                  )
                }
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  datasetsApi.exportFile(
                    inspectedData.dataset.id,
                    'xlsx',
                    inspectedData.dataset.name,
                  )
                }
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => onNavigate('statistical-tests')}
                className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
              >
                Analyze Dataset
              </button>
            </div>
          </div>

          {headerWarnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4" />
                <span>Intelligent Header & Structure Diagnostics</span>
              </div>
              <ul className="text-xs text-amber-800 dark:text-amber-200 list-disc list-inside space-y-0.5">
                {headerWarnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Dataset Quality Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500">Rows</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                {inspectedData.dataset.row_count}
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500">Columns</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                {inspectedData.dataset.col_count}
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500">Missing Cells</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                {inspectedData.summary.totalMissingCells}
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500">Duplicate Rows</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                {inspectedData.summary.duplicateRowCount}
              </p>
            </div>
          </div>

          {/* Data Cleaning Panel (Preview + Save as Separate Copy) */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#2563EB]" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Data Cleaning (Preserves Original Dataset)
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={cleanOp}
                onChange={(e) => setCleanOp(e.target.value)}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="remove_duplicates">Remove Duplicate Records</option>
                <option value="drop_missing_rows">Drop Rows with Missing Values</option>
                <option value="impute_missing">Impute Missing Values</option>
                <option value="remove_empty_columns">Remove Completely Empty Columns</option>
                <option value="rename_variable">Rename Variable</option>
                <option value="convert_type">Convert Variable Data Type</option>
              </select>

              {(cleanOp === 'impute_missing' ||
                cleanOp === 'rename_variable' ||
                cleanOp === 'convert_type') && (
                <select
                  value={cleanCol}
                  onChange={(e) => setCleanCol(e.target.value)}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  {inspectedData.variables.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.data_type})
                    </option>
                  ))}
                </select>
              )}

              {cleanOp === 'impute_missing' && (
                <select
                  value={cleanStrategy}
                  onChange={(e) =>
                    setCleanStrategy(e.target.value as 'mean' | 'median' | 'mode')
                  }
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="mean">Mean (Numeric)</option>
                  <option value="median">Median (Numeric)</option>
                  <option value="mode">Mode (Most Frequent)</option>
                </select>
              )}

              {cleanOp === 'convert_type' && (
                <select
                  value={cleanTargetType}
                  onChange={(e) => setCleanTargetType(e.target.value as DataType)}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="Integer">Integer</option>
                  <option value="Decimal">Decimal</option>
                  <option value="Text">Text</option>
                  <option value="Boolean">Boolean</option>
                </select>
              )}

              {cleanOp === 'rename_variable' && (
                <input
                  type="text"
                  value={cleanNewVarName}
                  onChange={(e) => setCleanNewVarName(e.target.value)}
                  placeholder="New variable name"
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              )}
            </div>

            <button
              type="button"
              onClick={handlePreviewClean}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#173B75] text-white text-xs font-semibold cursor-pointer"
            >
              Preview Cleaning Operation
            </button>

            {cleanPreview && (
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Preview: {cleanPreview.summary} ({cleanPreview.rowCount} rows × {cleanPreview.colCount} cols)
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={cleanCopyName}
                    onChange={(e) => setCleanCopyName(e.target.value)}
                    aria-label="Cleaned copy dataset name"
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCleanCopy}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Apply & Save Cleaned Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => setCleanPreview(null)}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Preview Table with Outlier Spotter & Inline Editing */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Dataset Preview (Showing first {Math.min(50, inspectedData.rows.length)} of {inspectedData.rows.length} rows)
                </h2>
                {outlierSpotter && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    IQR Outlier Check:{' '}
                    {Array.from(outlierFences.entries()).some(([, f]) => f.count > 0)
                      ? Array.from(outlierFences.entries())
                          .filter(([, f]) => f.count > 0)
                          .map(([col, f]) => `${col}: ${f.count} flagged`)
                          .join(' · ')
                      : 'No values fall outside 1.5× IQR fences.'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setOutlierSpotter((v) => !v)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                    outlierSpotter
                      ? 'bg-amber-600 border-amber-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-500'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{outlierSpotter ? 'Hide Outlier Spotter' : 'Outlier Spotter (IQR)'}</span>
                </button>
                {inlineEditing ? (
                  <>
                    <button
                      type="button"
                      disabled={savingInline}
                      onClick={handleSaveInlineEdits}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {savingInline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Save Inline Edits</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInlineDraftRows(inspectedData.rows.map((r) => ({ ...r })));
                        setInlineEditing(false);
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setInlineDraftRows(inspectedData.rows.map((r) => ({ ...r })));
                      setInlineEditing(true);
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer hover:border-[#2563EB]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Cells Inline</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    {inspectedData.variables.map((v) => (
                      <th key={v.name} className="py-2 px-3 font-semibold whitespace-nowrap">
                        <div>{v.name}</div>
                        <div className="text-[10px] font-normal text-slate-400">
                          {v.data_type} · {v.measurement_level}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(inlineEditing ? inlineDraftRows : inspectedData.rows)
                    .slice(0, 50)
                    .map((row, idx) => (
                      <tr key={idx}>
                        {inspectedData.variables.map((v) => {
                          const rawVal = row[v.name];
                          const numVal =
                            rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== ''
                              ? Number(rawVal)
                              : NaN;
                          const fence = outlierSpotter ? outlierFences.get(v.name) : undefined;
                          const isOutlier =
                            Boolean(fence) &&
                            Number.isFinite(numVal) &&
                            (numVal < fence!.lower || numVal > fence!.upper);

                          return (
                            <td
                              key={v.name}
                              className={`py-2 px-3 font-mono tabular-nums whitespace-nowrap ${
                                isOutlier
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-semibold'
                                  : ''
                              }`}
                            >
                              {inlineEditing ? (
                                <input
                                  type="text"
                                  value={rawVal === null || rawVal === undefined ? '' : String(rawVal)}
                                  onChange={(e) => {
                                    const nextVal = e.target.value;
                                    setInlineDraftRows((prev) =>
                                      prev.map((r, rIdx) =>
                                        rIdx === idx ? { ...r, [v.name]: nextVal } : r,
                                      ),
                                    );
                                  }}
                                  aria-label={`Row ${idx + 1} ${v.name}`}
                                  className="min-h-[34px] w-28 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                                />
                              ) : rawVal === null || rawVal === undefined || rawVal === '' ? (
                                <span className="text-slate-400 italic">missing</span>
                              ) : (
                                <span>
                                  {String(rawVal)}
                                  {isOutlier && (
                                    <span className="ml-1.5 text-[10px] font-sans font-bold text-amber-700 dark:text-amber-300">
                                      (Outlier)
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'list' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search datasets..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <select
              value={projectFilter}
              onChange={(e) =>
                setProjectFilter(e.target.value ? Number(e.target.value) : '')
              }
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading datasets...</span>
            </div>
          ) : datasets.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center">
              <TableProperties className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                No datasets saved yet
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Upload a CSV or Excel file, or click CREATE DATASET MANUALLY to enter observations directly.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {datasets.map((ds) => (
                <div
                  key={ds.id}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openInspect(ds.id)}
                      className="text-left font-display text-base font-bold text-[#173B75] dark:text-white hover:text-[#2563EB] cursor-pointer truncate block"
                    >
                      {ds.name}
                    </button>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                      <span className="font-mono tabular-nums">{ds.row_count} rows × {ds.col_count} cols</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{ds.source_type}</span>
                      {ds.project_title && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{ds.project_title}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openInspect(ds.id)}
                      className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                    >
                      Inspect & Clean
                    </button>
                    <button
                      type="button"
                      onClick={() => openInManualEditor(ds.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Edit Grid
                    </button>
                    {renamingId === ds.id ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (renameDraft.trim().length < 2) return;
                          await datasetsApi.rename(ds.id, renameDraft.trim());
                          setRenamingId(null);
                          loadDatasets();
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          aria-label="New dataset name"
                          className="min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                        />
                        <button
                          type="submit"
                          className="min-h-[38px] px-3 py-1 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(ds.id);
                          setRenameDraft(ds.name);
                        }}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await datasetsApi.duplicate(ds.id);
                        loadDatasets();
                        onChanged();
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicate</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await datasetsApi.remove(ds.id);
                        loadDatasets();
                        onChanged();
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
