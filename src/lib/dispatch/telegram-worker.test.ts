import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { esquecerConexaoTelegram, fecharCampanhas, montarFilas, rodarTelegram } from './telegram-worker';
import { Orcamento } from './ritmo';

type Op = { m: string; args: unknown[] };
type Cadeia = { table: string; ops: Op[] };
type Resposta = { data?: unknown; error?: { message: string } | null; count?: number };

/**
 * Supabase falso que responde olhando a CONSULTA (tabela + operações), não a ordem.
 * O motor faz muitas consultas; depender da ordem tornaria cada teste frágil.
 */
function fake(responder: (c: Cadeia) => Resposta | undefined) {
  const cadeias: Cadeia[] = [];
  const from = (table: string) => {
    const cadeia: Cadeia = { table, ops: [] };
    cadeias.push(cadeia);
    const b: Record<string, unknown> = {};
    for (const m of [
      'select', 'upsert', 'update', 'insert', 'delete',
      'eq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'order', 'limit', 'maybeSingle',
    ]) {
      b[m] = (...args: unknown[]) => {
        cadeia.ops.push({ m, args });
        return b;
      };
    }
    b.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(responder(cadeia) ?? { data: [], error: null }).then(ok, falha);
    return b;
  };
  return { client: { from } as unknown as SupabaseClient, cadeias };
}

const tem = (c: Cadeia, m: string) => c.ops.some((o) => o.m === m);
const args = (c: Cadeia, m: string) => c.ops.find((o) => o.m === m)?.args;
const todos = (c: Cadeia, m: string) => c.ops.filter((o) => o.m === m).map((o) => o.args);

const AGORA = new Date('2026-11-13T12:00:00.000Z');
const BOT = 'conexao-do-bot';

beforeEach(() => {
  esquecerConexaoTelegram();
  process.env.TELEGRAM_BOT_TOKEN = '123:teste';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('montarFilas', () => {
  it('campanha só de Telegram: monta a fila e assume o status', async () => {
    const { client, cadeias } = fake((c) => {
      if (c.table === 'campaigns' && tem(c, 'select') && !tem(c, 'update')) {
        return {
          data: [{ id: 'k1', nome: 'Aula', status: 'agendada', connection_id: BOT, telegram_chat_ids: ['c1', 'c2'] }],
        };
      }
      if (c.table === 'campaigns' && tem(c, 'update')) return { data: [{ id: 'k1' }] };
      if (c.table === 'telegram_chats') {
        return { data: [{ id: 'c1', titulo: 'Turma A', ativo: true, bot_status: 'administrator' }] };
      }
      return undefined;
    });

    expect(await montarFilas(client, AGORA, BOT, [])).toBe(1);

    // A corrida é pela marca da fila, com guarda.
    const corrida = cadeias.find((c) => c.table === 'campaigns' && args(c, 'update')?.[0] && 'telegram_fila_em' in (args(c, 'update')![0] as object));
    expect(todos(corrida!, 'is')).toContainEqual(['telegram_fila_em', null]);

    // Chat que sumiu entra como falha, não desaparece do resultado.
    const fila = cadeias.find((c) => c.table === 'telegram_envios' && tem(c, 'upsert'))!;
    const linhas = args(fila, 'upsert')![0] as Record<string, unknown>[];
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ campaign_id: 'k1', chat_ref: 'c1', chat_titulo: 'Turma A' });
    expect(linhas[0]).not.toHaveProperty('status');
    expect(linhas[1]).toMatchObject({ chat_ref: null, status: 'falha' });

    const status = cadeias.find((c) => c.table === 'campaigns' && (args(c, 'update')?.[0] as { status?: string })?.status === 'enviando');
    expect(status).toBeDefined();
    expect(todos(status!, 'eq')).toContainEqual(['status', 'agendada']);
  });

  it('campanha que também vai para o WhatsApp: o status NÃO é deste motor', async () => {
    const { client, cadeias } = fake((c) => {
      if (c.table === 'campaigns' && tem(c, 'select') && !tem(c, 'update')) {
        return { data: [{ id: 'k1', nome: 'Aula', status: 'agendada', connection_id: null, telegram_chat_ids: ['c1'] }] };
      }
      if (c.table === 'campaigns' && tem(c, 'update')) return { data: [{ id: 'k1' }] };
      if (c.table === 'telegram_chats') return { data: [{ id: 'c1', titulo: 'T', ativo: true, bot_status: 'member' }] };
      return undefined;
    });
    await montarFilas(client, AGORA, BOT, []);
    const mexeuNoStatus = cadeias.some(
      (c) => c.table === 'campaigns' && (args(c, 'update')?.[0] as { status?: string } | undefined)?.status,
    );
    expect(mexeuNoStatus).toBe(false);
  });

  it('quem perde a corrida não monta fila', async () => {
    const { client, cadeias } = fake((c) => {
      if (c.table === 'campaigns' && tem(c, 'select') && !tem(c, 'update')) {
        return { data: [{ id: 'k1', nome: 'A', status: 'agendada', connection_id: BOT, telegram_chat_ids: ['c1'] }] };
      }
      if (c.table === 'campaigns' && tem(c, 'update')) return { data: [] };
      return undefined;
    });
    expect(await montarFilas(client, AGORA, BOT, [])).toBe(0);
    expect(cadeias.some((c) => c.table === 'telegram_envios')).toBe(false);
  });

  it('só olha campanha vencida, com Telegram e sem fila', async () => {
    const { client, cadeias } = fake(() => ({ data: [] }));
    await montarFilas(client, AGORA, BOT, []);
    const busca = cadeias[0];
    expect(todos(busca, 'not')).toContainEqual(['telegram_chat_ids', 'is', null]);
    expect(todos(busca, 'is')).toContainEqual(['telegram_fila_em', null]);
    expect(args(busca, 'lte')).toEqual(['enviar_em', AGORA.toISOString()]);
    // Rascunho e cancelada nunca saem.
    expect(args(busca, 'in')?.[1]).not.toContain('rascunho');
    expect(args(busca, 'in')?.[1]).not.toContain('cancelada');
  });
});

/** Um ciclo do motor com uma linha na fila e a Bot API respondendo `resposta`. */
async function cicloComUmaLinha(resposta: Record<string, unknown>) {
  let entregues = 0;
  const { client, cadeias } = fake((c) => {
    if (c.table === 'connections') return { data: { id: BOT } };
    if (c.table === 'telegram_envios' && tem(c, 'select') && tem(c, 'limit') && !tem(c, 'update')) {
      if (entregues++ > 0) return { data: [] };
      return {
        data: [
          {
            id: 'e1',
            tentativas: 0,
            message_ids: null,
            chat_ref: 'c1',
            telegram_chats: { id: 'c1', chat_id: -1001, ativo: true },
            campaigns: { nome: 'Aula', tipo: 'texto', mensagem: '*Oi*', midia_url: null },
          },
        ],
      };
    }
    if (c.table === 'telegram_envios' && tem(c, 'update') && tem(c, 'select')) return { data: [{ id: 'e1' }] };
    return undefined;
  });
  const fetchFalso = vi.fn(async () => new Response(JSON.stringify(resposta)));
  vi.stubGlobal('fetch', fetchFalso);
  const r = await rodarTelegram(client, new Orcamento(60_000), AGORA);
  const gravacoes = cadeias
    // Só o que foi gravado NESTA linha: o mesmo ciclo também recupera linhas travadas.
    .filter(
      (c) =>
        c.table === 'telegram_envios' &&
        tem(c, 'update') &&
        !tem(c, 'select') &&
        todos(c, 'eq').some((a) => a[0] === 'id' && a[1] === 'e1'),
    )
    .map((c) => args(c, 'update')![0] as Record<string, unknown>);
  return { r, cadeias, gravacoes, fetchFalso };
}

describe('envio', () => {
  it('sucesso: publica em HTML e guarda o id da mensagem', async () => {
    const { r, gravacoes, fetchFalso } = await cicloComUmaLinha({ ok: true, result: { message_id: 77 } });
    expect(r.enviadas).toBe(1);
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/bot123:teste/sendMessage');
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: -1001, text: '<b>Oi</b>', parse_mode: 'HTML' });
    expect(gravacoes.find((g) => g.status === 'enviado')).toMatchObject({ message_ids: [77] });
  });

  it('429: espera o que o Telegram pediu, sem gastar tentativa', async () => {
    const { gravacoes } = await cicloComUmaLinha({
      ok: false,
      error_code: 429,
      description: 'Too Many Requests: retry after 3',
      parameters: { retry_after: 3 },
    });
    const g = gravacoes.find((x) => x.status === 'pendente')!;
    expect(g.tentativas).toBe(0);
    expect(new Date(g.liberar_em as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('grupo que virou supergrupo: anota o id novo e tenta de novo', async () => {
    const { cadeias, gravacoes } = await cicloComUmaLinha({
      ok: false,
      error_code: 400,
      description: 'Bad Request: group chat was upgraded to a supergroup chat',
      parameters: { migrate_to_chat_id: -1009 },
    });
    const chat = cadeias.find((c) => c.table === 'telegram_chats' && tem(c, 'update'))!;
    expect(args(chat, 'update')![0]).toMatchObject({ chat_id: -1009, tipo: 'supergroup' });
    expect(gravacoes.find((x) => x.status === 'pendente')).toMatchObject({ tentativas: 0 });
  });

  it('bot removido do grupo: falha de vez e marca o chat', async () => {
    const { cadeias, gravacoes } = await cicloComUmaLinha({
      ok: false,
      error_code: 403,
      description: 'Forbidden: bot was kicked from the supergroup chat',
    });
    expect(gravacoes.find((x) => x.status === 'falha')).toBeDefined();
    const chat = cadeias.find((c) => c.table === 'telegram_chats' && tem(c, 'update'))!;
    expect(args(chat, 'update')![0]).toMatchObject({ bot_status: 'left' });
  });

  it('erro passageiro (Telegram fora do ar): volta para a fila', async () => {
    const { gravacoes } = await cicloComUmaLinha({ ok: false, error_code: 502, description: 'Bad Gateway' });
    expect(gravacoes.find((x) => x.status === 'pendente')).toBeDefined();
    expect(gravacoes.find((x) => x.status === 'falha')).toBeUndefined();
  });
});

describe('fecharCampanhas', () => {
  function cenario(connection_id: string | null, contagens: Record<string, number>) {
    return fake((c) => {
      if (c.table === 'campaigns' && tem(c, 'select')) {
        return { data: [{ id: 'k1', nome: 'Aula', status: 'enviando', connection_id }] };
      }
      if (c.table === 'telegram_envios' && tem(c, 'select')) {
        const st = (args(c, 'in')?.[1] as string[]).join(',');
        return { count: contagens[st] ?? 0 };
      }
      return undefined;
    });
  }

  it('só de Telegram: fecha o status da campanha', async () => {
    const { client, cadeias } = cenario(BOT, { 'pendente,enviando': 0, enviado: 2, falha: 1, 'enviado,falha,cancelado': 3 });
    expect(await fecharCampanhas(client, AGORA, BOT, [])).toBe(1);
    const status = cadeias.find((c) => (args(c, 'update')?.[0] as { status?: string } | undefined)?.status);
    expect(args(status!, 'update')![0]).toMatchObject({
      status: 'enviada',
      resultado: { total: 3, enviados: 2, falhas: 1 },
    });
  });

  it('com WhatsApp junto: só o resumo do Telegram, o status é de quem manda o WhatsApp', async () => {
    const { client, cadeias } = cenario(null, { 'pendente,enviando': 0, enviado: 1, falha: 0, 'enviado,falha,cancelado': 1 });
    await fecharCampanhas(client, AGORA, BOT, []);
    const updates = cadeias.filter((c) => tem(c, 'update')).map((c) => args(c, 'update')![0] as Record<string, unknown>);
    expect(updates).toEqual([{ telegram_resultado: { total: 1, enviados: 1, falhas: 0 } }]);
  });

  it('ainda tem fila: não fecha', async () => {
    const { client } = cenario(BOT, { 'pendente,enviando': 2 });
    expect(await fecharCampanhas(client, AGORA, BOT, [])).toBe(0);
  });

  it('nada saiu: erro, com motivo', async () => {
    const { client, cadeias } = cenario(BOT, { 'pendente,enviando': 0, enviado: 0, falha: 2, 'enviado,falha,cancelado': 2 });
    const avisos: string[] = [];
    await fecharCampanhas(client, AGORA, BOT, avisos);
    const status = cadeias.find((c) => (args(c, 'update')?.[0] as { status?: string } | undefined)?.status);
    expect(args(status!, 'update')![0]).toMatchObject({ status: 'erro' });
    expect(avisos[0]).toMatch(/nenhum chat/);
  });
});
