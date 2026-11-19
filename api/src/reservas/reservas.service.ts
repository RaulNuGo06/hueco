import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, count, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { codigoPostgres, VIOLA_EXCLUSION, type Consultas, type Database } from '../db/database.js';
import {
  citas,
  horarios,
  negocios,
  profesionalServicios,
  profesionales,
  servicios,
  type Negocio,
} from '../db/schema.js';
import { calcularHuecos, diaDeLaSemana, fechaLocal, limitesDelDia, type Hueco } from './disponibilidad.js';
import { LIMITES, telefonoComparable, type Limites } from './limites.js';

/** Minutos mínimos entre que se reserva y empieza la cita. */
export const ANTELACION_MIN = 60;
/** Hasta cuántos días por delante se puede reservar. */
export const DIAS_RESERVABLES = 60;

export interface DatosReserva {
  servicioId: string;
  profesionalId?: string;
  inicio: Date;
  cliente: { nombre: string; telefono: string; email?: string };
}

@Injectable()
export class ReservasService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(LIMITES) private readonly limites: Limites,
  ) {}

  async negocio(slug: string): Promise<Negocio> {
    const [negocio] = await this.db.select().from(negocios).where(eq(negocios.slug, slug));
    if (!negocio) throw new NotFoundException('No existe ese negocio');
    return negocio;
  }

  /** Lo que ve el cliente al abrir el enlace del negocio. */
  async ficha(slug: string) {
    const negocio = await this.negocio(slug);
    const listaServicios = await this.db
      .select({
        id: servicios.id,
        nombre: servicios.nombre,
        duracionMin: servicios.duracionMin,
        precioCentimos: servicios.precioCentimos,
      })
      .from(servicios)
      .where(and(eq(servicios.negocioId, negocio.id), eq(servicios.activo, true)))
      .orderBy(asc(servicios.nombre));

    const filas = await this.db
      .select({
        id: profesionales.id,
        nombre: profesionales.nombre,
        servicioId: profesionalServicios.servicioId,
      })
      .from(profesionales)
      .innerJoin(profesionalServicios, eq(profesionalServicios.profesionalId, profesionales.id))
      .where(and(eq(profesionales.negocioId, negocio.id), eq(profesionales.activo, true)))
      .orderBy(asc(profesionales.nombre));

    const porId = new Map<string, { id: string; nombre: string; servicios: string[] }>();
    for (const fila of filas) {
      const p = porId.get(fila.id) ?? { id: fila.id, nombre: fila.nombre, servicios: [] };
      p.servicios.push(fila.servicioId);
      porId.set(fila.id, p);
    }

    return {
      slug: negocio.slug,
      nombre: negocio.nombre,
      zonaHoraria: negocio.zonaHoraria,
      servicios: listaServicios,
      profesionales: [...porId.values()],
    };
  }

  /** Los huecos libres de un día para un servicio, con quién puede atender en cada uno. */
  async huecos(slug: string, consulta: { servicioId: string; fecha: string; profesionalId?: string }) {
    const negocio = await this.negocio(slug);
    const servicio = await this.servicioActivo(negocio.id, consulta.servicioId);
    this.comprobarFechaReservable(consulta.fecha, negocio.zonaHoraria);

    const huecos = await this.calcular(
      negocio,
      servicio.duracionMin,
      consulta.servicioId,
      consulta.fecha,
      consulta.profesionalId,
    );
    return huecos.map((h) => ({ inicio: h.inicio.toISOString(), profesionales: h.profesionales }));
  }

  /**
   * Reserva una cita. Se comprueba que el hueco está libre con el cálculo de huecos, pero quien decide de verdad
   * es la restricción de exclusión de PostgreSQL: si dos personas reservan el mismo hueco a la vez,
   * la segunda inserción falla con 23P01 y se prueba con el siguiente profesional libre a esa hora.
   *
   * Un mismo teléfono no puede tener más de `citasPendientesPorTelefono` citas por venir en el negocio. Para que dos
   * reservas a la vez con el mismo teléfono no cuenten las dos "2 de 3", todo va en una transacción que empieza
   * cogiendo un bloqueo de PostgreSQL para ese negocio y teléfono: la segunda espera a que la primera termine.
   */
  async reservar(slug: string, datos: DatosReserva) {
    const negocio = await this.negocio(slug);
    const servicio = await this.servicioActivo(negocio.id, datos.servicioId);
    const fecha = fechaLocal(datos.inicio, negocio.zonaHoraria);
    this.comprobarFechaReservable(fecha, negocio.zonaHoraria);
    const telefono = telefonoComparable(datos.cliente.telefono);

    const codigo = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`reserva:${negocio.id}:${telefono}`}, 0))`,
      );
      await this.comprobarCitasPendientes(tx, negocio.id, telefono);

      const huecos = await this.calcular(
        negocio,
        servicio.duracionMin,
        servicio.id,
        fecha,
        datos.profesionalId,
        tx,
      );
      const hueco = huecos.find((h) => h.inicio.getTime() === datos.inicio.getTime());
      if (!hueco) throw new ConflictException('Ese hueco ya no está libre');

      const fin = new Date(datos.inicio.getTime() + servicio.duracionMin * 60_000);
      for (const profesionalId of hueco.profesionales) {
        try {
          // En un punto de guardado: si choca, se deshace solo esta inserción y la transacción sigue viva
          const [cita] = await tx.transaction((punto) =>
            punto
              .insert(citas)
              .values({
                negocioId: negocio.id,
                profesionalId,
                servicioId: servicio.id,
                inicio: datos.inicio,
                fin,
                clienteNombre: datos.cliente.nombre.trim(),
                clienteTelefono: datos.cliente.telefono.trim(),
                clienteEmail: datos.cliente.email?.trim() || null,
                codigo: randomBytes(16).toString('base64url'),
              })
              .returning({ codigo: citas.codigo }),
          );
          return cita.codigo;
        } catch (error) {
          // Otra reserva se ha llevado a este profesional justo ahora: se prueba con el siguiente
          if (codigoPostgres(error) === VIOLA_EXCLUSION) continue;
          throw error;
        }
      }
      throw new ConflictException('Ese hueco ya no está libre');
    });

    return this.consultar(codigo);
  }

  private async comprobarCitasPendientes(db: Consultas, negocioId: string, telefono: string) {
    const maximo = this.limites.citasPendientesPorTelefono;
    const [{ pendientes }] = await db
      .select({ pendientes: count() })
      .from(citas)
      .where(
        and(
          eq(citas.negocioId, negocioId),
          eq(citas.estado, 'CONFIRMADA'),
          gte(citas.inicio, new Date()),
          // Lo mismo que telefonoComparable(): los nueve últimos dígitos
          sql`right(regexp_replace(${citas.clienteTelefono}, '[^0-9]', '', 'g'), 9) = ${telefono}`,
        ),
      );
    if (pendientes >= maximo) {
      throw new UnprocessableEntityException(
        `Ya tienes ${pendientes} citas pendientes en este negocio con ese teléfono. ` +
          'Cancela alguna desde su enlace para pedir otra.',
      );
    }
  }

  /** La cita, para el enlace que recibe el cliente. */
  async consultar(codigo: string) {
    const [cita] = await this.db
      .select({
        codigo: citas.codigo,
        estado: citas.estado,
        inicio: citas.inicio,
        fin: citas.fin,
        clienteNombre: citas.clienteNombre,
        servicio: servicios.nombre,
        precioCentimos: servicios.precioCentimos,
        profesional: profesionales.nombre,
        negocio: { slug: negocios.slug, nombre: negocios.nombre, zonaHoraria: negocios.zonaHoraria },
      })
      .from(citas)
      .innerJoin(servicios, eq(servicios.id, citas.servicioId))
      .innerJoin(profesionales, eq(profesionales.id, citas.profesionalId))
      .innerJoin(negocios, eq(negocios.id, citas.negocioId))
      .where(eq(citas.codigo, codigo));
    if (!cita) throw new NotFoundException('No existe esa cita');
    return cita;
  }

  /** El cliente cancela desde su enlace. Una sola sentencia: dos cancelaciones a la vez no se pisan. */
  async cancelar(codigo: string) {
    const canceladas = await this.db
      .update(citas)
      .set({ estado: 'CANCELADA', canceladaEn: new Date() })
      .where(and(eq(citas.codigo, codigo), eq(citas.estado, 'CONFIRMADA'), gte(citas.inicio, new Date())))
      .returning({ codigo: citas.codigo });

    if (canceladas.length === 0) {
      const cita = await this.consultar(codigo); // 404 si no existe
      throw new ConflictException(
        cita.estado === 'CANCELADA'
          ? 'La cita ya estaba cancelada'
          : 'La cita ya ha pasado y no se puede cancelar',
      );
    }
    return this.consultar(codigo);
  }

  private async calcular(
    negocio: Negocio,
    duracionMin: number,
    servicioId: string,
    fecha: string,
    profesionalId?: string,
    db: Consultas = this.db,
  ): Promise<Hueco[]> {
    const candidatos = await db
      .select({ id: profesionales.id })
      .from(profesionales)
      .innerJoin(profesionalServicios, eq(profesionalServicios.profesionalId, profesionales.id))
      .where(
        and(
          eq(profesionales.negocioId, negocio.id),
          eq(profesionales.activo, true),
          eq(profesionalServicios.servicioId, servicioId),
          profesionalId ? eq(profesionales.id, profesionalId) : undefined,
        ),
      )
      .orderBy(asc(profesionales.nombre));
    if (candidatos.length === 0) return [];

    const ids = candidatos.map((c) => c.id);
    const dia = limitesDelDia(fecha, negocio.zonaHoraria);
    const [tramos, ocupadas] = await Promise.all([
      db
        .select()
        .from(horarios)
        .where(and(inArray(horarios.profesionalId, ids), eq(horarios.dia, diaDeLaSemana(fecha))))
        .orderBy(asc(horarios.inicio)),
      db
        .select({ profesionalId: citas.profesionalId, inicio: citas.inicio, fin: citas.fin })
        .from(citas)
        .where(
          and(
            inArray(citas.profesionalId, ids),
            eq(citas.estado, 'CONFIRMADA'),
            lt(citas.inicio, dia.fin),
            gte(citas.fin, dia.inicio),
          ),
        ),
    ]);

    return calcularHuecos({
      fecha,
      zonaHoraria: negocio.zonaHoraria,
      duracionMin,
      ahora: new Date(),
      antelacionMin: ANTELACION_MIN,
      profesionales: ids.map((id) => ({
        id,
        tramos: tramos.filter((t) => t.profesionalId === id),
        ocupado: ocupadas.filter((o) => o.profesionalId === id),
      })),
    });
  }

  private async servicioActivo(negocioId: string, servicioId: string) {
    const [servicio] = await this.db
      .select()
      .from(servicios)
      .where(
        and(eq(servicios.id, servicioId), eq(servicios.negocioId, negocioId), eq(servicios.activo, true)),
      );
    if (!servicio) throw new NotFoundException('Ese servicio no existe en este negocio');
    return servicio;
  }

  private comprobarFechaReservable(fecha: string, zonaHoraria: string) {
    const hoy = fechaLocal(new Date(), zonaHoraria);
    const limite = fechaLocal(new Date(Date.now() + DIAS_RESERVABLES * 86_400_000), zonaHoraria);
    // Las fechas AAAA-MM-DD se pueden comparar como texto
    if (fecha < hoy || fecha > limite) {
      throw new UnprocessableEntityException(
        `Solo se puede reservar desde hoy hasta dentro de ${DIAS_RESERVABLES} días`,
      );
    }
  }
}
