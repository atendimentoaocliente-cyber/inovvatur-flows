import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/http';
import { enviarMensagem, type TipoMensagem } from '@/lib/whatsapp/evolution';
import { abrirConexao, respostaDeErro } from '@/lib/whatsapp/celular-servidor';

export const dynamic = 'force-dynamic';

const TIPOS: TipoMensagem[] = ['texto', 'imagem', 'video', 'pdf'];

/**
 * Manda uma mensagem avulsa de dentro da conversa — o que a tela de Celular ainda não
 * fazia (ela só lia).
 *
 * Isto NÃO é campanha: não passa pela fila, não conta KPI e não tem intervalo
 * anti-bloqueio, porque é uma pessoa digitando para um destino de cada vez. Campanha
 * continua nascendo no compositor.
 *
 * Usa a mesma conexão que a tela está lendo, então a mensagem sai do número que o
 * usuário está vendo — e não de outro qualquer.
 */
export async function POST(req: Request) {
  const parsed = await readJson<{
    conexao?: string;
    jid?: string;
    texto?: string;
    tipo?: string;
    midia_url?: string;
    mencionar_todos?: boolean;
  }>(req);
  if (!parsed.ok) return parsed.res;
  const { conexao, jid, midia_url } = parsed.data;

  const texto = String(parsed.data.texto ?? '').trim();
  const tipo = (TIPOS as string[]).includes(String(parsed.data.tipo))
    ? (parsed.data.tipo as TipoMensagem)
    : 'texto';

  if (!jid) return NextResponse.json({ error: 'Falta a conversa de destino.' }, { status: 400 });
  if (tipo === 'texto' && !texto) {
    return NextResponse.json({ error: 'Escreva a mensagem.' }, { status: 400 });
  }
  if (tipo !== 'texto' && !midia_url) {
    return NextResponse.json({ error: 'Falta o arquivo para este tipo.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const aberta = await abrirConexao(supabase, conexao ?? null);
  if ('res' in aberta) return aberta.res;

  try {
    const r = await enviarMensagem(aberta.conexao.instance_name, {
      destino: jid,
      tipo,
      texto,
      midiaUrl: midia_url ?? null,
      // Menção a todos fica de fora de propósito: numa mensagem manual, marcar o grupo
      // inteiro sem querer é fácil e não tem desfazer. Campanha tem esse controle.
      mencionarTodos: false,
    });
    return NextResponse.json({ ok: true, messageId: r.messageId });
  } catch (e) {
    return respostaDeErro(e);
  }
}

