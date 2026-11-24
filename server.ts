import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { initializeDatabase } from './server/db.ts';
import { csrfProtect } from './server/middleware/auth.ts';
import authRoutes from './server/routes/auth.ts';
import dashboardRoutes from './server/routes/dashboard.ts';
import profileRoutes from './server/routes/profile.ts';
import projectRoutes from './server/routes/projects.ts';
import datasetRoutes from './server/routes/datasets.ts';
import statisticalTestRoutes from './server/routes/statisticalTests.ts';
import analysesRoutes from './server/routes/analyses.ts';
import reportRoutes from './server/routes/reports.ts';
import assistantRoutes from './server/routes/assistant.ts';

async function startServer() {
  initializeDatabase();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));

  // Baseline security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Protect mutating /api routes with CSRF verification
  app.use('/api', csrfProtect);

  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/datasets', datasetRoutes);
  app.use('/api/statistics', statisticalTestRoutes);
  app.use('/api/analyses', analysesRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/assistant', assistantRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'STATLYTICS' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`STATLYTICS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start STATLYTICS server:', err);
  process.exit(1);
});
