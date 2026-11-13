import type { Hueco } from '../api';
import { agruparEnFranjas, hora } from '../formato';

interface Props {
  huecos: Hueco[];
  duracionMin: number;
  zona: string;
  elegido?: string;
  onElegir: (inicio: string) => void;
}

/**
 * Las horas libres del día, por franjas. Entre la mañana y la tarde se ve el descanso: en la jornada partida
 * el cliente entiende de un vistazo por qué no hay horas a mediodía.
 */
export function Horas({ huecos, duracionMin, zona, elegido, onElegir }: Props) {
  const franjas = agruparEnFranjas(huecos, duracionMin);

  return (
    <div className="franjas">
      {franjas.map((franja, i) => (
        <div key={franja.huecos[0].inicio} className="franja-con-descanso">
          {i > 0 && (
            <p className="descanso">
              Sin huecos libres de {hora(franjas[i - 1].fin, zona)} a {hora(franja.huecos[0].inicio, zona)}
            </p>
          )}
          <div
            className="horas"
            role="group"
            aria-label={`De ${hora(franja.huecos[0].inicio, zona)} a ${hora(franja.fin, zona)}`}
          >
            {franja.huecos.map((h) => (
              <button
                key={h.inicio}
                type="button"
                className="hora"
                aria-pressed={elegido === h.inicio}
                onClick={() => onElegir(h.inicio)}
              >
                {hora(h.inicio, zona)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
