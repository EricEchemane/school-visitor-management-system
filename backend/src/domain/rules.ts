export const SCHOOL_TZ = 'Asia/Manila';
const MANILA_OFFSET_MIN = 8 * 60; // UTC+8, no daylight saving

/** Calendar date (YYYY-MM-DD) in the school's time zone. */
export function schoolDay(instant: Date): string {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** The instant a school-local "HH:MM" on a school day happens. */
export function schoolInstant(day: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const utc = Date.parse(`${day}T00:00:00Z`) + (h * 60 + m - MANILA_OFFSET_MIN) * 60_000;
  return new Date(utc);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export const MAX_ADVANCE_DAYS = 30;

export function validatePreRegistrationDate(date: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return 'Date must be YYYY-MM-DD';
  }
  const today = schoolDay(now);
  if (date < today) return 'Date cannot be in the past';
  if (date > addDays(today, MAX_ADVANCE_DAYS)) {
    return `Date cannot be more than ${MAX_ADVANCE_DAYS} days ahead`;
  }
  return null;
}

/** Overstay is derived, never stored. */
export function isOverstayed(
  visit: { state: string; expectedEndAt: Date | null },
  now: Date,
): boolean {
  return visit.state === 'CHECKED_IN' && !!visit.expectedEndAt && now > visit.expectedEndAt;
}

export function isHostTimedOut(registeredAt: Date, now: Date, timeoutMinutes: number): boolean {
  return now >= addMinutes(registeredAt, timeoutMinutes);
}

export function isReminderDue(registeredAt: Date, now: Date, timeoutMinutes: number): boolean {
  return now >= addMinutes(registeredAt, timeoutMinutes / 2);
}

/** Valid Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX. */
export function isValidPhMobile(value: string): boolean {
  return /^(\+63|0)9\d{9}$/.test(value.replace(/[\s-]/g, ''));
}
