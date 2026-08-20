import { describe, it, expect } from 'vitest';
import { formatWhen } from './format';

describe('formatWhen', () => {
  it('returns "—" for null', () => {
    expect(formatWhen(null)).toBe('—');
  });
  it('formats an ISO date as dd/MM HH:mm', () => {
    expect(formatWhen('2026-10-12T09:00:00-03:00')).toBe('12/10 09:00');
  });
  it('renders in America/Sao_Paulo regardless of host timezone', () => {
    // 12:00 UTC is 09:00 in São Paulo (UTC-3) — proves the timezone is pinned, not host-local.
    expect(formatWhen('2026-10-12T12:00:00Z')).toBe('12/10 09:00');
  });
});
