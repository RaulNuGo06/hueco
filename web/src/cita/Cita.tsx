import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { reservas } from '../api';
import { fechaLarga, hora, precio } from '../formato';

/** El enlace que se guarda el cliente: ver su cita y cancelarla, sin cuenta. */
export function Cita() {
  const { codigo = '' } = useParams();
  const recienReservada = (useLocation().state as { recienReservada?: boolean } | null)?.recienReservada;
  const cliente = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const [ahora] = useState(() => Date.now());

  const cita = useQuery({ queryKey: ['cita', codigo], queryFn: () => reservas.cita(codigo) });
  const cancelar = useMutation({
    mutationFn: () => reservas.cancelar(codigo),
    onSuccess: (c) => cliente.setQueryData(['cita', codigo], c),
  });

  if (cita.isPending) return <p className="cargando">Cargando…</p>;
  if (cita.isError) {
    return (
      <main className="pagina estrecha">
        <h1>No encontramos esta cita</h1>
        <p className="suave">Revisa que el enlace esté completo.</p>
      </main>
    );
  }

  const c = cita.data;
  const zona = c.negocio.zonaHoraria;
  const cancelada = c.estado === 'CANCELADA';
  const pasada = new Date(c.inicio).getTime() < ahora;

  return (
    <main className="pagina estrecha">
      {recienReservada && !cancelada && (
        <p className="aviso" role="status">
          Reservado. Guarda esta página: desde aquí puedes cancelar.
        </p>
      )}

      <article className={`ticket${cancelada ? ' ticket-cancelado' : ''}`}>
        <p className="ticket-negocio">{c.negocio.nombre}</p>
        <p className="ticket-hora">{hora(c.inicio, zona)}</p>
        <p className="ticket-fecha">{fechaLarga(c.inicio, zona)}</p>
        <dl className="ticket-detalle">
          <div>
            <dt>Servicio</dt>
            <dd>
              {c.servicio}, {precio(c.precioCentimos)}
            </dd>
          </div>
          <div>
            <dt>Te atiende</dt>
            <dd>{c.profesional}</dd>
          </div>
          <div>
            <dt>A nombre de</dt>
            <dd>{c.clienteNombre}</dd>
          </div>
        </dl>
        {cancelada && <p className="sello">Cancelada</p>}
      </article>

      {!cancelada && !pasada && (
        <div className="acciones">
          {confirmando ? (
            <>
              <p>
                ¿Cancelar la cita del {fechaLarga(c.inicio, zona)}? El hueco quedará libre para otra persona.
              </p>
              <button
                type="button"
                className="boton boton-peligro"
                onClick={() => cancelar.mutate()}
                disabled={cancelar.isPending}
              >
                {cancelar.isPending ? 'Cancelando…' : 'Sí, cancelar la cita'}
              </button>
              <button type="button" className="boton-secundario" onClick={() => setConfirmando(false)}>
                No, mantenerla
              </button>
            </>
          ) : (
            <button type="button" className="boton-secundario" onClick={() => setConfirmando(true)}>
              Cancelar la cita
            </button>
          )}
          {cancelar.isError && <p className="error">{cancelar.error.message}</p>}
        </div>
      )}

      <p className="pie-enlace">
        <Link to={`/r/${c.negocio.slug}`}>{cancelada ? 'Reservar otra hora' : 'Reservar otra cita'}</Link>
      </p>
    </main>
  );
}
