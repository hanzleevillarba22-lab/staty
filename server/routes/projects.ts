import { Router } from 'express';
import { db } from '../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { sanitizeText } from '../security.ts';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const q = sanitizeText(req.query.q, 100).toLowerCase();
  const sort = req.query.sort === 'title' ? 'title ASC' : 'updated_at DESC';

  const projects = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM datasets d WHERE d.project_id = p.id AND d.user_id = p.user_id) as dataset_count,
        (SELECT COUNT(*) FROM statistical_analyses a WHERE a.project_id = p.id AND a.user_id = p.user_id) as analysis_count,
        (SELECT COUNT(*) FROM generated_reports r WHERE r.project_id = p.id AND r.user_id = p.user_id) as report_count
       FROM research_projects p
       WHERE p.user_id = ?
       ORDER BY ${sort}`,
    )
    .all(userId) as Array<{
    id: number;
    title: string;
    description: string;
    research_question: string;
    created_at: string;
    updated_at: string;
    dataset_count: number;
    analysis_count: number;
    report_count: number;
  }>;

  const filtered = q
    ? projects.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.research_question.toLowerCase().includes(q),
      )
    : projects;

  res.json({ projects: filtered });
});

router.post('/', (req: AuthenticatedRequest, res) => {
  const title = sanitizeText(req.body?.title, 160);
  const description = sanitizeText(req.body?.description, 1000);
  const researchQuestion = sanitizeText(req.body?.researchQuestion, 500);

  if (title.length < 2) {
    res.status(400).json({ error: 'Project title must be at least 2 characters.' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO research_projects (user_id, title, description, research_question)
       VALUES (?, ?, ?, ?)`,
    )
    .run(req.user!.id, title, description, researchQuestion);

  const project = db
    .prepare('SELECT * FROM research_projects WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  res.status(201).json({ project });
});

router.get('/:id', (req: AuthenticatedRequest, res) => {
  const projectId = Number(req.params.id);
  const userId = req.user!.id;

  const project = db
    .prepare('SELECT * FROM research_projects WHERE id = ? AND user_id = ?')
    .get(projectId, userId);

  if (!project) {
    res.status(404).json({ error: 'Research project not found.' });
    return;
  }

  const datasets = db
    .prepare('SELECT id, name, source_type, row_count, col_count, created_at FROM datasets WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC')
    .all(projectId, userId);
  const analyses = db
    .prepare('SELECT id, title, procedure_name, sample_size, created_at FROM statistical_analyses WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC')
    .all(projectId, userId);
  const reports = db
    .prepare('SELECT id, title, format, created_at FROM generated_reports WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC')
    .all(projectId, userId);
  const notes = db
    .prepare('SELECT * FROM research_notes WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC')
    .all(projectId, userId);

  res.json({ project, datasets, analyses, reports, notes });
});

router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const projectId = Number(req.params.id);
  const userId = req.user!.id;
  const existing = db
    .prepare('SELECT id, title, description, research_question FROM research_projects WHERE id = ? AND user_id = ?')
    .get(projectId, userId) as
    | { id: number; title: string; description: string; research_question: string }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Research project not found.' });
    return;
  }

  const title = req.body?.title !== undefined ? sanitizeText(req.body.title, 160) : existing.title;
  const description =
    req.body?.description !== undefined
      ? sanitizeText(req.body.description, 1000)
      : existing.description;
  const researchQuestion =
    req.body?.researchQuestion !== undefined
      ? sanitizeText(req.body.researchQuestion, 500)
      : existing.research_question;

  if (title.length < 2) {
    res.status(400).json({ error: 'Project title must be at least 2 characters.' });
    return;
  }

  db.prepare(
    `UPDATE research_projects
     SET title = ?, description = ?, research_question = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  ).run(title, description, researchQuestion, projectId, userId);

  const project = db
    .prepare('SELECT * FROM research_projects WHERE id = ?')
    .get(projectId);
  res.json({ project });
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const projectId = Number(req.params.id);
  const info = db
    .prepare('DELETE FROM research_projects WHERE id = ? AND user_id = ?')
    .run(projectId, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Research project not found.' });
    return;
  }
  res.json({ ok: true });
});

// Research Notes inside a project
router.post('/:id/notes', (req: AuthenticatedRequest, res) => {
  const projectId = Number(req.params.id);
  const userId = req.user!.id;
  const proj = db
    .prepare('SELECT id FROM research_projects WHERE id = ? AND user_id = ?')
    .get(projectId, userId);
  if (!proj) {
    res.status(404).json({ error: 'Research project not found.' });
    return;
  }

  const title = sanitizeText(req.body?.title, 160) || 'Research Note';
  const content = sanitizeText(req.body?.content, 4000);
  if (!content) {
    res.status(400).json({ error: 'Note content cannot be empty.' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO research_notes (user_id, project_id, title, content)
       VALUES (?, ?, ?, ?)`,
    )
    .run(userId, projectId, title, content);

  db.prepare(`UPDATE research_projects SET updated_at = datetime('now') WHERE id = ?`).run(projectId);
  const note = db.prepare('SELECT * FROM research_notes WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ note });
});

router.delete('/:id/notes/:noteId', (req: AuthenticatedRequest, res) => {
  const info = db
    .prepare('DELETE FROM research_notes WHERE id = ? AND project_id = ? AND user_id = ?')
    .run(Number(req.params.noteId), Number(req.params.id), req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }
  res.json({ ok: true });
});

export default router;
