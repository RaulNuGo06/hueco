/** Fechas, horas y precios tal como se dicen en España, siempre en la zona horaria del negocio. */

export const hora = (iso: string | Date, zona: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { timeZone: zona, hour: '2-digit', minute: '2-digit' });

/** "martes 17 de noviembre", sin la coma que pone Intl, para que encaje en una frase. */
export const fechaLarga = (iso: string | Date, zona: string) =>
  new Date(iso)
    .toLocaleDateString('es-ES', {
      timeZone: zona,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    .replace(',', '');

export const precio = (centimos: number) =>
  (centimos / 100).toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: centimos % 100 ? 2 : 0,
  });

export const duracion = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;

/** AAAA-MM-DD de un instante en esa zona. */
export function fechaISO(instante: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
  return partes; // en-CA ya da AAAA-MM-DD
}

/** Los próximos días a partir de hoy en la zona del negocio, como AAAA-MM-DD. */
export function proximosDias(cuantos: number, zona: string, ahora = new Date()): string[] {
  const hoy = fechaISO(ahora, zona);
  const [a, m, d] = hoy.split('-').map(Number);
  return Array.from({ length: cuantos }, (_, i) =>
    new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10),
  );
}

/** Para la tira de días: "vie" y "20". La fecha es de calendario, así que se pinta en UTC. */
export function partesDelDia(fecha: string) {
  const dia = new Date(`${fecha}T12:00:00Z`);
  return {
    semana: dia.toLocaleDateString('es-ES', { timeZone: 'UTC', weekday: 'short' }).replace('.', ''),
    numero: dia.getUTCDate(),
    mes: dia.toLocaleDateString('es-ES', { timeZone: 'UTC', month: 'short' }).replace('.', ''),
  };
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export interface Franja<T> {
  huecos: T[];
  /** Hasta cuándo dura el último hueco de la franja. */
  fin: Date;
}

/**
 * Parte los huecos en franjas: si entre el final de un hueco y el siguiente pasan más de 45 minutos,
 * es que ahí se cierra (la comida en la jornada partida). Así la pantalla enseña el descanso en vez de esconderlo.
 */
export function agruparEnFranjas<T extends { inicio: string }>(
  huecos: T[],
  duracionMin: number,
): Franja<T>[] {
  const franjas: Franja<T>[] = [];
  const dur = duracionMin * 60_000;
  for (const hueco of huecos) {
    const inicio = new Date(hueco.inicio).getTime();
    const actual = franjas.at(-1);
    if (actual && inicio - actual.fin.getTime() <= 45 * 60_000) {
      actual.huecos.push(hueco);
      actual.fin = new Date(Math.max(actual.fin.getTime(), inicio + dur));
    } else {
      franjas.push({ huecos: [hueco], fin: new Date(inicio + dur) });
    }
  }
  return franjas;
}
