import { describe, it, expect } from 'vitest';
import { nomeDeInstancia, webhookAlcancavel } from './conexao';

describe('webhookAlcancavel', () => {
  it('recusa localhost — a Evolution roda noutra máquina e não alcança', () => {
    // Caso real: uma conexão criada a partir do ambiente local registrou
    // http://localhost:3000 e derrubou os eventos de produção em silêncio.
    expect(webhookAlcancavel('http://localhost:3000/api/webhooks/evolution')).toBe(false);
    expect(webhookAlcancavel('http://127.0.0.1:3000/x')).toBe(false);
    expect(webhookAlcancavel('http://meu-pc.local/x')).toBe(false);
  });

  it('aceita domínio público', () => {
    expect(webhookAlcancavel('https://inovvatur-disparador.vercel.app/api/webhooks/evolution?s=x')).toBe(true);
  });

  it('URL inválida não é alcançável', () => {
    expect(webhookAlcancavel('nao-e-url')).toBe(false);
  });
});

describe('nomeDeInstancia', () => {
  it('gera nome seguro com sufixo, para não herdar sessão de instância apagada', () => {
    expect(nomeDeInstancia('Conexão Teste', 'abc12')).toBe('conexao-teste-abc12');
  });

  it('nome vazio ainda produz algo válido', () => {
    expect(nomeDeInstancia('', 'abc12')).toBe('conexao-abc12');
  });
});
