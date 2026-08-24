export const CATEGORIAS = [
  { key: 'agentepro', label: 'AgentePRO' },
  { key: 'academy', label: 'Academy' },
  { key: 'p360', label: 'P360' },
  { key: 'avulsas', label: 'Avulsas' },
] as const;

export type CategoriaKey = (typeof CATEGORIAS)[number]['key'];

export const CATEGORIA_KEYS: CategoriaKey[] = CATEGORIAS.map((c) => c.key);

export function isCategoria(v: unknown): v is CategoriaKey {
  return typeof v === 'string' && (CATEGORIA_KEYS as string[]).includes(v);
}

export function categoriaLabel(key: string): string {
  return CATEGORIAS.find((c) => c.key === key)?.label ?? key;
}
