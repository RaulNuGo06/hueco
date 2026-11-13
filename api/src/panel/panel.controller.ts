import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { fechaSchema } from '../reservas/reservas.controller.js';
import { PanelService } from './panel.service.js';

const negocioSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones')
    .max(60)
    .optional(),
  zonaHoraria: z
    .string()
    .refine((zona) => Intl.supportedValuesOf('timeZone').includes(zona), 'Zona horaria desconocida')
    .default('Europe/Madrid'),
});

const servicioSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  duracionMin: z.number().int().min(5).max(480).multipleOf(5),
  precioCentimos: z.number().int().min(0).max(1_000_000),
  activo: z.boolean().optional(),
});

const profesionalSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  servicios: z.array(z.uuid()).max(100).default([]),
});

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM');
const horarioSchema = z.object({
  tramos: z
    .array(
      z
        .object({ dia: z.number().int().min(1).max(7), inicio: hora, fin: hora })
        .refine((t) => t.inicio < t.fin, 'El tramo tiene que acabar después de empezar'),
    )
    .max(50),
});

const id = { schema: z.uuid() };

@ApiTags('panel')
@Controller('panel/negocios')
export class PanelController {
  constructor(private readonly panel: PanelService) {}

  @Get()
  misNegocios() {
    return this.panel.misNegocios();
  }

  @Post()
  crearNegocio(@Body({ schema: negocioSchema }) datos: z.infer<typeof negocioSchema>) {
    return this.panel.crearNegocio(datos);
  }

  @Get(':slug/agenda')
  agenda(@Param('slug') slug: string, @Query('fecha', { schema: fechaSchema }) fecha: string) {
    return this.panel.agenda(slug, fecha);
  }

  @Post(':slug/citas/:id/cancelar')
  @HttpCode(200)
  cancelarCita(@Param('slug') slug: string, @Param('id', id) citaId: string) {
    return this.panel.cancelarCita(slug, citaId);
  }

  @Get(':slug/servicios')
  servicios(@Param('slug') slug: string) {
    return this.panel.servicios(slug);
  }

  @Post(':slug/servicios')
  crearServicio(
    @Param('slug') slug: string,
    @Body({ schema: servicioSchema }) datos: z.infer<typeof servicioSchema>,
  ) {
    return this.panel.crearServicio(slug, datos);
  }

  @Patch(':slug/servicios/:id')
  editarServicio(
    @Param('slug') slug: string,
    @Param('id', id) servicioId: string,
    @Body({ schema: servicioSchema.partial() }) cambios: Partial<z.infer<typeof servicioSchema>>,
  ) {
    return this.panel.editarServicio(slug, servicioId, cambios);
  }

  @Get(':slug/profesionales')
  profesionales(@Param('slug') slug: string) {
    return this.panel.profesionales(slug);
  }

  @Post(':slug/profesionales')
  crearProfesional(
    @Param('slug') slug: string,
    @Body({ schema: profesionalSchema }) datos: z.infer<typeof profesionalSchema>,
  ) {
    return this.panel.crearProfesional(slug, datos);
  }

  @Put(':slug/profesionales/:id/horario')
  ponerHorario(
    @Param('slug') slug: string,
    @Param('id', id) profesionalId: string,
    @Body({ schema: horarioSchema }) datos: z.infer<typeof horarioSchema>,
  ) {
    return this.panel.ponerHorario(slug, profesionalId, datos.tramos);
  }
}
