import { Pool } from 'pg';
import { createApp } from './app';
import { Db } from './db/pool';
import { systemClock } from './domain/clock';
import { SimulatedChannel } from './services/notification.service';
import { JobsService } from './services/jobs.service';

async function bootstrap() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const failing = (process.env.SIMULATE_CHANNEL_FAILURES ?? '').split(',').map((s) => s.trim().toUpperCase());

  const app = await createApp({
    db: new Db(new Pool({ connectionString: url })),
    clock: systemClock,
    channels: [
      new SimulatedChannel('EMAIL', failing.includes('EMAIL')),
      new SimulatedChannel('SMS', failing.includes('SMS')),
    ],
  });
  app.get(JobsService).start(Number(process.env.JOB_INTERVAL_MS ?? 60_000));
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
