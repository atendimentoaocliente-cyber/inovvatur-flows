/**
 * Uma campanha do disparador → as chamadas da Bot API que a publicam num chat.
 *
 * O texto das campanhas é escrito para o WhatsApp: *negrito*, _itálico_, ~riscado~,
 * ```bloco``` e `código`. No Telegram, isso sairia com os asteriscos aparecendo.
 * Aqui vira HTML (parse_mode 'HTML'), que é o modo do Telegram mais tolerante: só
 * `<`, `>` e `&` precisam de escape, e não há caractere comum que quebre o envio —
 * no MarkdownV2, um ponto final ou um hífen sem barra invertida derruba a mensagem.
 *
 * Os limites do Telegram que mudam a forma do envio:
 *   · legenda de mídia: 1024 caracteres;
 *   · mensagem de texto: 4096.
 * Texto que não cabe na legenda vai numa mensagem logo depois da mídia, em vez de
 * ser cortado.
 */
import type { CampaignType } from '../types';

export const LIMITE_LEGENDA = 1024;
export const LIMITE_TEXTO = 4096;

export interface ChamadaTelegram {
  metodo: 'sendMessage' | 'sendPhoto' | 'sendVideo' | 'sendDocument';
  params: Record<string, unknown>;
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Marcador só vale colado em palavra e com borda de espaço/pontuação dos dois lados,
// como no WhatsApp. Sem a borda, o "_" de um link (site.com/a_b_c) viraria itálico.
const ANTES = '(^|[\\s(\\[{"\'«“])';
const DEPOIS = '(?=$|[\\s)\\]}.,!?;:"\'»”…])';
function marcador(simbolo: string, tag: string) {
  const s = simbolo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${ANTES}${s}(\\S(?:[^${s}\\n]*?\\S)?)${s}${DEPOIS}`, 'g');
  return (texto: string) => texto.replace(re, `$1<${tag}>$2</${tag}>`);
}
const negrito = marcador('*', 'b');
const italico = marcador('_', 'i');
const riscado = marcador('~', 's');

/** Formatação do WhatsApp → HTML do Telegram. */
export function paraHtml(texto: string): string {
  const blocos: string[] = [];
  // Bloco e código primeiro, e guardados à parte: o que está dentro deles é literal,
  // um *asterisco* num trecho de código não pode virar negrito.
  let s = texto.replace(/```([\s\S]+?)```/g, (_m, dentro: string) => {
    blocos.push(`<pre>${escapar(dentro)}</pre>`);
    return `\u0000${blocos.length - 1}\u0000`;
  });
  s = s.replace(/`([^`\n]+)`/g, (_m, dentro: string) => {
    blocos.push(`<code>${escapar(dentro)}</code>`);
    return `\u0000${blocos.length - 1}\u0000`;
  });
  s = riscado(italico(negrito(escapar(s))));
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => blocos[Number(i)]);
}

/** Quanto o Telegram conta: o texto visível, sem os marcadores de formatação. */
export function tamanhoVisivel(texto: string): number {
  return paraHtml(texto)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').length;
}

/**
 * Corta em pedaços que cabem no limite, preferindo parágrafo, depois linha, depois
 * espaço. Corta o texto ORIGINAL (antes do HTML) para nunca partir uma tag ao meio.
 */
export function dividirTexto(texto: string, limite = LIMITE_TEXTO): string[] {
  const pedacos: string[] = [];
  let resto = texto.trim();
  while (resto.length > 0) {
    if (tamanhoVisivel(resto) <= limite) {
      pedacos.push(resto);
      break;
    }
    // Margem para o escape (&amp; conta 1 para o Telegram, mas o corte é no original).
    const janela = resto.slice(0, limite);
    let corte = janela.lastIndexOf('\n\n');
    if (corte < limite * 0.5) corte = janela.lastIndexOf('\n');
    if (corte < limite * 0.5) corte = janela.lastIndexOf(' ');
    if (corte < limite * 0.5) corte = limite;
    pedacos.push(resto.slice(0, corte).trimEnd());
    resto = resto.slice(corte).trimStart();
  }
  return pedacos;
}

function mensagensDeTexto(texto: string): ChamadaTelegram[] {
  return dividirTexto(texto).map((p) => ({
    metodo: 'sendMessage' as const,
    params: { text: paraHtml(p), parse_mode: 'HTML' },
  }));
}

/** As chamadas, em ordem, que publicam esta campanha num chat (sem o chat_id). */
export function montarEnvios(
  tipo: CampaignType,
  mensagem: string,
  midiaUrl: string | null,
): ChamadaTelegram[] {
  const texto = (mensagem ?? '').trim();

  if (tipo === 'texto' || !midiaUrl) return mensagensDeTexto(texto);

  const cabeNaLegenda = texto.length > 0 && tamanhoVisivel(texto) <= LIMITE_LEGENDA;
  const legenda = cabeNaLegenda ? { caption: paraHtml(texto), parse_mode: 'HTML' } : {};

  const midia: ChamadaTelegram =
    tipo === 'imagem'
      ? { metodo: 'sendPhoto', params: { photo: midiaUrl, ...legenda } }
      : tipo === 'video'
        ? { metodo: 'sendVideo', params: { video: midiaUrl, supports_streaming: true, ...legenda } }
        : { metodo: 'sendDocument', params: { document: midiaUrl, ...legenda } };

  if (cabeNaLegenda || texto.length === 0) return [midia];
  // Não coube: a mídia vai limpa e o texto inteiro vem na sequência.
  return [midia, ...mensagensDeTexto(texto)];
}
