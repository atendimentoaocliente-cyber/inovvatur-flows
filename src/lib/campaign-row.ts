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
  /** Chats do Telegram (ids de `telegram_chats`). Nulo = nenhum. */
  telegram_chat_ids?: string[] | null;
  /** Conexão por onde sai. A do bot do Telegram = campanha só de Telegram. */
  connection_id?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lista de chats do Telegram vinda do cliente: só ids válidos, sem repetição.
 * `undefined` = o campo não veio (não mexer); `null` = veio vazio (nenhum chat).
 * `false` = veio em formato errado.
 */
export function lerTelegramChatIds(v: unknown): string[] | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && UUID.test(x))) return false;
  const unicos = [...new Set(v as string[])];
  return unicos.length ? unicos : null;
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

/**
 * Quem vai receber esta campanha, em texto.
 *
 * Existe porque a coluna "Público" do painel era uma string fixa: escrevia "Todos ·
 * grupos ativos" para TODA campanha, sem olhar o destino. Uma campanha para 3 grupos
 * aparecia idêntica a uma para 15 — e a diferença só se descobria depois do envio.
 *
 * A precedência é a mesma que o dispatcher usa de verdade, senão a tela volta a mentir:
 *   1. grupos escolhidos na campanha;
 *   2. público salvo;
 *   3. nada disso = todos os grupos ativos.
 */
export function descreverPublico(
  c: {
    audience_id: string | null;
    group_ids: string[] | null;
    connection_id?: string | null;
    telegram_chat_ids?: string[] | null;
    telegram_resultado?: { total: number; enviados: number } | null;
  },
  audiences: { id: string; nome: string; tipo: string; group_ids: string[] | null }[],
  totalAtivos: number,
  conexaoTelegram: string | null = null,
): { titulo: string; detalhe: string } {
  const tg = c.telegram_chat_ids?.length ?? 0;
  const chats = (n: number) => `${n} chat${n === 1 ? '' : 's'} do Telegram`;
  // Depois do envio, o que importa é quantos receberam — não quantos estavam marcados.
  const resumoTg = c.telegram_resultado
    ? `Telegram: ${c.telegram_resultado.enviados}/${c.telegram_resultado.total}`
    : `+ ${chats(tg)}`;

  // Só de Telegram (sai pela conexão do bot): dizer "Todos" aqui seria a mentira de
  // volta, e a pior delas — parece que vai para todos os grupos do WhatsApp.
  if (conexaoTelegram && c.connection_id === conexaoTelegram) {
    return {
      titulo: chats(tg),
      detalhe: c.telegram_resultado ? resumoTg : 'só Telegram',
    };
  }

  const whats = publicoDoWhatsApp(c, audiences, totalAtivos);
  return tg ? { titulo: whats.titulo, detalhe: `${whats.detalhe} · ${resumoTg}` } : whats;
}

function publicoDoWhatsApp(
  c: { audience_id: string | null; group_ids: string[] | null },
  audiences: { id: string; nome: string; tipo: string; group_ids: string[] | null }[],
  totalAtivos: number,
): { titulo: string; detalhe: string } {
  const plural = (n: number) => `${n} grupo${n === 1 ? '' : 's'}`;

  if (c.group_ids && c.group_ids.length) {
    return { titulo: plural(c.group_ids.length), detalhe: 'escolhidos na campanha' };
  }

  if (c.audience_id) {
    const a = audiences.find((x) => x.id === c.audience_id);
    // Público apagado depois de a campanha ser agendada: o dispatcher trata como
    // "sem público" e manda para todos. Dizer isso é melhor que mostrar um nome vazio.
    if (!a) return { titulo: 'Público removido', detalhe: `cai para todos os ${totalAtivos}` };
    const n = a.tipo === 'manual' ? (a.group_ids?.length ?? 0) : totalAtivos;
    return { titulo: a.nome, detalhe: plural(n) };
  }

  return { titulo: 'Todos', detalhe: `${plural(totalAtivos)} ativos` };
}
