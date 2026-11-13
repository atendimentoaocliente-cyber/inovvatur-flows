// O motor de envio do Telegram.
//
// Mesmo desenho do motor do WhatsApp: o estado inteiro mora no banco (a fila
// `telegram_envios`, uma linha por campanha × chat) e o motor é um tick curto e
// idempotente. Pode rodar de minuto em minuto, duas vezes ao mesmo tempo ou depois
// de horas parado, que ninguém recebe a mesma mensagem duas vezes.
//
// A diferença de fundo para o WhatsApp é QUEM MANDA NA CAMPANHA:
//   · campanha só de Telegram (sai pela conexão do bot): este motor promove,
//     envia e fecha o status;
//   · campanha que também vai para o WhatsApp: o status é de quem envia o WhatsApp
//     (n8n ou motor da Evolution). Aqui só se cuida da fila do Telegram e do
//     `telegram_resultado` — escrever em `status` criaria dois donos para o mesmo
//     campo.
//
// O que o Telegram pede e o motor respeita:
//   · pausa entre envios (a Bot API aceita até 20 mensagens por minuto num mesmo
//     grupo e ~30 por segundo no total; 1s entre chats fica longe dos dois);
//   · 429 com `retry_after`: a linha espera exatamente o que o Telegram pediu;
//   · grupo que virou supergrupo: o id muda e o envio é refeito no id novo.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampaignType } from '../types';
import { chamar, ErroTelegram } from '../telegram/api';
import { montarEnvios } from '../telegram/mensagem';
import { dormir, Orcamento } from './ritmo';

/** Tentativas antes de desistir de um chat. */
const MAX_TENTATIVAS = 3;
/** Linha presa em 'enviando' há mais que isso volta para a fila. */
const MINUTOS_ATE_ORFA = 15;
/** Pausa entre um chat e o próximo. */
const PAUSA_MS = 1_000;
/** Custo estimado de publicar num chat (mídia pode levar alguns segundos). */
const CUSTO_ENVIO_MS = 8_000;

export interface ResultadoTelegram {
  filas: number;
  enviadas: number;
  falhas: number;
  pendentes: number;
  fechadas: number;
  avisos: string[];
}

let conexaoTelegramCache: string | null = null;

/** A linha de `connections` que representa o bot (migration 0026). */
export async function idDaConexaoTelegram(supabase: SupabaseClient): Promise<string | null> {
  if (conexaoTelegramCache) return conexaoTelegramCache;
  const { data } = await supabase
    .from('connections')
    .select('id')
    .eq('provider', 'telegram')
    .limit(1)
    .maybeSingle();
  conexaoTelegramCache = (data as { id: string } | null)?.id ?? null;
  return conexaoTelegramCache;
}

/** Só para os testes: o cache sobreviveria de um teste para o outro. */
export function esquecerConexaoTelegram(): void {
  conexaoTelegramCache = null;
}

interface ChatDaFila {
  id: string;
  titulo: string;
  ativo: boolean;
  bot_status: string;
}

const BOT_DENTRO = ['creator', 'administrator', 'member', 'restricted'];

// ── 1. Campanha vencida com Telegram vira fila ───────────────────────────────────

/**
 * Monta a fila do Telegram das campanhas cuja hora chegou.
 *
 * A corrida é por `telegram_fila_em`: só quem a preenche (update com guarda `is null`)
 * monta a fila. Status aceitos incluem 'enviando', 'enviada' e 'erro' porque, numa
 * campanha que também vai para o WhatsApp, o n8n pode já ter mexido no status antes
 * de este tick passar — e o Telegram não deixa de sair por isso.
 */
export async function montarFilas(
  supabase: SupabaseClient,
  agora: Date,
  conexaoTelegram: string | null,
  avisos: string[],
): Promise<number> {
  const { data: vencidas } = await supabase
    .from('campaigns')
    .select('id,nome,status,connection_id,telegram_chat_ids')
    .not('telegram_chat_ids', 'is', null)
    .is('telegram_fila_em', null)
    .lte('enviar_em', agora.toISOString())
    .in('status', ['agendada', 'enviando', 'enviada', 'erro'])
    .limit(50);
  if (!vencidas?.length) return 0;

  let montadas = 0;
  for (const c of vencidas as {
    id: string;
    nome: string;
    status: string;
    connection_id: string | null;
    telegram_chat_ids: string[] | null;
  }[]) {
    const { data: ganhou } = await supabase
      .from('campaigns')
      .update({ telegram_fila_em: agora.toISOString() })
      .eq('id', c.id)
      .is('telegram_fila_em', null)
      .select('id');
    if (!ganhou?.length) continue;

    const ids = [...new Set(c.telegram_chat_ids ?? [])];
    const { data: chats } = ids.length
      ? await supabase.from('telegram_chats').select('id,titulo,ativo,bot_status').in('id', ids)
      : { data: [] };
    const porId = new Map(((chats ?? []) as ChatDaFila[]).map((x) => [x.id, x]));

    // Chat que saiu do ar entre o agendamento e o envio entra na fila como falha, e
    // não some: o resultado precisa dizer "3 de 4" e por quê.
    const linhas = ids.map((id) => {
      const chat = porId.get(id);
      const pronto = chat && chat.ativo && BOT_DENTRO.includes(chat.bot_status);
      return {
        campaign_id: c.id,
        chat_ref: chat ? id : null,
        chat_titulo: chat?.titulo ?? 'Chat removido',
        ...(pronto
          ? {}
          : {
              status: 'falha',
              erro: !chat
                ? 'O chat foi removido do disparador.'
                : !chat.ativo
                  ? 'O chat está desativado no disparador.'
                  : 'O bot não está mais neste chat.',
            }),
      };
    });

    if (linhas.length) {
      // chat_ref nulo não colide no índice único — só existe se o chat sumiu.
      const { error } = await supabase
        .from('telegram_envios')
        .upsert(linhas, { onConflict: 'campaign_id,chat_ref', ignoreDuplicates: true });
      if (error) {
        // Devolve a corrida: o próximo tick tenta de novo, em vez de a campanha
        // ficar marcada como "fila montada" sem fila nenhuma.
        await supabase.from('campaigns').update({ telegram_fila_em: null }).eq('id', c.id);
        avisos.push(`[${c.nome}] não montou a fila do Telegram: ${error.message}`);
        continue;
      }
    }

    // Só de Telegram: o status é deste motor.
    if (conexaoTelegram && c.connection_id === conexaoTelegram && c.status === 'agendada') {
      await supabase
        .from('campaigns')
        .update({ status: 'enviando' })
        .eq('id', c.id)
        .eq('status', 'agendada');
    }
    montadas += 1;
  }
  return montadas;
}

// ── 2. Linha travada volta para a fila ───────────────────────────────────────────

export async function recuperarOrfas(supabase: SupabaseClient, agora: Date): Promise<void> {
  const corte = new Date(agora.getTime() - MINUTOS_ATE_ORFA * 60_000).toISOString();
  await supabase
    .from('telegram_envios')
    .update({ status: 'pendente' })
    .eq('status', 'enviando')
    .lt('atualizado_em', corte)
    .lt('tentativas', MAX_TENTATIVAS);
  await supabase
    .from('telegram_envios')
    .update({ status: 'falha', erro: 'Envio não concluído após várias tentativas.' })
    .eq('status', 'enviando')
    .lt('atualizado_em', corte)
    .gte('tentativas', MAX_TENTATIVAS);
}

// ── 3. Envio ─────────────────────────────────────────────────────────────────────

interface LinhaDaFila {
  id: string;
  tentativas: number;
  message_ids: number[] | null;
  chat_ref: string | null;
  telegram_chats: { id: string; chat_id: number; ativo: boolean } | null;
  campaigns: { nome: string; tipo: CampaignType; mensagem: string; midia_url: string | null } | null;
}

/** Publica um chat. Devolve os ids das mensagens já enviadas, inclusive em falha parcial. */
async function publicar(
  chatId: number,
  linha: LinhaDaFila,
): Promise<{ ids: number[]; erro: ErroTelegram | null }> {
  const c = linha.campaigns!;
  const chamadas = montarEnvios(c.tipo, c.mensagem, c.midia_url);
  const ids = [...(linha.message_ids ?? [])];
  // Retomada: se a mídia já saiu e só o texto falhou, não manda a mídia de novo.
  for (let i = ids.length; i < chamadas.length; i++) {
    const { metodo, params } = chamadas[i];
    try {
      let r: { message_id: number };
      try {
        r = await chamar<{ message_id: number }>(metodo, { chat_id: chatId, ...params });
      } catch (e) {
        // Foto acima de 5 MB o Telegram recusa como foto, mas aceita como arquivo.
        if (metodo === 'sendPhoto' && e instanceof ErroTelegram && e.codigo === 400 && !e.botFora) {
          const { photo, ...resto } = params;
          r = await chamar<{ message_id: number }>('sendDocument', { chat_id: chatId, document: photo, ...resto });
        } else {
          throw e;
        }
      }
      ids.push(r.message_id);
    } catch (e) {
      return { ids, erro: e instanceof ErroTelegram ? e : new ErroTelegram(String(e), 0) };
    }
  }
  return { ids, erro: null };
}

async function drenar(
  supabase: SupabaseClient,
  orcamento: Orcamento,
  resultado: ResultadoTelegram,
): Promise<void> {
  let primeira = true;
  while (orcamento.cabe(CUSTO_ENVIO_MS + PAUSA_MS)) {
    const agora = new Date();
    const { data: proximas } = await supabase
      .from('telegram_envios')
      .select(
        'id,tentativas,message_ids,chat_ref,telegram_chats(id,chat_id,ativo),campaigns!inner(nome,tipo,mensagem,midia_url,status)',
      )
      .eq('status', 'pendente')
      .or(`liberar_em.is.null,liberar_em.lte.${agora.toISOString()}`)
      .not('campaigns.status', 'in', '("cancelada","rascunho")')
      .order('criado_em', { ascending: true })
      .limit(1);
    const linha = (proximas as unknown as LinhaDaFila[] | null)?.[0];
    if (!linha) return;

    // Corrida pela linha: só um tick envia.
    const { data: ganhou } = await supabase
      .from('telegram_envios')
      .update({ status: 'enviando', tentativas: linha.tentativas + 1 })
      .eq('id', linha.id)
      .eq('status', 'pendente')
      .select('id');
    if (!ganhou?.length) continue;

    const chat = linha.telegram_chats;
    if (!chat || !chat.ativo || !linha.campaigns) {
      await supabase
        .from('telegram_envios')
        .update({ status: 'falha', erro: 'O chat foi removido ou desativado antes do envio.' })
        .eq('id', linha.id);
      resultado.falhas += 1;
      continue;
    }

    if (!primeira) await dormir(PAUSA_MS);
    primeira = false;

    const { ids, erro } = await publicar(chat.chat_id, linha);
    const tentativas = linha.tentativas + 1;

    if (!erro) {
      await supabase
        .from('telegram_envios')
        .update({ status: 'enviado', message_ids: ids, enviado_em: new Date().toISOString(), erro: null })
        .eq('id', linha.id);
      resultado.enviadas += 1;
      continue;
    }

    // Grupo virou supergrupo: anota o id novo e refaz sem gastar tentativa.
    if (erro.migrouPara !== null) {
      await supabase
        .from('telegram_chats')
        .update({ chat_id: erro.migrouPara, tipo: 'supergroup' })
        .eq('id', chat.id);
      await supabase
        .from('telegram_envios')
        .update({ status: 'pendente', tentativas: linha.tentativas, message_ids: ids })
        .eq('id', linha.id);
      continue;
    }

    // O Telegram pediu pausa: espera o que ele pediu, sem contar como tentativa.
    if (erro.esperarSeg !== null) {
      await supabase
        .from('telegram_envios')
        .update({
          status: 'pendente',
          tentativas: linha.tentativas,
          message_ids: ids,
          liberar_em: new Date(Date.now() + (erro.esperarSeg + 1) * 1000).toISOString(),
        })
        .eq('id', linha.id);
      resultado.avisos.push(`Telegram pediu ${erro.esperarSeg}s de pausa.`);
      // Pausa longa não cabe no tick: o resto fica para o próximo.
      if (!orcamento.cabe((erro.esperarSeg + 1) * 1000 + CUSTO_ENVIO_MS)) return;
      continue;
    }

    if (erro.botFora) {
      // Avisa o painel: o webhook costuma chegar antes, mas não é garantido.
      await supabase.from('telegram_chats').update({ bot_status: 'left' }).eq('id', chat.id);
    }

    const desiste = erro.permanente || tentativas >= MAX_TENTATIVAS;
    await supabase
      .from('telegram_envios')
      .update({
        status: desiste ? 'falha' : 'pendente',
        message_ids: ids,
        erro: erro.message.slice(0, 500),
      })
      .eq('id', linha.id);
    if (desiste) resultado.falhas += 1;
  }
}

// ── 4. Fechamento ────────────────────────────────────────────────────────────────

async function contar(supabase: SupabaseClient, campanhaId: string, status: string[]): Promise<number> {
  const { count } = await supabase
    .from('telegram_envios')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campanhaId)
    .in('status', status);
  return count ?? 0;
}

export async function fecharCampanhas(
  supabase: SupabaseClient,
  agora: Date,
  conexaoTelegram: string | null,
  avisos: string[],
): Promise<number> {
  const { data: abertas } = await supabase
    .from('campaigns')
    .select('id,nome,status,connection_id')
    .not('telegram_fila_em', 'is', null)
    .is('telegram_resultado', null)
    .limit(100);
  if (!abertas?.length) return 0;

  let fechadas = 0;
  for (const c of abertas as { id: string; nome: string; status: string; connection_id: string | null }[]) {
    // Campanha cancelada depois da fila: o que não saiu, não sai mais.
    if (c.status === 'cancelada') {
      await supabase
        .from('telegram_envios')
        .update({ status: 'cancelado' })
        .eq('campaign_id', c.id)
        .eq('status', 'pendente');
    }
    if ((await contar(supabase, c.id, ['pendente', 'enviando'])) > 0) continue;

    const enviados = await contar(supabase, c.id, ['enviado']);
    const falhas = await contar(supabase, c.id, ['falha']);
    const total = await contar(supabase, c.id, ['enviado', 'falha', 'cancelado']);
    const resumo = {
      total,
      enviados,
      falhas,
      ...(enviados === 0 && total > 0 ? { erro: 'Nenhuma mensagem saiu no Telegram.' } : {}),
    };

    await supabase
      .from('campaigns')
      .update({ telegram_resultado: resumo })
      .eq('id', c.id)
      .is('telegram_resultado', null);

    const soTelegram = conexaoTelegram !== null && c.connection_id === conexaoTelegram;
    if (soTelegram) {
      await supabase
        .from('campaigns')
        .update({
          status: enviados === 0 ? 'erro' : 'enviada',
          enviado_em: agora.toISOString(),
          resultado: resumo,
        })
        .eq('id', c.id)
        .eq('status', 'enviando');
    }
    fechadas += 1;
    if (enviados === 0 && total > 0) avisos.push(`[${c.nome}] não saiu em nenhum chat do Telegram.`);
  }
  return fechadas;
}

// ── Orquestração ─────────────────────────────────────────────────────────────────

/** Um ciclo completo do motor do Telegram. */
export async function rodarTelegram(
  supabase: SupabaseClient,
  orcamento: Orcamento,
  agora: Date = new Date(),
): Promise<ResultadoTelegram> {
  const resultado: ResultadoTelegram = {
    filas: 0,
    enviadas: 0,
    falhas: 0,
    pendentes: 0,
    fechadas: 0,
    avisos: [],
  };
  const conexao = await idDaConexaoTelegram(supabase);

  resultado.filas = await montarFilas(supabase, agora, conexao, resultado.avisos);
  await recuperarOrfas(supabase, agora);
  await drenar(supabase, orcamento, resultado);
  resultado.fechadas = await fecharCampanhas(supabase, new Date(), conexao, resultado.avisos);

  const { count } = await supabase
    .from('telegram_envios')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pendente', 'enviando']);
  resultado.pendentes = count ?? 0;
  return resultado;
}
