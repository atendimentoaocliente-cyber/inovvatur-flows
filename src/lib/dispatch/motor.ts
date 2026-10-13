/**
 * O interruptor do motor de envio novo (Evolution).
 *
 * Fica no código, e não só numa variável de ambiente, para ligar e desligar ser um
 * commit: revisável, com data e motivo no histórico, e reversível por `git revert`.
 * Mexer num campo escondido no painel da hospedagem não deixa rastro nenhum.
 *
 * A variável de ambiente continua existindo e GANHA do código, porque ela é o
 * desligamento de emergência: some na hora, sem esperar deploy. Se o motor começar a
 * fazer besteira num domingo, `MOTOR_WHATSAPP=0` corta na mesma hora.
 *
 * COMO O MOTOR É ACIONADO: por um Schedule Trigger do n8n chamando
 * POST /api/dispatch/tick a cada minuto — NÃO por cron da Vercel. O plano Hobby
 * recusa qualquer cron mais frequente que uma vez por dia, e a recusa não é um aviso:
 * ela FAZ O DEPLOY FALHAR. Um `vercel.json` com `* * * * *` travou três commits sem
 * que nada no painel do projeto indicasse o motivo.
 *
 * ⚠️ Ligar isto é um ato deliberado. Com o motor ativo, toda campanha que tiver um
 * número escolhido passa a ser dele — e o n8n deixa de vê-las (o cron de lá filtra
 * `connection_id=is.null`). Campanha sem número continua no n8n, como sempre.
 */
const LIGADO_NO_CODIGO = false;

export function motorLigado(): boolean {
  const v = (process.env.MOTOR_WHATSAPP ?? '').trim().toLowerCase();
  // Vazio = o código manda. Qualquer valor explícito sobrepõe, inclusive para desligar.
  if (v === '') return LIGADO_NO_CODIGO;
  return v === '1' || v === 'true' || v === 'on';
}

/** De onde veio a decisão — para a tela explicar, em vez de só dizer "desligado". */
export function origemDoMotor(): 'codigo' | 'ambiente' {
  return (process.env.MOTOR_WHATSAPP ?? '').trim() === '' ? 'codigo' : 'ambiente';
}
