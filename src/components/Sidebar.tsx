'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const items = [
  { href: '/campanhas', label: 'Campanhas', icon: '📣' },
  { href: '/sequencias', label: 'Sequências', icon: '🔁' },
  { href: '/recorrencias', label: 'Recorrentes', icon: '🔄' },
  { href: '/conexoes', label: 'Conexões', icon: '📱' },
  { href: '/grupos', label: 'Grupos', icon: '👥' },
  { href: '/publicos', label: 'Públicos', icon: '⭐' },
];

export function Sidebar() {
  const path = usePathname() ?? '';

  return (
    <aside className="flex min-h-screen w-60 shrink-0 flex-col gap-7 border-r border-border bg-gradient-to-b from-[#080C18] to-[#05080F] p-4">
      <Logo />

      <nav className="flex flex-col gap-1">
        {items.map((it) => {
          const active = path === it.href || path.startsWith(`${it.href}/`);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-[11px] rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue/15 text-ink'
                  : 'text-muted hover:bg-white/5 hover:text-ink'
              }`}
            >
              <span className={`text-base leading-none ${active ? 'opacity-100' : 'opacity-85'}`} aria-hidden="true">
                {it.icon}
              </span>
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-border bg-surface p-3 text-xs leading-relaxed text-muted">
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green shadow-[0_0_8px_var(--color-green)]" />
        Motor n8n + Z-API
        <br />
        Disparo em grupos de WhatsApp
      </div>
    </aside>
  );
}
