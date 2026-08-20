'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Campaign, CampaignStatus } from '@/lib/types';
import { CampaignRow, type ActionResult } from '@/components/CampaignRow';
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
  // Own the list so row actions can mutate it in place (update/remove) without a full reload.
  const [campaigns, setCampaigns] = useState<Campaign[]>(initial);
  const [actionError, setActionError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const upcoming = campaigns
      .filter((c) => (c.status === 'agendada' || c.status === 'enviando') && c.enviar_em)
      .map((c) => c.enviar_em as string)
      .sort();
    return {
      proximo: upcoming.length ? formatWhen(upcoming[0]) : '—',
      agendadas: campaigns.filter((c) => c.status === 'agendada').length,
      enviadas: campaigns.filter((c) => c.status === 'enviada').length,
      rascunhos: campaigns.filter((c) => c.status === 'rascunho').length,
    };
  }, [campaigns]);

  const rows = useMemo(
    () => campaigns.filter((c) => tabFilter[tab](c.status)),
    [campaigns, tab],
  );

  async function handleDelete(id: string): Promise<ActionResult> {
    setActionError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCampaigns((cs) => cs.filter((c) => c.id !== id));
        return { ok: true };
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const error = body.error ?? 'Não foi possível excluir a campanha.';
      setActionError(error);
      return { ok: false, error };
    } catch {
      const error = 'Sem conexão com o servidor. Tente de novo.';
      setActionError(error);
      return { ok: false, error };
    }
  }

  async function handleSetStatus(id: string, status: CampaignStatus): Promise<ActionResult> {
    setActionError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = (await res.json().catch(() => null)) as Campaign | null;
        setCampaigns((cs) =>
          cs.map((c) => (c.id === id ? { ...c, ...(updated ?? { status }) } : c)),
        );
        return { ok: true };
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const error = body.error ?? 'Não foi possível atualizar a campanha.';
      setActionError(error);
      return { ok: false, error };
    } catch {
      const error = 'Sem conexão com o servidor. Tente de novo.';
      setActionError(error);
      return { ok: false, error };
    }
  }

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

      {actionError && (
        <div
          role="alert"
          className="mb-3.5 flex items-start gap-2.5 rounded-xl border border-orange/30 bg-orange/[0.08] px-3.5 py-3 text-sm text-[#ffb183]"
        >
          <span aria-hidden="true">⚠️</span>
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Fechar aviso"
            className="shrink-0 text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl2 border border-border bg-surface">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-muted">{emptyMessage[tab]}</div>
        ) : (
          <>
            <div className="grid grid-cols-[2.4fr_1.3fr_1fr_0.85fr_1.15fr] gap-3 bg-surface2 px-[18px] py-[11px] text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              <div>Campanha</div>
              <div>Quando</div>
              <div>Público</div>
              <div>Status</div>
              <div className="text-right">Ações</div>
            </div>
            {rows.map((c) => (
              <CampaignRow
                key={c.id}
                c={c}
                onDelete={handleDelete}
                onCancel={(id) => handleSetStatus(id, 'cancelada')}
                onReenviar={(id) => handleSetStatus(id, 'agendada')}
              />
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
