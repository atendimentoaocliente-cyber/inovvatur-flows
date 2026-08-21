// Brazilian NATIONAL holidays, computed locally so the composer's "Feriados"
// quick-pick works offline and never drifts with a third-party calendar API.

export interface Holiday {
  /** ISO calendar date, YYYY-MM-DD (no time, no timezone). */
  date: string;
  nome: string;
}

/**
 * Easter Sunday for a given year via the Gauss/Meeus "Computus" algorithm
 * (Gregorian calendar). Returns a 1-based month (1-12) and day of month.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

// Format Y/M/D (month 1-12) as YYYY-MM-DD without going through Date, so a
// browser timezone can never shift the calendar day.
function iso(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Shift a calendar date by a number of days using a UTC Date (arithmetic only,
// never displayed), then read it back as YYYY-MM-DD.
function shiftIso(year: number, month: number, day: number, deltaDays: number): string {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Brazilian NATIONAL holidays for a year, sorted ascending by date.
 * Movable feasts (Carnaval, Sexta-feira Santa, Corpus Christi) are derived
 * from Easter Sunday.
 */
export function holidaysBR(year: number): Holiday[] {
  const easter = easterSunday(year);

  const fixed: Holiday[] = [
    { date: iso(year, 1, 1), nome: 'Confraternização Universal' },
    { date: iso(year, 4, 21), nome: 'Tiradentes' },
    { date: iso(year, 5, 1), nome: 'Dia do Trabalho' },
    { date: iso(year, 9, 7), nome: 'Independência' },
    { date: iso(year, 10, 12), nome: 'Nossa Senhora Aparecida' },
    { date: iso(year, 11, 2), nome: 'Finados' },
    { date: iso(year, 11, 15), nome: 'Proclamação da República' },
    { date: iso(year, 11, 20), nome: 'Consciência Negra' },
    { date: iso(year, 12, 25), nome: 'Natal' },
  ];

  const movable: Holiday[] = [
    { date: shiftIso(year, easter.month, easter.day, -47), nome: 'Carnaval' },
    { date: shiftIso(year, easter.month, easter.day, -2), nome: 'Sexta-feira Santa' },
    { date: shiftIso(year, easter.month, easter.day, 60), nome: 'Corpus Christi' },
  ];

  return [...fixed, ...movable].sort((a, b) => a.date.localeCompare(b.date));
}
