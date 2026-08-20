export function renderMessage(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.split(`{{${key}}}`).join(value),
    template,
  );
}

export function estimateDuration(groupCount: number, minDelay = 8, maxDelay = 15) {
  return { minSec: groupCount * minDelay, maxSec: groupCount * maxDelay };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}min` : `${m}min ${rem}s`;
}
