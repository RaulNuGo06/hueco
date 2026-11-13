import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

export const CARPETA_MIGRACIONES = fileURLToPath(new URL('../../drizzle', import.meta.url));

export const urlBaseDeDatos = () => process.env.DATABASE_URL ?? 'postgres://hueco:hueco@localhost:5432/hueco';

/** Aplica las migraciones que falten. Se llama al arrancar, antes de crear la aplicación. */
export async function migrar(url = urlBaseDeDatos()) {
  const db = drizzle(url);
  try {
    await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
  } finally {
    await db.$client.end();
  }
}
