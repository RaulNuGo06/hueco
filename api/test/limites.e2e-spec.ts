import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  aLas,
  CLIENTE,
  crearApp,
  dentroDe,
  montarBarberia,
  registrarDueno,
  type AppDePrueba,
} from './app.js';

const fecha = dentroDe(7);

async function prepararBarberia(t: AppDePrueba) {
  const barberia = await montarBarberia(t, await registrarDueno(t));
  const reservar = (hora: string, telefono = CLIENTE.telefono, ip = '203.0.113.1') =>
    t
      .http()
      .post(`/api/negocios/${barberia.slug}/citas`)
      .set('X-Forwarded-For', ip)
      .send({
        servicioId: barberia.servicioId,
        inicio: aLas(fecha, hora),
        cliente: { ...CLIENTE, telefono },
      });
  return { barberia, reservar };
}

describe('Límite de citas pendientes por teléfono (e2e)', () => {
  let t: AppDePrueba;
  let reservar: Awaited<ReturnType<typeof prepararBarberia>>['reservar'];

  beforeAll(async () => {
    t = await crearApp({
      limites: { citasPendientesPorTelefono: 2, reservasPorIp: { max: 1000, ventanaMin: 60 } },
    });
    ({ reservar } = await prepararBarberia(t));
  });

  afterAll(() => t.cerrar());

  it('con dos citas por venir no deja pedir otra, aunque el teléfono se escriba de otra forma', async () => {
    await reservar('09:00', '600 111 222').expect(201);
    const segunda = await reservar('09:30', '600111222').expect(201);

    const res = await reservar('10:00', '+34 600 111 222').expect(422);
    expect(res.body.message).toContain('Ya tienes 2 citas pendientes');
    await reservar('10:00', '0034600111222').expect(422);

    // Otro teléfono sí puede
    await reservar('10:00', '611 000 000').expect(201);

    // Al cancelar una, vuelve a haber sitio
    await t.http().post(`/api/citas/${segunda.body.codigo}/cancelar`).expect(200);
    await reservar('10:30', '600 111 222').expect(201);
  });

  it('seis reservas a la vez con el mismo teléfono: solo entran dos', async () => {
    const horas = ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30'];
    const respuestas = await Promise.all(horas.map((h) => reservar(h, '622 333 444')));

    const estados = respuestas.map((r) => r.status);
    expect(estados.filter((s) => s === 201)).toHaveLength(2);
    expect(estados.filter((s) => s === 422)).toHaveLength(4);
  });
});

describe('Límite de reservas por IP (e2e)', () => {
  let t: AppDePrueba;
  let reservar: Awaited<ReturnType<typeof prepararBarberia>>['reservar'];

  beforeAll(async () => {
    t = await crearApp({
      limites: { citasPendientesPorTelefono: 1000, reservasPorIp: { max: 3, ventanaMin: 60 } },
    });
    ({ reservar } = await prepararBarberia(t));
  });

  afterAll(() => t.cerrar());
  afterEach(() => {
    delete process.env.CABECERA_IP_CLIENTE;
  });

  it('a partir del cuarto intento en la ventana responde 429 con Retry-After; otra IP sigue pudiendo', async () => {
    const ip = '198.51.100.10';
    await reservar('09:00', '600000001', ip).expect(201);
    await reservar('09:00', '600000002', ip).expect(201);
    // Los intentos fallidos también cuentan: a las 09:00 ya no queda nadie libre
    await reservar('09:00', '600000003', ip).expect(409);

    const res = await reservar('09:30', '600000004', ip).expect(429);
    expect(res.body.message).toContain('Demasiadas reservas seguidas');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(3500);

    await reservar('09:30', '600000005', '198.51.100.11').expect(201);
  });

  it('la IP no se guarda en claro', async () => {
    const { rows } = await t.db.execute('select clave from limites');
    expect(JSON.stringify(rows)).not.toContain('198.51.100');
  });

  it('cuando la ventana caduca, la cuenta vuelve a empezar', async () => {
    const ip = '198.51.100.20';
    for (const telefono of ['600000011', '600000012', '600000013']) {
      await reservar('10:00', telefono, ip);
    }
    await reservar('10:30', '600000014', ip).expect(429);

    await t.db.execute(`update limites set ventana_fin = now() - interval '1 second'`);
    await reservar('10:30', '600000015', ip).expect(201);
  });

  it('con CABECERA_IP_CLIENTE se usa esa cabecera, y cambiar X-Forwarded-For no sirve para saltarse el límite', async () => {
    process.env.CABECERA_IP_CLIENTE = 'True-Client-IP';
    const intento = (n: number) =>
      reservar('11:00', `60000002${n}`, `192.0.2.${n}`).set('True-Client-IP', '198.51.100.30');

    for (let n = 1; n <= 3; n++) await intento(n);
    await intento(4).expect(429);
  });
});

describe('La web servida por la API, para la imagen de la demo (e2e)', () => {
  let t: AppDePrueba;
  let carpeta: string;

  beforeAll(async () => {
    carpeta = mkdtempSync(join(tmpdir(), 'hueco-web-'));
    mkdirSync(join(carpeta, 'assets'));
    writeFileSync(join(carpeta, 'index.html'), '<div id="root"></div>');
    writeFileSync(join(carpeta, 'assets', 'app-abc123.js'), 'console.log("hola")');
    t = await crearApp({ carpetaWeb: carpeta });
  });

  afterAll(async () => {
    await t.cerrar();
    rmSync(carpeta, { recursive: true, force: true });
  });

  it('las rutas de React Router devuelven index.html', async () => {
    for (const ruta of ['/', '/r/barberia-el-tupe', '/panel']) {
      const res = await t.http().get(ruta).expect(200);
      expect(res.text).toContain('<div id="root">');
    }
  });

  it('los ficheros con hash se guardan en caché para siempre', async () => {
    const res = await t.http().get('/assets/app-abc123.js').expect(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('la API sigue respondiendo JSON, también con un 404', async () => {
    await t.http().get('/api/salud').expect(200, { estado: 'ok' });
    const res = await t.http().get('/api/no-existe').expect(404);
    expect(res.headers['content-type']).toContain('application/json');
  });
});
