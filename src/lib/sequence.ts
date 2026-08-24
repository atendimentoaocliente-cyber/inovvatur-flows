import type { SequenceStep } from './types';

// pt-BR nome do dia da semana, indexado por Date#getUTCDay() (0 = domingo).
// Array fixo em vez de Intl para não depender do locale do ambiente (evita drift).
const DIAS_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;

// America/Sao_Paulo é fixo em UTC−03:00 (sem horário de verão desde 2019).
const SP_OFFSET = '-03:00';

/**
 * Substitui {{tema}}, {{hora}}, {{data}} e {{diasemana}} no template.
 * Tolerante a espaços internos e caixa: `{{ Tema }}`, `{{DIASEMANA}}` etc. funcionam.
 * Variáveis desconhecidas são deixadas como estão.
 */
export function renderTemplate(
  tpl: string,
  vars: { tema: string; hora: string; data: string; diasemana: string },
): string {
  const map: Record<string, string> = {
    tema: vars.tema,
    hora: vars.hora,
    data: vars.data,
    diasemana: vars.diasemana,
  };
  return tpl.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (full, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    return key in map ? map[key] : full;
  });
}

/** 'HH:MM' → estilo BR: '19h' quando minutos = 0, senão '19h30'. */
export function formatHora(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  const hh = String(Number(h));
  const mm = m ?? '00';
  return Number(mm) === 0 ? `${hh}h` : `${hh}h${mm}`;
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export function formatData(dateYMD: string): string {
  const [y, m, d] = dateYMD.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Dia da semana por extenso, pt-BR minúsculo (ex.: 'quinta-feira').
 * Usa Date.UTC + getUTCDay() para não depender de fuso do ambiente.
 */
export function diaSemana(dateYMD: string): string {
  const [y, m, d] = dateYMD.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return DIAS_SEMANA[day];
}

/**
 * Desloca uma data de calendário por deltaDays, via Date.UTC (aritmética pura,
 * nunca exibida), e devolve 'YYYY-MM-DD'. Mesmo truque de holidays.ts.
 */
export function shiftDateYMD(dateYMD: string, deltaDays: number): string {
  const [y, m, d] = dateYMD.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Momento de envio (UTC ISO) de um passo, dado data/hora da aula.
 * Timezone America/Sao_Paulo fixo em UTC−03:00.
 * - Data base = data da aula deslocada por step.dia_offset.
 * - hora_tipo 'fixo': base + step.hora_fixa (-03:00).
 * - hora_tipo 'relativo': base + hora da aula (-03:00) + step.offset_min minutos.
 */
export function computeStepEnviarEm(
  aulaDateYMD: string,
  aulaHora: string,
  step: SequenceStep,
): string {
  const base = shiftDateYMD(aulaDateYMD, step.dia_offset);
  if (step.hora_tipo === 'fixo') {
    return new Date(`${base}T${step.hora_fixa}:00${SP_OFFSET}`).toISOString();
  }
  const d = new Date(`${base}T${aulaHora}:00${SP_OFFSET}`);
  d.setTime(d.getTime() + (step.offset_min ?? 0) * 60000);
  return d.toISOString();
}
