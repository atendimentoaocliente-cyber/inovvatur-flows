import type { Campaign, CampaignStatus, CampaignType } from '@/lib/types';
import { StatusChip } from './StatusChip';
import { formatWhen } from '@/lib/format';

const typeIcon: Record<CampaignType, string> = {
  texto: '💬',
  imagem: '🖼️',
  video: '🎬',
  pdf: '📄',
};

const typeLabel: Record<CampaignType, string> = {
  texto: 'Só texto',
  imagem: 'Imagem + texto',
  video: 'Vídeo + legenda',
  pdf: 'PDF + texto',
};

// Small muted line under the date, derived from status (no live "relative time"
// so server and client render identically — avoids hydration drift).
const whenHint: Record<CampaignStatus, string> = {
  rascunho: 'não agendada',
  agendada: 'agendada',
  enviando: 'em andamento',
  enviada: 'concluída',
  cancelada: 'cancelada',
  erro: 'falhou',
};

export function CampaignRow({ c }: { c: Campaign }) {
  const detail =
    c.status === 'enviando' && c.resultado
      ? `${c.resultado.enviados}/${c.resultado.total}`
      : undefined;

  const meta = typeLabel[c.tipo] + (c.mencionar_todos ? ' · menção a todos' : '');

  return (
    <div className="grid grid-cols-[2.4fr_1.3fr_1.1fr_0.9fr] items-center gap-3 border-t border-border px-[18px] py-[15px] first:border-t-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border border-border bg-surface2 text-base">
          {typeIcon[c.tipo]}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{c.nome}</div>
          <div className="mt-0.5 truncate text-xs text-muted">{meta}</div>
        </div>
      </div>

      <div className="text-sm">
        {formatWhen(c.enviar_em)}
        <span className="mt-0.5 block text-xs text-muted">{whenHint[c.status]}</span>
      </div>

      <div className="text-sm text-ink">
        Todos <span className="text-xs text-muted">· grupos ativos</span>
      </div>

      <div>
        <StatusChip status={c.status} detail={detail} />
      </div>
    </div>
  );
}
