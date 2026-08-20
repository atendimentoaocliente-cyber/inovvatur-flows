import { describe, it, expect } from 'vitest';
import { formatWhen } from './format';

describe('formatWhen', () => {
  it('returns "—" for null', () => {
    expect(formatWhen(null)).toBe('—');
  });
  it('formats an ISO date as dd/MM HH:mm', () => {
    expect(formatWhen('2026-10-12T09:00:00-03:00')).toBe('12/10 09:00');
  });
});
