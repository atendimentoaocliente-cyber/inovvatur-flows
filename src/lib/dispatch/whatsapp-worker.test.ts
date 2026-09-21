import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { promoverCampanhas } from './whatsapp-worker';

type Call = { table: string; method: string; args: unknown[] };

/** Cliente Supabase falso: builder encadeável e "thenable", com resultados enfileirados. */
function fakeClient(results: { data?: unknown; error?: { message: string } | null }[]) {
  const calls: Call[] = [];
  let i = 0;
  const from = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of [
      'select', 'upsert', 'update', 'insert', 'delete',
      'eq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'order', 'limit', 'maybeSingle',
    ]) {
      b[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve(results[i++] ?? { data: [], error: null });
    return b;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const AGORA = new Date('2026-09-21T12:00:00.000Z');

describe('promoverCampanhas — a convivência com o n8n', () => {
  it('só busca campanha que escolheu um número (connection_id não nulo)', async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    await promoverCampanhas(client, AGORA, []);

    // Este filtro é o que mantém Academy, P360 e tudo que já estava agendado com o
    // n8n enquanto o motor novo é testado. Se ele sumir, o motor sequestra tudo.
    const filtro = calls.find((c) => c.method === 'not');
    expect(filtro?.args).toEqual(['connection_id', 'is', null]);
  });

  it('busca só campanha agendada e já vencida', async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    await promoverCampanhas(client, AGORA, []);

    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['status', 'agendada']);
    expect(calls.find((c) => c.method === 'lte')?.args).toEqual([
      'enviar_em',
      '2026-09-21T12:00:00.000Z',
    ]);
  });

  it('não procura conexão de reserva — escolha implícita seria envio que ninguém pediu', async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    await promoverCampanhas(client, AGORA, []);
    expect(calls.some((c) => c.table === 'connections')).toBe(false);
  });

  it('erro ao listar vira aviso, não exceção', async () => {
    const { client } = fakeClient([{ data: null, error: { message: 'banco fora' } }]);
    const avisos: string[] = [];
    expect(await promoverCampanhas(client, AGORA, avisos)).toBe(0);
    expect(avisos[0]).toMatch(/banco fora/);
  });

  it('sem campanha vencida, não toca em mais nada', async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    expect(await promoverCampanhas(client, AGORA, [])).toBe(0);
    expect(calls.some((c) => c.method === 'update')).toBe(false);
    expect(calls.some((c) => c.method === 'upsert')).toBe(false);
  });
});
