/** Los tipos de la API y una función para llamarla. Todo va a /api, en el mismo origen que la web. */

export interface Servicio {
  id: string;
  nombre: string;
  duracionMin: number;
  precioCentimos: number;
}

export interface FichaNegocio {
  slug: string;
  nombre: string;
  zonaHoraria: string;
  servicios: Servicio[];
  profesionales: { id: string; nombre: string; servicios: string[] }[];
}

export interface Hueco {
  inicio: string;
  profesionales: string[];
}

export interface Cita {
  codigo: string;
  estado: 'CONFIRMADA' | 'CANCELADA';
  inicio: string;
  fin: string;
  clienteNombre: string;
  servicio: string;
  precioCentimos: number;
  profesional: string;
  negocio: { slug: string; nombre: string; zonaHoraria: string };
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
}

export interface NegocioPropio {
  slug: string;
  nombre: string;
  zonaHoraria: string;
}

export interface CitaAgenda {
  id: string;
  estado: 'CONFIRMADA' | 'CANCELADA';
  inicio: string;
  fin: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string | null;
  servicio: string;
  profesional: { id: string; nombre: string };
}

export interface DatosCliente {
  nombre: string;
  telefono: string;
  email?: string;
}

export class ErrorApi extends Error {
  readonly estado: number;

  constructor(estado: number, mensaje: string) {
    super(mensaje);
    this.estado = estado;
  }
}

export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
    headers: opciones.cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;

  const datos: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ErrorApi(res.status, mensajeDeError(datos, res.status));
  return datos as T;
}

/** El mensaje que trae la API, que puede ser un texto o una lista de errores de validación. */
function mensajeDeError(datos: unknown, estado: number): string {
  const mensaje = (datos as { message?: unknown } | null)?.message;
  if (typeof mensaje === 'string') return mensaje;
  if (Array.isArray(mensaje) && mensaje.length > 0) {
    return mensaje.map((m) => (typeof m === 'string' ? m : (m as { message?: string }).message)).join('. ');
  }
  return estado >= 500 ? 'El servidor no responde. Prueba otra vez en un momento.' : 'No se ha podido hacer.';
}

export const reservas = {
  ficha: (slug: string) => api<FichaNegocio>(`/negocios/${slug}`),
  huecos: (slug: string, servicio: string, fecha: string, profesional?: string) => {
    const q = new URLSearchParams({ servicio, fecha });
    if (profesional) q.set('profesional', profesional);
    return api<Hueco[]>(`/negocios/${slug}/huecos?${q}`);
  },
  reservar: (
    slug: string,
    datos: { servicioId: string; profesionalId?: string; inicio: string; cliente: DatosCliente },
  ) => api<Cita>(`/negocios/${slug}/citas`, { cuerpo: datos }),
  cita: (codigo: string) => api<Cita>(`/citas/${codigo}`),
  cancelar: (codigo: string) => api<Cita>(`/citas/${codigo}/cancelar`, { metodo: 'POST' }),
};

export const panel = {
  yo: () => api<Usuario>('/yo'),
  entrar: (email: string, contrasena: string) =>
    api<Usuario>('/auth/entrar', { cuerpo: { email, contrasena } }),
  registro: (nombre: string, email: string, contrasena: string) =>
    api<Usuario>('/auth/registro', { cuerpo: { nombre, email, contrasena } }),
  salir: () => api<void>('/auth/salir', { metodo: 'POST' }),
  negocios: () => api<NegocioPropio[]>('/panel/negocios'),
  agenda: (slug: string, fecha: string) => api<CitaAgenda[]>(`/panel/negocios/${slug}/agenda?fecha=${fecha}`),
  profesionales: (slug: string) =>
    api<{ id: string; nombre: string; activo: boolean }[]>(`/panel/negocios/${slug}/profesionales`),
  cancelar: (slug: string, id: string) =>
    api<{ id: string }>(`/panel/negocios/${slug}/citas/${id}/cancelar`, { metodo: 'POST' }),
};
