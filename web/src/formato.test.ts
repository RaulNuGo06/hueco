import { agruparEnFranjas, duracion, precio, proximosDias } from './formato';

const h = (iso: string) => ({ inicio: iso });

describe('agruparEnFranjas', () => {
  it('separa la mañana de la tarde cuando hay un descanso largo', () => {
    const franjas = agruparEnFranjas(
      [
        h('2026-11-20T11:30:00Z'), // 12:30 en Madrid
        h('2026-11-20T11:45:00Z'),
        h('2026-11-20T12:00:00Z'), // 13:00: el último de la mañana
        h('2026-11-20T15:30:00Z'), // 16:30: empieza la tarde
        h('2026-11-20T15:45:00Z'),
      ],
      30,
    );

    expect(franjas.map((f) => f.huecos.length)).toEqual([3, 2]);
    // La mañana acaba cuando acaba el último hueco: 13:30 en Madrid
    expect(franjas[0].fin.toISOString()).toBe('2026-11-20T12:30:00.000Z');
  });

  it('un hueco que falta porque está reservado no parte la franja', () => {
    const franjas = agruparEnFranjas(
      [h('2026-11-20T08:00:00Z'), h('2026-11-20T08:45:00Z'), h('2026-11-20T09:00:00Z')],
      30,
    );
    expect(franjas).toHaveLength(1);
  });

  it('sin huecos no hay franjas', () => {
    expect(agruparEnFranjas([], 30)).toEqual([]);
  });
});

describe('formatos', () => {
  it('precio en euros, sin decimales si no hacen falta', () => {
    expect(precio(1400)).toMatch(/^14\s€$/);
    expect(precio(950)).toMatch(/^9,50\s€$/);
  });

  it('duración legible', () => {
    expect(duracion(30)).toBe('30 min');
    expect(duracion(60)).toBe('1 h');
    expect(duracion(90)).toBe('1 h 30 min');
  });

  it('los próximos días empiezan hoy en la zona del negocio', () => {
    // A las 23:30 UTC del 19 ya es día 20 en Madrid
    expect(proximosDias(3, 'Europe/Madrid', new Date('2026-11-19T23:30:00Z'))).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });
});
