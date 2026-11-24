import { Router } from 'express';
import { db } from '../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import {
  hashPassword,
  sanitizeText,
  validatePasswordStrength,
  verifyPassword,
} from '../security.ts';
import { isSmtpConfigured } from './auth.ts';

const router = Router();

router.patch('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const fullName = sanitizeText(req.body?.fullName, 120);
  if (fullName.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }

  db.prepare(
    `UPDATE users SET full_name = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(fullName, req.user!.id);

  const updated = db
    .prepare(
      `SELECT id, full_name, username, email, avatar_url, theme_preference, notifications_enabled, created_at
       FROM users WHERE id = ?`,
    )
    .get(req.user!.id);

  res.json({ user: updated });
});

router.post('/password', requireAuth, (req: AuthenticatedRequest, res) => {
  const currentPassword =
    typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword =
    typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword =
    typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

  const userRow = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.user!.id) as { password_hash: string } | undefined;

  if (!userRow || !verifyPassword(currentPassword, userRow.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const pwError = validatePasswordStrength(newPassword);
  if (pwError) {
    res.status(400).json({ error: pwError });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'New passwords do not match.' });
    return;
  }

  const newHash = hashPassword(newPassword);
  db.prepare(
    `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(newHash, req.user!.id);

  res.json({ ok: true, message: 'Password updated successfully.' });
});

router.patch('/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  const theme = req.body?.themePreference === 'dark' ? 'dark' : 'light';
  const notifications = req.body?.notificationsEnabled ? 1 : 0;

  db.prepare(
    `UPDATE users
     SET theme_preference = ?, notifications_enabled = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(theme, notifications, req.user!.id);

  const updated = db
    .prepare(
      `SELECT id, full_name, username, email, avatar_url, theme_preference, notifications_enabled, created_at
       FROM users WHERE id = ?`,
    )
    .get(req.user!.id);

  res.json({ user: updated });
});

router.get('/status', requireAuth, (_req: AuthenticatedRequest, res) => {
  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
  );
  res.json({
    aiConfigured: geminiConfigured,
    smtpConfigured: isSmtpConfigured(),
    databaseEngine: 'SQLite (WAL)',
  });
});

export default router;
