-- Un profesional no puede tener dos citas confirmadas que se solapen.
-- Lo garantiza PostgreSQL, no el código: aunque lleguen diez reservas a la vez para el mismo hueco,
-- solo entra una y las demás fallan con el error 23P01, que la API convierte en un 409.
-- El intervalo es [inicio, fin): una cita que acaba a las 10:00 no choca con otra que empieza a las 10:00.
-- btree_gist hace falta para combinar la igualdad del uuid con el solape de rangos en el mismo índice.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_sin_solapes"
  EXCLUDE USING gist ("profesional_id" WITH =, tstzrange("inicio", "fin", '[)') WITH &&)
  WHERE ("estado" = 'CONFIRMADA');
