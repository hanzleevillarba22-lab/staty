import { Router } from 'express';
import { db } from '../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { sanitizeText } from '../security.ts';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const q = sanitizeText(req.query.q, 120).toLowerCase();
  const procedure = sanitizeText(req.query.procedure, 100).toLowerCase();

  const rows = db
    .prepare(
      `SELECT a.*, d.name as dataset_name, p.title as project_title
       FROM statistical_analyses a
       LEFT JOIN datasets d ON d.id = a.dataset_id
       LEFT JOIN research_projects p ON p.id = a.project_id
       WHERE a.user_id = ?
       ORDER BY a.updated_at DESC`,
    )
    .all(userId) as Array<{
    id: number;
    title: string;
    procedure_name: string;
    research_question: string;
    sample_size: number;
    dataset_id: number | null;
    dataset_name: string | null;
    project_id: number | null;
    project_title: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const filtered = rows.filter((r) => {
    if (procedure && !r.procedure_name.toLowerCase().includes(procedure)) return false;
    if (
      q &&
      !r.title.toLowerCase().includes(q) &&
      !r.procedure_name.toLowerCase().includes(q) &&
      !r.research_question.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  res.json({ analyses: filtered });
});

// Reopen saved analysis without re-executing calculations
router.get('/:id', (req: AuthenticatedRequest, res) => {
  const analysisId = Number(req.params.id);
  const userId = req.user!.id;

  const analysis = db
    .prepare(
      `SELECT a.*, d.name as dataset_name, p.title as project_title
       FROM statistical_analyses a
       LEFT JOIN datasets d ON d.id = a.dataset_id
       LEFT JOIN research_projects p ON p.id = a.project_id
       WHERE a.id = ? AND a.user_id = ?`,
    )
    .get(analysisId, userId) as Record<string, unknown> | undefined;

  if (!analysis) {
    res.status(404).json({ error: 'Saved analysis not found.' });
    return;
  }

  const resultRow = db
    .prepare('SELECT * FROM analysis_results WHERE analysis_id = ?')
    .get(analysisId) as Record<string, unknown> | undefined;

  if (!resultRow) {
    res.status(404).json({ error: 'Analysis result record is missing.' });
    return;
  }

  const descPayload = JSON.parse(String(resultRow.descriptive_stats_json || '{}'));
  const hydratedResult = {
    procedure: analysis.procedure_name,
    researchQuestion: analysis.research_question,
    variables: JSON.parse(String(analysis.variables_json || '{}')),
    sampleSize: analysis.sample_size,
    alpha: descPayload.alpha ?? 0.05,
    descriptives: descPayload.descriptives ?? [],
    postHoc: descPayload.postHoc ?? [],
    alternativeProcedure: descPayload.alternativeProcedure ?? undefined,
    testResults: JSON.parse(String(resultRow.test_results_json || '{}')),
    effectSize: JSON.parse(String(resultRow.effect_size_json || '{}')),
    confidenceInterval: JSON.parse(String(resultRow.confidence_intervals_json || '{}')),
    diagnostics: JSON.parse(String(resultRow.diagnostics_json || '[]')),
    technicalInterpretation: resultRow.technical_interpretation,
    simplifiedInterpretation: resultRow.simplified_interpretation,
    visualization: JSON.parse(String(resultRow.visualization_json || '{}')),
  };

  res.json({ analysis, result: hydratedResult });
});

router.patch('/:id/rename', (req: AuthenticatedRequest, res) => {
  const title = sanitizeText(req.body?.title, 180);
  if (title.length < 2) {
    res.status(400).json({ error: 'Analysis title must be at least 2 characters.' });
    return;
  }
  const info = db
    .prepare(
      `UPDATE statistical_analyses SET title = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
    .run(title, Number(req.params.id), req.user!.id);

  if (info.changes === 0) {
    res.status(404).json({ error: 'Saved analysis not found.' });
    return;
  }
  res.json({ ok: true, title });
});

router.post('/:id/duplicate', (req: AuthenticatedRequest, res) => {
  const analysisId = Number(req.params.id);
  const userId = req.user!.id;

  const existing = db
    .prepare('SELECT * FROM statistical_analyses WHERE id = ? AND user_id = ?')
    .get(analysisId, userId) as Record<string, unknown> | undefined;
  const existingResult = db
    .prepare('SELECT * FROM analysis_results WHERE analysis_id = ?')
    .get(analysisId) as Record<string, unknown> | undefined;

  if (!existing || !existingResult) {
    res.status(404).json({ error: 'Saved analysis not found.' });
    return;
  }

  const dupTx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO statistical_analyses
         (user_id, project_id, dataset_id, title, procedure_name, research_question, variables_json, sample_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        existing.project_id,
        existing.dataset_id,
        `${existing.title} (Copy)`,
        existing.procedure_name,
        existing.research_question,
        existing.variables_json,
        existing.sample_size,
      );
    const newId = Number(info.lastInsertRowid);

    db.prepare(
      `INSERT INTO analysis_results
       (analysis_id, descriptive_stats_json, test_results_json, effect_size_json,
        confidence_intervals_json, diagnostics_json, technical_interpretation,
        simplified_interpretation, visualization_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId,
      existingResult.descriptive_stats_json,
      existingResult.test_results_json,
      existingResult.effect_size_json,
      existingResult.confidence_intervals_json,
      existingResult.diagnostics_json,
      existingResult.technical_interpretation,
      existingResult.simplified_interpretation,
      existingResult.visualization_json,
    );
    return newId;
  });

  const newAnalysisId = dupTx();
  res.status(201).json({ analysisId: newAnalysisId });
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const info = db
    .prepare('DELETE FROM statistical_analyses WHERE id = ? AND user_id = ?')
    .run(Number(req.params.id), req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Saved analysis not found.' });
    return;
  }
  res.json({ ok: true });
});

export default router;
