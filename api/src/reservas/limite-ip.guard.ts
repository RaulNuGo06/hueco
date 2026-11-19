import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { lt, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import type { Database } from '../db/database.js';
import { limites as tablaLimites } from '../db/schema.js';
import { ipDelCliente, LIMITES, type Limites } from './limites.js';

/**
 * Cuántas reservas se intentan desde cada IP, en PostgreSQL para que valga con varias instancias y tras un reinicio.
 * Contar es una sola sentencia (insertar o sumar uno), así que dos peticiones a la vez nunca leen la misma cuenta.
 * Cuenta todos los intentos, también los que fallan: lo que frena es el ritmo, no el resultado.
 */
@Injectable()
export class LimiteIpGuard implements CanActivate {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(LIMITES) private readonly limites: Limites,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const http = contexto.switchToHttp();
    const req = http.getRequest<Request>();
    const { max, ventanaMin } = this.limites.reservasPorIp;

    // La IP no se guarda en claro
    const clave = createHash('sha256')
      .update(`reservar:${ipDelCliente(req)}`)
      .digest('base64url');
    const ahora = new Date();
    const finVentana = new Date(ahora.getTime() + ventanaMin * 60_000);
    const caducada = sql`${tablaLimites.ventanaFin} <= ${ahora}`;

    const [fila] = await this.db
      .insert(tablaLimites)
      .values({ clave, ventanaFin: finVentana, cuenta: 1 })
      .onConflictDoUpdate({
        target: tablaLimites.clave,
        set: {
          cuenta: sql`case when ${caducada} then 1 else ${tablaLimites.cuenta} + 1 end`,
          ventanaFin: sql`case when ${caducada} then excluded.ventana_fin else ${tablaLimites.ventanaFin} end`,
        },
      })
      .returning({ cuenta: tablaLimites.cuenta, ventanaFin: tablaLimites.ventanaFin });

    // Al abrir una ventana nueva, de paso, se borran las que ya han caducado
    if (fila.cuenta === 1) await this.db.delete(tablaLimites).where(lt(tablaLimites.ventanaFin, ahora));

    if (fila.cuenta <= max) return true;

    const segundos = Math.max(1, Math.ceil((fila.ventanaFin.getTime() - ahora.getTime()) / 1000));
    http.getResponse<Response>().setHeader('Retry-After', String(segundos));
    throw new HttpException(
      `Demasiadas reservas seguidas desde esta conexión. Prueba otra vez dentro de ${Math.ceil(segundos / 60)} min.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
