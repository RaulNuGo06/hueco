import {
  calcularHuecos,
  diaDeLaSemana,
  fechaLocal,
  limitesDelDia,
  type AgendaProfesional,
} from './disponibilidad.js';

const MADRID = 'Europe/Madrid';
// Un momento muy anterior a todas las fechas de prueba, para que "ya pasó" no quite huecos
const HACE_TIEMPO = new Date('2026-01-01T00:00:00Z');

const horas = (huecos: { inicio: Date }[]) =>
  huecos.map((h) =>
    h.inicio.toLocaleTimeString('es-ES', { timeZone: MADRID, hour: '2-digit', minute: '2-digit' }),
  );

const agenda = (
  id: string,
  tramos: [string, string][],
  ocupado: [string, string][] = [],
): AgendaProfesional => ({
  id,
  tramos: tramos.map(([inicio, fin]) => ({ inicio, fin })),
  ocupado: ocupado.map(([inicio, fin]) => ({ inicio: new Date(inicio), fin: new Date(fin) })),
});

describe('calcularHuecos', () => {
  it('reparte el tramo en huecos cada 15 minutos y el último acaba justo al cerrar', () => {
    const huecos = calcularHuecos({
      fecha: '2026-11-20',
      zonaHoraria: MADRID,
      duracionMin: 30,
      profesionales: [agenda('ana', [['09:00', '10:00']])],
      ahora: HACE_TIEMPO,
    });

    expect(horas(huecos)).toEqual(['09:00', '09:15', '09:30']);
  });

  it('respeta la jornada partida: no hay huecos en el descanso de mediodía', () => {
    const huecos = calcularHuecos({
      fecha: '2026-11-20',
      zonaHoraria: MADRID,
      duracionMin: 60,
      pasoMin: 60,
      profesionales: [
        agenda('ana', [
          ['09:00', '14:00'],
          ['17:00', '20:00'],
        ]),
      ],
      ahora: HACE_TIEMPO,
    });

    expect(horas(huecos)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '17:00', '18:00', '19:00']);
  });

  it('quita los huecos que chocan con una cita, pero no los que empiezan justo cuando acaba', () => {
    const huecos = calcularHuecos({
      fecha: '2026-11-20',
      zonaHoraria: MADRID,
      duracionMin: 30,
      profesionales: [
        // Cita de 9:30 a 10:00 hora de Madrid (UTC+1 en noviembre)
        agenda('ana', [['09:00', '11:00']], [['2026-11-20T08:30:00Z', '2026-11-20T09:00:00Z']]),
      ],
      ahora: HACE_TIEMPO,
    });

    // 9:15 acabaría a las 9:45 y 9:45 empieza dentro de la cita: fuera. 9:00 acaba a las 9:30: vale.
    expect(horas(huecos)).toEqual(['09:00', '10:00', '10:15', '10:30']);
  });

  it('junta a los profesionales libres a la misma hora', () => {
    const huecos = calcularHuecos({
      fecha: '2026-11-20',
      zonaHoraria: MADRID,
      duracionMin: 30,
      pasoMin: 30,
      profesionales: [
        agenda('ana', [['09:00', '10:00']], [['2026-11-20T08:00:00Z', '2026-11-20T08:30:00Z']]),
        agenda('luis', [['09:00', '10:00']]),
      ],
      ahora: HACE_TIEMPO,
    });

    expect(huecos.map((h) => [horas([h])[0], h.profesionales])).toEqual([
      ['09:00', ['luis']],
      ['09:30', ['ana', 'luis']],
    ]);
  });

  it('no ofrece huecos que ya han pasado ni los que no cumplen la antelación mínima', () => {
    const huecos = calcularHuecos({
      fecha: '2026-11-20',
      zonaHoraria: MADRID,
      duracionMin: 30,
      pasoMin: 30,
      profesionales: [agenda('ana', [['09:00', '13:00']])],
      // Son las 10:05 en Madrid y hace falta una hora de antelación
      ahora: new Date('2026-11-20T09:05:00Z'),
      antelacionMin: 60,
    });

    expect(horas(huecos)).toEqual(['11:30', '12:00', '12:30']);
  });

  it('un servicio más largo que el tramo no cabe', () => {
    const huecos = calcularHuecos({
      fecha: '2026-11-20',
      zonaHoraria: MADRID,
      duracionMin: 90,
      profesionales: [agenda('ana', [['09:00', '10:00']])],
      ahora: HACE_TIEMPO,
    });

    expect(huecos).toEqual([]);
  });

  it('el horario es de hora local: en verano el mismo tramo empieza una hora antes en UTC', () => {
    const peticion = {
      zonaHoraria: MADRID,
      duracionMin: 60,
      profesionales: [agenda('ana', [['09:00', '10:00']])],
      ahora: HACE_TIEMPO,
    };

    const invierno = calcularHuecos({ ...peticion, fecha: '2026-11-20' });
    const verano = calcularHuecos({ ...peticion, fecha: '2026-07-20' });

    expect(invierno[0].inicio.toISOString()).toBe('2026-11-20T08:00:00.000Z');
    expect(verano[0].inicio.toISOString()).toBe('2026-07-20T07:00:00.000Z');
  });

  it('el día que se atrasa la hora, un tramo de 1:00 a 4:00 dura cuatro horas de verdad', () => {
    // 25 de octubre de 2026: a las 3:00 vuelven a ser las 2:00 en Madrid
    const huecos = calcularHuecos({
      fecha: '2026-10-25',
      zonaHoraria: MADRID,
      duracionMin: 60,
      pasoMin: 60,
      profesionales: [agenda('ana', [['01:00', '04:00']])],
      ahora: HACE_TIEMPO,
    });

    expect(huecos.map((h) => h.inicio.toISOString())).toEqual([
      '2026-10-24T23:00:00.000Z',
      '2026-10-25T00:00:00.000Z',
      '2026-10-25T01:00:00.000Z',
      '2026-10-25T02:00:00.000Z',
    ]);
  });

  it('el día que se adelanta la hora, ese mismo tramo dura dos horas', () => {
    // 29 de marzo de 2026: a las 2:00 pasan a ser las 3:00 en Madrid
    const huecos = calcularHuecos({
      fecha: '2026-03-29',
      zonaHoraria: MADRID,
      duracionMin: 60,
      pasoMin: 60,
      profesionales: [agenda('ana', [['01:00', '04:00']])],
      ahora: HACE_TIEMPO,
    });

    expect(huecos.map((h) => h.inicio.toISOString())).toEqual([
      '2026-03-29T00:00:00.000Z',
      '2026-03-29T01:00:00.000Z',
    ]);
  });

  it('acepta las horas con segundos, como las devuelve PostgreSQL', () => {
    const huecos = calcularHuecos({
      fecha: '2026-11-20',
      zonaHoraria: MADRID,
      duracionMin: 30,
      pasoMin: 30,
      profesionales: [agenda('ana', [['09:00:00', '10:00:00']])],
      ahora: HACE_TIEMPO,
    });

    expect(horas(huecos)).toEqual(['09:00', '09:30']);
  });
});

describe('fechas', () => {
  it('diaDeLaSemana usa la numeración ISO', () => {
    expect(diaDeLaSemana('2026-11-16')).toBe(1); // lunes
    expect(diaDeLaSemana('2026-11-22')).toBe(7); // domingo
  });

  it('limitesDelDia cubre el día entero en la zona del negocio, también el de 25 horas', () => {
    const normal = limitesDelDia('2026-11-20', MADRID);
    expect(normal.inicio.toISOString()).toBe('2026-11-19T23:00:00.000Z');
    expect(normal.fin.toISOString()).toBe('2026-11-20T23:00:00.000Z');

    const largo = limitesDelDia('2026-10-25', MADRID);
    expect(largo.fin.getTime() - largo.inicio.getTime()).toBe(25 * 3_600_000);
  });

  it('fechaLocal da el día del negocio aunque en UTC aún sea el anterior', () => {
    expect(fechaLocal(new Date('2026-11-19T23:30:00Z'), MADRID)).toBe('2026-11-20');
  });
});
