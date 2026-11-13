/**
 * Tipos e regras do Telegram que rodam dos dois lados (servidor e navegador).
 * Fica separado de `chats.ts`, que usa node:crypto e só existe no servidor.
 */

export type TipoChat = 'group' | 'supergroup' | 'channel';
export type StatusDoBot = 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';

export interface TelegramChat {
  id: string;
  chat_id: number;
  tipo: TipoChat;
  titulo: string;
  username: string | null;
  bot_status: StatusDoBot;
  pode_postar: boolean;
  ativo: boolean;
  membros: number | null;
  criado_em: string;
  atualizado_em: string;
}

/** O bot está dentro e pode publicar? */
export function podePublicar(chat: Pick<TelegramChat, 'bot_status' | 'pode_postar' | 'ativo'>): boolean {
  return (
    chat.ativo &&
    chat.pode_postar &&
    ['creator', 'administrator', 'member', 'restricted'].includes(chat.bot_status)
  );
}
