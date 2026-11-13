import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurar, documentar } from './configurar.js';
import { migrar } from './db/migrar.js';

// Una sola instancia: las migraciones se aplican al arrancar
await migrar();

const app = configurar(await NestFactory.create(AppModule));
documentar(app);
await app.listen(process.env.PORT ?? 3000);
