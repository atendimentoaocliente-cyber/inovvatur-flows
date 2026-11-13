import { describe, it, expect } from 'vitest';
import { dividirTexto, LIMITE_LEGENDA, montarEnvios, paraHtml, tamanhoVisivel } from './mensagem';

describe('paraHtml — a formatação do WhatsApp no Telegram', () => {
  it('converte negrito, itálico e riscado', () => {
    expect(paraHtml('*Aula hoje* às _19h_, ~não~ amanhã')).toBe('<b>Aula hoje</b> às <i>19h</i>, <s>não</s> amanhã');
  });

  it('escapa < > & — sem isso o Telegram recusa a mensagem inteira', () => {
    expect(paraHtml('Promo 2 < 3 & R$ 10 > nada')).toBe('Promo 2 &lt; 3 &amp; R$ 10 &gt; nada');
  });

  it('não transforma o _ de um link em itálico', () => {
    expect(paraHtml('Link: https://site.com/aula_de_hoje_ok')).toBe('Link: https://site.com/aula_de_hoje_ok');
  });

  it('asterisco solto (preço, nota de rodapé) fica como está', () => {
    expect(paraHtml('Valor 3 * 2 = 6')).toBe('Valor 3 * 2 = 6');
  });

  it('trecho de código é literal: nada de negrito dentro dele', () => {
    expect(paraHtml('use `*cupom*` ou ```*A* <b>```')).toBe('use <code>*cupom*</code> ou <pre>*A* &lt;b&gt;</pre>');
  });

  it('marcador colado em pontuação continua valendo', () => {
    expect(paraHtml('(*Atenção*!)')).toBe('(<b>Atenção</b>!)');
  });
});

describe('tamanhoVisivel — o que o Telegram conta', () => {
  it('não conta os marcadores nem o escape', () => {
    expect(tamanhoVisivel('*oi* & tchau')).toBe('oi & tchau'.length);
  });
});

describe('dividirTexto', () => {
  it('texto curto fica inteiro', () => {
    expect(dividirTexto('Bom dia!')).toEqual(['Bom dia!']);
  });

  it('corta no parágrafo, sem passar do limite', () => {
    const p1 = 'a'.repeat(60);
    const p2 = 'b'.repeat(60);
    const partes = dividirTexto(`${p1}\n\n${p2}`, 100);
    expect(partes).toEqual([p1, p2]);
    for (const p of partes) expect(p.length).toBeLessThanOrEqual(100);
  });
});

describe('montarEnvios — uma campanha vira chamadas da Bot API', () => {
  it('texto vai como sendMessage em HTML', () => {
    expect(montarEnvios('texto', '*Oi*', null)).toEqual([
      { metodo: 'sendMessage', params: { text: '<b>Oi</b>', parse_mode: 'HTML' } },
    ]);
  });

  it('imagem leva o texto na legenda quando cabe', () => {
    const [c] = montarEnvios('imagem', 'Legenda', 'https://x/a.png');
    expect(c).toEqual({
      metodo: 'sendPhoto',
      params: { photo: 'https://x/a.png', caption: 'Legenda', parse_mode: 'HTML' },
    });
  });

  it('vídeo e PDF usam o método certo', () => {
    expect(montarEnvios('video', 'v', 'https://x/a.mp4')[0].metodo).toBe('sendVideo');
    expect(montarEnvios('pdf', 'p', 'https://x/a.pdf')[0].metodo).toBe('sendDocument');
  });

  it('texto maior que a legenda: a mídia vai limpa e o texto vem depois, inteiro', () => {
    const longo = 'x'.repeat(LIMITE_LEGENDA + 10);
    const chamadas = montarEnvios('imagem', longo, 'https://x/a.png');
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0].params).not.toHaveProperty('caption');
    expect(chamadas[1]).toEqual({ metodo: 'sendMessage', params: { text: longo, parse_mode: 'HTML' } });
  });

  it('mídia sem URL cai para texto, em vez de mandar arquivo vazio', () => {
    expect(montarEnvios('imagem', 'oi', null)[0].metodo).toBe('sendMessage');
  });
});
