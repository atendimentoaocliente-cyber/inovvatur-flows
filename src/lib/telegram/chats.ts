/**
 * Os grupos e canais onde o bot está — como eles chegam e como se atualizam.
 *
 * Ninguém digita ID de chat. O bot entra por um link (ver `linksDeEntrada`), o
 * Telegram avisa o webhook com `my_chat_member`, e o chat aparece no painel.
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chamar, tokenTelegram } from './api';

import type { StatusDoBot, TelegramChat, TipoChat } from './tipos';

export type { StatusDoBot, TelegramChat, TipoChat } from './tipos';
export { podePublicar } from './tipos';

/**
 * Segredo do webhook, derivado do token.
 *
 * O Telegram devolve esse valor no cabeçalho X-Telegram-Bot-Api-Secret-Token de
 * toda chamada; é como se sabe que o pedido veio dele. Derivar do token evita uma
 * variável a mais para configurar — e trocar o token troca o segredo junto.
 */
export function segredoDoWebhook(): string | null {
  const token = tokenTelegram();
  if (!token) return null;
  return createHash('sha256').update(`disparador-webhook:${token}`).digest('base64url');
}

/** O que o Telegram manda sobre o bot num chat (`ChatMember`). */
export interface MembroBot {
  status: StatusDoBot;
  can_post_messages?: boolean;
  can_send_messages?: boolean;
}

/** Em canal só publica admin com "publicar"; em grupo, membro comum já publica. */
export function calcularPodePostar(tipo: TipoChat, m: MembroBot): boolean {
  if (m.status === 'left' || m.status === 'kicked') return false;
  if (tipo === 'channel') {
    return m.status === 'creator' || (m.status === 'administrator' && m.can_post_messages !== false);
  }
  if (m.status === 'restricted') return m.can_send_messages !== false;
  return true;
}

export interface ChatDoTelegram {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

/**
 * Grava (ou atualiza) um chat a partir do que o Telegram informou. `ativo` não vai
 * no update: quem desligou um grupo no painel não o vê religar porque o bot recebeu
 * uma permissão nova.
 */
export async function registrarChat(
  supabase: SupabaseClient,
  chat: ChatDoTelegram,
  membro: MembroBot,
): Promise<void> {
  if (chat.type !== 'group' && chat.type !== 'supergroup' && chat.type !== 'channel') return;
  const tipo = chat.type as TipoChat;
  await supabase.from('telegram_chats').upsert(
    {
      chat_id: chat.id,
      tipo,
      titulo: chat.title?.trim() || (tipo === 'channel' ? 'Canal sem nome' : 'Grupo sem nome'),
      username: chat.username ?? null,
      bot_status: membro.status,
      pode_postar: calcularPodePostar(tipo, membro),
    },
    { onConflict: 'chat_id' },
  );
}

/** Grupo virou supergrupo: o Telegram dá um id novo e o antigo para de funcionar. */
export async function migrarChat(supabase: SupabaseClient, de: number, para: number): Promise<void> {
  // Se o id novo já entrou sozinho (o my_chat_member do supergrupo pode chegar antes),
  // a linha nova sai e a antiga — a que as campanhas apontam — fica com o id novo.
  const { data: jaExiste } = await supabase
    .from('telegram_chats')
    .select('id')
    .eq('chat_id', para)
    .maybeSingle();
  const { data: antiga } = await supabase
    .from('telegram_chats')
    .select('id')
    .eq('chat_id', de)
    .maybeSingle();
  if (!antiga) return;
  if (jaExiste) await supabase.from('telegram_chats').delete().eq('id', (jaExiste as { id: string }).id);
  await supabase
    .from('telegram_chats')
    .update({ chat_id: para, tipo: 'supergroup' })
    .eq('id', (antiga as { id: string }).id);
}

/**
 * Pergunta ao Telegram como está cada chat agora: nome, quantos membros e se o
 * bot ainda está lá. Serve para o botão "Atualizar" e para conferir depois de
 * conectar.
 */
export async function atualizarChats(supabase: SupabaseClient): Promise<{ atualizados: number; erros: string[] }> {
  const { data } = await supabase.from('telegram_chats').select('*');
  const chats = (data ?? []) as TelegramChat[];
  if (!chats.length) return { atualizados: 0, erros: [] };

  const bot = await chamar<{ id: number }>('getMe');
  const erros: string[] = [];
  let atualizados = 0;
  for (const c of chats) {
    try {
      const info = await chamar<ChatDoTelegram>('getChat', { chat_id: c.chat_id });
      const membro = await chamar<MembroBot>('getChatMember', { chat_id: c.chat_id, user_id: bot.id });
      const membros = await chamar<number>('getChatMemberCount', { chat_id: c.chat_id }).catch(() => null);
      await supabase
        .from('telegram_chats')
        .update({
          titulo: info.title?.trim() || c.titulo,
          username: info.username ?? null,
          bot_status: membro.status,
          pode_postar: calcularPodePostar(c.tipo, membro),
          membros,
        })
        .eq('id', c.id);
      atualizados += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Chat que sumiu ou de onde o bot saiu: marca, em vez de deixar como estava.
      if (/chat not found|kicked|not a member|forbidden/i.test(msg)) {
        await supabase.from('telegram_chats').update({ bot_status: 'left', pode_postar: false }).eq('id', c.id);
      }
      erros.push(`${c.titulo}: ${msg}`);
    }
  }
  return { atualizados, erros };
}
