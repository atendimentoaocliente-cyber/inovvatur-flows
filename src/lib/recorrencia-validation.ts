import { isCategoria, type CategoriaKey } from './categories';
import type { ValidationError } from './validation';
import type { CampaignType } from './types';
import { lerTelegramChatIds } from './campaign-row';

const TIPOS: CampaignType[] = ['texto', 'imagem', 'video', 'pdf'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface RecorrenciaInput {
  nome: string;
  categoria: CategoriaKey;
  dia_semana: number;
  hora: string;
  tipo: CampaignType;
  mensagem: string;
  midia_url: string | null;
  mencionar_todos: boolean;
  audience_id: string | null;
  group_ids: string[] | null;
  telegram_chat_ids?: string[] | null;
  ativo: boolean;
}

/**
 * Normaliza o corpo cru vindo do form/HTTP num molde de recorrência.
 * Devolve os erros de validação junto — o chamador responde 400 se houver algum.
 */
export function parseRecorrencia(body: Record<string, unknown>): {
  value: RecorrenciaInput;
  errors: ValidationError[];
  /** "Só Telegram" veio no corpo? undefined = não veio (não mexer na conexão). */
  semWhatsApp: boolean | undefined;
} {
  const errors: ValidationError[] = [];

  const nome = String(body.nome ?? '').trim();
  if (!nome) errors.push({ field: 'nome', message: 'Dê um nome à recorrência.' });

  const diaSemana = Number(body.dia_semana);
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    errors.push({ field: 'dia_semana', message: 'Escolha o dia da semana.' });
  }

  const hora = String(body.hora ?? '').trim();
  if (!HHMM.test(hora)) errors.push({ field: 'hora', message: 'Hora inválida (HH:MM).' });

  const tipo = body.tipo as CampaignType;
  if (!TIPOS.includes(tipo)) errors.push({ field: 'tipo', message: 'Tipo inválido.' });

  const mensagem = String(body.mensagem ?? '').trim();
  if (!mensagem) errors.push({ field: 'mensagem', message: 'Escreva a mensagem.' });

  const midiaUrl = typeof body.midia_url === 'string' && body.midia_url ? body.midia_url : null;
  if (TIPOS.includes(tipo) && tipo !== 'texto' && !midiaUrl) {
    errors.push({ field: 'midia_url', message: 'Envie a mídia para este tipo de campanha.' });
  }

  const groupIds =
    Array.isArray(body.group_ids) && body.group_ids.length ? (body.group_ids as string[]) : null;

  const telegramIds = lerTelegramChatIds(body.telegram_chat_ids);
  if (telegramIds === false) {
    errors.push({ field: 'telegram', message: 'Lista de chats do Telegram inválida.' });
  }
  const semWhatsApp = typeof body.sem_whatsapp === 'boolean' ? body.sem_whatsapp : undefined;
  if (semWhatsApp && !(telegramIds && telegramIds.length)) {
    errors.push({ field: 'telegram', message: 'Sem WhatsApp, escolha pelo menos um grupo ou canal do Telegram.' });
  }

  return {
    value: {
      nome,
      categoria: isCategoria(body.categoria) ? body.categoria : 'p360',
      dia_semana: Number.isInteger(diaSemana) ? diaSemana : 1,
      hora,
      tipo: TIPOS.includes(tipo) ? tipo : 'texto',
      mensagem,
      midia_url: midiaUrl,
      mencionar_todos: Boolean(body.mencionar_todos),
      audience_id: typeof body.audience_id === 'string' ? body.audience_id : null,
      group_ids: groupIds,
      // Só quando veio (ou já existia no molde): banco sem a 0009 não tem a coluna.
      ...(telegramIds !== undefined && telegramIds !== false ? { telegram_chat_ids: telegramIds } : {}),
      ativo: body.ativo === undefined ? true : Boolean(body.ativo),
    },
    errors,
    semWhatsApp,
  };
}
