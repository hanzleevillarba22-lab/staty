import { Router } from 'express';
import nodemailer from 'nodemailer';
import { db } from '../db.ts';
import {
  type AuthenticatedRequest,
  extractSessionToken,
  requireAuth,
} from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import {
  generateCsrfToken,
  generateRandomToken,
  hashPassword,
  hashToken,
  isValidEmail,
  isValidUsername,
  sanitizeText,
  validatePasswordStrength,
  verifyPassword,
} from '../security.ts';

const router = Router();

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 25,
  message: 'Too many authentication attempts. Please wait a few minutes and try again.',
});

function isHttpsRequest(req: AuthenticatedRequest): boolean {
  return (
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https'
  );
}

function setSessionCookieIfHttps(
  req: AuthenticatedRequest,
  res: { cookie: (name: string, val: string, opts: Record<string, unknown>) => void },
  token: string,
  rememberMe: boolean,
): void {
  if (!isHttpsRequest(req)) return;
  const maxAgeMs = rememberMe
    ? 30 * 24 * 60 * 60 * 1000
    : 12 * 60 * 60 * 1000;
  res.cookie('statlytics_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
    maxAge: maxAgeMs,
  });
}

function createUserSession(userId: number, rememberMe: boolean): string {
  const rawToken = generateRandomToken(32);
  const tokenHash = hashToken(rawToken);
  const ttlMs = rememberMe
    ? 30 * 24 * 60 * 60 * 1000
    : 12 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  db.prepare(
    `INSERT INTO sessions (user_id, token_hash, remember_me, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(userId, tokenHash, rememberMe ? 1 : 0, expiresAt);

  return rawToken;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  );
}

router.get('/csrf', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ csrfToken: generateCsrfToken() });
});

router.post('/register', authRateLimit, (req: AuthenticatedRequest, res) => {
  const fullName = sanitizeText(req.body?.fullName, 120);
  const username = sanitizeText(req.body?.username, 32);
  const email = sanitizeText(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirmPassword =
    typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';
  const acceptedTerms = Boolean(req.body?.acceptedTerms);

  if (fullName.length < 2) {
    res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
    return;
  }
  if (!isValidUsername(username)) {
    res.status(400).json({
      error: 'Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens.',
    });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  const pwError = validatePasswordStrength(password);
  if (pwError) {
    res.status(400).json({ error: pwError });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }
  if (!acceptedTerms) {
    res.status(400).json({ error: 'You must accept the Terms and Conditions to create an account.' });
    return;
  }

  const existingEmail = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(email) as { id: number } | undefined;
  if (existingEmail) {
    res.status(409).json({ error: 'An account with this email address already exists.' });
    return;
  }

  const existingUsername = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(username) as { id: number } | undefined;
  if (existingUsername) {
    res.status(409).json({ error: 'This username is already taken. Please choose another.' });
    return;
  }

  const passwordHash = hashPassword(password);

  const registerTx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO users (full_name, username, email, password_hash)
         VALUES (?, ?, ?, ?)`,
      )
      .run(fullName, username, email, passwordHash);

    const userId = Number(info.lastInsertRowid);
    const token = createUserSession(userId, false);
    const user = db
      .prepare(
        `SELECT id, full_name, username, email, avatar_url, theme_preference, notifications_enabled, created_at
         FROM users WHERE id = ?`,
      )
      .get(userId);
    return { token, user };
  });

  const { token, user } = registerTx();
  setSessionCookieIfHttps(req, res, token, false);
  res.status(201).json({ token, user });
});

router.post('/login', authRateLimit, (req: AuthenticatedRequest, res) => {
  const identifier = sanitizeText(req.body?.identifier, 254);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const rememberMe = Boolean(req.body?.rememberMe);

  if (!identifier || !password) {
    res.status(400).json({ error: 'Please enter your email or username and password.' });
    return;
  }

  const userRow = db
    .prepare(
      `SELECT id, full_name, username, email, password_hash, avatar_url,
              theme_preference, notifications_enabled, created_at
       FROM users
       WHERE email = ? OR username = ?`,
    )
    .get(identifier.toLowerCase(), identifier) as
    | {
        id: number;
        full_name: string;
        username: string;
        email: string;
        password_hash: string;
        avatar_url: string | null;
        theme_preference: 'light' | 'dark';
        notifications_enabled: number;
        created_at: string;
      }
    | undefined;

  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    res.status(401).json({ error: 'Invalid email/username or password.' });
    return;
  }

  const token = createUserSession(userRow.id, rememberMe);
  setSessionCookieIfHttps(req, res, token, rememberMe);

  const { password_hash: _pw, ...safeUser } = userRow;
  res.json({ token, user: safeUser });
});

router.post('/logout', (req: AuthenticatedRequest, res) => {
  const rawToken = extractSessionToken(req);
  if (rawToken) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(rawToken));
  }
  if (isHttpsRequest(req)) {
    res.clearCookie('statlytics_session', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
    });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

router.post('/forgot-password', authRateLimit, async (req, res) => {
  const email = sanitizeText(req.body?.email, 254).toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  if (!isSmtpConfigured()) {
    res.status(503).json({
      smtpConfigured: false,
      emailSent: false,
      error:
        'Password recovery email delivery is not configured yet. Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in the application environment settings.',
    });
    return;
  }

  const user = db
    .prepare('SELECT id, full_name, email FROM users WHERE email = ?')
    .get(email) as { id: number; full_name: string; email: string } | undefined;

  if (!user) {
    // Do not leak account existence when SMTP is configured
    res.json({
      smtpConfigured: true,
      emailSent: true,
      message:
        'If an account matches that email address, a password reset link has been sent.',
    });
    return;
  }

  const rawResetToken = generateRandomToken(32);
  const tokenHash = hashToken(rawResetToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.transaction(() => {
    db.prepare(
      `UPDATE password_reset_tokens
       SET used_at = datetime('now')
       WHERE user_id = ? AND used_at IS NULL`,
    ).run(user.id);

    db.prepare(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
    ).run(user.id, tokenHash, expiresAt);
  })();

  const baseUrl =
    process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL.replace(/\/$/, '')
      : `${req.protocol}://${req.get('host')}`;
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawResetToken)}`;

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'STATLYTICS — Password Reset Request',
      text: `Hello ${user.full_name},\n\nUse this link to reset your STATLYTICS password (valid for 15 minutes):\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    });

    res.json({
      smtpConfigured: true,
      emailSent: true,
      message:
        'If an account matches that email address, a password reset link has been sent.',
    });
  } catch (err) {
    console.error('SMTP email delivery failed:', err);
    res.status(502).json({
      smtpConfigured: true,
      emailSent: false,
      error:
        'Email provider failed to send the reset message. Please verify your SMTP configuration.',
    });
  }
});

router.get('/reset-password/validate', (req, res) => {
  const token = sanitizeText(req.query?.token, 128);
  if (!token) {
    res.json({ valid: false });
    return;
  }

  const row = db
    .prepare(
      `SELECT id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = ?`,
    )
    .get(hashToken(token)) as
    | { id: number; expires_at: string; used_at: string | null }
    | undefined;

  if (!row || row.used_at !== null || new Date(row.expires_at).getTime() <= Date.now()) {
    res.json({ valid: false });
    return;
  }

  res.json({ valid: true });
});

router.post('/reset-password', authRateLimit, (req, res) => {
  const token = sanitizeText(req.body?.token, 128);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirmPassword =
    typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (!token) {
    res.status(400).json({ error: 'Reset token is missing.' });
    return;
  }
  const pwError = validatePasswordStrength(password);
  if (pwError) {
    res.status(400).json({ error: pwError });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }

  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = ?`,
    )
    .get(tokenHash) as
    | { id: number; user_id: number; expires_at: string; used_at: string | null }
    | undefined;

  if (!row || row.used_at !== null || new Date(row.expires_at).getTime() <= Date.now()) {
    res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
    return;
  }

  const newHash = hashPassword(password);
  const resetTx = db.transaction(() => {
    const updateRes = db
      .prepare(
        `UPDATE password_reset_tokens
         SET used_at = datetime('now')
         WHERE id = ? AND used_at IS NULL`,
      )
      .run(row.id);
    if (updateRes.changes !== 1) {
      throw new Error('TOKEN_ALREADY_USED');
    }
    db.prepare(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(newHash, row.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  });

  try {
    resetTx();
    res.json({ ok: true, message: 'Password updated successfully. Please sign in.' });
  } catch {
    res.status(400).json({ error: 'This password reset link has already been used.' });
  }
});

export default router;
