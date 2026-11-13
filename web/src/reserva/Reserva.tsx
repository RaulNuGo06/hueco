import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ErrorApi, reservas, type FichaNegocio, type Servicio } from '../api';
import { duracion, fechaLarga, hora, partesDelDia, precio, proximosDias, sumarDias } from '../formato';
import { Horas } from './Horas';

const DIAS_VISIBLES = 21;

export function Reserva() {
  const { slug = '' } = useParams();
  const ficha = useQuery({ queryKey: ['ficha', slug], queryFn: () => reservas.ficha(slug) });

  if (ficha.isPending) return <p className="cargando">Cargando…</p>;
  if (ficha.isError) {
    return (
      <main className="pagina estrecha">
        <h1>No encontramos este negocio</h1>
        <p className="suave">Revisa el enlace que te han pasado.</p>
      </main>
    );
  }
  return <Pasos ficha={ficha.data} />;
}

function Pasos({ ficha }: { ficha: FichaNegocio }) {
  const navegar = useNavigate();
  const zona = ficha.zonaHoraria;
  const dias = proximosDias(DIAS_VISIBLES, zona);

  const [servicio, setServicio] = useState<Servicio | undefined>(
    ficha.servicios.length === 1 ? ficha.servicios[0] : undefined,
  );
  const [profesional, setProfesional] = useState<string>('');
  const [fecha, setFecha] = useState(dias[0]);
  const [inicio, setInicio] = useState<string>();
  const datosRef = useRef<HTMLFormElement>(null);

  const profesionalesDelServicio = ficha.profesionales.filter(
    (p) => servicio && p.servicios.includes(servicio.id),
  );

  const huecos = useQuery({
    queryKey: ['huecos', ficha.slug, servicio?.id, fecha, profesional],
    queryFn: () => reservas.huecos(ficha.slug, servicio!.id, fecha, profesional || undefined),
    enabled: !!servicio,
  });

  const reservar = useMutation({
    mutationFn: (cliente: { nombre: string; telefono: string; email?: string }) =>
      reservas.reservar(ficha.slug, {
        servicioId: servicio!.id,
        profesionalId: profesional || undefined,
        inicio: inicio!,
        cliente,
      }),
    onSuccess: (cita) => navegar(`/cita/${cita.codigo}`, { state: { recienReservada: true } }),
    onError: (error) => {
      // Otra persona se ha llevado el hueco mientras rellenabas: se recargan las horas
      if (error instanceof ErrorApi && error.estado === 409) {
        setInicio(undefined);
        void huecos.refetch();
      }
    },
  });

  useEffect(() => {
    if (inicio) datosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [inicio]);

  const elegirServicio = (s: Servicio) => {
    setServicio(s);
    setInicio(undefined);
    if (profesional && !ficha.profesionales.find((p) => p.id === profesional)?.servicios.includes(s.id)) {
      setProfesional('');
    }
  };

  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const email = String(datos.get('email') ?? '').trim();
    reservar.mutate({
      nombre: String(datos.get('nombre')),
      telefono: String(datos.get('telefono')),
      email: email || undefined,
    });
  };

  return (
    <main className="pagina estrecha reserva">
      <header className="cabecera-negocio">
        <p className="suave">Reserva tu hueco en</p>
        <h1>{ficha.nombre}</h1>
      </header>

      <section className="paso" aria-labelledby="paso-servicio">
        <h2 id="paso-servicio">
          <span className="numero">1</span> Qué te hacemos
        </h2>
        <ul className="servicios">
          {ficha.servicios.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="servicio"
                aria-pressed={servicio?.id === s.id}
                onClick={() => elegirServicio(s)}
              >
                <span className="servicio-nombre">{s.nombre}</span>
                <span className="servicio-detalle">
                  {duracion(s.duracionMin)} <span aria-hidden="true">·</span> {precio(s.precioCentimos)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {servicio && (
        <section className="paso" aria-labelledby="paso-dia">
          <h2 id="paso-dia">
            <span className="numero">2</span> Qué día
          </h2>

          {profesionalesDelServicio.length > 1 && (
            <label className="campo campo-linea">
              <span>Con</span>
              <select
                value={profesional}
                onChange={(e) => {
                  setProfesional(e.target.value);
                  setInicio(undefined);
                }}
              >
                <option value="">quien esté libre</option>
                {profesionalesDelServicio.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="dias" role="group" aria-label="Días">
            {dias.map((d) => {
              const { semana, numero, mes } = partesDelDia(d);
              return (
                <button
                  key={d}
                  type="button"
                  className="dia"
                  aria-pressed={fecha === d}
                  aria-label={fechaLarga(`${d}T12:00:00Z`, 'UTC')}
                  onClick={() => {
                    setFecha(d);
                    setInicio(undefined);
                  }}
                >
                  <span className="dia-semana">{semana}</span>
                  <span className="dia-numero">{numero}</span>
                  {numero === 1 || d === dias[0] ? <span className="dia-mes">{mes}</span> : null}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {servicio && (
        <section className="paso" aria-labelledby="paso-hora" aria-busy={huecos.isFetching}>
          <h2 id="paso-hora">
            <span className="numero">3</span> A qué hora
          </h2>
          {huecos.isPending && <p className="suave">Buscando horas libres…</p>}
          {huecos.isError && <p className="error">{huecos.error.message}</p>}
          {huecos.data?.length === 0 && (
            <div className="vacio">
              <p>El {fechaLarga(`${fecha}T12:00:00Z`, 'UTC')} no queda ningún hueco.</p>
              {fecha < dias[dias.length - 1] && (
                <button
                  type="button"
                  className="boton-secundario"
                  onClick={() => setFecha(sumarDias(fecha, 1))}
                >
                  Ver el día siguiente
                </button>
              )}
            </div>
          )}
          {huecos.data && huecos.data.length > 0 && (
            <Horas
              huecos={huecos.data}
              duracionMin={servicio.duracionMin}
              zona={zona}
              elegido={inicio}
              onElegir={setInicio}
            />
          )}
        </section>
      )}

      {servicio && inicio && (
        <form ref={datosRef} className="paso datos" onSubmit={enviar} aria-labelledby="paso-datos">
          <h2 id="paso-datos">
            <span className="numero">4</span> Tus datos
          </h2>
          <p className="resumen">
            {servicio.nombre}, el {fechaLarga(inicio, zona)} a las {hora(inicio, zona)}
            {profesional && <> con {ficha.profesionales.find((p) => p.id === profesional)?.nombre}</>}.
          </p>
          <label className="campo">
            <span>Nombre</span>
            <input name="nombre" autoComplete="name" required minLength={2} maxLength={80} />
          </label>
          <label className="campo">
            <span>Teléfono</span>
            <input
              name="telefono"
              type="tel"
              autoComplete="tel"
              required
              pattern="\+?[0-9 ]{9,15}"
              inputMode="tel"
            />
          </label>
          <label className="campo">
            <span>
              Email <span className="suave">(opcional)</span>
            </span>
            <input name="email" type="email" autoComplete="email" maxLength={254} />
          </label>
          {reservar.isError && (
            <p className="error" role="alert">
              {reservar.error.message}
              {reservar.error instanceof ErrorApi && reservar.error.estado === 409
                ? '. Elige otra hora.'
                : ''}
            </p>
          )}
          <button type="submit" className="boton" disabled={reservar.isPending}>
            {reservar.isPending ? 'Reservando…' : `Reservar a las ${hora(inicio, zona)}`}
          </button>
        </form>
      )}
    </main>
  );
}
