'use client';

import { useState } from 'react';
import type { Group } from '@/lib/types';

const inputCls =
  'w-full rounded-xl border border-border bg-surface2 px-3 py-3 text-sm text-ink outline-none placeholder:text-muted focus:border-blue2';

export function GroupsClient({ initial }: { initial: Group[] }) {
  const [groups, setGroups] = useState(initial);
  const [groupId, setGroupId] = useState('');
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId, nome }),
      });
      if (res.ok) {
        const g = (await res.json()) as Group;
        setGroups([g, ...groups]);
        setGroupId('');
        setNome('');
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Não foi possível salvar o grupo.');
      }
    } catch {
      setError('Sem conexão com o servidor. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em]">Grupos</h1>
        <p className="mt-1.5 text-sm text-muted">
          Cadastre cada grupo uma vez — cole o ID do WhatsApp para reutilizá-lo nas campanhas.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl2 border border-border bg-surface p-5">
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            ID do grupo (Z-API)
          </span>
          <input
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            placeholder="120363…-group"
            className={inputCls}
          />
        </label>
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Nome amigável
          </span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Clientes Turma 12"
            className={inputCls}
          />
        </label>
        <button
          onClick={add}
          disabled={saving || !groupId.trim() || !nome.trim()}
          className="rounded-xl bg-blue px-5 py-3 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(1,71,255,.35)] transition-colors hover:bg-[#0a54ff] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {saving ? 'Salvando…' : '＋ Adicionar'}
        </button>

        {error && (
          <p className="w-full text-sm text-[#ffb183]" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl2 border border-border bg-surface">
        {groups.length === 0 ? (
          <div className="p-6 text-sm text-muted">
            Nenhum grupo cadastrado ainda. Adicione o primeiro acima.
          </div>
        ) : (
          groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 border-t border-border px-4 py-3.5 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{g.nome}</div>
                <div className="mt-0.5 truncate font-mono text-xs text-muted">{g.group_id}</div>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  g.ativo ? 'border-green/30 text-green' : 'border-border text-muted'
                }`}
              >
                {g.ativo ? 'ativo' : 'inativo'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
