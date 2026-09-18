// Fan-out: a campanha (um molde) vira N destinatários (a fila).
//
// É aqui que "mandar para o público X" deixa de ser uma intenção e vira uma lista
// concreta de linhas, cada uma com o seu destino e a sua conexão. Tudo puro e testável:
// quem lê o banco é o worker, esta parte só decide.

import type { Audience, Campaign, Group } from '../types';
import { normalizarDestino } from '../whatsapp/jid';

export interface LinhaDestinatario {
  campaign_id: string;
  connection_id: string | null;
  destino: string;
  destino_nome: string | null;
  destino_tipo: 'grupo';
  status: 'pendente';
}

export interface ResultadoFanout {
  linhas: LinhaDestinatario[];
  /** Problemas que não impedem o disparo, mas que a tela precisa mostrar. */
  avisos: string[];
}

export interface FontesFanout {
  /** Grupos ativos cadastrados (já filtrados por `ativo`). */
  grupos: Group[];
  /** Público salvo da campanha, quando ela aponta para um. */
  audience: Audience | null;
  /** Conexão a usar quando nada mais definir uma. */
  conexaoPadrao: string | null;
}

/**
 * Decide quais grupos entram na campanha. A precedência é a mesma que o dispatcher
 * do n8n já usava — mantida de propósito para não mudar o comportamento de campanhas
 * que o time já tem agendadas:
 *
 *   1. `campaign.group_ids` — a seleção avulsa feita no compositor, que manda em tudo.
 *   2. público `manual` — a lista salva de grupos.
 *   3. resto — todos os grupos ativos.
 */
export function gruposDaCampanha(campanha: Campaign, grupos: Group[], audience: Audience | null): Group[] {
  const porId = new Map(grupos.map((g) => [normalizarDestino(g.group_id), g]));

  const explicitos =
    campanha.group_ids && campanha.group_ids.length
      ? campanha.group_ids
      : audience && audience.tipo === 'manual' && audience.group_ids?.length
        ? audience.group_ids
        : null;

  if (!explicitos) return grupos;

  // Um group_id selecionado que não está mais cadastrado ainda assim é enviado: ele veio
  // de uma escolha explícita do usuário, e sumir em silêncio seria pior do que tentar.
  return explicitos.map((id) => {
    const chave = normalizarDestino(id);
    return (
      porId.get(chave) ?? {
        id: '',
        group_id: id,
        nome: id,
        ativo: true,
        criado_em: '',
      }
    );
  });
}

/** Monta as linhas da fila para uma campanha de WhatsApp. */
export function montarDestinatarios(campanha: Campaign, fontes: FontesFanout): ResultadoFanout {
  const avisos: string[] = [];
  const linhas: LinhaDestinatario[] = [];
  // Dedupe pelo destino JÁ normalizado: o mesmo grupo escrito nos dois dialetos
  // (`120@g.us` e `120-group`) é um destino só, e mandar duas vezes é visível para
  // quem recebe.
  const vistos = new Set<string>();

  for (const grupo of gruposDaCampanha(campanha, fontes.grupos, fontes.audience)) {
    const destino = normalizarDestino(grupo.group_id);
    if (!destino) {
      avisos.push(`ID de grupo inválido, ignorado: ${grupo.group_id}`);
      continue;
    }
    if (vistos.has(destino)) continue;
    vistos.add(destino);
    linhas.push({
      campaign_id: campanha.id,
      connection_id:
        // Um grupo só pode ser alcançado pelo número que participa dele — por isso a
        // conexão do grupo vem ANTES da escolhida na campanha. É também o que
        // distribui o disparo entre vários números sem ninguém configurar nada.
        grupo.connection_id ?? campanha.connection_id ?? fontes.conexaoPadrao,
      destino,
      destino_nome: grupo.nome ?? null,
      destino_tipo: 'grupo',
      status: 'pendente',
    });
  }

  if (!linhas.length) avisos.push('Nenhum grupo válido para esta campanha.');
  return { linhas, avisos };
}

/**
 * Resumo contado a partir da fila. Substitui o `campaigns.resultado` antigo, que era
 * escrito pelo n8n e só tinha {total, enviados, falhas}.
 */
export function resumirFila(
  linhas: { status: string }[],
): { total: number; enviados: number; falhas: number; pendentes: number } {
  return {
    total: linhas.length,
    enviados: linhas.filter((l) => ['enviado', 'entregue', 'lido'].includes(l.status)).length,
    falhas: linhas.filter((l) => l.status === 'falha').length,
    pendentes: linhas.filter((l) => l.status === 'pendente' || l.status === 'enviando').length,
  };
}
