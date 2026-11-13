import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { CurrentUser, Public, SignInService } from '@nestjs/authentication';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CuentasService } from './cuentas.service.js';
import type { UsuarioSesion } from './usuario.js';

const registroSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  contrasena: z.string().min(10).max(128),
});

const entradaSchema = z.object({
  email: z.email(),
  // Sin mínimo: una contraseña creada con una regla anterior tiene que seguir valiendo
  contrasena: z.string().max(128),
});

@ApiTags('cuentas')
@Controller()
export class CuentasController {
  constructor(
    private readonly cuentas: CuentasService,
    private readonly sesion: SignInService,
  ) {}

  @Public()
  @Post('auth/registro')
  async registro(@Body({ schema: registroSchema }) datos: z.infer<typeof registroSchema>) {
    const usuario = await this.cuentas.registrar(datos);
    await this.sesion.signIn(usuario.id, { method: 'password' });
    return usuario;
  }

  @Public()
  @Post('auth/entrar')
  @HttpCode(200)
  async entrar(@Body({ schema: entradaSchema }) datos: z.infer<typeof entradaSchema>) {
    const usuario = await this.cuentas.verificar(datos.email, datos.contrasena);
    if (!usuario) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    await this.sesion.signIn(usuario.id, { method: 'password' });
    return usuario;
  }

  @Public()
  @Post('auth/salir')
  @HttpCode(204)
  async salir() {
    await this.sesion.signOut();
  }

  @Get('yo')
  yo(@CurrentUser() usuario: UsuarioSesion) {
    return usuario;
  }
}
