import { Pool, PoolClient, types } from 'pg';

// Keep DATE columns as plain 'YYYY-MM-DD' strings (no time zone shifting).
types.setTypeParser(1082, (v: string) => v);

export type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export class Db {
  constructor(readonly pool: Pool) {}

  query<T = any>(text: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    return this.pool.query(text, params as any[]).then((r) => ({ rows: r.rows, rowCount: r.rowCount ?? 0 }));
  }

  /** Run work in one transaction; rolls back if it throws. */
  async tx<T>(work: (q: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}
