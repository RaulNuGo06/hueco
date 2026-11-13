import { TZDate } from '@date-fns/tz';

/** Un tramo del horario en hora local del negocio, como lo devuelve PostgreSQL: "09:00" o "09:00:00". */
export interface Tramo {
  inicio: string;
  fin: string;
}

export interface Intervalo {
  inicio: Date;
  fin: Date;
}

export interface AgendaProfesional {
  id: string;
  /** Los tramos de ese día de la semana. */
  tramos: Tramo[];
  /** Sus citas confirmadas ese día. */
  ocupado: Intervalo[];
}

export interface Hueco {
  inicio: Date;
  /** Quién puede atender a esa hora, en el orden de entrada. */
  profesionales: string[];
}

export interface PeticionHuecos {
  /** Día en el calendario del negocio, AAAA-MM-DD. */
  fecha: string;
  zonaHoraria: string;
  duracionMin: number;
  profesionales: AgendaProfesional[];
  ahora: Date;
  /** Minutos mínimos entre ahora y el inicio de una cita. */
  antelacionMin?: number;
  /** Cada cuántos minutos empieza un hueco, contando desde el inicio del tramo. */
  pasoMin?: number;
}

const MINUTO = 60_000;

/**
 * Los huecos libres de un día para un servicio.
 *
 * Los horarios están en hora local del negocio y las citas son instantes, así que cada tramo se
 * convierte a instantes con la zona horaria del negocio. Así un tramo de 9:00 a 14:00 es de 8:00 a 13:00 UTC
 * en invierno y de 7:00 a 12:00 UTC en verano, y los días de cambio de hora salen bien.
 */
export function calcularHuecos(p: PeticionHuecos): Hueco[] {
  const paso = (p.pasoMin ?? 15) * MINUTO;
  const duracion = p.duracionMin * MINUTO;
  const primeroPosible = p.ahora.getTime() + (p.antelacionMin ?? 0) * MINUTO;
  const porInstante = new Map<number, string[]>();

  for (const profesional of p.profesionales) {
    for (const tramo of profesional.tramos) {
      const inicioTramo = aInstante(p.fecha, tramo.inicio, p.zonaHoraria);
      const finTramo = aInstante(p.fecha, tramo.fin, p.zonaHoraria);

      for (let t = inicioTramo; t + duracion <= finTramo; t += paso) {
        if (t < primeroPosible) continue;
        const choca = profesional.ocupado.some(
          (o) => t < o.fin.getTime() && o.inicio.getTime() < t + duracion,
        );
        if (choca) continue;
        const quienes = porInstante.get(t) ?? [];
        if (!quienes.includes(profesional.id)) quienes.push(profesional.id);
        porInstante.set(t, quienes);
      }
    }
  }

  return [...porInstante.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, profesionales]) => ({ inicio: new Date(t), profesionales }));
}

/** El día de la semana ISO (1 = lunes … 7 = domingo) de una fecha AAAA-MM-DD. No depende de la zona horaria. */
export function diaDeLaSemana(fecha: string): number {
  const [a, m, d] = partes(fecha);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dia === 0 ? 7 : dia;
}

/** Desde las 0:00 de ese día hasta las 0:00 del siguiente, en la zona del negocio. */
export function limitesDelDia(fecha: string, zonaHoraria: string): Intervalo {
  const [a, m, d] = partes(fecha);
  return {
    inicio: new Date(new TZDate(a, m - 1, d, 0, 0, zonaHoraria).getTime()),
    fin: new Date(new TZDate(a, m - 1, d + 1, 0, 0, zonaHoraria).getTime()),
  };
}

/** La fecha AAAA-MM-DD de un instante en el calendario del negocio. */
export function fechaLocal(instante: Date, zonaHoraria: string): string {
  const local = new TZDate(instante.getTime(), zonaHoraria);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${local.getFullYear()}-${dos(local.getMonth() + 1)}-${dos(local.getDate())}`;
}

function aInstante(fecha: string, hora: string, zonaHoraria: string): number {
  const [a, m, d] = partes(fecha);
  const [h, min] = hora.split(':').map(Number);
  return new TZDate(a, m - 1, d, h, min, zonaHoraria).getTime();
}

function partes(fecha: string): [number, number, number] {
  const [a, m, d] = fecha.split('-').map(Number);
  return [a, m, d];
}
