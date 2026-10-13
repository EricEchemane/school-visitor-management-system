import {
  VISIT_STATES,
  VisitEvent,
  VisitState,
  InvalidTransitionError,
  nextState,
  isTerminal,
} from '../../src/domain/visit-state';

const LEGAL: Array<[VisitState, VisitEvent, VisitState]> = [
  ['PRE_REGISTERED', 'CHECK_IN', 'CHECKED_IN'],
  ['PRE_REGISTERED', 'CANCEL', 'CANCELLED'],
  ['PRE_REGISTERED', 'MARK_NO_SHOW', 'NO_SHOW'],
  ['AWAITING_HOST', 'HOST_CONFIRM', 'CHECKED_IN'],
  ['AWAITING_HOST', 'HOST_DECLINE', 'DECLINED'],
  ['AWAITING_HOST', 'EXPIRE', 'EXPIRED'],
  ['CHECKED_IN', 'CHECK_OUT', 'CHECKED_OUT'],
];
const ALL_EVENTS: VisitEvent[] = [
  'CHECK_IN',
  'HOST_CONFIRM',
  'HOST_DECLINE',
  'EXPIRE',
  'CANCEL',
  'MARK_NO_SHOW',
  'CHECK_OUT',
];

describe('visit state machine', () => {
  it.each(LEGAL)('allows %s --%s--> %s', (from, event, to) => {
    expect(nextState(from, event)).toBe(to);
  });

  const legalKeys = new Set(LEGAL.map(([f, e]) => `${f}:${e}`));
  const illegal: Array<[VisitState, VisitEvent]> = [];
  for (const s of VISIT_STATES) {
    for (const e of ALL_EVENTS) if (!legalKeys.has(`${s}:${e}`)) illegal.push([s, e]);
  }

  it.each(illegal)('rejects %s --%s--', (from, event) => {
    expect(() => nextState(from, event)).toThrow(InvalidTransitionError);
  });

  it('a walk-in cannot be checked in by the guard (only the host can confirm)', () => {
    expect(() => nextState('AWAITING_HOST', 'CHECK_IN')).toThrow(InvalidTransitionError);
  });

  it('a visitor cannot be checked out before check-in', () => {
    expect(() => nextState('AWAITING_HOST', 'CHECK_OUT')).toThrow(InvalidTransitionError);
    expect(() => nextState('PRE_REGISTERED', 'CHECK_OUT')).toThrow(InvalidTransitionError);
  });

  it('terminal states allow nothing', () => {
    for (const s of ['CHECKED_OUT', 'DECLINED', 'EXPIRED', 'CANCELLED', 'NO_SHOW'] as const) {
      expect(isTerminal(s)).toBe(true);
    }
    expect(isTerminal('CHECKED_IN')).toBe(false);
  });
});
