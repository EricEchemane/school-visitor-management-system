import { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Db } from '../../src/db/pool';
import { migrate } from '../../src/db/migrate';
import { FixedClock } from '../../src/domain/clock';
import { NotificationChannel, SimulatedChannel } from '../../src/services/notification.service';
import { JobsService } from '../../src/services/jobs.service';
import { SEED_PASSWORD } from '../../src/db/seed-data';

process.env.NODE_ENV = 'test';
jest.setTimeout(180_000);

/** 2026-03-10 10:00 in Manila (UTC+8). */
export const BASE_TIME = new Date('2026-03-10T02:00:00Z');

/** A channel whose failures can be switched on for one test. */
export class ToggleChannel implements NotificationChannel {
  failing = false;
  constructor(readonly name: 'EMAIL' | 'SMS') {}
  async send(to: any, message: string) {
    if (this.failing) throw new Error(`Simulated ${this.name} outage`);
    await new SimulatedChannel(this.name).send();
    void to;
    void message;
  }
}

export interface TestApp {
  app: INestApplication;
  db: Db;
  clock: FixedClock;
  email: ToggleChannel;
  sms: ToggleChannel;
  jobs: JobsService;
  container: StartedPostgreSqlContainer;
  http: () => ReturnType<typeof request>;
  as: (email: string) => Promise<ReturnType<typeof request.agent>>;
  ids: Record<string, string>;
  stop: () => Promise<void>;
}

export async function startTestApp(): Promise<TestApp> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const adminUrl = container.getConnectionUri();
  await migrate(adminUrl, 'app-secret');

  const appUrl = new URL(adminUrl);
  appUrl.username = 'svm_app';
  appUrl.password = 'app-secret';
  const db = new Db(new Pool({ connectionString: appUrl.toString() }));

  const clock = new FixedClock(BASE_TIME);
  const email = new ToggleChannel('EMAIL');
  const sms = new ToggleChannel('SMS');
  const app = await createApp({ db, clock, channels: [email, sms] });
  await app.init();

  const users = await db.query<{ id: string; email: string }>('SELECT id, email FROM users');
  const ids = Object.fromEntries(users.rows.map((u) => [u.email, u.id]));

  return {
    app,
    db,
    clock,
    email,
    sms,
    jobs: app.get(JobsService),
    container,
    ids,
    http: () => request(app.getHttpServer()),
    as: async (emailAddress: string) => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: emailAddress, password: SEED_PASSWORD }).expect(200);
      return agent;
    },
    stop: async () => {
      await app.close();
      await db.close();
      await container.stop();
    },
  };
}

export const USERS = {
  admin: 'admin@school.test',
  guard: 'frontdesk1@school.test',
  teacher1: 'teacher1@school.test',
  teacher2: 'teacher2@school.test',
};
