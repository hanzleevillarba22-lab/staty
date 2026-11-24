import type { NextFunction, Request, Response } from 'express';
import { db } from '../db.ts';
import { hashToken, verifyCsrfToken } from '../security.ts';

export interface AuthenticatedUser {
  id: number;
  full_name: string;
  username: string;
  email: string;
  avatar_url: string | null;
  theme_preference: 'light' | 'dark';
  notifications_enabled: number;
  created_at: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionTokenHash?: string;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) result[key] = val;
  }
  return result;
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.statlytics_session) {
    return cookies.statlytics_session;
  }
  return null;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const rawToken = extractSessionToken(req);
  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT
        u.id, u.full_name, u.username, u.email, u.avatar_url,
        u.theme_preference, u.notifications_enabled, u.created_at,
        s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as (AuthenticatedUser & { expires_at: string }) | undefined;

  if (!row) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  req.user = {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    email: row.email,
    avatar_url: row.avatar_url,
    theme_preference: row.theme_preference === 'dark' ? 'dark' : 'light',
    notifications_enabled: row.notifications_enabled,
    created_at: row.created_at,
  };
  req.sessionTokenHash = tokenHash;
  next();
}

export function csrfProtect(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  // Verify Origin / Host alignment when Origin header is present
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        res.status(403).json({ error: 'Cross-origin mutation blocked.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Invalid request origin.' });
      return;
    }
  }

  const csrfToken = req.headers['x-csrf-token'] as string | undefined;
  if (!verifyCsrfToken(csrfToken)) {
    res.status(403).json({ error: 'Invalid or missing CSRF token.' });
    return;
  }

  next();
}
