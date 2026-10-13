const TZ = 'Asia/Manila';

export const todayInSchool = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

export function addDaysISO(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-PH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '–';

export const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-PH', {
        timeZone: TZ,
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–';

export const visitorLabel = (v: { visitorName: string | null }) => v.visitorName ?? '(anonymised)';

export const STATE_LABEL: Record<string, string> = {
  PRE_REGISTERED: 'Expected',
  AWAITING_HOST: 'Waiting for host',
  CHECKED_IN: 'On campus',
  CHECKED_OUT: 'Checked out',
  DECLINED: 'Declined',
  EXPIRED: 'No response',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};
