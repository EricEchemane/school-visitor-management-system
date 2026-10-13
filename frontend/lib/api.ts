export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.code ?? 'ERROR', data.message ?? 'Something went wrong', data);
  }
  return data as T;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface Visit {
  id: string;
  kind: 'PRE_REGISTERED' | 'WALK_IN';
  state: string;
  visitorName: string | null;
  visitorContact: string | null;
  anonymised: boolean;
  purpose: string;
  hostId: string;
  hostName: string;
  expectedDate: string;
  windowStart: string | null;
  windowEnd: string | null;
  durationMinutes: number;
  expectedEndAt: string | null;
  registeredAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  departureVerified: boolean | null;
  declineReason: string | null;
  overstayed: boolean;
  pass: { number: string; token: string } | null;
}
