'use client';

import { useMemo, useState } from 'react';
import { holidaysBR } from '@/lib/holidays';

export interface DateEntry {
  /** ISO calendar date, YYYY-MM-DD. */
  date: string;
  /** Wall-clock time, HH:mm. */
  time: string;
  /** Optional per-date override; empty/undefined inherits the base message. */
  mensagem?: string;
}

// Local YYYY-MM-DD for "today" so the browser's timezone can't shift the day.
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// YYYY-MM-DD → dd/MM (no Date, no timezone drift).
function ddMM(isoDate: string): string {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

// YYYY-MM-DD → dd/MM/yyyy.
function ddMMyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// Keep entries unique by date and sorted ascending — the single source of order.
function normalize(entries: DateEntry[]): DateEntry[] {
  const seen = new Map<string, DateEntry>();
  for (const e of entries) if (!seen.has(e.date)) seen.set(e.date, e);
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function MultiDatePicker({
  entries,
  onChange,
  baseMensagem,
  defaultTime,
  onDefaultTimeChange,
}: {
  entries: DateEntry[];
  onChange: (next: DateEntry[]) => void;
  baseMensagem: string;
  defaultTime: string;
  onDefaultTimeChange: (t: string) => void;
}): React.JSX.Element {
  const today = useMemo(() => todayIso(), []);
  const [customDate, setCustomDate] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const selected = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);

  // National holidays for this year and the next, keeping only today-or-later.
  const upcomingHolidays = useMemo(() => {
    const year = new Date().getFullYear();
    return [...holidaysBR(year), ...holidaysBR(year + 1)].filter((h) => h.date >= today);
  }, [today]);

  function addDate(date: string) {
    if (!date || date < today || selected.has(date)) return;
    onChange(normalize([...entries, { date, time: defaultTime }]));
  }

  function removeDate(date: string) {
    onChange(entries.filter((e) => e.date !== date));
  }

  function toggleHoliday(date: string) {
    if (selected.has(date)) removeDate(date);
    else addDate(date);
  }

  function setEntryTime(date: string, time: string) {
    onChange(entries.map((e) => (e.date === date ? { ...e, time } : e)));
  }

  function setEntryMensagem(date: string, mensagem: string) {
    onChange(entries.map((e) => (e.date === date ? { ...e, mensagem } : e)));
  }

  const sorted = useMemo(() => normalize(entries), [entries]);

  return (
    <div className="space-y-4">
      {/* Default time for newly added dates */}
      <div>
        <label
          htmlFor="mdp-default-time"
          className="mb-[9px] block text-[13px] font-semibold"
        >
          Horário padrão{' '}
          <span className="font-normal text-muted">· usado ao adicionar datas</span>
        </label>
        <input
          id="mdp-default-time"
          type="time"
          value={defaultTime}
          onChange={(e) => onDefaultTimeChange(e.target.value)}
          className={`${inputCls} max-w-[140px] [color-scheme:dark]`}
        />
      </div>

      {/* Holiday quick-pick */}
      <div>
        <div className="mb-[9px] text-[13px] font-semibold">
          Feriados <span className="font-normal text-muted">· toque pra adicionar</span>
        </div>
        {upcomingHolidays.length === 0 ? (
          <p className="text-[13px] text-muted">Nenhum feriado nacional à frente.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {upcomingHolidays.map((h) => {
              const on = selected.has(h.date);
              return (
                <button
                  key={h.date}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleHoliday(h.date)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-[7px] text-[12.5px] font-medium transition-colors ${
                    on
                      ? 'border-blue bg-blue/15 text-ink'
                      : 'border-border bg-surface2 text-muted hover:border-blue2 hover:text-ink'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] leading-none ${
                      on ? 'bg-blue text-white' : 'border border-[#33405f]'
                    }`}
                  >
                    {on ? '✓' : '+'}
                  </span>
                  <span>{h.nome}</span>
                  <span className={on ? 'text-blue2' : 'text-muted/70'}>{ddMM(h.date)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Add an arbitrary future date */}
      <div>
        <label htmlFor="mdp-custom-date" className="mb-[9px] block text-[13px] font-semibold">
          Adicionar data
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="mdp-custom-date"
            type="date"
            min={today}
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className={`${inputCls} max-w-[180px] [color-scheme:dark]`}
          />
          <button
            type="button"
            onClick={() => {
              addDate(customDate);
              setCustomDate('');
            }}
            disabled={!customDate || customDate < today || selected.has(customDate)}
            className="rounded-xl border border-blue2/50 bg-blue/15 px-4 py-3 text-sm font-semibold text-ink transition-colors hover:bg-blue/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Adicionar
          </button>
        </div>
      </div>

      {/* Selected dates */}
      <div>
        <div className="mb-[9px] text-[13px] font-semibold">
          Datas selecionadas{' '}
          <span className="font-normal text-muted">
            {sorted.length ? `· ${sorted.length}` : ''}
          </span>
        </div>
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2a3550] bg-surface2 px-3.5 py-6 text-center text-[13px] text-muted">
            Nenhuma data ainda. Escolha um feriado ou adicione uma data acima.
          </div>
        ) : (
          <ul className="space-y-2">
            {sorted.map((entry) => {
              const isOpen = expanded[entry.date] ?? false;
              return (
                <li
                  key={entry.date}
                  className="rounded-xl border border-border bg-surface2 px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-display text-sm font-semibold tabular-nums text-ink">
                      {ddMMyyyy(entry.date)}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="sr-only">Horário de {ddMMyyyy(entry.date)}</span>
                      <input
                        type="time"
                        aria-label={`Horário de ${ddMMyyyy(entry.date)}`}
                        value={entry.time}
                        onChange={(e) => setEntryTime(entry.date, e.target.value)}
                        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none [color-scheme:dark] focus:border-blue2"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((s) => ({ ...s, [entry.date]: !isOpen }))
                      }
                      aria-expanded={isOpen}
                      className={`ml-auto rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        entry.mensagem?.trim() || isOpen
                          ? 'border-blue2/50 bg-blue/10 text-blue2'
                          : 'border-border text-muted hover:text-ink'
                      }`}
                    >
                      {entry.mensagem?.trim() ? '✎ Mensagem própria' : 'Personalizar mensagem'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDate(entry.date)}
                      aria-label={`Remover ${ddMMyyyy(entry.date)}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-orange hover:text-orange"
                    >
                      ✕
                    </button>
                  </div>
                  {isOpen && (
                    <textarea
                      value={entry.mensagem ?? ''}
                      onChange={(e) => setEntryMensagem(entry.date, e.target.value)}
                      rows={3}
                      placeholder={baseMensagem || 'Herda a mensagem base…'}
                      aria-label={`Mensagem para ${ddMMyyyy(entry.date)}`}
                      className="mt-2.5 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-blue2"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-border bg-surface2 px-[13px] py-3 text-sm text-ink outline-none placeholder:text-muted focus:border-blue2';
