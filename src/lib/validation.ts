import type { CampaignType } from './types';

export interface CampaignDraft {
  nome: string;
  tipo: CampaignType;
  mensagem: string;
  midia_url: string | null;
  mencionar_todos: boolean;
  agendar: boolean;
  enviar_em: string | null;
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validateCampaign(d: CampaignDraft, now: Date): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!d.nome.trim()) errors.push({ field: 'nome', message: 'Dê um nome à campanha.' });
  if (!d.mensagem.trim()) errors.push({ field: 'mensagem', message: 'Escreva a mensagem.' });
  if (d.tipo !== 'texto' && !d.midia_url) {
    errors.push({ field: 'midia_url', message: 'Envie a mídia para este tipo de campanha.' });
  }
  if (d.agendar) {
    if (!d.enviar_em) {
      errors.push({ field: 'enviar_em', message: 'Escolha a data e hora.' });
    } else if (new Date(d.enviar_em).getTime() <= now.getTime()) {
      errors.push({ field: 'enviar_em', message: 'A data precisa ser no futuro.' });
    }
  }
  return errors;
}
