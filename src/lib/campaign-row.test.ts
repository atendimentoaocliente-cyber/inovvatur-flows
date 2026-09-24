import { describe, it, expect } from 'vitest';
import { buildCampaignRow , descreverPublico } from './campaign-row';
import type { CampaignDraft } from './validation';

const now = new Date('2026-08-20T12:00:00Z');
const draft: CampaignDraft = {
  nome: 'Feriado', tipo: 'imagem', mensagem: 'Bom dia',
  midia_url: 'https://x/y.jpg', mencionar_todos: true,
  agendar: true, enviar_em: '2026-08-21T09:00:00Z',
};

describe('buildCampaignRow', () => {
  it('maps a scheduled draft to an agendada row', () => {
    const row = buildCampaignRow(draft, 'aud-1', null, now, { asDraft: false });
    expect(row).toMatchObject({
      nome: 'Feriado', tipo: 'imagem', mensagem: 'Bom dia',
      midia_url: 'https://x/y.jpg', mencionar_todos: true,
      audience_id: 'aud-1', status: 'agendada', enviar_em: '2026-08-21T09:00:00Z',
    });
  });
  it('send-now sets status agendada with enviar_em = now', () => {
    const row = buildCampaignRow({ ...draft, agendar: false, enviar_em: null }, null, null, now, { asDraft: false });
    expect(row.status).toBe('agendada');
    expect(row.enviar_em).toBe(now.toISOString());
    expect(row.audience_id).toBeNull();
  });
  it('asDraft forces status rascunho', () => {
    expect(buildCampaignRow(draft, 'aud-1', null, now, { asDraft: true }).status).toBe('rascunho');
  });
  it('coerces a sparse draft without throwing', () => {
    const row = buildCampaignRow({ tipo: 'texto' } as unknown as CampaignDraft, null, null, now, { asDraft: true });
    expect(row.nome).toBe('');
    expect(row.mensagem).toBe('');
    expect(row.status).toBe('rascunho');
  });
  it('carries ad-hoc group_ids when provided', () => {
    const row = buildCampaignRow(draft, null, ['g1', 'g2'], now, { asDraft: false });
    expect(row.group_ids).toEqual(['g1', 'g2']);
  });
  it('normalizes empty group_ids to null', () => {
    const row = buildCampaignRow(draft, null, [], now, { asDraft: false });
    expect(row.group_ids).toBeNull();
  });
  it('defaults categoria to avulsas when absent/invalid', () => {
    expect(buildCampaignRow(draft, null, null, now, { asDraft: false }).categoria).toBe('avulsas');
  });
  it('carries a valid categoria', () => {
    expect(buildCampaignRow({ ...draft, categoria: 'p360' }, null, null, now, { asDraft: false }).categoria).toBe('p360');
  });
});

describe('descreverPublico — a coluna que mentia', () => {
  const aud = [
    { id: 'a1', nome: 'Avisos aulas', tipo: 'manual', group_ids: ['g1', 'g2', 'g3'] },
    { id: 'a2', nome: 'Todo mundo', tipo: 'todos', group_ids: null },
  ];

  it('mostra o nome do público salvo e quantos grupos ele tem', () => {
    // O caso real: 6 campanhas com "Avisos aulas" (3 grupos) apareciam como
    // "Todos · grupos ativos" — cinco vezes o alcance verdadeiro.
    expect(descreverPublico({ audience_id: 'a1', group_ids: null }, aud, 15)).toEqual({
      titulo: 'Avisos aulas',
      detalhe: '3 grupos',
    });
  });

  it('público do tipo "todos" conta os ativos', () => {
    expect(descreverPublico({ audience_id: 'a2', group_ids: null }, aud, 15)).toEqual({
      titulo: 'Todo mundo',
      detalhe: '15 grupos',
    });
  });

  it('grupos escolhidos na campanha ganham do público', () => {
    expect(descreverPublico({ audience_id: 'a1', group_ids: ['x', 'y'] }, aud, 15)).toEqual({
      titulo: '2 grupos',
      detalhe: 'escolhidos na campanha',
    });
  });

  it('sem nada escolhido, avisa que vai para todos — com o número', () => {
    expect(descreverPublico({ audience_id: null, group_ids: null }, aud, 15)).toEqual({
      titulo: 'Todos',
      detalhe: '15 grupos ativos',
    });
  });

  it('público apagado não vira nome vazio', () => {
    const r = descreverPublico({ audience_id: 'sumiu', group_ids: null }, aud, 15);
    expect(r.titulo).toBe('Público removido');
    expect(r.detalhe).toMatch(/15/);
  });
});
