import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_ROLES, PERMISSIONS } from '../domain/permissions';
import { SEED_USERS, DEFAULT_SETTINGS } from './seed-data';

const APP_ROLE = 'svm_app';

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Runs as the database owner. Creates the schema, seeds reference data, and
 * creates the restricted application role (insert/select only on audit_events).
 */
export async function migrate(adminUrl: string, appPassword: string, opts = { seedDemo: true }) {
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
    if (opts.seedDemo && rowCount === 0) {
      for (const u of SEED_USERS) {
        await client.query(
          `INSERT INTO users(email, name, password_hash, role_id, mobile)
           SELECT $1, $2, $3, id, $4 FROM roles WHERE name = $5`,
          [u.email, u.name, bcrypt.hashSync(u.password, 10), u.mobile, u.role],
        );
      }
    }

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
