// Pinned to America/Sao_Paulo so the rendered date is identical on the server
// (Vercel runs in UTC) and in the browser — avoids a hydration mismatch on the date text.
const WHEN_FMT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const parts = WHEN_FMT.formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`;
}
