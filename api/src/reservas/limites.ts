import type { Request } from 'express';

/** Los límites contra quien reserva sin intención de venir o llena la agenda con un script. */
export interface Limites {
  /** Citas confirmadas que todavía no han pasado que puede tener un mismo teléfono en un negocio. */
  citasPendientesPorTelefono: number;
  /** Intentos de reserva desde una misma IP en cada ventana de tiempo, en todos los negocios. */
  reservasPorIp: { max: number; ventanaMin: number };
}

export const LIMITES = Symbol('LIMITES');

export const LIMITES_POR_DEFECTO: Limites = {
  citasPendientesPorTelefono: 3,
  reservasPorIp: { max: 20, ventanaMin: 60 },
};

/**
 * Los nueve últimos dígitos del teléfono: así "+34 600 123 456", "0034600123456" y "600123456" son el mismo.
 * En SQL se calcula igual en `telefonoComparable`.
 */
export function telefonoComparable(telefono: string): string {
  return telefono.replace(/[^0-9]/g, '').slice(-9);
}

/**
 * La IP del cliente. Detrás de un proxy que pone una cabecera propia y fiable (Cloudflare pone `True-Client-IP`),
 * se lee esa (CABECERA_IP_CLIENTE). Si no, la que calcula Express a partir de X-Forwarded-For, fiándose solo de
 * los proxies que diga TRUST_PROXY (ver `configurar`).
 */
export function ipDelCliente(req: Request): string {
  const cabecera = process.env.CABECERA_IP_CLIENTE;
  const valor = cabecera ? req.headers[cabecera.toLowerCase()] : undefined;
  if (typeof valor === 'string' && valor.trim()) return valor.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'desconocida';
}
