import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const instante = (nombre: string) => timestamp(nombre, { withTimezone: true, mode: 'date' });

export const usuarios = pgTable('usuarios', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  nombre: text().notNull(),
  hashContrasena: text('hash_contrasena').notNull(),
  creadoEn: instante('creado_en').notNull().defaultNow(),
});

export const negocios = pgTable('negocios', {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  nombre: text().notNull(),
  // Las horas de los horarios son de esta zona; las citas se guardan como instantes
  zonaHoraria: text('zona_horaria').notNull().default('Europe/Madrid'),
  duenoId: uuid('dueno_id')
    .notNull()
    .references(() => usuarios.id),
  creadoEn: instante('creado_en').notNull().defaultNow(),
});

export const servicios = pgTable(
  'servicios',
  {
    id: uuid().primaryKey().defaultRandom(),
    negocioId: uuid('negocio_id')
      .notNull()
      .references(() => negocios.id, { onDelete: 'cascade' }),
    nombre: text().notNull(),
    duracionMin: integer('duracion_min').notNull(),
    precioCentimos: integer('precio_centimos').notNull(),
    activo: boolean().notNull().default(true),
  },
  (t) => [
    index('servicios_negocio_idx').on(t.negocioId),
    check('servicios_duracion_valida', sql`${t.duracionMin} between 5 and 480 and ${t.duracionMin} % 5 = 0`),
    check('servicios_precio_valido', sql`${t.precioCentimos} >= 0`),
  ],
);

export const profesionales = pgTable(
  'profesionales',
  {
    id: uuid().primaryKey().defaultRandom(),
    negocioId: uuid('negocio_id')
      .notNull()
      .references(() => negocios.id, { onDelete: 'cascade' }),
    nombre: text().notNull(),
    activo: boolean().notNull().default(true),
  },
  (t) => [index('profesionales_negocio_idx').on(t.negocioId)],
);

/** Qué servicios hace cada profesional. */
export const profesionalServicios = pgTable(
  'profesional_servicios',
  {
    profesionalId: uuid('profesional_id')
      .notNull()
      .references(() => profesionales.id, { onDelete: 'cascade' }),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.profesionalId, t.servicioId] })],
);

/**
 * Horario semanal de cada profesional. Un día puede tener varios tramos (jornada partida).
 * dia: 1 = lunes … 7 = domingo (ISO 8601).
 */
export const horarios = pgTable(
  'horarios',
  {
    id: uuid().primaryKey().defaultRandom(),
    profesionalId: uuid('profesional_id')
      .notNull()
      .references(() => profesionales.id, { onDelete: 'cascade' }),
    dia: smallint().notNull(),
    inicio: time().notNull(),
    fin: time().notNull(),
  },
  (t) => [
    index('horarios_profesional_idx').on(t.profesionalId),
    check('horarios_dia_valido', sql`${t.dia} between 1 and 7`),
    check('horarios_tramo_valido', sql`${t.inicio} < ${t.fin}`),
  ],
);

export const estadoCita = pgEnum('estado_cita', ['CONFIRMADA', 'CANCELADA']);

/**
 * Las citas. Que un profesional no tenga dos citas a la vez no lo comprueba el código:
 * lo garantiza PostgreSQL con la restricción de exclusión `citas_sin_solapes`
 * (migración citas_sin_solapes), así que da igual cuántas reservas lleguen a la vez.
 */
export const citas = pgTable(
  'citas',
  {
    id: uuid().primaryKey().defaultRandom(),
    negocioId: uuid('negocio_id')
      .notNull()
      .references(() => negocios.id, { onDelete: 'cascade' }),
    profesionalId: uuid('profesional_id')
      .notNull()
      .references(() => profesionales.id),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id),
    inicio: instante('inicio').notNull(),
    fin: instante('fin').notNull(),
    clienteNombre: text('cliente_nombre').notNull(),
    clienteTelefono: text('cliente_telefono').notNull(),
    clienteEmail: text('cliente_email'),
    estado: estadoCita().notNull().default('CONFIRMADA'),
    // Para que el cliente consulte o cancele su cita sin cuenta: 128 bits aleatorios
    codigo: text().notNull().unique(),
    creadaEn: instante('creada_en').notNull().defaultNow(),
    canceladaEn: instante('cancelada_en'),
  },
  (t) => [
    index('citas_negocio_inicio_idx').on(t.negocioId, t.inicio),
    check('citas_intervalo_valido', sql`${t.inicio} < ${t.fin}`),
  ],
);

/** Sesiones del panel, para @nestjs/authentication. Se guarda el SHA-256 del token, nunca el token. */
export const sesiones = pgTable(
  'sesiones',
  {
    id: text().primaryKey(),
    userId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    createdAt: instante('creada_en').notNull(),
    expiresAt: instante('caduca_en').notNull(),
    lastActiveAt: instante('ultima_actividad').notNull(),
    mfa: text({ enum: ['pending', 'verified'] }),
    metadata: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index('sesiones_usuario_idx').on(t.userId), index('sesiones_caducidad_idx').on(t.expiresAt)],
);

export type Usuario = typeof usuarios.$inferSelect;
export type Negocio = typeof negocios.$inferSelect;
export type Servicio = typeof servicios.$inferSelect;
export type Profesional = typeof profesionales.$inferSelect;
export type Horario = typeof horarios.$inferSelect;
export type Cita = typeof citas.$inferSelect;
