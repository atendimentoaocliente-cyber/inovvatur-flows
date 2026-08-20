import type { CampaignDraft } from './validation';
import type { CampaignStatus, CampaignType } from './types';

export interface CampaignRow {
  nome: string;
  tipo: CampaignType;
  mensagem: string;
  midia_url: string | null;
  mencionar_todos: boolean;
  audience_id: string | null;
  enviar_em: string | null;
  status: CampaignStatus;
}

export function buildCampaignRow(
  draft: CampaignDraft,
  audienceId: string | null,
  now: Date,
  opts: { asDraft: boolean },
): CampaignRow {
  const enviar_em = draft.agendar ? draft.enviar_em : now.toISOString();
  const status: CampaignStatus = opts.asDraft ? 'rascunho' : 'agendada';
  return {
    nome: draft.nome.trim(),
    tipo: draft.tipo,
    mensagem: draft.mensagem.trim(),
    midia_url: draft.midia_url,
    mencionar_todos: draft.mencionar_todos,
    audience_id: audienceId,
    enviar_em,
    status,
  };
}
