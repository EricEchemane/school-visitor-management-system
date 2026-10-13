'use client';
import { STATE_LABEL } from '@/lib/util';

export const StateBadge = ({ state, overstayed }: { state: string; overstayed?: boolean }) => (
  <span className={`badge s-${state}${overstayed ? ' overstay' : ''}`}>
    {overstayed ? 'Overstayed' : (STATE_LABEL[state] ?? state)}
  </span>
);

export const ErrorText = ({ message }: { message: string | null }) =>
  message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
