CREATE TYPE "estado_cita" AS ENUM('CONFIRMADA', 'CANCELADA');--> statement-breakpoint
CREATE TABLE "citas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"negocio_id" uuid NOT NULL,
	"profesional_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"cliente_nombre" text NOT NULL,
	"cliente_telefono" text NOT NULL,
	"cliente_email" text,
	"estado" "estado_cita" DEFAULT 'CONFIRMADA'::"estado_cita" NOT NULL,
	"codigo" text NOT NULL UNIQUE,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelada_en" timestamp with time zone,
	CONSTRAINT "citas_intervalo_valido" CHECK ("inicio" < "fin")
);
--> statement-breakpoint
CREATE TABLE "horarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"profesional_id" uuid NOT NULL,
	"dia" smallint NOT NULL,
	"inicio" time NOT NULL,
	"fin" time NOT NULL,
	CONSTRAINT "horarios_dia_valido" CHECK ("dia" between 1 and 7),
	CONSTRAINT "horarios_tramo_valido" CHECK ("inicio" < "fin")
);
--> statement-breakpoint
CREATE TABLE "negocios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" text NOT NULL UNIQUE,
	"nombre" text NOT NULL,
	"zona_horaria" text DEFAULT 'Europe/Madrid' NOT NULL,
	"dueno_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profesional_servicios" (
	"profesional_id" uuid,
	"servicio_id" uuid,
	CONSTRAINT "profesional_servicios_pkey" PRIMARY KEY("profesional_id","servicio_id")
);
--> statement-breakpoint
CREATE TABLE "profesionales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"negocio_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"negocio_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"duracion_min" integer NOT NULL,
	"precio_centimos" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "servicios_duracion_valida" CHECK ("duracion_min" between 5 and 480 and "duracion_min" % 5 = 0),
	CONSTRAINT "servicios_precio_valido" CHECK ("precio_centimos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY,
	"usuario_id" uuid NOT NULL,
	"creada_en" timestamp with time zone NOT NULL,
	"caduca_en" timestamp with time zone NOT NULL,
	"ultima_actividad" timestamp with time zone NOT NULL,
	"mfa" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"nombre" text NOT NULL,
	"hash_contrasena" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "citas_negocio_inicio_idx" ON "citas" ("negocio_id","inicio");--> statement-breakpoint
CREATE INDEX "horarios_profesional_idx" ON "horarios" ("profesional_id");--> statement-breakpoint
CREATE INDEX "profesionales_negocio_idx" ON "profesionales" ("negocio_id");--> statement-breakpoint
CREATE INDEX "servicios_negocio_idx" ON "servicios" ("negocio_id");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" ("usuario_id");--> statement-breakpoint
CREATE INDEX "sesiones_caducidad_idx" ON "sesiones" ("caduca_en");--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_profesional_id_profesionales_id_fkey" FOREIGN KEY ("profesional_id") REFERENCES "profesionales"("id");--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_servicio_id_servicios_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id");--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_profesional_id_profesionales_id_fkey" FOREIGN KEY ("profesional_id") REFERENCES "profesionales"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_dueno_id_usuarios_id_fkey" FOREIGN KEY ("dueno_id") REFERENCES "usuarios"("id");--> statement-breakpoint
ALTER TABLE "profesional_servicios" ADD CONSTRAINT "profesional_servicios_profesional_id_profesionales_id_fkey" FOREIGN KEY ("profesional_id") REFERENCES "profesionales"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profesional_servicios" ADD CONSTRAINT "profesional_servicios_servicio_id_servicios_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profesionales" ADD CONSTRAINT "profesionales_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_negocio_id_negocios_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE;