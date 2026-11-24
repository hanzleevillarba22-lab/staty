import { Router } from 'express';
import { db } from '../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';

const router = Router();

router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const analysesCount = (
    db
      .prepare('SELECT COUNT(*) as count FROM statistical_analyses WHERE user_id = ?')
      .get(userId) as { count: number }
  ).count;

  const reportsCount = (
    db
      .prepare('SELECT COUNT(*) as count FROM generated_reports WHERE user_id = ?')
      .get(userId) as { count: number }
  ).count;

  const datasetsCount = (
    db
      .prepare('SELECT COUNT(*) as count FROM datasets WHERE user_id = ?')
      .get(userId) as { count: number }
  ).count;

  const projectsCount = (
    db
      .prepare('SELECT COUNT(*) as count FROM research_projects WHERE user_id = ?')
      .get(userId) as { count: number }
  ).count;

  const recentAnalyses = db
    .prepare(
      `SELECT id, title, procedure_name, created_at
       FROM statistical_analyses
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
    )
    .all(userId) as Array<{
    id: number;
    title: string;
    procedure_name: string;
    created_at: string;
  }>;

  const recentDatasets = db
    .prepare(
      `SELECT id, name, source_type, row_count, created_at
       FROM datasets
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
    )
    .all(userId) as Array<{
    id: number;
    name: string;
    source_type: string;
    row_count: number;
    created_at: string;
  }>;

  const recentReports = db
    .prepare(
      `SELECT id, title, format, created_at
       FROM generated_reports
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
    )
    .all(userId) as Array<{
    id: number;
    title: string;
    format: string;
    created_at: string;
  }>;

  const recentProjects = db
    .prepare(
      `SELECT id, title, updated_at
       FROM research_projects
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 5`,
    )
    .all(userId) as Array<{
    id: number;
    title: string;
    updated_at: string;
  }>;

  // Build real 7-day activity series from database records
  const days: Array<{ date: string; label: string; analyses: number; datasets: number; reports: number }> = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const isoDate = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const aCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM statistical_analyses WHERE user_id = ? AND substr(created_at, 1, 10) = ?`,
        )
        .get(userId, isoDate) as { c: number }
    ).c;
    const dCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM datasets WHERE user_id = ? AND substr(created_at, 1, 10) = ?`,
        )
        .get(userId, isoDate) as { c: number }
    ).c;
    const rCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM generated_reports WHERE user_id = ? AND substr(created_at, 1, 10) = ?`,
        )
        .get(userId, isoDate) as { c: number }
    ).c;

    days.push({ date: isoDate, label, analyses: aCount, datasets: dCount, reports: rCount });
  }

  res.json({
    counts: {
      analyses: analysesCount,
      reports: reportsCount,
      datasets: datasetsCount,
      projects: projectsCount,
    },
    recent: {
      analyses: recentAnalyses,
      datasets: recentDatasets,
      reports: recentReports,
      projects: recentProjects,
    },
    activitySeries: days,
  });
});

export default router;
