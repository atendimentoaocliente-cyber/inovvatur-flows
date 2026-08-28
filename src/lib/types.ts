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

export interface SequenceStep {
  id: string;
  ordem: number;
  dia_offset: number;            // 0 = dia da aula, -1 = 1 dia antes, -2 = 2 dias antes
  hora_tipo: 'fixo' | 'relativo';
  hora_fixa: string | null;      // 'HH:MM' quando fixo
  offset_min: number | null;     // minutos vs. hora da aula quando relativo
  mensagem: string;
  tipo: CampaignType;
  midia_url: string | null;
  mencionar_todos: boolean;
}

export interface Sequence {
  id: string;
  nome: string;
  categoria: CategoriaKey;
  steps: SequenceStep[];
  criado_em: string;
  atualizado_em: string;
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
  /** Preenchido quando a campanha foi materializada por uma recorrência semanal. */
  recorrencia_id?: string | null;
  resultado: CampaignResult | null;
  enviado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Recorrencia {
  id: string;
  nome: string;
  categoria: CategoriaKey;
  dia_semana: number;            // 0 = domingo … 6 = sábado (Date#getDay())
  hora: string;                  // 'HH:MM' no relógio de São Paulo
  tipo: CampaignType;
  mensagem: string;
  midia_url: string | null;
  mencionar_todos: boolean;
  audience_id: string | null;
  group_ids: string[] | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}
