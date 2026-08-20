'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Campaign, CampaignStatus } from '@/lib/types';
import { CampaignRow } from '@/components/CampaignRow';
import { formatWhen } from '@/lib/format';

type Tab = 'agendadas' | 'historico' | 'rascunhos';

const tabs: { key: Tab; label: string }[] = [
  { key: 'agendadas', label: 'Agendadas' },
  { key: 'historico', label: 'Histórico' },
  { key: 'rascunhos', label: 'Rascunhos' },
];

const tabFilter: Record<Tab, (s: CampaignStatus) => boolean> = {
  agendadas: (s) => s === 'agendada' || s === 'enviando',
  historico: (s) => s === 'enviada' || s === 'erro' || s === 'cancelada',
  rascunhos: (s) => s === 'rascunho',
};

const emptyMessage: Record<Tab, string> = {
  agendadas: 'Nenhuma campanha agendada. Crie a primeira em "Nova campanha".',
  historico: 'Nada enviado ainda. O que sair vai aparecer aqui.',
  rascunhos: 'Sem rascunhos salvos.',
};

export function CampaignsClient({ initial }: { initial: Campaign[] }) {
  const [tab, setTab] = useState<Tab>('agendadas');

  const stats = useMemo(() => {
    const upcoming = initial
      .filter((c) => (c.status === 'agendada' || c.status === 'enviando') && c.enviar_em)
      .map((c) => c.enviar_em as string)
      .sort();
    return {
      proximo: upcoming.length ? formatWhen(upcoming[0]) : '—',
      agendadas: initial.filter((c) => c.status === 'agendada').length,
      enviadas: initial.filter((c) => c.status === 'enviada').length,
      rascunhos: initial.filter((c) => c.status === 'rascunho').length,
    };
  }, [initial]);

  const rows = useMemo(
    () => initial.filter((c) => tabFilter[tab](c.status)),
    [initial, tab],
  );

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em]">Campanhas</h1>
          <p className="mt-1.5 text-sm text-muted">
            Crie disparos pontuais para os grupos e acompanhe o que já saiu.
          </p>
        </div>
        <Link
          href="/campanhas/nova"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue px-[18px] py-3 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(1,71,255,.35)] transition-colors hover:bg-[#0a54ff]"
        >
          ＋ Nova campanha
        </Link>
      </div>

      <div className="mb-[26px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Stat label="Próximo disparo" value={stats.proximo} accent />
        <Stat label="Agendadas" value={String(stats.agendadas)} />
        <Stat label="Enviadas" value={String(stats.enviadas)} />
        <Stat label="Rascunhos" value={String(stats.rascunhos)} />
      </div>

      <div className="mb-3.5 flex gap-1.5 border-b border-border">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                active ? 'border-blue text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl2 border border-border bg-surface">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-muted">{emptyMessage[tab]}</div>
        ) : (
          <>
            <div className="grid grid-cols-[2.4fr_1.3fr_1.1fr_0.9fr] gap-3 bg-surface2 px-[18px] py-[11px] text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              <div>Campanha</div>
              <div>Quando</div>
              <div>Público</div>
              <div>Status</div>
            </div>
            {rows.map((c) => (
              <CampaignRow key={c.id} c={c} />
            ))}
          </>
        )}
      </div>

      <p className="mt-3.5 text-xs text-muted">
        As campanhas são despachadas pelo motor n8n nos horários agendados.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl2 border p-[18px] ${
        accent
          ? 'border-blue2/40 bg-gradient-to-b from-blue/15 to-blue/5'
          : 'border-border bg-surface'
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-2 font-display text-[26px] font-semibold leading-tight">{value}</div>
    </div>
  );
}
