import {
  aLas,
  CLIENTE,
  crearApp,
  dentroDe,
  montarBarberia,
  registrarDueno,
  type AppDePrueba,
} from './app.js';

describe('Panel del negocio (e2e)', () => {
  let t: AppDePrueba;
  let cookie: string;
  let barberia: Awaited<ReturnType<typeof montarBarberia>>;
  const fecha = dentroDe(5);

  beforeAll(async () => {
    t = await crearApp();
    cookie = await registrarDueno(t);
    barberia = await montarBarberia(t, cookie);
  });

  afterAll(() => t.cerrar());

  it('lista los negocios del dueño', async () => {
    const res = await t.http().get('/api/panel/negocios').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual([
      { slug: barberia.slug, nombre: 'Barbería El Tupé', zonaHoraria: 'Europe/Madrid' },
    ]);
  });

  it('genera el enlace a partir del nombre y no deja repetirlo', async () => {
    const res = await t
      .http()
      .post('/api/panel/negocios')
      .set('Cookie', cookie)
      .send({ nombre: 'Peluquería Ñandú' })
      .expect(201);
    expect(res.body.slug).toBe('peluqueria-nandu');

    await t
      .http()
      .post('/api/panel/negocios')
      .set('Cookie', cookie)
      .send({ nombre: 'Peluquería Ñandú' })
      .expect(409);
  });

  it('rechaza una zona horaria que no existe', async () => {
    await t
      .http()
      .post('/api/panel/negocios')
      .set('Cookie', cookie)
      .send({ nombre: 'En ninguna parte', zonaHoraria: 'Europe/Almendralejo' })
      .expect(400);
  });

  it('la agenda del día trae las citas con el cliente, y el dueño puede cancelarlas', async () => {
    const reserva = await t
      .http()
      .post(`/api/negocios/${barberia.slug}/citas`)
      .send({
        servicioId: barberia.servicioId,
        profesionalId: barberia.bruno.id,
        inicio: aLas(fecha, '09:30'),
        cliente: CLIENTE,
      })
      .expect(201);

    const agenda = await t
      .http()
      .get(`/api/panel/negocios/${barberia.slug}/agenda`)
      .query({ fecha })
      .set('Cookie', cookie)
      .expect(200);
    expect(agenda.body).toHaveLength(1);
    expect(agenda.body[0]).toMatchObject({
      estado: 'CONFIRMADA',
      inicio: aLas(fecha, '09:30'),
      clienteNombre: 'Marta Gil',
      clienteTelefono: '600 123 456',
      servicio: 'Corte de pelo',
      profesional: { id: barberia.bruno.id, nombre: 'Bruno' },
    });

    await t
      .http()
      .post(`/api/panel/negocios/${barberia.slug}/citas/${agenda.body[0].id}/cancelar`)
      .set('Cookie', cookie)
      .expect(200);
    const cita = await t.http().get(`/api/citas/${reserva.body.codigo}`).expect(200);
    expect(cita.body.estado).toBe('CANCELADA');
  });

  it('otro dueño no ve ni toca el negocio: responde 404, como si no existiera', async () => {
    const otro = await registrarDueno(t, 'otro@ejemplo.com');

    await t
      .http()
      .get(`/api/panel/negocios/${barberia.slug}/agenda`)
      .query({ fecha })
      .set('Cookie', otro)
      .expect(404);
    await t.http().get(`/api/panel/negocios/${barberia.slug}/servicios`).set('Cookie', otro).expect(404);
    await t
      .http()
      .post(`/api/panel/negocios/${barberia.slug}/servicios`)
      .set('Cookie', otro)
      .send({ nombre: 'Intruso', duracionMin: 30, precioCentimos: 0 })
      .expect(404);
    const lista = await t.http().get('/api/panel/negocios').set('Cookie', otro).expect(200);
    expect(lista.body).toEqual([]);
  });

  it('un servicio desactivado desaparece de la ficha pública y no se puede reservar', async () => {
    const tinte = await t
      .http()
      .post(`/api/panel/negocios/${barberia.slug}/servicios`)
      .set('Cookie', cookie)
      .send({ nombre: 'Tinte', duracionMin: 60, precioCentimos: 3000 })
      .expect(201);

    await t
      .http()
      .patch(`/api/panel/negocios/${barberia.slug}/servicios/${tinte.body.id}`)
      .set('Cookie', cookie)
      .send({ activo: false })
      .expect(200);

    const ficha = await t.http().get(`/api/negocios/${barberia.slug}`).expect(200);
    expect(ficha.body.servicios.map((s: { nombre: string }) => s.nombre)).toEqual(['Corte de pelo']);
    await t
      .http()
      .get(`/api/negocios/${barberia.slug}/huecos`)
      .query({ servicio: tinte.body.id, fecha })
      .expect(404);
  });

  it('valida la duración de los servicios y los tramos del horario', async () => {
    await t
      .http()
      .post(`/api/panel/negocios/${barberia.slug}/servicios`)
      .set('Cookie', cookie)
      .send({ nombre: 'Raro', duracionMin: 7, precioCentimos: 100 })
      .expect(400);

    await t
      .http()
      .put(`/api/panel/negocios/${barberia.slug}/profesionales/${barberia.ana.id}/horario`)
      .set('Cookie', cookie)
      .send({ tramos: [{ dia: 1, inicio: '14:00', fin: '09:00' }] })
      .expect(400);
  });

  it('cambiar el horario cambia los huecos: sin tramos ese día, el profesional no aparece', async () => {
    await t
      .http()
      .put(`/api/panel/negocios/${barberia.slug}/profesionales/${barberia.ana.id}/horario`)
      .set('Cookie', cookie)
      .send({ tramos: [] })
      .expect(200);

    const huecos = await t
      .http()
      .get(`/api/negocios/${barberia.slug}/huecos`)
      .query({ servicio: barberia.servicioId, fecha })
      .expect(200);
    expect(
      huecos.body.every((h: { profesionales: string[] }) => !h.profesionales.includes(barberia.ana.id)),
    ).toBe(true);

    const equipo = await t
      .http()
      .get(`/api/panel/negocios/${barberia.slug}/profesionales`)
      .set('Cookie', cookie)
      .expect(200);
    expect(equipo.body.find((p: { nombre: string }) => p.nombre === 'Ana').horario).toEqual([]);
    expect(equipo.body.find((p: { nombre: string }) => p.nombre === 'Bruno').horario).toHaveLength(14);
  });
});
