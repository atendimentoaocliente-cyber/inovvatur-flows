import type { CategoriaKey } from './categories';

export type CampaignType = 'texto' | 'imagem' | 'video' | 'pdf';
export type CampaignStatus =
  | 'rascunho' | 'agendada' | 'enviando' | 'enviada' | 'cancelada' | 'erro';

export interface Group {
  id: string;
  group_id: string;
  nome: string;
  ativo: boolean;
  criado_em: string;
}

export interface Audience {
  id: string;
  nome: string;
  tipo: 'todos' | 'manual';
  group_ids: string[] | null;
  criado_em: string;
}

export interface CampaignResult {
  total: number;
  enviados: number;
  falhas: number;
  erro?: string;
}

export interface Campaign {
  id: string;
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
  resultado: CampaignResult | null;
  enviado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}
