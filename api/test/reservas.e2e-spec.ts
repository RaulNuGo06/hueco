import {
  aLas,
  CLIENTE,
  crearApp,
  dentroDe,
  montarBarberia,
  registrarDueno,
  type AppDePrueba,
} from './app.js';

describe('Reservas (e2e)', () => {
  let t: AppDePrueba;
  let barberia: Awaited<ReturnType<typeof montarBarberia>>;
  const fecha = dentroDe(7);

  const huecos = async (dia = fecha, extra: Record<string, string> = {}) =>
    (
      await t
        .http()
        .get(`/api/negocios/${barberia.slug}/huecos`)
        .query({ servicio: barberia.servicioId, fecha: dia, ...extra })
        .expect(200)
    ).body as { inicio: string; profesionales: string[] }[];

  const reservar = (hora: string, extra: Record<string, unknown> = {}) =>
    t
      .http()
      .post(`/api/negocios/${barberia.slug}/citas`)
      .send({ servicioId: barberia.servicioId, inicio: aLas(fecha, hora), cliente: CLIENTE, ...extra });

  beforeAll(async () => {
    t = await crearApp();
    barberia = await montarBarberia(t, await registrarDueno(t));
  });

  afterAll(() => t.cerrar());

  it('la ficha pública enseña los servicios y quién los hace', async () => {
    const res = await t.http().get(`/api/negocios/${barberia.slug}`).expect(200);

    expect(res.body).toMatchObject({
      nombre: 'Barbería El Tupé',
      zonaHoraria: 'Europe/Madrid',
      servicios: [
        { id: barberia.servicioId, nombre: 'Corte de pelo', duracionMin: 30, precioCentimos: 1400 },
      ],
      profesionales: [
        { nombre: 'Ana', servicios: [barberia.servicioId] },
        { nombre: 'Bruno', servicios: [barberia.servicioId] },
      ],
    });
  });

  it('un negocio que no existe es un 404', async () => {
    await t.http().get('/api/negocios/no-existe').expect(404);
  });

  it('da los huecos del día con la jornada partida: de 9:00 a 13:30 y de 17:00 a 19:30', async () => {
    const lista = await huecos();

    expect(lista[0]).toEqual({
      inicio: aLas(fecha, '09:00'),
      profesionales: [barberia.ana.id, barberia.bruno.id],
    });
    expect(lista.map((h) => h.inicio)).toContain(aLas(fecha, '13:30'));
    expect(lista.map((h) => h.inicio)).not.toContain(aLas(fecha, '13:45'));
    expect(lista.map((h) => h.inicio)).not.toContain(aLas(fecha, '15:00'));
    expect(lista.at(-1)?.inicio).toBe(aLas(fecha, '19:30'));
  });

  it('reserva, quita el hueco a ese profesional, y al cancelar vuelve', async () => {
    const res = await reservar('10:00', { profesionalId: barberia.ana.id }).expect(201);
    expect(res.body).toMatchObject({
      estado: 'CONFIRMADA',
      servicio: 'Corte de pelo',
      profesional: 'Ana',
      clienteNombre: 'Marta Gil',
      negocio: { slug: barberia.slug },
    });
    expect(res.body.codigo).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const conAna = await huecos(fecha, { profesional: barberia.ana.id });
    expect(conAna.map((h) => h.inicio)).not.toContain(aLas(fecha, '10:00'));
    expect(conAna.map((h) => h.inicio)).not.toContain(aLas(fecha, '09:45')); // acabaría a las 10:15
    expect(conAna.map((h) => h.inicio)).toContain(aLas(fecha, '10:30'));

    // Bruno sigue libre a las 10:00
    const todos = await huecos();
    expect(todos.find((h) => h.inicio === aLas(fecha, '10:00'))?.profesionales).toEqual([barberia.bruno.id]);

    const consulta = await t.http().get(`/api/citas/${res.body.codigo}`).expect(200);
    expect(consulta.body.estado).toBe('CONFIRMADA');

    const cancelada = await t.http().post(`/api/citas/${res.body.codigo}/cancelar`).expect(200);
    expect(cancelada.body.estado).toBe('CANCELADA');
    await t.http().post(`/api/citas/${res.body.codigo}/cancelar`).expect(409);

    const despues = await huecos(fecha, { profesional: barberia.ana.id });
    expect(despues.map((h) => h.inicio)).toContain(aLas(fecha, '10:00'));
  });

  it('sin elegir profesional, se asigna al primero libre', async () => {
    const primera = await reservar('11:00').expect(201);
    const segunda = await reservar('11:00').expect(201);
    expect([primera.body.profesional, segunda.body.profesional]).toEqual(['Ana', 'Bruno']);

    // Con los dos ocupados, ya no hay hueco a las 11:00
    await reservar('11:00').expect(409);
    expect((await huecos()).map((h) => h.inicio)).not.toContain(aLas(fecha, '11:00'));
  });

  it('diez reservas a la vez para el último hueco: entra una y las demás reciben un 409', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => reservar('12:00', { profesionalId: barberia.bruno.id })),
    );

    const estados = respuestas.map((r) => r.status);
    expect(estados.filter((s) => s === 201)).toHaveLength(1);
    expect(estados.filter((s) => s === 409)).toHaveLength(9);
  });

  it('la base de datos rechaza un solape aunque alguien se salte la API', async () => {
    const cita = await reservar('17:00', { profesionalId: barberia.ana.id }).expect(201);
    const [{ id: negocioId }] = (
      await t.db.execute(`select id from negocios where slug = '${barberia.slug}'`)
    ).rows as { id: string }[];

    await expect(
      t.db.execute(
        `insert into citas (negocio_id, profesional_id, servicio_id, inicio, fin, cliente_nombre, cliente_telefono, codigo)
         values ('${negocioId}', '${barberia.ana.id}', '${barberia.servicioId}',
                 '${aLas(fecha, '17:15')}', '${aLas(fecha, '17:45')}', 'Colado', '600000000', 'colado')`,
      ),
    ).rejects.toMatchObject({ cause: { code: '23P01' } });
    expect(cita.status).toBe(201);
  });

  it('no acepta una hora fuera del horario ni fuera de la cuadrícula de 15 minutos', async () => {
    await reservar('15:00').expect(409);
    await reservar('09:10').expect(409);
  });

  it('no deja reservar en el pasado ni a más de 60 días', async () => {
    await t
      .http()
      .get(`/api/negocios/${barberia.slug}/huecos`)
      .query({ servicio: barberia.servicioId, fecha: dentroDe(-2) })
      .expect(422);
    await t
      .http()
      .get(`/api/negocios/${barberia.slug}/huecos`)
      .query({ servicio: barberia.servicioId, fecha: dentroDe(90) })
      .expect(422);
  });

  it('valida los datos del cliente', async () => {
    const res = await reservar('18:00', { cliente: { ...CLIENTE, telefono: 'llámame' } }).expect(400);
    expect(JSON.stringify(res.body)).toContain('Teléfono no válido');

    await reservar('18:00', { cliente: { nombre: 'M', telefono: '600123456' } }).expect(400);
    await reservar('18:00', { servicioId: 'no-es-un-uuid' }).expect(400);
  });

  it('un código de cita inventado es un 404', async () => {
    await t.http().get('/api/citas/AAAAAAAAAAAAAAAAAAAAAA').expect(404);
    await t.http().get('/api/citas/corto').expect(400);
  });
});
