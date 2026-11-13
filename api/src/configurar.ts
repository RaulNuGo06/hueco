import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Lo que comparten main.ts y los tests e2e, para que los tests prueben la aplicación tal como arranca. */
export function configurar(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  // Rechaza escrituras que vengan de páginas de otros orígenes (CSRF), también en las rutas públicas
  app.enableCsrfProtection();
  app.enableShutdownHooks();
  return app;
}

export function documentar(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Hueco')
    .setDescription('Reservas de citas para negocios locales')
    .setVersion('1.0')
    .addCookieAuth('__Host-sid')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
}
