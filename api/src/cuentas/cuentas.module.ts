import { Module } from '@nestjs/common';
import { CuentasController } from './cuentas.controller.js';
import { CuentasService } from './cuentas.service.js';
import { SesionProvider } from './sesion.provider.js';
import { SesionesStore } from './sesiones.store.js';

@Module({
  controllers: [CuentasController],
  providers: [CuentasService, SesionProvider, SesionesStore],
})
export class CuentasModule {}
