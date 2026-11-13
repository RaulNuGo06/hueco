import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurar } from '../src/configurar.js';
import { CARPETA_MIGRACIONES } from '../src/db/migrar.js';
import { fechaLocal } from '../src/reservas/disponibilidad.js';

/**
 * La aplicación de verdad, con dos cambios: la base de datos es PGlite (PostgreSQL compilado a WebAssembly,
 * con las migraciones reales y la extensión btree_gist), así que los tests no necesitan un servidor,
 * y el hash de contraseñas es más barato para que los tests vayan rápido.
 */
export async function crearApp() {
  const pglite = new PGlite({ extensions: { btree_gist } });
  const db = drizzle({ client: pglite });
  await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDrizzleToken())
    .useValue(db)
    .overrideProvider(PasswordHasher)
    .useValue(new PasswordHasher({ logN: 10 }))
    .compile();

  const app: INestApplication = configurar(modulo.createNestApplication());
  await app.init();

  return {
    app,
    db,
    http: () => request(app.getHttpServer()),
    cerrar: async () => {
      await app.close();
      await pglite.close();
    },
  };
}

export type AppDePrueba = Awaited<ReturnType<typeof crearApp>>;

/** Registra a un dueño y devuelve su cookie de sesión. */
export async function registrarDueno(t: AppDePrueba, email = 'lucia@ejemplo.com') {
  const res = await t
    .http()
    .post('/api/auth/registro')
    .send({ nombre: 'Lucía', email, contrasena: 'una contraseña larga' })
    .expect(201);
  return cookieDe(res.headers['set-cookie']);
}

export function cookieDe(setCookie: string | string[] | undefined): string {
  const primera = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!primera) throw new Error('La respuesta no trae cookie de sesión');
  return primera.split(';')[0];
}

/** Una fecha dentro de unos días en el calendario de Madrid, para que siempre quede en el futuro. */
export function dentroDe(dias: number): string {
  return fechaLocal(new Date(Date.now() + dias * 86_400_000), 'Europe/Madrid');
}

/** De lunes a domingo, de 9:00 a 14:00 y de 17:00 a 20:00: así da igual qué día de la semana caiga la prueba. */
export const TODA_LA_SEMANA = [1, 2, 3, 4, 5, 6, 7].flatMap((dia) => [
  { dia, inicio: '09:00', fin: '14:00' },
  { dia, inicio: '17:00', fin: '20:00' },
]);

/**
 * Monta una barbería de prueba a través del panel: un servicio de 30 minutos y dos profesionales con
 * el mismo horario. Así cada test usa la API como lo haría el dueño.
 */
export async function montarBarberia(t: AppDePrueba, cookie: string, slug = 'barberia-el-tupe') {
  await t
    .http()
    .post('/api/panel/negocios')
    .set('Cookie', cookie)
    .send({ nombre: 'Barbería El Tupé', slug })
    .expect(201);

  const corte = await t
    .http()
    .post(`/api/panel/negocios/${slug}/servicios`)
    .set('Cookie', cookie)
    .send({ nombre: 'Corte de pelo', duracionMin: 30, precioCentimos: 1400 })
    .expect(201);

  const profesionales: { id: string; nombre: string }[] = [];
  for (const nombre of ['Ana', 'Bruno']) {
    const p = await t
      .http()
      .post(`/api/panel/negocios/${slug}/profesionales`)
      .set('Cookie', cookie)
      .send({ nombre, servicios: [corte.body.id] })
      .expect(201);
    await t
      .http()
      .put(`/api/panel/negocios/${slug}/profesionales/${p.body.id}/horario`)
      .set('Cookie', cookie)
      .send({ tramos: TODA_LA_SEMANA })
      .expect(200);
    profesionales.push(p.body);
  }

  const [ana, bruno] = profesionales;
  return { slug, servicioId: corte.body.id as string, ana, bruno };
}

/** El instante de las HH:MM de esa fecha en Madrid, en ISO. */
export function aLas(fecha: string, hora: string): string {
  const [h, m] = hora.split(':').map(Number);
  const [a, mes, d] = fecha.split('-').map(Number);
  // Madrid es UTC+1 o UTC+2: se prueba con los dos y se queda el que da esa hora local
  for (const desfase of [1, 2]) {
    const instante = new Date(Date.UTC(a, mes - 1, d, h - desfase, m));
    const local = instante.toLocaleTimeString('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
    });
    if (local === hora) return instante.toISOString();
  }
  throw new Error(`No existe ${hora} el ${fecha} en Madrid`);
}

export const CLIENTE = { nombre: 'Marta Gil', telefono: '600 123 456', email: 'marta@ejemplo.com' };
