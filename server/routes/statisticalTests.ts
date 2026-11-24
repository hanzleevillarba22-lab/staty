import { Router } from 'express';
import { db } from '../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { sanitizeText } from '../security.ts';
import {
  type RecommendationInput,
  recommendStatisticalTest,
} from '../services/recommendationEngine.ts';
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
} from '../services/statisticalEngine.ts';

const router = Router();
router.use(requireAuth);

router.post('/recommend', (req: AuthenticatedRequest, res) => {
  const body = req.body as Partial<RecommendationInput>;
  if (!body.objective || !body.dvMeasurementLevel || !body.design) {
    res.status(400).json({
      error: 'Please provide objective, dependent variable measurement level, and study design.',
    });
    return;
  }

  const recommendation = recommendStatisticalTest({
    researchQuestion: sanitizeText(body.researchQuestion, 500),
    objective: body.objective,
    ivMeasurementLevel: body.ivMeasurementLevel || 'None',
    dvMeasurementLevel: body.dvMeasurementLevel,
    groupCount: body.groupCount ? Number(body.groupCount) : undefined,
    design: body.design,
    normalityStatus: body.normalityStatus,
  });

  res.json({ recommendation });
});

router.post('/power', (req: AuthenticatedRequest, res) => {
  const procedure = String(req.body?.procedure || 'independent_t') as PowerProcedure;
  const validProcedures = new Set<PowerProcedure>([
    'independent_t',
    'paired_t',
    'one_way_anova',
    'pearson_correlation',
    'multiple_regression',
  ]);
  if (!validProcedures.has(procedure)) {
    res.status(400).json({ error: 'Unsupported procedure for power analysis.' });
    return;
  }

  const effectSize = Number(req.body?.effectSize ?? 0.5);
  if (!Number.isFinite(effectSize) || effectSize <= 0) {
    res.status(400).json({ error: 'Effect size must be a positive number.' });
    return;
  }

  const power = calculateSamplePower({
    procedure,
    effectSize,
    alpha: req.body?.alpha ? Number(req.body.alpha) : 0.05,
    power: req.body?.power ? Number(req.body.power) : 0.8,
    groups: req.body?.groups ? Number(req.body.groups) : 3,
    predictors: req.body?.predictors ? Number(req.body.predictors) : 3,
  });

  res.json({ power });
});

router.post('/run', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const datasetId = Number(req.body?.datasetId);
  const procedure = String(req.body?.procedure || '');
  const researchQuestion = sanitizeText(req.body?.researchQuestion, 500);
  const alpha = req.body?.alpha ? Number(req.body.alpha) : 0.05;

  const ds = db
    .prepare('SELECT id, name FROM datasets WHERE id = ? AND user_id = ?')
    .get(datasetId, userId) as { id: number; name: string } | undefined;

  if (!ds) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }

  const recs = db
    .prepare('SELECT data_json FROM dataset_records WHERE dataset_id = ? ORDER BY row_index')
    .all(datasetId) as Array<{ data_json: string }>;
  const rows = recs.map((r) => JSON.parse(r.data_json) as Record<string, unknown>);

  if (rows.length === 0) {
    res.status(400).json({ error: 'Selected dataset has no observations.' });
    return;
  }

  try {
    let result: StatisticalComputationResult;
    if (procedure === 'one_way_anova') {
      result = runOneWayAnova({
        rows,
        groupColumn: String(req.body?.groupColumn || ''),
        valueColumn: String(req.body?.valueColumn || ''),
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'kruskal_wallis') {
      result = runKruskalWallis({
        rows,
        groupColumn: String(req.body?.groupColumn || ''),
        valueColumn: String(req.body?.valueColumn || ''),
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'independent_t') {
      result = runIndependentTTest({
        rows,
        groupColumn: String(req.body?.groupColumn || ''),
        valueColumn: String(req.body?.valueColumn || ''),
        equalVariance:
          req.body?.equalVariance === undefined
            ? undefined
            : Boolean(req.body.equalVariance),
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'mann_whitney') {
      result = runMannWhitneyU({
        rows,
        groupColumn: String(req.body?.groupColumn || ''),
        valueColumn: String(req.body?.valueColumn || ''),
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'paired_t') {
      result = runPairedTTest({
        rows,
        columnA: String(req.body?.columnA || ''),
        columnB: String(req.body?.columnB || ''),
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'wilcoxon') {
      result = runWilcoxonSignedRank({
        rows,
        columnA: String(req.body?.columnA || ''),
        columnB: String(req.body?.columnB || ''),
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'pearson_correlation') {
      result = runPearsonCorrelation({
        rows,
        columnX: String(req.body?.columnX || ''),
        columnY: String(req.body?.columnY || ''),
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'spearman') {
      result = runSpearmanCorrelation({
        rows,
        columnX: String(req.body?.columnX || ''),
        columnY: String(req.body?.columnY || ''),
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'multiple_regression') {
      const preds = Array.isArray(req.body?.predictorColumns)
        ? req.body.predictorColumns.map(String)
        : [];
      result = runMultipleRegression({
        rows,
        dependentColumn: String(req.body?.dependentColumn || ''),
        predictorColumns: preds,
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'chi_square') {
      result = runChiSquareIndependence({
        rows,
        rowColumn: String(req.body?.rowColumn || ''),
        colColumn: String(req.body?.colColumn || ''),
        alpha,
        researchQuestion,
      });
    } else if (procedure === 'cronbach_alpha') {
      const itemColumns = Array.isArray(req.body?.itemColumns)
        ? req.body.itemColumns.map(String)
        : [];
      result = runCronbachAlpha({
        rows,
        itemColumns,
        alpha,
        researchQuestion,
      });
    } else {
      res.status(400).json({ error: 'Unsupported statistical procedure selected.' });
      return;
    }

    res.json({ datasetName: ds.name, result });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Unable to execute statistical test.',
    });
  }
});

router.post('/save', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const title = sanitizeText(req.body?.title, 180);
  const datasetId = req.body?.datasetId ? Number(req.body.datasetId) : null;
  const projectId = req.body?.projectId ? Number(req.body.projectId) : null;
  const result = req.body?.result as StatisticalComputationResult | undefined;

  if (title.length < 2) {
    res.status(400).json({ error: 'Please provide an analysis title (at least 2 characters).' });
    return;
  }
  if (!result || !result.procedure || !result.testResults) {
    res.status(400).json({ error: 'Valid computed statistical results are required to save.' });
    return;
  }

  if (datasetId) {
    const ds = db
      .prepare('SELECT id FROM datasets WHERE id = ? AND user_id = ?')
      .get(datasetId, userId);
    if (!ds) {
      res.status(404).json({ error: 'Referenced dataset not found.' });
      return;
    }
  }
  if (projectId) {
    const proj = db
      .prepare('SELECT id FROM research_projects WHERE id = ? AND user_id = ?')
      .get(projectId, userId);
    if (!proj) {
      res.status(404).json({ error: 'Referenced project not found.' });
      return;
    }
  }

  const saveTx = db.transaction(() => {
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
        result.procedure,
        result.researchQuestion || '',
        JSON.stringify(result.variables || {}),
        result.sampleSize || 0,
      );

    const analysisId = Number(info.lastInsertRowid);

    db.prepare(
      `INSERT INTO analysis_results
       (analysis_id, descriptive_stats_json, test_results_json, effect_size_json,
        confidence_intervals_json, diagnostics_json, technical_interpretation,
        simplified_interpretation, visualization_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      analysisId,
      JSON.stringify({
        descriptives: result.descriptives || [],
        postHoc: result.postHoc || [],
        alternativeProcedure: result.alternativeProcedure || null,
        alpha: result.alpha ?? 0.05,
      }),
      JSON.stringify(result.testResults),
      JSON.stringify(result.effectSize),
      JSON.stringify(result.confidenceInterval),
      JSON.stringify(result.diagnostics || []),
      result.technicalInterpretation || '',
      result.simplifiedInterpretation || '',
      JSON.stringify(result.visualization || {}),
    );

    return analysisId;
  });

  const analysisId = saveTx();
  res.status(201).json({ analysisId, message: 'Analysis saved to your workspace.' });
});

export default router;
