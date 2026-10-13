'use client';
import type { ButtonHTMLAttributes } from 'react';
import { STATE_LABEL } from '@/lib/util';

export const StateBadge = ({ state, overstayed }: { state: string; overstayed?: boolean }) => (
  <span className={`badge s-${state}${overstayed ? ' overstay' : ''}`}>
    {overstayed ? 'Overstayed' : (STATE_LABEL[state] ?? state)}
  </span>
);

export const ErrorText = ({ message }: { message: string | null }) =>
  message ? (
    <p className="error" role="alert" data-testid="error">
      {message}
    </p>
  ) : null;

export const Spinner = () => <span className="spinner" aria-hidden="true" />;

/** A button that shows a spinner and blocks clicks while its action is in flight. */
export function Button({
  pending = false,
  pendingLabel,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean; pendingLabel?: string }) {
  return (
    <button {...rest} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Shown until the first poll answers, so "nobody is waiting" is never claimed before we know. */
export const Loading = ({ what }: { what: string }) => (
  <p className="muted loading">
    <Spinner /> Loading {what}…
  </p>
);
