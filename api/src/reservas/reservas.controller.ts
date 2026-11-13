import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ReservasService } from './reservas.service.js';

export const fechaSchema = z.iso.date();

const huecosSchema = z.object({
  servicio: z.uuid(),
  fecha: fechaSchema,
  profesional: z.uuid().optional(),
});

const reservaSchema = z.object({
  servicioId: z.uuid(),
  profesionalId: z.uuid().optional(),
  inicio: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  cliente: z.object({
    nombre: z.string().trim().min(2).max(80),
    telefono: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ]{9,15}$/, 'Teléfono no válido'),
    email: z.email().max(254).optional(),
  }),
});

const codigoSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

/** Lo que usa el cliente desde el enlace del negocio, sin cuenta. */
@ApiTags('reservas')
@Public()
@Controller()
export class ReservasController {
  constructor(private readonly reservas: ReservasService) {}

  @Get('negocios/:slug')
  ficha(@Param('slug') slug: string) {
    return this.reservas.ficha(slug);
  }

  @Get('negocios/:slug/huecos')
  huecos(@Param('slug') slug: string, @Query({ schema: huecosSchema }) q: z.infer<typeof huecosSchema>) {
    return this.reservas.huecos(slug, {
      servicioId: q.servicio,
      fecha: q.fecha,
      profesionalId: q.profesional,
    });
  }

  @Post('negocios/:slug/citas')
  reservar(
    @Param('slug') slug: string,
    @Body({ schema: reservaSchema }) datos: z.infer<typeof reservaSchema>,
  ) {
    return this.reservas.reservar(slug, datos);
  }

  @Get('citas/:codigo')
  consultar(@Param('codigo', { schema: codigoSchema }) codigo: string) {
    return this.reservas.consultar(codigo);
  }

  @Post('citas/:codigo/cancelar')
  @HttpCode(200)
  cancelar(@Param('codigo', { schema: codigoSchema }) codigo: string) {
    return this.reservas.cancelar(codigo);
  }
}
