import {
  addDays,
  isHostTimedOut,
  isOverstayed,
  isReminderDue,
  isValidPhMobile,
  schoolDay,
  schoolInstant,
  validatePreRegistrationDate,
} from '../../src/domain/rules';

describe('school time', () => {
  it('uses Manila (UTC+8) for the school day', () => {
    expect(schoolDay(new Date('2026-03-10T16:30:00Z'))).toBe('2026-03-11'); // 00:30 Manila
    expect(schoolDay(new Date('2026-03-10T15:59:00Z'))).toBe('2026-03-10');
  });

  it('converts a school-local time to the right instant', () => {
    expect(schoolInstant('2026-03-10', '18:00').toISOString()).toBe('2026-03-10T10:00:00.000Z');
  });
});

describe('pre-registration date', () => {
  const now = new Date('2026-03-10T02:00:00Z'); // 10:00 Manila, 2026-03-10
  it('accepts today and 30 days ahead', () => {
    expect(validatePreRegistrationDate('2026-03-10', now)).toBeNull();
    expect(validatePreRegistrationDate(addDays('2026-03-10', 30), now)).toBeNull();
  });
  it('rejects the past, 31 days ahead and bad formats', () => {
    expect(validatePreRegistrationDate('2026-03-09', now)).toMatch(/past/);
    expect(validatePreRegistrationDate(addDays('2026-03-10', 31), now)).toMatch(/30 days/);
    expect(validatePreRegistrationDate('10/03/2026', now)).toMatch(/YYYY-MM-DD/);
  });
});

describe('overstay (derived)', () => {
  const end = new Date('2026-03-10T05:00:00Z');
  it('is true only when checked in and past the expected end', () => {
    expect(isOverstayed({ state: 'CHECKED_IN', expectedEndAt: end }, new Date('2026-03-10T05:01:00Z'))).toBe(true);
    expect(isOverstayed({ state: 'CHECKED_IN', expectedEndAt: end }, new Date('2026-03-10T04:59:00Z'))).toBe(false);
    expect(isOverstayed({ state: 'CHECKED_OUT', expectedEndAt: end }, new Date('2026-03-10T09:00:00Z'))).toBe(false);
  });
});

describe('host timeout and reminder', () => {
  const t0 = new Date('2026-03-10T02:00:00Z');
  it('reminds at half the timeout and expires at the full timeout', () => {
    expect(isReminderDue(t0, new Date('2026-03-10T02:02:29Z'), 5)).toBe(false);
    expect(isReminderDue(t0, new Date('2026-03-10T02:02:30Z'), 5)).toBe(true);
    expect(isHostTimedOut(t0, new Date('2026-03-10T02:04:59Z'), 5)).toBe(false);
    expect(isHostTimedOut(t0, new Date('2026-03-10T02:05:00Z'), 5)).toBe(true);
  });
});

describe('Philippine mobile numbers', () => {
  it('accepts local and international formats', () => {
    expect(isValidPhMobile('0917 000 0001')).toBe(true);
    expect(isValidPhMobile('+639170000001')).toBe(true);
  });
  it('rejects others', () => {
    expect(isValidPhMobile('12345')).toBe(false);
    expect(isValidPhMobile('+14155550100')).toBe(false);
  });
});
