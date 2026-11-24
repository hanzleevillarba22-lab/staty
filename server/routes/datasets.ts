import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { db } from '../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { sanitizeText } from '../security.ts';
import {
  applyCleaningPreview,
  type CleaningOperation,
  type DataType,
  type MeasurementLevel,
  parseTabularBuffer,
  rowsToWorkbookBuffer,
  type VariableMetadata,
} from '../services/dataProcessing.ts';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, XLSX, and XLS dataset files are allowed here.'));
    }
  },
});

function saveDatasetTx(params: {
  userId: number;
  projectId: number | null;
  name: string;
  sourceType: 'upload' | 'manual' | 'cleaned';
  variables: Array<{
    name: string;
    description?: string;
    dataType: DataType;
    measurementLevel: MeasurementLevel;
  }>;
  rows: Record<string, unknown>[];
}) {
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO datasets (user_id, project_id, name, source_type, row_count, col_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.userId,
        params.projectId,
        params.name,
        params.sourceType,
        params.rows.length,
        params.variables.length,
      );
    const datasetId = Number(info.lastInsertRowid);

    const insertVar = db.prepare(
      `INSERT INTO dataset_variables (dataset_id, name, description, data_type, measurement_level, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    params.variables.forEach((v, idx) => {
      insertVar.run(
        datasetId,
        v.name,
        v.description || '',
        v.dataType,
        v.measurementLevel,
        idx,
      );
    });

    const insertRow = db.prepare(
      `INSERT INTO dataset_records (dataset_id, row_index, data_json)
       VALUES (?, ?, ?)`,
    );
    params.rows.forEach((row, idx) => {
      insertRow.run(datasetId, idx, JSON.stringify(row));
    });

    return datasetId;
  });

  return tx();
}

function loadOwnedDataset(datasetId: number, userId: number) {
  const ds = db
    .prepare('SELECT * FROM datasets WHERE id = ? AND user_id = ?')
    .get(datasetId, userId) as
    | {
        id: number;
        user_id: number;
        project_id: number | null;
        name: string;
        source_type: string;
        row_count: number;
        col_count: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!ds) return null;

  const vars = db
    .prepare('SELECT * FROM dataset_variables WHERE dataset_id = ? ORDER BY position')
    .all(datasetId) as Array<{
    id: number;
    name: string;
    description: string;
    data_type: DataType;
    measurement_level: MeasurementLevel;
    position: number;
  }>;

  const recs = db
    .prepare('SELECT row_index, data_json FROM dataset_records WHERE dataset_id = ? ORDER BY row_index')
    .all(datasetId) as Array<{ row_index: number; data_json: string }>;

  const rows = recs.map((r) => JSON.parse(r.data_json) as Record<string, string | number | boolean | null>);

  return { dataset: ds, variables: vars, rows };
}

router.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const q = sanitizeText(req.query.q, 100).toLowerCase();
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;

  const rows = db
    .prepare(
      `SELECT d.*, p.title as project_title
       FROM datasets d
       LEFT JOIN research_projects p ON p.id = d.project_id
       WHERE d.user_id = ?
       ORDER BY d.updated_at DESC`,
    )
    .all(userId) as Array<{
    id: number;
    name: string;
    project_id: number | null;
    project_title: string | null;
    source_type: string;
    row_count: number;
    col_count: number;
    created_at: string;
    updated_at: string;
  }>;

  const filtered = rows.filter((d) => {
    if (projectId && d.project_id !== projectId) return false;
    if (q && !d.name.toLowerCase().includes(q)) return false;
    return true;
  });

  res.json({ datasets: filtered });
});

router.post('/upload', (req: AuthenticatedRequest, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'File upload error.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Please select a CSV, XLSX, or XLS file to upload.' });
      return;
    }

    try {
      const parsed = parseTabularBuffer(req.file.buffer, req.file.originalname);
      const customName = sanitizeText(req.body?.name, 140);
      const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
      const datasetName = customName || baseName || 'Imported Dataset';
      const projectId = req.body?.projectId ? Number(req.body.projectId) : null;

      if (projectId) {
        const proj = db
          .prepare('SELECT id FROM research_projects WHERE id = ? AND user_id = ?')
          .get(projectId, req.user!.id);
        if (!proj) {
          res.status(404).json({ error: 'Selected research project not found.' });
          return;
        }
      }

      const datasetId = saveDatasetTx({
        userId: req.user!.id,
        projectId,
        name: datasetName,
        sourceType: 'upload',
        variables: parsed.variables,
        rows: parsed.rows,
      });

      res.status(201).json({
        datasetId,
        name: datasetName,
        preview: parsed,
      });
    } catch (parseErr) {
      res.status(400).json({
        error: parseErr instanceof Error ? parseErr.message : 'Unable to parse dataset file.',
      });
    }
  });
});

// Create or save Manual Dataset
router.post('/manual', (req: AuthenticatedRequest, res) => {
  const name = sanitizeText(req.body?.name, 140);
  const projectId = req.body?.projectId ? Number(req.body.projectId) : null;
  const variables = Array.isArray(req.body?.variables) ? req.body.variables : [];
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (name.length < 2) {
    res.status(400).json({ error: 'Dataset name must be at least 2 characters.' });
    return;
  }
  if (variables.length === 0) {
    res.status(400).json({ error: 'Define at least one variable column.' });
    return;
  }

  if (projectId) {
    const proj = db
      .prepare('SELECT id FROM research_projects WHERE id = ? AND user_id = ?')
      .get(projectId, req.user!.id);
    if (!proj) {
      res.status(404).json({ error: 'Selected research project not found.' });
      return;
    }
  }

  const cleanVars = variables.map((v: Record<string, unknown>, idx: number) => ({
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

  const datasetId = saveDatasetTx({
    userId: req.user!.id,
    projectId,
    name,
    sourceType: 'manual',
    variables: cleanVars,
    rows,
  });

  res.status(201).json({ datasetId });
});

router.get('/:id', (req: AuthenticatedRequest, res) => {
  const loaded = loadOwnedDataset(Number(req.params.id), req.user!.id);
  if (!loaded) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }

  // Compute live missing/duplicate summary
  const seen = new Set<string>();
  let duplicateRowCount = 0;
  let totalMissingCells = 0;

  for (const r of loaded.rows) {
    const sig = JSON.stringify(r);
    if (seen.has(sig)) duplicateRowCount += 1;
    else seen.add(sig);
    for (const v of loaded.variables) {
      const val = r[v.name];
      if (val === null || val === undefined || String(val).trim() === '') {
        totalMissingCells += 1;
      }
    }
  }

  res.json({
    ...loaded,
    summary: {
      duplicateRowCount,
      totalMissingCells,
    },
  });
});

// Update manual or existing dataset rows & variable config
router.put('/:id', (req: AuthenticatedRequest, res) => {
  const datasetId = Number(req.params.id);
  const existing = loadOwnedDataset(datasetId, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }

  const name = sanitizeText(req.body?.name, 140) || existing.dataset.name;
  const variables = Array.isArray(req.body?.variables) ? req.body.variables : [];
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const projectId =
    req.body?.projectId !== undefined
      ? req.body.projectId
        ? Number(req.body.projectId)
        : null
      : existing.dataset.project_id;

  if (variables.length === 0) {
    res.status(400).json({ error: 'Dataset must contain at least one variable.' });
    return;
  }

  if (projectId) {
    const proj = db
      .prepare('SELECT id FROM research_projects WHERE id = ? AND user_id = ?')
      .get(projectId, req.user!.id);
    if (!proj) {
      res.status(404).json({ error: 'Selected research project not found.' });
      return;
    }
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE datasets SET name = ?, project_id = ?, row_count = ?, col_count = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    ).run(name, projectId, rows.length, variables.length, datasetId, req.user!.id);

    db.prepare('DELETE FROM dataset_variables WHERE dataset_id = ?').run(datasetId);
    db.prepare('DELETE FROM dataset_records WHERE dataset_id = ?').run(datasetId);

    const insertVar = db.prepare(
      `INSERT INTO dataset_variables (dataset_id, name, description, data_type, measurement_level, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    variables.forEach((v: Record<string, unknown>, idx: number) => {
      insertVar.run(
        datasetId,
        sanitizeText(v.name, 80) || `Variable_${idx + 1}`,
        sanitizeText(v.description, 300),
        String(v.dataType || v.data_type || 'Text'),
        String(v.measurementLevel || v.measurement_level || 'Nominal'),
        idx,
      );
    });

    const insertRow = db.prepare(
      `INSERT INTO dataset_records (dataset_id, row_index, data_json)
       VALUES (?, ?, ?)`,
    );
    rows.forEach((r: Record<string, unknown>, idx: number) => {
      insertRow.run(datasetId, idx, JSON.stringify(r));
    });
  });

  tx();
  res.json({ ok: true });
});

router.patch('/:id/rename', (req: AuthenticatedRequest, res) => {
  const name = sanitizeText(req.body?.name, 140);
  if (name.length < 2) {
    res.status(400).json({ error: 'Dataset name must be at least 2 characters.' });
    return;
  }
  const info = db
    .prepare(`UPDATE datasets SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(name, Number(req.params.id), req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  res.json({ ok: true, name });
});

router.post('/:id/duplicate', (req: AuthenticatedRequest, res) => {
  const loaded = loadOwnedDataset(Number(req.params.id), req.user!.id);
  if (!loaded) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }

  const newId = saveDatasetTx({
    userId: req.user!.id,
    projectId: loaded.dataset.project_id,
    name: `${loaded.dataset.name} (Copy)`,
    sourceType: loaded.dataset.source_type as 'upload' | 'manual' | 'cleaned',
    variables: loaded.variables.map((v) => ({
      name: v.name,
      description: v.description,
      dataType: v.data_type,
      measurementLevel: v.measurement_level,
    })),
    rows: loaded.rows,
  });

  res.status(201).json({ datasetId: newId });
});

// Preview or Apply Data Cleaning (always saves cleaned dataset as a separate copy)
router.post('/:id/clean', (req: AuthenticatedRequest, res) => {
  const loaded = loadOwnedDataset(Number(req.params.id), req.user!.id);
  if (!loaded) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }

  const operation = req.body?.operation as CleaningOperation | undefined;
  const applyAsCopy = Boolean(req.body?.applyAsCopy);
  const newName = sanitizeText(req.body?.newName, 140) || `${loaded.dataset.name} (Cleaned)`;

  if (!operation || !operation.type) {
    res.status(400).json({ error: 'Specify a valid cleaning operation.' });
    return;
  }

  try {
    const varsMeta: VariableMetadata[] = loaded.variables.map((v) => ({
      name: v.name,
      originalName: v.name,
      description: v.description,
      dataType: v.data_type,
      measurementLevel: v.measurement_level,
      position: v.position,
      missingCount: 0,
      uniqueCount: 0,
      isUnnamedPlaceholder: false,
      isLikelyIndex: false,
      isEmptyColumn: false,
    }));

    const cleaned = applyCleaningPreview(varsMeta, loaded.rows, operation);

    if (!applyAsCopy) {
      res.json({
        preview: {
          variables: cleaned.variables,
          rows: cleaned.rows.slice(0, 50),
          rowCount: cleaned.rows.length,
          colCount: cleaned.variables.length,
          summary: cleaned.summary,
        },
      });
      return;
    }

    const newDatasetId = saveDatasetTx({
      userId: req.user!.id,
      projectId: loaded.dataset.project_id,
      name: newName,
      sourceType: 'cleaned',
      variables: cleaned.variables,
      rows: cleaned.rows,
    });

    res.status(201).json({
      datasetId: newDatasetId,
      name: newName,
      summary: cleaned.summary,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Cleaning operation failed.',
    });
  }
});

router.get('/:id/export', (req: AuthenticatedRequest, res) => {
  const loaded = loadOwnedDataset(Number(req.params.id), req.user!.id);
  if (!loaded) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }

  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const buf = rowsToWorkbookBuffer(
    loaded.dataset.name,
    loaded.variables,
    loaded.rows,
    format,
  );
  const safeBase = loaded.dataset.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'dataset';

  res.setHeader(
    'Content-Type',
    format === 'csv'
      ? 'text/csv; charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${safeBase}.${format}"`);
  res.send(buf);
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const info = db
    .prepare('DELETE FROM datasets WHERE id = ? AND user_id = ?')
    .run(Number(req.params.id), req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  res.json({ ok: true });
});

export default router;
