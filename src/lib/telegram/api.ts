/**
 * Cliente da Bot API do Telegram — só o que o disparador usa.
 *
 * O token vem de TELEGRAM_BOT_TOKEN e nunca vai para o banco nem para o navegador:
 * quem tem o token publica em nome do bot em todos os grupos.
 *
 * Os erros carregam o que o motor precisa decidir sem ler texto solto:
 *   · `esperarSeg` — 429, o Telegram pediu pausa (retry_after);
 *   · `migrouPara` — o grupo virou supergrupo e ganhou outro id;
 *   · `permanente` — tentar de novo não resolve (bot removido, chat não existe).
 */

const BASE = 'https://api.telegram.org';

export class ErroTelegram extends Error {
  constructor(
    message: string,
    readonly codigo: number,
    readonly esperarSeg: number | null = null,
    readonly migrouPara: number | null = null,
  ) {
    super(message);
    this.name = 'ErroTelegram';
  }

  /** 400/403 sem pausa nem migração: o pedido em si está errado ou o bot não pode. */
  get permanente(): boolean {
    if (this.esperarSeg !== null || this.migrouPara !== null) return false;
    return this.codigo === 400 || this.codigo === 403 || this.codigo === 404;
  }

  /** O bot não está mais no chat (removido, chat apagado, sem permissão). */
  get botFora(): boolean {
    return (
      this.codigo === 403 ||
      /chat not found|bot was kicked|not a member|have no rights|not enough rights/i.test(this.message)
    );
  }
}

export function tokenTelegram(): string | null {
  const t = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  return t || null;
}

export function telegramConfigurado(): boolean {
  return tokenTelegram() !== null;
}

/**
 * O envio do Telegram está ligado? Basta o token. `TELEGRAM_ENVIO=0` é o
 * desligamento de emergência, sem esperar deploy — o mesmo papel do MOTOR_WHATSAPP.
 */
export function envioTelegramLigado(): boolean {
  const v = (process.env.TELEGRAM_ENVIO ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return telegramConfigurado();
}

interface RespostaTelegram<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

export async function chamar<T = unknown>(
  metodo: string,
  params: Record<string, unknown> = {},
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const token = tokenTelegram();
  if (!token) throw new ErroTelegram('TELEGRAM_BOT_TOKEN não configurado', 0);

  let res: Response;
  try {
    res = await fetch(`${BASE}/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch (e) {
    // Rede ou timeout: transitório. Código 0 = "não chegou a responder".
    throw new ErroTelegram(`sem resposta do Telegram: ${e instanceof Error ? e.message : String(e)}`, 0);
  }

  const corpo = (await res.json().catch(() => null)) as RespostaTelegram<T> | null;
  if (corpo?.ok) return corpo.result as T;

  throw new ErroTelegram(
    corpo?.description ?? `HTTP ${res.status}`,
    corpo?.error_code ?? res.status,
    corpo?.parameters?.retry_after ?? null,
    corpo?.parameters?.migrate_to_chat_id ?? null,
  );
}

export interface BotInfo {
  id: number;
  username: string;
  first_name: string;
  can_join_groups?: boolean;
}

export function sobreOBot(): Promise<BotInfo> {
  return chamar<BotInfo>('getMe', {}, { timeoutMs: 10_000 });
}

export interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
  last_error_date?: number;
}

export function estadoDoWebhook(): Promise<WebhookInfo> {
  return chamar<WebhookInfo>('getWebhookInfo', {}, { timeoutMs: 10_000 });
}

/**
 * Aponta o bot para o nosso webhook. `my_chat_member` avisa quando o bot entra ou
 * sai de um grupo/canal; `message` traz a migração de grupo para supergrupo.
 */
export function registrarWebhook(url: string, segredo: string): Promise<true> {
  return chamar<true>(
    'setWebhook',
    {
      url,
      secret_token: segredo,
      allowed_updates: ['my_chat_member', 'message'],
    },
    { timeoutMs: 15_000 },
  );
}

/** Links que adicionam o bot com as permissões certas, num toque. */
export function linksDeEntrada(username: string): { grupo: string; canal: string } {
  return {
    // Em grupo, o bot publica mesmo sem ser admin; admin serve para convidar e fixar.
    grupo: `https://t.me/${username}?startgroup=true&admin=invite_users+pin_messages`,
    // Em canal, só publica quem é admin com "publicar mensagens".
    canal: `https://t.me/${username}?startchannel=true&admin=post_messages+invite_users`,
  };
}
