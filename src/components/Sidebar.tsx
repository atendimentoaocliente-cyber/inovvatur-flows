'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from './Logo';

/**
 * Navegação agrupada por PROPÓSITO, não numa lista plana.
 *
 * Eram sete itens no mesmo nível, e a ordem não dizia nada: "Celular" ficava no meio
 * de coisas de disparo, e "Conexões" parecia mais um destino do dia a dia do que a
 * configuração que é. Agrupar separa as três perguntas que se faz ao abrir o sistema:
 * o que está acontecendo nas conversas, o que vai sair, e o que está cadastrado.
 */
const grupos: { titulo: string | null; itens: { href: string; label: string; icon: string }[] }[] = [
  {
    titulo: 'Conversas',
    itens: [{ href: '/celular', label: 'Celular', icon: '💬' }],
  },
  {
    titulo: 'Disparo',
    itens: [
      { href: '/campanhas', label: 'Campanhas', icon: '📣' },
      { href: '/sequencias', label: 'Sequências', icon: '🔁' },
      { href: '/recorrencias', label: 'Recorrentes', icon: '🔄' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { href: '/grupos', label: 'Grupos', icon: '👥' },
      { href: '/publicos', label: 'Públicos', icon: '⭐' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [{ href: '/conexoes', label: 'Conexões', icon: '🔌' }],
  },
];

interface ResumoConexoes {
  conectadas: number;
  total: number;
}

export function Sidebar() {
  const path = usePathname() ?? '';
  const [menuAberto, setMenuAberto] = useState(false);
  const [conexoes, setConexoes] = useState<ResumoConexoes | null>(null);

  // O rodapé mostra o estado real dos números. Antes havia ali um selo fixo dizendo
  // "Motor n8n + Z-API" — decorativo, e que continuaria verde com tudo desconectado.
  useEffect(() => {
    let ativo = true;
    fetch('/api/connections')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!ativo || !body?.conexoes) return;
        const lista = body.conexoes as { status: string }[];
        setConexoes({
          conectadas: lista.filter((c) => c.status === 'conectada').length,
          total: lista.length,
        });
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [path]);

  return (
    <>
      {/* No celular a barra fixa de 240px deixava ~150px de conteúdo: o título quebrava
          no meio e o formulário ficava ilegível. Abaixo de md ela vira uma gaveta. */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setMenuAberto((v) => !v)}
          aria-expanded={menuAberto}
          aria-controls="menu-principal"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-ink transition-colors hover:bg-blue/10"
        >
          <span className="sr-only">{menuAberto ? 'Fechar menu' : 'Abrir menu'}</span>
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            {menuAberto ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <Logo />
      </header>

      {menuAberto && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMenuAberto(false)}
          className="fixed inset-0 z-40 bg-bg/70 md:hidden"
        />
      )}

      <aside
        id="menu-principal"
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-gradient-to-b from-[#080C18] to-[#05080F] p-4 transition-transform duration-200 ease-out md:static md:min-h-screen md:translate-x-0 ${
          menuAberto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Logo />

        <nav className="flex flex-col gap-5">
          {grupos.map((grupo, i) => (
            <div key={grupo.titulo ?? `g${i}`} className="flex flex-col gap-1">
              {grupo.titulo && (
                <h2 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70">
                  {grupo.titulo}
                </h2>
              )}
              {grupo.itens.map((it) => {
                const active = path === it.href || path.startsWith(`${it.href}/`);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={active ? 'page' : undefined}
                    // No celular a gaveta cobre a tela: escolher um destino fecha ela.
                    onClick={() => setMenuAberto(false)}
                    className={`flex items-center gap-[11px] rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? 'bg-blue/15 text-ink' : 'text-muted hover:bg-white/5 hover:text-ink'
                    }`}
                  >
                    <span
                      className={`text-base leading-none ${active ? 'opacity-100' : 'opacity-85'}`}
                      aria-hidden="true"
                    >
                      {it.icon}
                    </span>
                    {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <Link
          href="/conexoes"
          className="mt-auto rounded-xl border border-border bg-surface p-3 text-xs leading-relaxed text-muted transition-colors hover:border-blue2"
        >
          <EstadoConexoes resumo={conexoes} />
        </Link>
      </aside>
    </>
  );
}

function EstadoConexoes({ resumo }: { resumo: ResumoConexoes | null }) {
  if (!resumo) return <span className="text-muted">Verificando conexões…</span>;

  if (resumo.total === 0) {
    return (
      <>
        <Ponto cor="bg-orange" />
        Nenhum número conectado
        <br />
        <span className="text-muted/80">Disparo pelo n8n + Z-API</span>
      </>
    );
  }

  const tudoOk = resumo.conectadas === resumo.total;
  return (
    <>
      <Ponto cor={resumo.conectadas === 0 ? 'bg-orange' : tudoOk ? 'bg-green' : 'bg-blue2'} />
      {resumo.conectadas} de {resumo.total} número{resumo.total > 1 ? 's' : ''} conectado
      {resumo.conectadas === 1 && resumo.total === 1 ? '' : 's'}
      <br />
      <span className="text-muted/80">Evolution · em teste, ao lado do n8n</span>
    </>
  );
}

function Ponto({ cor }: { cor: string }) {
  return (
    <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${cor} shadow-[0_0_8px_currentColor]`} />
  );
}
