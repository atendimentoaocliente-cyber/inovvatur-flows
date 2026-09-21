/**
 * A URL pública do app.
 *
 * Importa porque é ela que vai no webhook registrado na Evolution: se estiver errada,
 * os eventos de entrega e leitura chegam num endereço que não existe e os status das
 * campanhas ficam parados no "enviado".
 *
 * Ordem de preferência:
 *   1. APP_URL — o domínio definitivo, definido à mão. Sempre o certo.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — o domínio de produção do projeto na Vercel.
 *   3. VERCEL_URL — a URL desta implantação. Rede de segurança, mas muda a cada deploy:
 *      os webhooks registrados antes deixam de chegar.
 */
export function urlPublica(): string {
  const explicita = (process.env.APP_URL ?? '').trim();
  if (explicita) return explicita.replace(/\/+$/, '');

  const producao = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim();
  if (producao) return `https://${producao.replace(/\/+$/, '')}`;

  const deploy = (process.env.VERCEL_URL ?? '').trim();
  if (deploy) return `https://${deploy.replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}

/** APP_URL está definida? Sem ela, o webhook aponta para uma URL que muda a cada deploy. */
export function urlPublicaEstavel(): boolean {
  return Boolean(
    (process.env.APP_URL ?? '').trim() || (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim(),
  );
}
