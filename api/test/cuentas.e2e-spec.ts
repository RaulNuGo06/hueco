import { cookieDe, crearApp, registrarDueno, type AppDePrueba } from './app.js';

describe('Cuentas (e2e)', () => {
  let t: AppDePrueba;

  beforeAll(async () => {
    t = await crearApp();
  });

  afterAll(() => t.cerrar());

  it('al registrarse queda con la sesión iniciada y /yo devuelve su cuenta, sin el hash', async () => {
    const cookie = await registrarDueno(t, 'nuevo@ejemplo.com');

    const yo = await t.http().get('/api/yo').set('Cookie', cookie).expect(200);
    expect(yo.body).toEqual({ id: expect.any(String), email: 'nuevo@ejemplo.com', nombre: 'Lucía' });
  });

  it('no deja registrar dos veces el mismo email, aunque cambien las mayúsculas', async () => {
    await registrarDueno(t, 'repetido@ejemplo.com');

    await t
      .http()
      .post('/api/auth/registro')
      .send({ nombre: 'Otra', email: ' Repetido@Ejemplo.com ', contrasena: 'otra contraseña larga' })
      .expect(400); // el email con espacios no es un email válido

    const res = await t
      .http()
      .post('/api/auth/registro')
      .send({ nombre: 'Otra', email: 'REPETIDO@ejemplo.com', contrasena: 'otra contraseña larga' })
      .expect(409);
    expect(res.body.message).toBe('Ya hay una cuenta con ese email');
  });

  it('pide una contraseña de al menos 10 caracteres', async () => {
    await t
      .http()
      .post('/api/auth/registro')
      .send({ nombre: 'Corta', email: 'corta@ejemplo.com', contrasena: 'corta' })
      .expect(400);
  });

  it('entra con la contraseña buena y no con una mala', async () => {
    await registrarDueno(t, 'entrar@ejemplo.com');

    await t
      .http()
      .post('/api/auth/entrar')
      .send({ email: 'entrar@ejemplo.com', contrasena: 'no es esta' })
      .expect(401);
    await t
      .http()
      .post('/api/auth/entrar')
      .send({ email: 'nadie@ejemplo.com', contrasena: 'no es esta' })
      .expect(401);

    const res = await t
      .http()
      .post('/api/auth/entrar')
      .send({ email: 'Entrar@Ejemplo.com', contrasena: 'una contraseña larga' })
      .expect(200);
    await t.http().get('/api/yo').set('Cookie', cookieDe(res.headers['set-cookie'])).expect(200);
  });

  it('sin sesión, el panel responde 401', async () => {
    await t.http().get('/api/yo').expect(401);
    await t.http().get('/api/panel/negocios').expect(401);
  });

  it('al salir, la cookie deja de valer', async () => {
    const cookie = await registrarDueno(t, 'salir@ejemplo.com');

    await t.http().post('/api/auth/salir').set('Cookie', cookie).expect(204);
    await t.http().get('/api/yo').set('Cookie', cookie).expect(401);
  });
});
