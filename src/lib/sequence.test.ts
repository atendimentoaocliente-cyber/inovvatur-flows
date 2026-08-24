import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  formatHora,
  formatData,
  diaSemana,
  shiftDateYMD,
  computeStepEnviarEm,
} from './sequence';
import type { SequenceStep } from './types';

const baseStep = (over: Partial<SequenceStep>): SequenceStep => ({
  id: 's',
  ordem: 0,
  dia_offset: 0,
  hora_tipo: 'fixo',
  hora_fixa: '08:00',
  offset_min: null,
  mensagem: '',
  tipo: 'texto',
  midia_url: null,
  mencionar_todos: false,
  ...over,
});

describe('renderTemplate', () => {
  const vars = { tema: 'IA na prática', hora: '19h', data: '17/09/2026', diasemana: 'quinta-feira' };

  it('replaces all four variables', () => {
    expect(
      renderTemplate('{{diasemana}} ({{data}}) às {{hora}} — tema: {{tema}}', vars),
    ).toBe('quinta-feira (17/09/2026) às 19h — tema: IA na prática');
  });

  it('tolerates inner spaces and case', () => {
    expect(renderTemplate('{{ Tema }} / {{DIASEMANA}} / {{  hora  }}', vars)).toBe(
      'IA na prática / quinta-feira / 19h',
    );
  });

  it('leaves unknown variables as-is', () => {
    expect(renderTemplate('oi {{fulano}} e {{tema}}', vars)).toBe('oi {{fulano}} e IA na prática');
  });
});

describe('formatHora', () => {
  it('drops minutes when zero', () => {
    expect(formatHora('19:00')).toBe('19h');
    expect(formatHora('08:00')).toBe('8h');
  });
  it('keeps minutes otherwise', () => {
    expect(formatHora('19:30')).toBe('19h30');
    expect(formatHora('09:05')).toBe('9h05');
  });
});

describe('formatData', () => {
  it('YYYY-MM-DD -> DD/MM/YYYY', () => {
    expect(formatData('2026-09-17')).toBe('17/09/2026');
  });
});

describe('diaSemana', () => {
  it('2026-09-17 is quinta-feira', () => {
    expect(diaSemana('2026-09-17')).toBe('quinta-feira');
  });
  it('2026-09-20 is domingo', () => {
    expect(diaSemana('2026-09-20')).toBe('domingo');
  });
});

describe('shiftDateYMD', () => {
  it('shifts back across a month boundary', () => {
    expect(shiftDateYMD('2026-09-01', -1)).toBe('2026-08-31');
  });
  it('shifts forward across a year boundary', () => {
    expect(shiftDateYMD('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('-2 days', () => {
    expect(shiftDateYMD('2026-09-17', -2)).toBe('2026-09-15');
  });
});

describe('computeStepEnviarEm', () => {
  it('fixo: aula 2026-09-17, s1 dia -1 08:00 -> 2026-09-16T11:00:00.000Z', () => {
    const step = baseStep({ dia_offset: -1, hora_tipo: 'fixo', hora_fixa: '08:00' });
    expect(computeStepEnviarEm('2026-09-17', '19:00', step)).toBe('2026-09-16T11:00:00.000Z');
  });

  it('relativo -60 (aula 19:00) -> 18:00 local = 2026-09-17T21:00:00.000Z', () => {
    const step = baseStep({ dia_offset: 0, hora_tipo: 'relativo', hora_fixa: null, offset_min: -60 });
    expect(computeStepEnviarEm('2026-09-17', '19:00', step)).toBe('2026-09-17T21:00:00.000Z');
  });

  it('relativo 0 (aula 19:00) -> 19:00 local = 2026-09-17T22:00:00.000Z', () => {
    const step = baseStep({ dia_offset: 0, hora_tipo: 'relativo', hora_fixa: null, offset_min: 0 });
    expect(computeStepEnviarEm('2026-09-17', '19:00', step)).toBe('2026-09-17T22:00:00.000Z');
  });

  it('relativo +5 (aula 19:00) -> 19:05 local = 2026-09-17T22:05:00.000Z', () => {
    const step = baseStep({ dia_offset: 0, hora_tipo: 'relativo', hora_fixa: null, offset_min: 5 });
    expect(computeStepEnviarEm('2026-09-17', '19:00', step)).toBe('2026-09-17T22:05:00.000Z');
  });

  it('relativo +10 crossing an hour (aula 19:55) -> 20:05 local = 2026-09-17T23:05:00.000Z', () => {
    const step = baseStep({ dia_offset: 0, hora_tipo: 'relativo', hora_fixa: null, offset_min: 10 });
    expect(computeStepEnviarEm('2026-09-17', '19:55', step)).toBe('2026-09-17T23:05:00.000Z');
  });

  it('relativo +10 crossing midnight (aula 23:55) -> next day = 2026-09-18T03:05:00.000Z', () => {
    const step = baseStep({ dia_offset: 0, hora_tipo: 'relativo', hora_fixa: null, offset_min: 10 });
    expect(computeStepEnviarEm('2026-09-17', '23:55', step)).toBe('2026-09-18T03:05:00.000Z');
  });
});
