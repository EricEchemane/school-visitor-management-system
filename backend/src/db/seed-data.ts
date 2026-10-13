// All data below is fictional.
export const SEED_PASSWORD = 'Passw0rd!demo';

export interface SeedUser {
  email: string;
  name: string;
  role: string;
  mobile: string | null;
  password: string;
}

export const SEED_USERS: SeedUser[] = [
  { email: 'admin@school.test', name: 'Alex Admin', role: 'Admin', mobile: null, password: SEED_PASSWORD },
  { email: 'frontdesk1@school.test', name: 'Gabriel Gate', role: 'Front Desk', mobile: null, password: SEED_PASSWORD },
  { email: 'frontdesk2@school.test', name: 'Gina Gate', role: 'Front Desk', mobile: null, password: SEED_PASSWORD },
  { email: 'teacher1@school.test', name: 'Teresa Reyes', role: 'Employee', mobile: '09170000001', password: SEED_PASSWORD },
  { email: 'teacher2@school.test', name: 'Tomas Cruz', role: 'Employee', mobile: '09170000002', password: SEED_PASSWORD },
  { email: 'teacher3@school.test', name: 'Tala Santos', role: 'Employee', mobile: '09170000003', password: SEED_PASSWORD },
  { email: 'registrar@school.test', name: 'Rina Bautista', role: 'Employee', mobile: '09170000004', password: SEED_PASSWORD },
  { email: 'principal@school.test', name: 'Paolo Mendoza', role: 'Employee', mobile: '09170000005', password: SEED_PASSWORD },
  { email: 'counselor@school.test', name: 'Carla Ramos', role: 'Employee', mobile: '09170000006', password: SEED_PASSWORD },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  host_timeout_minutes: '5',
  closing_time: '18:00',
  retention_days: '365',
  default_duration_minutes: '120',
};
