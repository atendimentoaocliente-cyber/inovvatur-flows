'use client';

import { useCallback, useEffect, useState } from 'react';
import { podePublicar, type TelegramChat } from '@/lib/telegram/tipos';

interface EstadoBot {
  configurado: boolean;
  envio_ligado?: boolean;
  erro?: string;
  bot?: { username: string; nome: string };
  links?: { grupo: string; canal: string };
  webhook?: {
    conectado: boolean;
    url: string | null;
    esperado: string;
    pendentes: number;
    ultimo_erro: string | null;
  };
  url_estavel?: boolean;
}

const botaoPrimario =
  'rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(1,71,255,.35)] transition-colors hover:bg-[#0a54ff] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none';
const botaoSecundario =
  'rounded-xl border border-border bg-surface2 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-blue2 disabled:cursor-not-allowed disabled:opacity-50';

function rotuloStatus(c: TelegramChat): { texto: string; ok: boolean } {
  if (c.bot_status === 'left' || c.bot_status === 'kicked') return { texto: 'bot fora', ok: false };
  if (!c.pode_postar) {
    return { texto: c.tipo === 'channel' ? 'falta permissão de publicar' : 'sem permissão', ok: false };
  }
  if (!c.ativo) return { texto: 'desligado', ok: false };
  return { texto: c.bot_status === 'administrator' || c.bot_status === 'creator' ? 'admin' : 'membro', ok: true };
}

export function TelegramClient() {
  const [estado, setEstado] = useState<EstadoBot | null>(null);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [e, c] = await Promise.allSettled([fetch('/api/telegram'), fetch('/api/telegram/chats')]);
    if (e.status === 'fulfilled') setEstado((await e.value.json().catch(() => null)) as EstadoBot | null);
    if (c.status === 'fulfilled' && c.value.ok) {
      const corpo = await c.value.json().catch(() => null);
      setChats(Array.isArray(corpo?.chats) ? (corpo.chats as TelegramChat[]) : []);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (vivo) await carregar();
    })();
    return () => {
      vivo = false;
    };
  }, [carregar]);

  async function acao(nome: string, fn: () => Promise<Response>, sucesso: (corpo: Record<string, unknown>) => string) {
    setOcupado(nome);
    setErro(null);
    setAviso(null);
    try {
      const res = await fn();
      const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setErro(typeof corpo.error === 'string' ? corpo.error : 'Não deu certo. Tente de novo.');
      } else {
        setAviso(sucesso(corpo));
      }
      await carregar();
    } catch {
      setErro('Sem conexão com o servidor. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  async function alternar(c: TelegramChat) {
    setChats((lista) => lista.map((x) => (x.id === c.id ? { ...x, ativo: !c.ativo } : x)));
    const res = await fetch(`/api/telegram/chats/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !c.ativo }),
    }).catch(() => null);
    if (!res?.ok) {
      setChats((lista) => lista.map((x) => (x.id === c.id ? { ...x, ativo: c.ativo } : x)));
      setErro('Não foi possível alterar. Tente de novo.');
    }
  }

  async function remover(c: TelegramChat) {
    if (!confirm(`Tirar "${c.titulo}" do disparador? O bot continua no grupo até você removê-lo pelo Telegram.`)) return;
    const res = await fetch(`/api/telegram/chats/${c.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) setChats((lista) => lista.filter((x) => x.id !== c.id));
    else setErro('Não foi possível remover. Tente de novo.');
  }

  const prontos = chats.filter(podePublicar).length;

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em]">Telegram</h1>
        <p className="mt-1.5 text-sm text-muted">
          O bot entra nos grupos e canais por um link e aparece aqui sozinho. Depois é só marcar o
          Telegram na campanha.
        </p>
      </header>

      {carregando ? (
        <div className="rounded-xl2 border border-border bg-surface p-5 text-sm text-muted">Carregando…</div>
      ) : !estado?.configurado ? (
        <div className="rounded-xl2 border border-border bg-surface p-5 text-sm">
          <p className="font-semibold">O bot ainda não está configurado.</p>
          <p className="mt-1.5 text-muted">
            Crie o bot no @BotFather e coloque o token na variável <code className="font-mono">TELEGRAM_BOT_TOKEN</code>{' '}
            da hospedagem.
          </p>
        </div>
      ) : estado.erro ? (
        <div className="rounded-xl2 border border-border bg-surface p-5 text-sm text-[#ffb183]" role="alert">
          O Telegram não respondeu: {estado.erro}
        </div>
      ) : (
        <>
          <section className="mb-6 rounded-xl2 border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{estado.bot?.nome}</div>
                <div className="font-mono text-xs text-muted">@{estado.bot?.username}</div>
              </div>
              {estado.webhook?.conectado ? (
                <span className="rounded-full border border-green/30 px-2.5 py-1 text-xs text-green">
                  detectando grupos sozinho
                </span>
              ) : (
                <button
                  className={botaoPrimario}
                  disabled={ocupado !== null}
                  onClick={() =>
                    acao('webhook', () => fetch('/api/telegram', { method: 'POST' }), () => 'Pronto: o bot avisa aqui quando entrar num grupo.')
                  }
                >
                  {ocupado === 'webhook' ? 'Conectando…' : 'Ligar detecção de grupos'}
                </button>
              )}
            </div>

            {!estado.webhook?.conectado && (
              <p className="mt-3 text-xs text-muted">
                Sem isto, o bot entra nos grupos mas o disparador não fica sabendo.
                {estado.webhook?.url ? ` Hoje ele aponta para ${estado.webhook.url}.` : ''}
              </p>
            )}
            {estado.webhook?.ultimo_erro && (
              <p className="mt-2 text-xs text-[#ffb183]">Último erro do Telegram: {estado.webhook.ultimo_erro}</p>
            )}
            {estado.envio_ligado === false && (
              <p className="mt-2 text-xs text-[#ffb183]">
                O envio pelo Telegram está desligado (variável TELEGRAM_ENVIO).
              </p>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a href={estado.links?.grupo} target="_blank" rel="noreferrer" className={`${botaoSecundario} text-center`}>
                ＋ Adicionar a um grupo
              </a>
              <a href={estado.links?.canal} target="_blank" rel="noreferrer" className={`${botaoSecundario} text-center`}>
                ＋ Adicionar a um canal
              </a>
            </div>
            <p className="mt-2.5 text-xs text-muted">
              Abra no celular com o Telegram instalado, escolha o grupo ou canal e confirme. O bot entra como
              administrador, com as permissões certas.
            </p>
          </section>

          <section className="overflow-hidden rounded-xl2 border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="text-sm">
                <b>{prontos}</b> <span className="text-muted">de {chats.length} prontos para receber</span>
              </div>
              <button
                className={botaoSecundario}
                disabled={ocupado !== null || chats.length === 0}
                onClick={() =>
                  acao(
                    'atualizar',
                    () => fetch('/api/telegram/chats', { method: 'POST' }),
                    (c) => {
                      const erros = Array.isArray(c.erros) ? (c.erros as string[]) : [];
                      return erros.length
                        ? `Atualizado, com ${erros.length} aviso(s): ${erros.join(' · ')}`
                        : 'Atualizado com o que o Telegram informa agora.';
                    },
                  )
                }
              >
                {ocupado === 'atualizar' ? 'Atualizando…' : 'Atualizar'}
              </button>
            </div>

            {chats.length === 0 ? (
              <div className="p-6 text-sm text-muted">
                Nenhum grupo ainda. Use um dos botões acima para adicionar o bot.
              </div>
            ) : (
              chats.map((c) => {
                const st = rotuloStatus(c);
                return (
                  <div key={c.id} className="flex items-center gap-3 border-t border-border px-5 py-3.5 first:border-t-0">
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-medium ${c.ativo ? '' : 'text-muted'}`}>{c.titulo}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {c.tipo === 'channel' ? 'Canal' : 'Grupo'}
                        {c.username ? ` · @${c.username}` : ''}
                        {c.membros != null ? ` · ${c.membros} membros` : ''}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                        st.ok ? 'border-green/30 text-green' : 'border-border text-muted'
                      }`}
                    >
                      {st.texto}
                    </span>
                    <button
                      onClick={() => void alternar(c)}
                      className="shrink-0 text-xs text-muted transition-colors hover:text-ink"
                    >
                      {c.ativo ? 'Desligar' : 'Ligar'}
                    </button>
                    <button
                      onClick={() => void remover(c)}
                      className="shrink-0 text-xs text-muted transition-colors hover:text-[#ffb183]"
                    >
                      Remover
                    </button>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}

      {aviso && <p className="mt-4 text-sm text-green">{aviso}</p>}
      {erro && (
        <p className="mt-4 text-sm text-[#ffb183]" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
