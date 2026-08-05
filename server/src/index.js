import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import bucketsRouter from './routes/buckets.js';
import replicationRouter from './routes/replication.js';
import overviewRouter from './routes/overview.js';
import settingsRouter from './routes/settings.js';
import { REGIONS } from './regions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.IONOS_S3_ACCESS_KEY || !process.env.IONOS_S3_SECRET_KEY) {
  console.warn(
    'Missing IONOS_S3_ACCESS_KEY / IONOS_S3_SECRET_KEY in environment (.env) - upload a .env file from the app banner to configure credentials.',
  );
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/regions', (req, res) => res.json({ regions: REGIONS }));
app.use('/api/replication-overview', overviewRouter);
app.use('/api/buckets', bucketsRouter);
app.use('/api/buckets/:region/:bucket', replicationRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`IONOS bucket replication server listening on http://localhost:${port}`);
});
