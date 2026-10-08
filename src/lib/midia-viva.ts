/**
 * A mídia da campanha ainda existe?
 *
 * Em 08/10 duas campanhas da Academy foram marcadas como "enviada · 3 sucessos" e não
 * chegaram em grupo nenhum: o arquivo tinha sido apagado do bucket depois do
 * agendamento, o Z-API buscou a imagem, recebeu erro e o fluxo seguiu marcando êxito.
 * O painel dizia 100% de sucesso enquanto nada era entregue.
 *
 * Checar no agendamento não resolveria — o arquivo existia naquele momento. Por isso a
 * verificação é na LEITURA do painel: toda vez que a lista é aberta, o que ainda vai
 * sair é conferido.
 */
export interface MidiaStatus {
  /** Campanhas (por id) cujo arquivo não responde. */
  quebradas: string[];
}

/** HEAD numa URL, com teto de tempo curto: isto roda no caminho de uma página. */
async function existe(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    // Timeout ou rede fora não é prova de que o arquivo sumiu. Na dúvida, não acusa:
    // um alarme falso em campanha boa custa mais confiança do que vale.
    return true;
  }
}

/**
 * Confere a mídia das campanhas que ainda vão sair. Só essas importam — para as já
 * enviadas o estrago, se houve, já aconteceu.
 */
export async function conferirMidias(
  campanhas: { id: string; status: string; midia_url: string | null }[],
): Promise<MidiaStatus> {
  const aVerificar = campanhas.filter(
    (c) => c.midia_url && (c.status === 'agendada' || c.status === 'rascunho'),
  );
  if (!aVerificar.length) return { quebradas: [] };

  const resultados = await Promise.all(
    aVerificar.map(async (c) => ({ id: c.id, ok: await existe(c.midia_url as string) })),
  );
  return { quebradas: resultados.filter((r) => !r.ok).map((r) => r.id) };
}
