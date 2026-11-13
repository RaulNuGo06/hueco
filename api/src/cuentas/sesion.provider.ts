import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, SessionCookieProvider, type SessionRecord } from '@nestjs/authentication';
import { CuentasService } from './cuentas.service.js';
import type { UsuarioSesion } from './usuario.js';

/** Quién hace la petición, a partir de la cookie de sesión. */
@Injectable()
export class SesionProvider extends SessionCookieProvider<UsuarioSesion> {
  constructor(
    private readonly cuentas: CuentasService,
    registro: AuthenticationRegistry,
  ) {
    super();
    registro.registerProvider(this);
  }

  // En cada petición: si el usuario ya no existe, la sesión deja de valer al momento
  validate(sesion: SessionRecord) {
    return this.cuentas.buscarPorId(sesion.userId);
  }
}
