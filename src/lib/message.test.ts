import { describe, it, expect } from 'vitest';
import { renderMessage, estimateDuration, formatDuration } from './message';

describe('renderMessage', () => {
  it('replaces {{data}} with the provided value', () => {
    expect(renderMessage('Bom dia {{data}}!', { data: '12/10' })).toBe('Bom dia 12/10!');
  });
  it('replaces every occurrence', () => {
    expect(renderMessage('{{x}}-{{x}}', { x: 'a' })).toBe('a-a');
  });
  it('leaves unknown variables untouched', () => {
    expect(renderMessage('Oi {{tema}}', { data: 'x' })).toBe('Oi {{tema}}');
  });
});

describe('estimateDuration', () => {
  it('multiplies group count by the delay range', () => {
    expect(estimateDuration(18)).toEqual({ minSec: 144, maxSec: 270 });
  });
  it('is zero for no groups', () => {
    expect(estimateDuration(0)).toEqual({ minSec: 0, maxSec: 0 });
  });
});

describe('formatDuration', () => {
  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('45s');
  });
  it('formats minutes', () => {
    expect(formatDuration(270)).toBe('4min 30s');
  });
});
