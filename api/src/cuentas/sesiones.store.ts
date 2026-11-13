import { Injectable } from '@nestjs/common';
import { AuthenticationStorage, type SessionRecord, type SessionStore } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, lt, lte } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { sesiones } from '../db/schema.js';

/**
 * Las sesiones del panel en PostgreSQL, para que sobrevivan a un reinicio y las compartan varias instancias.
 * Lo que decide si algo vale una sola vez es una única sentencia condicional, nunca leer y luego escribir.
 */
@Injectable()
export class SesionesStore implements SessionStore {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    almacen: AuthenticationStorage,
  ) {
    almacen.registerSource({ sessions: this });
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const [fila] = await this.db.select().from(sesiones).where(eq(sesiones.id, id));
    return fila && sinNulos(fila);
  }

  async createSession(sesion: SessionRecord): Promise<void> {
    await this.db.insert(sesiones).values(sesion);
    // De paso, se borran las caducadas
    await this.db.delete(sesiones).where(lte(sesiones.expiresAt, sesion.createdAt));
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    // Condicional: una sesión que se acaba de cerrar no vuelve a aparecer
    await this.db
      .update(sesiones)
      .set({ lastActiveAt })
      .where(and(eq(sesiones.id, id), lt(sesiones.lastActiveAt, lastActiveAt)));
  }

  async deleteSession(id: string): Promise<boolean> {
    const borradas = await this.db.delete(sesiones).where(eq(sesiones.id, id)).returning({ id: sesiones.id });
    return borradas.length > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const filas = await this.db.select().from(sesiones).where(eq(sesiones.userId, userId));
    return filas.map(sinNulos);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(sesiones).where(eq(sesiones.userId, userId));
  }
}

type SinNulos<T> = { [K in keyof T]: Exclude<T[K], null> };

function sinNulos<T extends object>(fila: T): SinNulos<T> {
  return Object.fromEntries(Object.entries(fila).filter(([, valor]) => valor !== null)) as SinNulos<T>;
}
