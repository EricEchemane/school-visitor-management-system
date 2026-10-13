import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_ROLES, PERMISSIONS } from '../domain/permissions';
import { schoolDay } from '../domain/rules';
import { SEED_USERS, DEFAULT_SETTINGS } from './seed-data';

const APP_ROLE = 'svm_app';

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Runs as the database owner. Creates the schema, seeds reference data, and
 * creates the restricted application role (insert/select only on audit_events).
 */
export async function migrate(adminUrl: string, appPassword: string, opts: { seedDemo?: boolean; sampleVisits?: boolean } = {}) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));

    for (const code of PERMISSIONS) {
      await client.query('INSERT INTO permissions(code) VALUES ($1) ON CONFLICT DO NOTHING', [code]);
    }
    for (const [name, perms] of Object.entries(DEFAULT_ROLES)) {
      const r = await client.query(
        'INSERT INTO roles(name, system) VALUES ($1, TRUE) ON CONFLICT (name) DO UPDATE SET system = TRUE RETURNING id, (xmax = 0) AS inserted',
        [name],
      );
      if (r.rows[0].inserted) {
        for (const code of perms) {
          await client.query(
            'INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE code = $2',
            [r.rows[0].id, code],
          );
        }
      }
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await client.query('INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT DO NOTHING', [key, value]);
    }

    const { rowCount } = await client.query('SELECT 1 FROM users LIMIT 1');
    const seedDemo = opts.seedDemo ?? true;
    if (seedDemo && rowCount === 0) {
      for (const u of SEED_USERS) {
        await client.query(
          `INSERT INTO users(email, name, password_hash, role_id, mobile)
           SELECT $1, $2, $3, id, $4 FROM roles WHERE name = $5`,
          [u.email, u.name, bcrypt.hashSync(u.password, 10), u.mobile, u.role],
        );
      }
    }

    if (seedDemo && rowCount === 0 && (opts.sampleVisits ?? true)) await seedSampleVisits(client);

    await client.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
           CREATE ROLE ${APP_ROLE} LOGIN PASSWORD ${literal(appPassword)};
         ELSE
           ALTER ROLE ${APP_ROLE} PASSWORD ${literal(appPassword)};
         END IF;
       END $$`,
    );
    await client.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
    // Audit trail is append-only for the application.
    await client.query(`REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM ${APP_ROLE}`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
    await client.end();
  }
}

/** A few fictional visits in different states so the screens are not empty on first run. */
async function seedSampleVisits(client: Client) {
  const now = new Date();
  const today = schoolDay(now);
  const user = async (email: string) =>
    (await client.query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id as string;
  const [t1, t2, guard] = await Promise.all([
    user('teacher1@school.test'),
    user('teacher2@school.test'),
    user('frontdesk1@school.test'),
  ]);
  const insert = async (v: {
    name: string; purpose: string; host: string; kind: string; state: string;
    inMinAgo?: number; outMinAgo?: number; durationMin: number; window?: [string, string];
  }) => {
    const checkedIn = v.inMinAgo !== undefined ? new Date(now.getTime() - v.inMinAgo * 60_000) : null;
    const checkedOut = v.outMinAgo !== undefined ? new Date(now.getTime() - v.outMinAgo * 60_000) : null;
    const { rows } = await client.query(
      `INSERT INTO visits(visitor_name, purpose, host_id, created_by, kind, state, expected_date,
         window_start, window_end, duration_minutes, expected_end_at, registered_at, checked_in_at,
         checked_out_at, departure_verified, checked_out_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14,$15) RETURNING id`,
      [v.name, v.purpose, v.host, v.kind === 'WALK_IN' ? guard : v.host, v.kind, v.state, today,
       v.window?.[0] ?? null, v.window?.[1] ?? null, v.durationMin,
       checkedIn ? new Date(checkedIn.getTime() + v.durationMin * 60_000) : null,
       checkedIn ?? now, checkedOut, checkedOut ? true : null, checkedOut ? guard : null],
    );
    if (v.state === 'CHECKED_IN' || v.state === 'CHECKED_OUT') {
      const seq = await client.query("SELECT nextval('pass_number_seq') AS n");
      await client.query(
        'INSERT INTO passes(visit_id, number, token, issued_at, invalidated_at) VALUES ($1,$2,$3,$4,$5)',
        [rows[0].id, `V-${String(seq.rows[0].n).padStart(4, '0')}`, randomBytes(24).toString('base64url'), checkedIn, checkedOut],
      );
    }
  };
  await insert({ name: 'Paula Parent', purpose: 'Parent-teacher meeting', host: t1, kind: 'PRE_REGISTERED', state: 'PRE_REGISTERED', durationMin: 60, window: ['13:00', '14:00'] });
  await insert({ name: 'Victor Vendor', purpose: 'Deliver science kits', host: t2, kind: 'PRE_REGISTERED', state: 'PRE_REGISTERED', durationMin: 30, window: ['09:00', '12:00'] });
  await insert({ name: 'Olive Overstay', purpose: 'Book fair setup', host: t2, kind: 'WALK_IN', state: 'CHECKED_IN', inMinAgo: 200, durationMin: 60 });
  await insert({ name: 'Carlo Contractor', purpose: 'Repair the gym lights', host: t1, kind: 'PRE_REGISTERED', state: 'CHECKED_IN', inMinAgo: 20, durationMin: 120 });
  await insert({ name: 'Dina Departed', purpose: 'Enrolment inquiry', host: t1, kind: 'WALK_IN', state: 'CHECKED_OUT', inMinAgo: 120, outMinAgo: 70, durationMin: 60 });
}

if (require.main === module) {
  const admin = process.env.DATABASE_ADMIN_URL;
  const pw = process.env.APP_DB_PASSWORD;
  if (!admin || !pw) {
    console.error('DATABASE_ADMIN_URL and APP_DB_PASSWORD are required');
    process.exit(1);
  }
  migrate(admin, pw, { seedDemo: process.env.SEED_DEMO !== 'false' })
    .then(() => console.log('migrations and seed complete'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
