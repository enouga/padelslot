import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import meRouter from './routes/me';
import sportsRouter from './routes/sports';
import clubsRouter from './routes/clubs';
import adminRouter from './routes/admin';
import resourcesRouter from './routes/resources';
import reservationsRouter from './routes/reservations';
import tournamentsRouter from './routes/tournaments';
import eventsRouter from './routes/events';
import platformRouter from './routes/platform';
import { authMiddleware } from './middleware/auth';
import { requireSuperAdmin } from './middleware/requireSuperAdmin';
import { startCleanupJob } from './jobs/cleanup.job';
import { prisma } from './db/prisma';
import { redis } from './redis/client';
import { UPLOADS_DIR, ensureUploadDirs } from './utils/uploads';

const app = express();

const FRONTEND_ROOT = process.env.FRONTEND_ROOT_DOMAIN || 'localhost';
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // outils non-navigateur / same-origin
    try {
      const host = new URL(origin).hostname;
      if (host === FRONTEND_ROOT || host.endsWith(`.${FRONTEND_ROOT}`)) return cb(null, true);
    } catch { /* origine illisible */ }
    cb(null, false);
  },
}));
app.use(express.json());

// Fichiers uploadés (avatars). Cache long : les noms de fichiers sont horodatés.
ensureUploadDirs();
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '365d', immutable: true }));

app.use('/api/auth',          authRouter);
app.use('/api/me',            meRouter);
app.use('/api/sports',        sportsRouter);
app.use('/api/resources',     resourcesRouter);
app.use('/api/reservations',  reservationsRouter);
app.use('/api/tournaments',   tournamentsRouter);
app.use('/api/events',        eventsRouter);
app.use('/api/platform', authMiddleware, requireSuperAdmin, platformRouter);
// Admin scopé par club — monté AVANT /api/clubs (plus spécifique).
app.use('/api/clubs/:clubId/admin', adminRouter);
app.use('/api/clubs',         clubsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Validation des certificats TLS « à la demande » de Caddy (sous-domaines clubs en prod).
// Caddy appelle GET /internal/tls-check?domain=<host> ; on n'autorise que palova.fr et ses sous-domaines.
app.get('/internal/tls-check', (req: Request, res: Response) => {
  const domain = String(req.query.domain || '').toLowerCase();
  const root = (process.env.FRONTEND_ROOT_DOMAIN || 'localhost').toLowerCase();
  if (domain === root || domain === `www.${root}` || domain === `api.${root}` || domain.endsWith(`.${root}`)) {
    res.sendStatus(200);
    return;
  }
  res.sendStatus(403);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

const PORT = parseInt(process.env.PORT || '3001', 10);

if (require.main === module) {
  Promise.all([prisma.$connect(), redis.connect()])
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Backend démarré sur http://localhost:${PORT}`);
        startCleanupJob();
      });
    })
    .catch(console.error);
}

export default app;
