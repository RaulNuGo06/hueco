import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';

/** Lo que comparten main.ts y los tests e2e, para que los tests prueben la aplicación tal como arranca. */
export function configurar<T extends INestApplication>(app: T): T {
  // De qué proxies se fía Express para sacar la IP y el protocolo de X-Forwarded-*. Por defecto, de los de la
  // red local (el nginx del docker compose); un cliente desde fuera no puede hacerse pasar por otra IP.
  app.getHttpAdapter().getInstance().set('trust proxy', confianzaEnProxies(process.env.TRUST_PROXY));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  // Rechaza escrituras que vengan de páginas de otros orígenes (CSRF), también en las rutas públicas
  app.enableCsrfProtection();
  app.enableShutdownHooks();
  return app;
}

/** "true", un número de saltos o una lista de direcciones, como lo entiende Express. */
export function confianzaEnProxies(valor = 'loopback, uniquelocal'): boolean | number | string {
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  if (/^\d+$/.test(valor)) return Number(valor);
  return valor;
}

/**
 * Para desplegar un solo servicio (la demo en Render): la API sirve también la web compilada, en el mismo
 * origen, así la cookie de sesión y la protección CSRF funcionan igual que detrás de nginx.
 * Cualquier GET que no sea de la API ni un fichero devuelve index.html, para las rutas de React Router.
 */
export function servirWeb(app: NestExpressApplication, carpeta: string) {
  // Los ficheros con hash en el nombre no cambian nunca
  app.useStaticAssets(join(carpeta, 'assets'), { prefix: '/assets', immutable: true, maxAge: '1y' });
  app.useStaticAssets(carpeta, { index: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(carpeta, 'index.html'));
  });
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
