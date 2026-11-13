import { Route, Routes } from 'react-router';
import { Cita } from './cita/Cita';
import { Inicio } from './Inicio';
import { Agenda } from './panel/Agenda';
import { Entrar } from './panel/Entrar';
import { MisNegocios, Panel } from './panel/Panel';
import { Reserva } from './reserva/Reserva';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/r/:slug" element={<Reserva />} />
      <Route path="/cita/:codigo" element={<Cita />} />
      <Route path="/panel/entrar" element={<Entrar />} />
      <Route path="/panel" element={<Panel />}>
        <Route index element={<MisNegocios />} />
        <Route path=":slug" element={<Agenda />} />
      </Route>
      <Route
        path="*"
        element={
          <main className="pagina estrecha">
            <h1>Esta página no existe</h1>
          </main>
        }
      />
    </Routes>
  );
}
