import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { mensagemDoUpsert, parseEventoEvolution, type AckStatus } from '@/lib/whatsapp/eventos';
import { normalizarDestino } from '@/lib/whatsapp/jid';
import { assinaturaConfere } from '@/lib/seguranca';

export const dynamic = 'force-dynamic';

/**
 * A porta de entrada dos KPIs de WhatsApp.
 *
 * Cada ✓✓ cinza e cada ✓✓ azul que aparece no celular de quem recebeu passa por aqui.
 * Sem este endpoint funcionando, "entregue" e "lido" ficam em zero para sempre — e o
 * pior é que nada quebra visivelmente: a campanha diz "enviada" e o painel diz 0% de
 * leitura, que é indistinguível de "ninguém leu".
 *
 * Duas regras valem para tudo o que acontece aqui:
 *
 *   1. RESPONDER RÁPIDO E SEMPRE 200. A Evolution reenvia o que falha, e um endpoint
 *      lento vira uma fila crescente de retentativas em cima do servidor. Se algo der
 *      errado do nosso lado, engolimos o erro e devolvemos 200 — o custo de perder um
 *      ACK é um KPI levemente defasado; o de travar o webhook é a ingestão inteira parar.
 *   2. NADA PESADO NO CAMINHO. Uma consulta por índice e um update. Sem varredura,
 *      sem agregação, sem recalcular campanha.
 */

/** Ordem do funil. Um ACK só avança o estado — nunca puxa de volta. */
const ORDEM: Record<string, number> = {
  pendente: 0,
  enviando: 1,
  enviado: 2,
  entregue: 3,
  lido: 4,
};

const CARIMBO: Record<AckStatus, string> = {
  enviado: 'enviado_em',
  entregue: 'entregue_em',
  lido: 'lido_em',
};

export async function POST(req: Request) {
  // O segredo viaja na URL porque a Evolution não deixa configurar cabeçalho no
  // webhook. Comparação em tempo constante: a URL chega em log de servidor e proxy,
  // então ela é o elo mais fraco e não convém facilitar ainda mais.
  const esperado = (process.env.WEBHOOK_SECRET ?? '').trim();
  if (esperado) {
    const recebido = new URL(req.url).searchParams.get('s') ?? '';
    if (!assinaturaConfere(recebido, esperado)) {
      return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: true, ignorado: 'corpo inválido' });
  }

  const evento = parseEventoEvolution(payload);
  const instancia = String((payload as Record<string, unknown>)?.instance ?? '').trim();

  // Guarda a mensagem da conversa (inclusive a nossa). É o que dá tempo real à tela de
  // Celular: o banco da Evolution grava em lotes e chega a ficar 40 minutos atrás do
  // que está acontecendo; o webhook chega no instante. Roda antes do resto e nunca
  // atrapalha — erro aqui é engolido, como tudo neste endpoint.
  const msg = mensagemDoUpsert(payload);
  if (msg && instancia) {
    try {
      const supabase = createServerClient();
      const { data: cx } = await supabase
        .from('connections')
        .select('id')
        .eq('instance_name', instancia)
        .maybeSingle();
      if (cx?.id) {
        await supabase.from('mensagens').upsert(
          {
            connection_id: cx.id as string,
            jid: msg.jid,
            message_id: msg.messageId,
            from_me: msg.fromMe,
            tipo: msg.tipo,
            texto: msg.texto,
            autor: msg.autor,
            autor_nome: msg.autorNome,
            enviada_em: new Date(msg.ts * 1000).toISOString(),
          },
          { onConflict: 'connection_id,message_id', ignoreDuplicates: true },
        );
      }
    } catch {
      // Um KPI defasado é melhor que o webhook parar.
    }
  }

  try {
    const supabase = createServerClient();

    if (evento.tipo === 'ack') {
      const { data: linha } = await supabase
        .from('campaign_recipients')
        .select('id,status')
        .eq('provider_message_id', evento.messageId)
        .maybeSingle();
      // Mensagem que não saiu daqui (conversa normal do número): nada a fazer.
      if (!linha) return NextResponse.json({ ok: true, ignorado: 'mensagem desconhecida' });

      const atual = ORDEM[linha.status as string] ?? 0;
      const novo = ORDEM[evento.status];
      // ACKs chegam fora de ordem com frequência (READ antes de DELIVERY_ACK, ou
      // repetido). Sem esta guarda, "lido" viraria "entregue" e a taxa de leitura
      // oscilaria para baixo sozinha.
      if (novo <= atual) return NextResponse.json({ ok: true, ignorado: 'ACK atrasado' });

      const agora = new Date().toISOString();
      const patch: Record<string, unknown> = { status: evento.status };
      patch[CARIMBO[evento.status]] = agora;
      // Um "lido" que chega sem o "entregue" anterior deixaria um buraco no funil:
      // preenche o carimbo que faltou com o mesmo instante.
      if (evento.status === 'lido') patch.entregue_em = patch.entregue_em ?? agora;

      await supabase.from('campaign_recipients').update(patch).eq('id', linha.id);
      return NextResponse.json({ ok: true });
    }

    if (evento.tipo === 'resposta') {
      const destino = normalizarDestino(evento.remoteJid);
      if (!destino) return NextResponse.json({ ok: true });
      // A resposta é creditada à ÚLTIMA mensagem que mandamos para aquele destino nos
      // últimos 7 dias. Não é exato (a pessoa pode estar respondendo outra coisa), mas
      // é a atribuição honesta possível sem ler o conteúdo — e a janela de 7 dias evita
      // creditar uma conversa de hoje a uma campanha do mês passado.
      const corte = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: linha } = await supabase
        .from('campaign_recipients')
        .select('id')
        .eq('destino', destino)
        .is('respondido_em', null)
        .gte('enviado_em', corte)
        .order('enviado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (linha) {
        await supabase
          .from('campaign_recipients')
          .update({ respondido_em: new Date().toISOString() })
          .eq('id', linha.id);
      }
      return NextResponse.json({ ok: true });
    }

    if (evento.tipo === 'conexao' && instancia) {
      await supabase
        .from('connections')
        .update({
          status: evento.estado,
          ...(evento.estado === 'conectada' ? { ultimo_erro: null } : {}),
        })
        .eq('instance_name', instancia);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, ignorado: evento.tipo });
  } catch (e) {
    // Ver a regra 1 no topo: erro nosso não vira erro para a Evolution.
    console.error('[webhook evolution] falhou:', e);
    return NextResponse.json({ ok: true, erro: 'processamento falhou' });
  }
}

/** A Evolution faz um GET de verificação ao configurar o webhook em algumas versões. */
export async function GET() {
  return NextResponse.json({ ok: true, servico: 'sendflow/webhooks/evolution' });
}
