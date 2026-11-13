import { Link } from 'react-router';

export function Inicio() {
  return (
    <main className="pagina estrecha inicio">
      <h1 className="logotipo">hueco</h1>
      <p className="lema">Tus clientes reservan desde el móvil. Tú ves la agenda del día.</p>
      <p>
        Para peluquerías, barberías, fisios y talleres: cada negocio tiene un enlace donde el cliente elige
        servicio, día y hora, sin crear cuenta. Las horas salen del horario de cada profesional, con jornada
        partida, y dos personas nunca se quedan con el mismo hueco.
      </p>
      <ul className="enlaces-inicio">
        <li>
          <Link to="/r/barberia-el-tupe">Reservar en la barbería de demostración</Link>
        </li>
        <li>
          <Link to="/panel">Entrar en el panel</Link>
        </li>
      </ul>
    </main>
  );
}
