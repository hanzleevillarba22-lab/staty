import { Router } from 'express';
import fs from 'node:fs';
import { db } from '../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { sanitizeText } from '../security.ts';
import {
  generateDocxReport,
  generateExcelReport,
  generatePdfReport,
  type ReportSourceData,
  resolveSafeReportPath,
} from '../services/reportGenerator.ts';
import type { StatisticalComputationResult } from '../services/statisticalEngine.ts';

const router = Router();
router.use(requireAuth);

function buildReportSource(analysisId: number, userId: number): {
  analysis: Record<string, unknown>;
  source: ReportSourceData;
} | null {
  const analysis = db
    .prepare(
      `SELECT a.*, d.name as dataset_name
       FROM statistical_analyses a
       LEFT JOIN datasets d ON d.id = a.dataset_id
       WHERE a.id = ? AND a.user_id = ?`,
    )
    .get(analysisId, userId) as Record<string, unknown> | undefined;
  if (!analysis) return null;

  const resultRow = db
    .prepare('SELECT * FROM analysis_results WHERE analysis_id = ?')
    .get(analysisId) as Record<string, unknown> | undefined;
  if (!resultRow) return null;

  const descPayload = JSON.parse(String(resultRow.descriptive_stats_json || '{}'));
  const result: StatisticalComputationResult = {
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

  return {
    analysis,
    source: {
      analysisTitle: String(analysis.title),
      procedureName: String(analysis.procedure_name),
      researchQuestion: String(analysis.research_question || ''),
      datasetName: String(analysis.dataset_name || 'Not linked'),
      createdAt: String(analysis.created_at),
      result,
      datasetHeaders,
      datasetRows,
    },
  };
}

router.get('/', (req: AuthenticatedRequest, res) => {
  const reports = db
    .prepare(
      `SELECT r.id, r.analysis_id, r.project_id, r.title, r.format, r.created_at,
              a.procedure_name, p.title as project_title
       FROM generated_reports r
       LEFT JOIN statistical_analyses a ON a.id = r.analysis_id
       LEFT JOIN research_projects p ON p.id = r.project_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(req.user!.id);

  res.json({ reports });
});

router.post('/generate', async (req: AuthenticatedRequest, res) => {
  const analysisId = Number(req.body?.analysisId);
  const rawFmt = String(req.body?.format || 'pdf').toLowerCase();
  const format = rawFmt === 'excel' ? 'excel' : rawFmt === 'docx' ? 'docx' : 'pdf';
  const customTitle = sanitizeText(req.body?.title, 180);

  const built = buildReportSource(analysisId, req.user!.id);
  if (!built) {
    res.status(404).json({ error: 'Saved analysis not found.' });
    return;
  }

  const title = customTitle || `${built.source.analysisTitle} (${format.toUpperCase()})`;

  try {
    const generated =
      format === 'pdf'
        ? await generatePdfReport(built.source)
        : format === 'docx'
          ? await generateDocxReport(built.source)
          : generateExcelReport(built.source);

    const info = db
      .prepare(
        `INSERT INTO generated_reports (user_id, analysis_id, project_id, title, format, file_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user!.id,
        analysisId,
        built.analysis.project_id ?? null,
        title,
        format,
        generated.filename,
      );

    const report = db
      .prepare(
        `SELECT id, analysis_id, project_id, title, format, created_at
         FROM generated_reports WHERE id = ?`,
      )
      .get(Number(info.lastInsertRowid));

    res.status(201).json({ report });
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: 'Failed to generate report file.' });
  }
});

router.post('/:id/regenerate', async (req: AuthenticatedRequest, res) => {
  const reportId = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM generated_reports WHERE id = ? AND user_id = ?')
    .get(reportId, req.user!.id) as
    | { id: number; analysis_id: number | null; format: string; file_path: string; title: string }
    | undefined;

  if (!existing || !existing.analysis_id) {
    res.status(404).json({ error: 'Report or linked analysis not found.' });
    return;
  }

  const built = buildReportSource(existing.analysis_id, req.user!.id);
  if (!built) {
    res.status(404).json({ error: 'Linked analysis no longer exists.' });
    return;
  }

  try {
    const generated =
      existing.format === 'pdf'
        ? await generatePdfReport(built.source)
        : existing.format === 'docx'
          ? await generateDocxReport(built.source)
          : generateExcelReport(built.source);

    try {
      const oldPath = resolveSafeReportPath(existing.file_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch {
      // ignore missing old file
    }

    db.prepare(`UPDATE generated_reports SET file_path = ?, created_at = datetime('now') WHERE id = ?`).run(
      generated.filename,
      reportId,
    );

    const updated = db
      .prepare('SELECT id, analysis_id, project_id, title, format, created_at FROM generated_reports WHERE id = ?')
      .get(reportId);
    res.json({ report: updated });
  } catch {
    res.status(500).json({ error: 'Failed to regenerate report.' });
  }
});

router.get('/:id/preview', (req: AuthenticatedRequest, res) => {
  const report = db
    .prepare(
      `SELECT id, analysis_id, project_id, title, format, created_at
       FROM generated_reports WHERE id = ? AND user_id = ?`,
    )
    .get(Number(req.params.id), req.user!.id) as
    | { id: number; analysis_id: number | null; title: string; format: string; created_at: string }
    | undefined;

  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  const built = report.analysis_id
    ? buildReportSource(report.analysis_id, req.user!.id)
    : null;

  res.json({
    report,
    preview: built ? built.source : null,
  });
});

router.get('/:id/download', (req: AuthenticatedRequest, res) => {
  const report = db
    .prepare('SELECT * FROM generated_reports WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user!.id) as
    | { id: number; title: string; format: string; file_path: string }
    | undefined;

  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  try {
    const fullPath = resolveSafeReportPath(report.file_path);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Stored report file not found. Try regenerating it.' });
      return;
    }

    const ext = report.format === 'pdf' ? 'pdf' : report.format === 'docx' ? 'docx' : 'xlsx';
    const safeTitle = report.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'statlytics_report';

    res.setHeader(
      'Content-Type',
      report.format === 'pdf'
        ? 'application/pdf'
        : report.format === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.${ext}"`);
    res.sendFile(fullPath);
  } catch {
    res.status(403).json({ error: 'Invalid report path.' });
  }
});

router.patch('/:id/rename', (req: AuthenticatedRequest, res) => {
  const title = sanitizeText(req.body?.title, 180);
  if (title.length < 2) {
    res.status(400).json({ error: 'Report title must be at least 2 characters.' });
    return;
  }
  const info = db
    .prepare('UPDATE generated_reports SET title = ? WHERE id = ? AND user_id = ?')
    .run(title, Number(req.params.id), req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  res.json({ ok: true, title });
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const report = db
    .prepare('SELECT id, file_path FROM generated_reports WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user!.id) as { id: number; file_path: string } | undefined;

  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  try {
    const fullPath = resolveSafeReportPath(report.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch {
    // ignore unlink failure
  }

  db.prepare('DELETE FROM generated_reports WHERE id = ? AND user_id = ?').run(
    report.id,
    req.user!.id,
  );
  res.json({ ok: true });
});

export default router;
