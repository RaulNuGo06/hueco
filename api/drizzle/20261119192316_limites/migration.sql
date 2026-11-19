CREATE TABLE "limites" (
	"clave" text PRIMARY KEY,
	"ventana_fin" timestamp with time zone NOT NULL,
	"cuenta" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "limites_ventana_fin_idx" ON "limites" ("ventana_fin");