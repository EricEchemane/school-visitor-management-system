export const VISIT_STATES = [
  'PRE_REGISTERED',
  'AWAITING_HOST',
  'CHECKED_IN',
  'CHECKED_OUT',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type VisitState = (typeof VISIT_STATES)[number];

export type VisitEvent =
  | 'CHECK_IN'
  | 'HOST_CONFIRM'
  | 'HOST_DECLINE'
  | 'EXPIRE'
  | 'CANCEL'
  | 'MARK_NO_SHOW'
  | 'CHECK_OUT';

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: VisitState,
    readonly event: VisitEvent,
  ) {
    super(`Cannot ${event} a visit that is ${from}`);
  }
}

/**
 * The only place that knows which visit state changes are legal.
 * Every other combination is rejected.
 */
const TRANSITIONS: Record<VisitState, Partial<Record<VisitEvent, VisitState>>> = {
  PRE_REGISTERED: { CHECK_IN: 'CHECKED_IN', CANCEL: 'CANCELLED', MARK_NO_SHOW: 'NO_SHOW' },
  AWAITING_HOST: { HOST_CONFIRM: 'CHECKED_IN', HOST_DECLINE: 'DECLINED', EXPIRE: 'EXPIRED' },
  CHECKED_IN: { CHECK_OUT: 'CHECKED_OUT' },
  CHECKED_OUT: {},
  DECLINED: {},
  EXPIRED: {},
  CANCELLED: {},
  NO_SHOW: {},
};

export function nextState(from: VisitState, event: VisitEvent): VisitState {
  const to = TRANSITIONS[from][event];
  if (!to) throw new InvalidTransitionError(from, event);
  return to;
}

export function allowedEvents(from: VisitState): VisitEvent[] {
  return Object.keys(TRANSITIONS[from]) as VisitEvent[];
}

export function isTerminal(state: VisitState): boolean {
  return allowedEvents(state).length === 0;
}

/** States from which the given event is legal (used to build conditional updates). */
export function statesAllowing(event: VisitEvent): VisitState[] {
  return VISIT_STATES.filter((s) => TRANSITIONS[s][event] !== undefined);
}
