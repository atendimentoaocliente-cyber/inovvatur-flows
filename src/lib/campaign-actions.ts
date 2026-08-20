import type { CampaignStatus } from './types';

// Per-row actions available on the campaigns panel, keyed by status. Pure logic so
// it can be unit-tested and reused. Order here is the order shown in the row.
// `enviando` returns [] on purpose — the API blocks changes mid-send.
export type CampaignAction = 'reenviar' | 'editar' | 'cancelar' | 'excluir';

const byStatus: Record<CampaignStatus, CampaignAction[]> = {
  agendada: ['editar', 'cancelar', 'excluir'],
  rascunho: ['editar', 'excluir'],
  erro: ['reenviar', 'editar', 'excluir'],
  cancelada: ['reenviar', 'excluir'],
  enviada: ['excluir'],
  enviando: [],
};

export function campaignActions(status: CampaignStatus): CampaignAction[] {
  return byStatus[status] ?? [];
}
