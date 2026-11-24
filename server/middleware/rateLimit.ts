import type { NextFunction, Request, Response } from 'express';

interface RateRecord {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message: string;
}) {
  const store = new Map<string, RateRecord>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = store.get(key);

    if (!existing || now > existing.resetAt) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
      res.status(429).json({ error: options.message });
      return;
    }

    existing.count += 1;
    next();
  };
}
