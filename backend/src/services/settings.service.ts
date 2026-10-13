import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../db/pool';
import { DEFAULT_SETTINGS } from '../db/seed-data';

export interface Settings {
  hostTimeoutMinutes: number;
  closingTime: string;
  retentionDays: number;
  defaultDurationMinutes: number;
}

@Injectable()
export class SettingsService {
  constructor(@Inject(Db) private readonly db: Db) {}

  async get(): Promise<Settings> {
    const { rows } = await this.db.query<{ key: string; value: string }>('SELECT key, value FROM settings');
    const m = { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
    return {
      hostTimeoutMinutes: Number(m.host_timeout_minutes),
      closingTime: m.closing_time,
      retentionDays: Number(m.retention_days),
      defaultDurationMinutes: Number(m.default_duration_minutes),
    };
  }
}
