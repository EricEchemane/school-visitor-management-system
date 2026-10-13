CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  system BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INT NOT NULL REFERENCES roles(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  mobile TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS pass_number_seq START 1;

CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name TEXT,
  visitor_contact TEXT,
  purpose TEXT NOT NULL,
  host_id UUID NOT NULL REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('PRE_REGISTERED', 'WALK_IN')),
  state TEXT NOT NULL CHECK (state IN
    ('PRE_REGISTERED','AWAITING_HOST','CHECKED_IN','CHECKED_OUT','DECLINED','EXPIRED','CANCELLED','NO_SHOW')),
  expected_date DATE NOT NULL,
  window_start TEXT,
  window_end TEXT,
  duration_minutes INT NOT NULL,
  expected_end_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  departure_verified BOOLEAN,
  checked_out_by UUID REFERENCES users(id),
  departure_corrected_by UUID REFERENCES users(id),
  departure_corrected_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  decline_reason TEXT,
  reminder_sent_at TIMESTAMPTZ,
  anonymised_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS visits_state ON visits (state);
CREATE INDEX IF NOT EXISTS visits_expected_date ON visits (expected_date);
CREATE INDEX IF NOT EXISTS visits_host ON visits (host_id);

CREATE TABLE IF NOT EXISTS passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL UNIQUE REFERENCES visits(id),
  number TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS')),
  kind TEXT NOT NULL CHECK (kind IN ('WALK_IN_REQUEST', 'REMINDER', 'OUTCOME')),
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_recipient ON notifications (recipient_id, channel);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  actor_id UUID,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_events (at DESC);
