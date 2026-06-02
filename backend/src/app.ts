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
import { startCleanupJob } from './jobs/cleanup.job';
import { prisma } from './db/prisma';
import { redis } from './redis/client';

const app = express();

const FRONTEND_ROOT = process.env.FRONTEND_ROOT_DOMAIN || 'localhost';
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // outils non-navigateur / same-origin
    try {
      const host = new URL(origin).hostname;
      if (host === FRONTEND_ROOT || host.endsWith(`.${FRONTEND_ROOT}`)) return cb(null, true);
    } catch { /* origine illisible */ }
    cb(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json());

app.use('/api/auth',          authRouter);
app.use('/api/me',            meRouter);
app.use('/api/sports',        sportsRouter);
app.use('/api/resources',     resourcesRouter);
app.use('/api/reservations',  reservationsRouter);
// Admin scopé par club — monté AVANT /api/clubs (plus spécifique).
app.use('/api/clubs/:clubId/admin', adminRouter);
app.use('/api/clubs',         clubsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
