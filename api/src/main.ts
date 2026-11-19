import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configurar, documentar, servirWeb } from './configurar.js';
import { migrar } from './db/migrar.js';

// Una sola instancia: las migraciones se aplican al arrancar
await migrar();

const app = configurar(await NestFactory.create<NestExpressApplication>(AppModule));
documentar(app);
// En la imagen de la demo la web va dentro; con docker compose la sirve nginx
if (process.env.CARPETA_WEB) servirWeb(app, process.env.CARPETA_WEB);
await app.listen(process.env.PORT ?? 3000);
