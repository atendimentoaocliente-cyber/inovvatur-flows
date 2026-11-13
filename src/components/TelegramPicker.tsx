'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { podePublicar, type TelegramChat } from '@/lib/telegram/tipos';
import { Field, inputCls } from './ui';

/** Os chats do Telegram que a campanha pode atingir: marca um por um, sem "todos". */
export function TelegramPicker({
  chats,
  selectedIds,
  onToggle,
  error,
}: {
  chats: TelegramChat[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  error?: string;
}) {
  const [busca, setBusca] = useState('');
  // Só aparece o que está ligado no painel; quem o bot não alcança aparece apagado,
  // para a pessoa entender por que não consegue marcar.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return chats
      .filter((c) => c.ativo)
      .filter((c) => !q || c.titulo.toLowerCase().includes(q) || (c.username ?? '').toLowerCase().includes(q));
  }, [chats, busca]);

  return (
    <Field label="Telegram" hint="· grupos e canais onde o bot está" error={error}>
      {chats.length > 6 && (
        <input
          aria-label="Buscar grupo ou canal do Telegram"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Buscar grupo ou canal…"
          className={`${inputCls} mb-3 py-2.5`}
        />
      )}
      <div className="max-h-72 overflow-auto rounded-xl border border-border">
        {visiveis.length === 0 ? (
          <div className="px-3.5 py-6 text-sm text-muted">
            {chats.length === 0 ? (
              <>
                O bot ainda não está em nenhum grupo.{' '}
                <Link href="/telegram" className="text-blue2 hover:underline">
                  Adicione o bot em Telegram
                </Link>
                .
              </>
            ) : (
              <>Nenhum grupo ou canal encontrado.</>
            )}
          </div>
        ) : (
          visiveis.map((c) => {
            const pode = podePublicar(c);
            const marcado = selectedIds.includes(c.id);
            const Wrapper = pode ? 'label' : 'div';
            return (
              <Wrapper
                key={c.id}
                className={`flex items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0 ${
                  pode ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-not-allowed opacity-60'
                }`}
              >
                {pode && (
                  <input type="checkbox" checked={marcado} onChange={() => onToggle(c.id)} className="sr-only" />
                )}
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs text-white transition-colors ${
                    marcado ? 'border-blue bg-blue' : 'border-[#33405f]'
                  }`}
                  aria-hidden="true"
                >
                  {marcado ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${pode ? '' : 'text-muted'}`}>{c.titulo}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {c.tipo === 'channel' ? 'Canal' : 'Grupo'}
                    {c.membros != null ? ` · ${c.membros} membros` : ''}
                  </span>
                </span>
                <span
                  className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                    pode ? 'border-green/30 text-green' : 'border-border text-muted'
                  }`}
                >
                  {pode ? 'pronto' : c.bot_status === 'left' || c.bot_status === 'kicked' ? 'bot fora' : 'sem permissão'}
                </span>
              </Wrapper>
            );
          })
        )}
      </div>
      <div className="mt-2.5 text-[13px] text-muted">
        {selectedIds.length ? (
          <>
            <b className="text-ink">{selectedIds.length}</b>{' '}
            {selectedIds.length === 1 ? 'chat do Telegram selecionado' : 'chats do Telegram selecionados'}
          </>
        ) : (
          <>Nenhum chat do Telegram marcado</>
        )}
      </div>
    </Field>
  );
}
