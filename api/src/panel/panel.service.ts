import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticationContext } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { codigoPostgres, VIOLA_UNICIDAD, type Database } from '../db/database.js';
import {
  citas,
  horarios,
  negocios,
  profesionalServicios,
  profesionales,
  servicios,
  type Negocio,
} from '../db/schema.js';
import { limitesDelDia } from '../reservas/disponibilidad.js';

export interface DatosServicio {
  nombre: string;
  duracionMin: number;
  precioCentimos: number;
  activo?: boolean;
}

export interface Tramo {
  dia: number;
  inicio: string;
  fin: string;
}

/** "Peluquería Ñandú" pasa a ser "peluqueria-nandu". */
export function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Todo lo del panel pasa por negocioPropio(): un negocio de otro dueño responde 404, igual que uno que no existe,
 * para no confirmar qué negocios hay.
 */
@Injectable()
export class PanelService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly contexto: AuthenticationContext,
  ) {}

  misNegocios() {
    const { id } = this.contexto.requireUser();
    return this.db
      .select({ slug: negocios.slug, nombre: negocios.nombre, zonaHoraria: negocios.zonaHoraria })
      .from(negocios)
      .where(eq(negocios.duenoId, id))
      .orderBy(asc(negocios.nombre));
  }

  async crearNegocio(datos: { nombre: string; slug?: string; zonaHoraria: string }) {
    const { id } = this.contexto.requireUser();
    const slug = datos.slug ?? aSlug(datos.nombre);
    try {
      const [negocio] = await this.db
        .insert(negocios)
        .values({ nombre: datos.nombre.trim(), slug, zonaHoraria: datos.zonaHoraria, duenoId: id })
        .returning({ slug: negocios.slug, nombre: negocios.nombre, zonaHoraria: negocios.zonaHoraria });
      return negocio;
    } catch (error) {
      if (codigoPostgres(error) === VIOLA_UNICIDAD)
        throw new ConflictException(`El enlace "${slug}" ya está cogido`);
      throw error;
    }
  }

  async agenda(slug: string, fecha: string) {
    const negocio = await this.negocioPropio(slug);
    const dia = limitesDelDia(fecha, negocio.zonaHoraria);
    return this.db
      .select({
        id: citas.id,
        estado: citas.estado,
        inicio: citas.inicio,
        fin: citas.fin,
        clienteNombre: citas.clienteNombre,
        clienteTelefono: citas.clienteTelefono,
        clienteEmail: citas.clienteEmail,
        servicio: servicios.nombre,
        profesional: { id: profesionales.id, nombre: profesionales.nombre },
      })
      .from(citas)
      .innerJoin(servicios, eq(servicios.id, citas.servicioId))
      .innerJoin(profesionales, eq(profesionales.id, citas.profesionalId))
      .where(and(eq(citas.negocioId, negocio.id), gte(citas.inicio, dia.inicio), lt(citas.inicio, dia.fin)))
      .orderBy(asc(citas.inicio), asc(profesionales.nombre));
  }

  async cancelarCita(slug: string, citaId: string) {
    const negocio = await this.negocioPropio(slug);
    const [cita] = await this.db
      .update(citas)
      .set({ estado: 'CANCELADA', canceladaEn: new Date() })
      .where(and(eq(citas.id, citaId), eq(citas.negocioId, negocio.id), eq(citas.estado, 'CONFIRMADA')))
      .returning({ id: citas.id, estado: citas.estado });
    if (!cita) throw new NotFoundException('No hay una cita confirmada con ese id');
    return cita;
  }

  async servicios(slug: string) {
    const negocio = await this.negocioPropio(slug);
    return this.db
      .select({
        id: servicios.id,
        nombre: servicios.nombre,
        duracionMin: servicios.duracionMin,
        precioCentimos: servicios.precioCentimos,
        activo: servicios.activo,
      })
      .from(servicios)
      .where(eq(servicios.negocioId, negocio.id))
      .orderBy(asc(servicios.nombre));
  }

  async crearServicio(slug: string, datos: DatosServicio) {
    const negocio = await this.negocioPropio(slug);
    const [servicio] = await this.db
      .insert(servicios)
      .values({ ...datos, negocioId: negocio.id })
      .returning();
    return servicio;
  }

  async editarServicio(slug: string, servicioId: string, cambios: Partial<DatosServicio>) {
    const negocio = await this.negocioPropio(slug);
    const [servicio] = await this.db
      .update(servicios)
      .set(cambios)
      .where(and(eq(servicios.id, servicioId), eq(servicios.negocioId, negocio.id)))
      .returning();
    if (!servicio) throw new NotFoundException('No existe ese servicio');
    return servicio;
  }

  async profesionales(slug: string) {
    const negocio = await this.negocioPropio(slug);
    const lista = await this.db
      .select({ id: profesionales.id, nombre: profesionales.nombre, activo: profesionales.activo })
      .from(profesionales)
      .where(eq(profesionales.negocioId, negocio.id))
      .orderBy(asc(profesionales.nombre));
    if (lista.length === 0) return [];

    const ids = lista.map((p) => p.id);
    const [asignados, tramos] = await Promise.all([
      this.db.select().from(profesionalServicios).where(inArray(profesionalServicios.profesionalId, ids)),
      this.db
        .select()
        .from(horarios)
        .where(inArray(horarios.profesionalId, ids))
        .orderBy(asc(horarios.dia), asc(horarios.inicio)),
    ]);

    return lista.map((p) => ({
      ...p,
      servicios: asignados.filter((a) => a.profesionalId === p.id).map((a) => a.servicioId),
      horario: tramos
        .filter((t) => t.profesionalId === p.id)
        .map((t) => ({ dia: t.dia, inicio: t.inicio.slice(0, 5), fin: t.fin.slice(0, 5) })),
    }));
  }

  async crearProfesional(slug: string, datos: { nombre: string; servicios: string[] }) {
    const negocio = await this.negocioPropio(slug);
    await this.comprobarServiciosDelNegocio(negocio.id, datos.servicios);
    return this.db.transaction(async (tx) => {
      const [profesional] = await tx
        .insert(profesionales)
        .values({ nombre: datos.nombre.trim(), negocioId: negocio.id })
        .returning({ id: profesionales.id, nombre: profesionales.nombre });
      if (datos.servicios.length > 0) {
        await tx
          .insert(profesionalServicios)
          .values(datos.servicios.map((servicioId) => ({ profesionalId: profesional.id, servicioId })));
      }
      return { ...profesional, servicios: datos.servicios, horario: [] };
    });
  }

  /** Sustituye el horario semanal entero. En una transacción: nadie ve un horario a medias. */
  async ponerHorario(slug: string, profesionalId: string, tramos: Tramo[]) {
    const negocio = await this.negocioPropio(slug);
    const [profesional] = await this.db
      .select({ id: profesionales.id })
      .from(profesionales)
      .where(and(eq(profesionales.id, profesionalId), eq(profesionales.negocioId, negocio.id)));
    if (!profesional) throw new NotFoundException('No existe ese profesional');

    await this.db.transaction(async (tx) => {
      await tx.delete(horarios).where(eq(horarios.profesionalId, profesionalId));
      if (tramos.length > 0) {
        await tx.insert(horarios).values(tramos.map((t) => ({ ...t, profesionalId })));
      }
    });
    return tramos;
  }

  private async negocioPropio(slug: string): Promise<Negocio> {
    const { id } = this.contexto.requireUser();
    const [negocio] = await this.db
      .select()
      .from(negocios)
      .where(and(eq(negocios.slug, slug), eq(negocios.duenoId, id)));
    if (!negocio) throw new NotFoundException('No existe ese negocio');
    return negocio;
  }

  private async comprobarServiciosDelNegocio(negocioId: string, ids: string[]) {
    if (ids.length === 0) return;
    const encontrados = await this.db
      .select({ id: servicios.id })
      .from(servicios)
      .where(and(eq(servicios.negocioId, negocioId), inArray(servicios.id, ids)));
    if (encontrados.length !== new Set(ids).size)
      throw new NotFoundException('Algún servicio no es de este negocio');
  }
}
