/**
 * Datos de demostración: la Barbería El Tupé (inventada), su dueña y unas cuantas citas en los próximos días.
 * Se puede lanzar varias veces: borra la barbería de demostración y la vuelve a crear.
 *
 *   npm run semilla
 *
 * Cuenta del panel: demo@hueco.dev / demo-hueco-2026
 */
import { PasswordHasher } from '@nestjs/authentication';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { calcularHuecos, diaDeLaSemana, fechaLocal } from '../reservas/disponibilidad.js';
import { migrar, urlBaseDeDatos } from './migrar.js';
import {
  citas,
  horarios,
  negocios,
  profesionalServicios,
  profesionales,
  servicios,
  usuarios,
} from './schema.js';
import { randomBytes } from 'node:crypto';

const EMAIL = 'demo@hueco.dev';
const CONTRASENA = 'demo-hueco-2026';
const SLUG = 'barberia-el-tupe';
const ZONA = 'Europe/Madrid';

await migrar();
const db = drizzle(urlBaseDeDatos());

try {
  let [dueno] = await db.select().from(usuarios).where(eq(usuarios.email, EMAIL));
  if (!dueno) {
    [dueno] = await db
      .insert(usuarios)
      .values({
        email: EMAIL,
        nombre: 'Lucía Méndez',
        hashContrasena: await new PasswordHasher().hash(CONTRASENA),
      })
      .returning();
  }

  // Las citas no se borran en cascada desde el negocio por las claves de profesional y servicio: van primero
  const [anterior] = await db.select().from(negocios).where(eq(negocios.slug, SLUG));
  if (anterior) {
    await db.delete(citas).where(eq(citas.negocioId, anterior.id));
    await db.delete(negocios).where(eq(negocios.id, anterior.id));
  }

  const [negocio] = await db
    .insert(negocios)
    .values({ slug: SLUG, nombre: 'Barbería El Tupé', zonaHoraria: ZONA, duenoId: dueno.id })
    .returning();

  const lista = await db
    .insert(servicios)
    .values([
      { negocioId: negocio.id, nombre: 'Corte de pelo', duracionMin: 30, precioCentimos: 1400 },
      { negocioId: negocio.id, nombre: 'Corte y barba', duracionMin: 45, precioCentimos: 2000 },
      { negocioId: negocio.id, nombre: 'Arreglo de barba', duracionMin: 20, precioCentimos: 900 },
      { negocioId: negocio.id, nombre: 'Corte infantil', duracionMin: 25, precioCentimos: 1100 },
    ])
    .returning();

  const equipo = await db
    .insert(profesionales)
    .values([
      { negocioId: negocio.id, nombre: 'Ana' },
      { negocioId: negocio.id, nombre: 'Bruno' },
    ])
    .returning();
  const [ana, bruno] = equipo;

  // Ana lo hace todo; Bruno no hace el corte infantil
  await db
    .insert(profesionalServicios)
    .values([
      ...lista.map((s) => ({ profesionalId: ana.id, servicioId: s.id })),
      ...lista
        .filter((s) => s.nombre !== 'Corte infantil')
        .map((s) => ({ profesionalId: bruno.id, servicioId: s.id })),
    ]);

  // Jornada partida de lunes a viernes; los sábados, solo por la mañana. Bruno libra los lunes.
  const tramos = (profesionalId: string, dias: number[]) =>
    dias.flatMap((dia) =>
      dia === 6
        ? [{ profesionalId, dia, inicio: '09:30', fin: '14:00' }]
        : [
            { profesionalId, dia, inicio: '09:30', fin: '13:30' },
            { profesionalId, dia, inicio: '16:30', fin: '20:00' },
          ],
    );
  await db
    .insert(horarios)
    .values([...tramos(ana.id, [1, 2, 3, 4, 5, 6]), ...tramos(bruno.id, [2, 3, 4, 5, 6])]);

  // Unas cuantas citas en los próximos siete días, en huecos libres de verdad
  const clientes = [
    'Marta Gil',
    'Javier Soto',
    'Carmen Ruiz',
    'Pablo Díaz',
    'Elena Vidal',
    'Sergio León',
    'Rosa Prieto',
  ];
  const corte = lista[0];
  let creadas = 0;
  for (let d = 1; d <= 7; d++) {
    const fecha = fechaLocal(new Date(Date.now() + d * 86_400_000), ZONA);
    const dia = diaDeLaSemana(fecha);
    for (const profesional of equipo) {
      const huecos = calcularHuecos({
        fecha,
        zonaHoraria: ZONA,
        duracionMin: corte.duracionMin,
        pasoMin: 90, // una de cada tres horas, para que la agenda no salga llena
        ahora: new Date(),
        profesionales: [
          {
            id: profesional.id,
            tramos: tramos(
              profesional.id,
              profesional === bruno ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6],
            ).filter((t) => t.dia === dia),
            ocupado: [],
          },
        ],
      });
      for (const hueco of huecos) {
        await db.insert(citas).values({
          negocioId: negocio.id,
          profesionalId: profesional.id,
          servicioId: corte.id,
          inicio: hueco.inicio,
          fin: new Date(hueco.inicio.getTime() + corte.duracionMin * 60_000),
          clienteNombre: clientes[creadas % clientes.length],
          clienteTelefono: `600 000 ${String(100 + creadas).padStart(3, '0')}`,
          codigo: randomBytes(16).toString('base64url'),
        });
        creadas++;
      }
    }
  }

  console.log(`Barbería El Tupé lista, con ${creadas} citas. Panel: ${EMAIL} / ${CONTRASENA}`);
} finally {
  await db.$client.end();
}
