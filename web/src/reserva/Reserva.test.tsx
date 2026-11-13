import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import type { FichaNegocio, Hueco } from '../api';
import { proximosDias } from '../formato';
import { Reserva } from './Reserva';

const FICHA: FichaNegocio = {
  slug: 'barberia-el-tupe',
  nombre: 'Barbería El Tupé',
  zonaHoraria: 'Europe/Madrid',
  servicios: [
    { id: 's-corte', nombre: 'Corte de pelo', duracionMin: 30, precioCentimos: 1400 },
    { id: 's-barba', nombre: 'Arreglo de barba', duracionMin: 20, precioCentimos: 900 },
  ],
  profesionales: [
    { id: 'p-ana', nombre: 'Ana', servicios: ['s-corte', 's-barba'] },
    { id: 'p-bruno', nombre: 'Bruno', servicios: ['s-corte'] },
  ],
};

const hoy = proximosDias(1, 'Europe/Madrid')[0];
/** Un instante de hoy a esa hora de Madrid (en noviembre/invierno sería UTC+1; da igual para el test). */
const aLas = (hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  for (const desfase of [1, 2]) {
    const [a, mes, d] = hoy.split('-').map(Number);
    const i = new Date(Date.UTC(a, mes - 1, d, h - desfase, m));
    if (
      i.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) ===
      hora
    ) {
      return i.toISOString();
    }
  }
  throw new Error(hora);
};

const HUECOS: Hueco[] = ['10:00', '10:15', '10:30', '17:00', '17:15'].map((h) => ({
  inicio: aLas(h),
  profesionales: ['p-ana'],
}));

function responder(cuerpo: unknown, estado = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } }),
  );
}

function montar() {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, init) => {
    const url = String(entrada);
    llamadas.push({ url, init });
    if (url.includes('/huecos')) return responder(HUECOS);
    if (url.endsWith('/citas') && init?.method === 'POST')
      return responder({ codigo: 'CODIGO_DE_PRUEBA_123456' }, 201);
    if (url.endsWith('/negocios/barberia-el-tupe')) return responder(FICHA);
    return responder({ message: 'No existe' }, 404);
  });

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/r/barberia-el-tupe']}>
        <Routes>
          <Route path="/r/:slug" element={<Reserva />} />
          <Route path="/cita/:codigo" element={<p>Página de la cita</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return llamadas;
}

describe('Reserva', () => {
  it('separa con una franja vacía las horas de la mañana y las de la tarde', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: /Corte de pelo/ }));

    expect(await screen.findByText('Sin huecos libres de 11:00 a 17:00')).toBeInTheDocument();
    const mañana = screen.getByRole('group', { name: 'De 10:00 a 11:00' });
    expect(
      within(mañana)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['10:00', '10:15', '10:30']);
  });

  it('reserva con servicio, hora y datos, y lleva a la página de la cita', async () => {
    const usuario = userEvent.setup();
    const llamadas = montar();

    await usuario.click(await screen.findByRole('button', { name: /Corte de pelo/ }));
    await usuario.selectOptions(screen.getByRole('combobox'), 'Ana');
    await usuario.click(await screen.findByRole('button', { name: '10:15' }));

    expect(screen.getByText(/Corte de pelo, el .* a las 10:15 con Ana\./)).toBeInTheDocument();

    await usuario.type(screen.getByLabelText('Nombre'), 'Marta Gil');
    await usuario.type(screen.getByLabelText('Teléfono'), '600 123 456');
    await usuario.click(screen.getByRole('button', { name: 'Reservar a las 10:15' }));

    expect(await screen.findByText('Página de la cita')).toBeInTheDocument();
    const reserva = llamadas.find((l) => l.init?.method === 'POST');
    expect(JSON.parse(String(reserva?.init?.body))).toEqual({
      servicioId: 's-corte',
      profesionalId: 'p-ana',
      inicio: aLas('10:15'),
      cliente: { nombre: 'Marta Gil', telefono: '600 123 456' },
    });
  });

  it('si el negocio no existe lo dice', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      responder({ message: 'No existe ese negocio' }, 404),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/r/no-existe']}>
          <Routes>
            <Route path="/r/:slug" element={<Reserva />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'No encontramos este negocio' })).toBeInTheDocument();
  });
});
