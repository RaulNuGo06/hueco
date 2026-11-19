import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * La base de datos que se inyecta con @InjectDrizzle(). En producción es node-postgres;
 * en los tests e2e, PGlite (PostgreSQL en WebAssembly), que tiene la misma API de consultas.
 */
export type Database = NodePgDatabase;

/** Donde se puede consultar: la base de datos o una transacción abierta. */
export type Consultas = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** El código de PostgreSQL de un error, mirando también el error original que envuelve Drizzle. */
export function codigoPostgres(error: unknown): string | undefined {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const codigo = (e as { code?: unknown }).code;
    if (typeof codigo === 'string' && /^[0-9A-Z]{5}$/.test(codigo)) return codigo;
  }
  return undefined;
}

export const VIOLA_EXCLUSION = '23P01';
export const VIOLA_UNICIDAD = '23505';
