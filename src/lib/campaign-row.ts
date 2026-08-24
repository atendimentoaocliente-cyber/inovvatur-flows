import type { CampaignDraft } from './validation';
import type { CampaignStatus, CampaignType } from './types';
import { isCategoria, type CategoriaKey } from './categories';

export interface CampaignRow {
  nome: string;
  tipo: CampaignType;
  categoria: CategoriaKey;
  mensagem: string;
  midia_url: string | null;
  mencionar_todos: boolean;
  audience_id: string | null;
  group_ids: string[] | null;
  enviar_em: string | null;
  status: CampaignStatus;
}

export function buildCampaignRow(
  draft: CampaignDraft,
  audienceId: string | null,
  groupIds: string[] | null,
  now: Date,
  opts: { asDraft: boolean },
): CampaignRow {
  const enviar_em = draft.agendar ? draft.enviar_em : now.toISOString();
  const status: CampaignStatus = opts.asDraft ? 'rascunho' : 'agendada';
  return {
    nome: String(draft.nome ?? '').trim(),
    tipo: draft.tipo,
    categoria: isCategoria(draft.categoria) ? draft.categoria : 'avulsas',
    mensagem: String(draft.mensagem ?? '').trim(),
    midia_url: draft.midia_url ?? null,
    mencionar_todos: Boolean(draft.mencionar_todos),
    audience_id: audienceId,
    group_ids: groupIds && groupIds.length ? groupIds : null,
    enviar_em,
    status,
  };
}
