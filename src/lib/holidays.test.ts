import { describe, it, expect } from 'vitest';
import { easterSunday, holidaysBR, type Holiday } from './holidays';

describe('easterSunday', () => {
  it('computes Easter 2026 as April 5', () => {
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
  });
  it('computes Easter 2027 as March 28', () => {
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
  });
});

describe('holidaysBR', () => {
  const list = holidaysBR(2026);
  const byDate = (d: string) => list.find((h) => h.date === d);

  it('includes Natal', () => {
    expect(byDate('2026-12-25')).toEqual({ date: '2026-12-25', nome: 'Natal' });
  });
  it('includes Tiradentes', () => {
    expect(byDate('2026-04-21')).toEqual({ date: '2026-04-21', nome: 'Tiradentes' });
  });
  it('includes a Carnaval entry dated 2026-02-17', () => {
    const carnaval = byDate('2026-02-17');
    expect(carnaval).toBeDefined();
    expect(carnaval?.nome).toMatch(/Carnaval/i);
  });
  it('is sorted ascending by date', () => {
    const dates = list.map((h) => h.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
  it('returns well-formed Holiday entries', () => {
    for (const h of list) {
      const holiday: Holiday = h;
      expect(holiday.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(holiday.nome.length).toBeGreaterThan(0);
    }
  });
});
