import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { CuentasModule } from './cuentas/cuentas.module.js';
import { urlBaseDeDatos } from './db/migrar.js';
import { PanelController } from './panel/panel.controller.js';
import { PanelService } from './panel/panel.service.js';
import { ReservasController } from './reservas/reservas.controller.js';
import { ReservasService } from './reservas/reservas.service.js';
import { SaludController } from './salud.controller.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: urlBaseDeDatos() }),
    }),
    AuthenticationModule.forRoot({
      session: {
        absoluteTtl: '14d',
        idleTtl: '3d',
        // Detrás de HTTP sin TLS (docker compose en local) la cookie no puede ser Secure
        cookie: { secure: process.env.COOKIE_SEGURA !== 'false' },
      },
    }),
    CuentasModule,
  ],
  controllers: [SaludController, ReservasController, PanelController],
  providers: [ReservasService, PanelService],
})
export class AppModule {}
