import { NextResponse } from 'next/server';
import { motorLigado, origemDoMotor } from '@/lib/dispatch/motor';

export const dynamic = 'force-dynamic';

/**
 * O motor novo está ligado?
 *
 * Serve para a interface não oferecer o que não funciona. O campo "Enviar por" do
 * compositor grava `connection_id` na campanha, e isso a tira do n8n (que filtra por
 * connection_id nulo). Com o motor desligado, ninguém a envia: ela fica `agendada`
 * para sempre, sem erro e sem aviso. Foi o que derrubou um aviso de aula em 08/10.
 *
 * Não expõe segredo nenhum — só diz se a chave existe, nunca o valor.
 */
export function GET() {
  return NextResponse.json({ ligado: motorLigado(), origem: origemDoMotor() });
}
