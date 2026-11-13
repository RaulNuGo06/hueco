import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { Link, Navigate, Outlet, useNavigate } from 'react-router';
import { api, ErrorApi, panel, type NegocioPropio } from '../api';

/** El marco del panel: comprueba la sesión y lista los negocios del dueño. */
export function Panel() {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const yo = useQuery({ queryKey: ['yo'], queryFn: panel.yo, retry: false });
  const salir = useMutation({
    mutationFn: panel.salir,
    onSuccess: () => {
      cliente.clear();
      navegar('/panel/entrar');
    },
  });

  if (yo.isPending) return <p className="cargando">Cargando…</p>;
  if (yo.isError) {
    if (yo.error instanceof ErrorApi && yo.error.estado === 401)
      return <Navigate to="/panel/entrar" replace />;
    return <p className="error pagina">{yo.error.message}</p>;
  }

  return (
    <div className="panel">
      <header className="barra">
        <Link to="/panel" className="marca">
          hueco
        </Link>
        <span className="suave">{yo.data.nombre}</span>
        <button type="button" className="enlace" onClick={() => salir.mutate()}>
          Salir
        </button>
      </header>
      <Outlet />
    </div>
  );
}

/** /panel: lleva al primer negocio, o deja dar de alta el primero. */
export function MisNegocios() {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const negocios = useQuery({ queryKey: ['negocios'], queryFn: panel.negocios });
  const crear = useMutation({
    mutationFn: (nombre: string) => api<NegocioPropio>('/panel/negocios', { cuerpo: { nombre } }),
    onSuccess: (negocio) => {
      void cliente.invalidateQueries({ queryKey: ['negocios'] });
      navegar(`/panel/${negocio.slug}`);
    },
  });

  if (negocios.isPending) return <p className="cargando">Cargando…</p>;
  if (negocios.isError) return <p className="error pagina">{negocios.error.message}</p>;
  if (negocios.data.length > 0) return <Navigate to={`/panel/${negocios.data[0].slug}`} replace />;

  const alEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    crear.mutate(String(new FormData(e.currentTarget).get('nombre')));
  };

  return (
    <main className="pagina estrecha">
      <h1>Da de alta tu negocio</h1>
      <p className="suave">Con el nombre se crea el enlace donde reservarán tus clientes.</p>
      <form className="formulario" onSubmit={alEnviar}>
        <label className="campo">
          <span>Nombre del negocio</span>
          <input name="nombre" required minLength={2} maxLength={80} placeholder="Peluquería Ñandú" />
        </label>
        {crear.isError && (
          <p className="error" role="alert">
            {crear.error.message}
          </p>
        )}
        <button type="submit" className="boton" disabled={crear.isPending}>
          Dar de alta
        </button>
      </form>
      <p className="suave">
        Los servicios, el equipo y los horarios se configuran por ahora desde la API (
        <a href="/api/docs">/api/docs</a>).
      </p>
    </main>
  );
}
