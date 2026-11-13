import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { panel, type CitaAgenda } from '../api';
import { fechaISO, fechaLarga, hora, sumarDias } from '../formato';

const PX_POR_MINUTO = 1.6;

/** Minutos desde las 0:00 de un instante en la zona del negocio. */
function minutoDelDia(iso: string, zona: string) {
  const [h, m] = hora(iso, zona).split(':').map(Number);
  return h * 60 + m;
}

export function Agenda() {
  const { slug = '' } = useParams();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const [params, setParams] = useSearchParams();

  const negocios = useQuery({ queryKey: ['negocios'], queryFn: panel.negocios });
  const negocio = negocios.data?.find((n) => n.slug === slug);
  const zona = negocio?.zonaHoraria ?? 'Europe/Madrid';
  const [ahora] = useState(() => new Date());
  const hoy = fechaISO(ahora, zona);
  const fecha = params.get('fecha') ?? hoy;
  const irA = (f: string) => setParams(f === hoy ? {} : { fecha: f });

  const agenda = useQuery({ queryKey: ['agenda', slug, fecha], queryFn: () => panel.agenda(slug, fecha) });
  const equipo = useQuery({ queryKey: ['equipo', slug], queryFn: () => panel.profesionales(slug) });
  const [abierta, setAbierta] = useState<CitaAgenda>();

  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(undefined);
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [abierta]);

  const cancelar = useMutation({
    mutationFn: (id: string) => panel.cancelar(slug, id),
    onSuccess: () => {
      setAbierta(undefined);
      void cliente.invalidateQueries({ queryKey: ['agenda', slug] });
    },
  });

  if (negocios.isSuccess && !negocio) {
    return (
      <main className="pagina estrecha">
        <h1>No encontramos ese negocio</h1>
        <Link to="/panel">Volver al panel</Link>
      </main>
    );
  }

  const citas = agenda.data ?? [];
  const columnas = (equipo.data ?? []).filter(
    (p) => p.activo || citas.some((c) => c.profesional.id === p.id),
  );
  const confirmadas = citas.filter((c) => c.estado === 'CONFIRMADA').length;

  // De la primera a la última hora con citas, y como poco de 9:00 a 20:00
  const desde = Math.min(9 * 60, ...citas.map((c) => Math.floor(minutoDelDia(c.inicio, zona) / 60) * 60));
  const hasta = Math.max(20 * 60, ...citas.map((c) => Math.ceil(minutoDelDia(c.fin, zona) / 60) * 60));
  const horas = Array.from({ length: (hasta - desde) / 60 }, (_, i) => desde + i * 60);

  return (
    <main className="pagina agenda">
      <div className="agenda-cabecera">
        <div>
          {negocios.data && negocios.data.length > 1 ? (
            <select
              className="selector-negocio"
              value={slug}
              onChange={(e) => navegar(`/panel/${e.target.value}`)}
            >
              {negocios.data.map((n) => (
                <option key={n.slug} value={n.slug}>
                  {n.nombre}
                </option>
              ))}
            </select>
          ) : (
            <p className="agenda-negocio">{negocio?.nombre}</p>
          )}
          <h1 className="agenda-fecha">{fechaLarga(`${fecha}T12:00:00Z`, 'UTC')}</h1>
          <p className="suave">
            {agenda.isSuccess &&
              (confirmadas === 0
                ? 'Sin citas.'
                : confirmadas === 1
                  ? '1 cita.'
                  : `${confirmadas} citas.`)}{' '}
            Enlace para tus clientes: <a href={`/r/${slug}`}>{`${location.host}/r/${slug}`}</a>
          </p>
        </div>
        <nav className="navegacion-dias" aria-label="Cambiar de día">
          <button
            type="button"
            className="boton-secundario"
            onClick={() => irA(sumarDias(fecha, -1))}
            aria-label="Día anterior"
          >
            ‹
          </button>
          <button
            type="button"
            className="boton-secundario"
            onClick={() => irA(hoy)}
            disabled={fecha === hoy}
          >
            Hoy
          </button>
          <button
            type="button"
            className="boton-secundario"
            onClick={() => irA(sumarDias(fecha, 1))}
            aria-label="Día siguiente"
          >
            ›
          </button>
        </nav>
      </div>

      {agenda.isError && <p className="error">{agenda.error.message}</p>}

      <div className="rejilla" style={{ '--columnas': Math.max(columnas.length, 1) } as CSSProperties}>
        <div className="regla" style={{ height: (hasta - desde) * PX_POR_MINUTO }} aria-hidden="true">
          {horas.map((m) => (
            <span key={m} style={{ top: (m - desde) * PX_POR_MINUTO }}>
              {String(m / 60).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {columnas.map((p) => (
          <section key={p.id} className="columna" aria-label={`Citas de ${p.nombre}`}>
            <h2 className="columna-nombre">{p.nombre}</h2>
            <ol className="columna-citas" style={{ height: (hasta - desde) * PX_POR_MINUTO }}>
              {horas.map((m) => (
                <li
                  key={m}
                  className="linea-hora"
                  style={{ top: (m - desde) * PX_POR_MINUTO }}
                  aria-hidden="true"
                />
              ))}
              {citas
                .filter((c) => c.profesional.id === p.id)
                .map((c) => {
                  const ini = minutoDelDia(c.inicio, zona);
                  const fin = minutoDelDia(c.fin, zona);
                  return (
                    <li
                      key={c.id}
                      className={`bloque${c.estado === 'CANCELADA' ? ' bloque-cancelado' : ''}`}
                      style={{
                        top: (ini - desde) * PX_POR_MINUTO,
                        height: Math.max((fin - ini) * PX_POR_MINUTO - 2, 22),
                      }}
                    >
                      <button type="button" onClick={() => setAbierta(c)} aria-haspopup="dialog">
                        <span className="bloque-hora">{hora(c.inicio, zona)}</span> {c.clienteNombre}
                        <span className="bloque-servicio">
                          {c.estado === 'CANCELADA' ? 'Cancelada' : c.servicio}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ol>
          </section>
        ))}
      </div>

      {abierta && (
        <div className="fondo-dialogo" onClick={() => setAbierta(undefined)}>
          <div
            className="dialogo"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialogo-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="dialogo-titulo">{abierta.clienteNombre}</h2>
            <p>
              {abierta.servicio} con {abierta.profesional.nombre}, de {hora(abierta.inicio, zona)} a{' '}
              {hora(abierta.fin, zona)}.
            </p>
            <p>
              <a href={`tel:${abierta.clienteTelefono.replace(/\s/g, '')}`}>{abierta.clienteTelefono}</a>
              {abierta.clienteEmail && (
                <>
                  <br />
                  <a href={`mailto:${abierta.clienteEmail}`}>{abierta.clienteEmail}</a>
                </>
              )}
            </p>
            {cancelar.isError && <p className="error">{cancelar.error.message}</p>}
            <div className="dialogo-acciones">
              {abierta.estado === 'CONFIRMADA' && (
                <button
                  type="button"
                  className="boton boton-peligro"
                  onClick={() => cancelar.mutate(abierta.id)}
                  disabled={cancelar.isPending}
                >
                  Cancelar la cita
                </button>
              )}
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setAbierta(undefined)}
                autoFocus
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
