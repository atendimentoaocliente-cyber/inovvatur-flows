import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Compara segredos em tempo constante.
 *
 * `a === b` vaza informação pelo TEMPO: a comparação para no primeiro byte diferente,
 * então dá para descobrir o valor byte a byte medindo a duração. Usado na conferência
 * do segredo do webhook da Evolution.
 */
export function assinaturaConfere(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // `timingSafeEqual` exige o mesmo tamanho; tamanhos diferentes já são "não confere".
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Token opaco e imprevisível (32 bytes = 43 caracteres em base64url). */
export function tokenAleatorio(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
