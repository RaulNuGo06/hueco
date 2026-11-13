import { ConflictException, Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import { codigoPostgres, VIOLA_UNICIDAD, type Database } from '../db/database.js';
import { usuarios } from '../db/schema.js';
import { normalizarEmail, type UsuarioSesion } from './usuario.js';

const publico = { id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre };

@Injectable()
export class CuentasService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly hasher: PasswordHasher,
  ) {}

  async registrar(datos: { nombre: string; email: string; contrasena: string }): Promise<UsuarioSesion> {
    const hashContrasena = await this.hasher.hash(datos.contrasena);
    try {
      const [usuario] = await this.db
        .insert(usuarios)
        .values({ nombre: datos.nombre.trim(), email: normalizarEmail(datos.email), hashContrasena })
        .returning(publico);
      return usuario;
    } catch (error) {
      // La restricción única decide, no una consulta previa: dos registros a la vez no pueden colarse
      if (codigoPostgres(error) === VIOLA_UNICIDAD) {
        throw new ConflictException('Ya hay una cuenta con ese email');
      }
      throw error;
    }
  }

  /** El usuario, o null si el email o la contraseña no son correctos. */
  async verificar(email: string, contrasena: string): Promise<UsuarioSesion | null> {
    const [fila] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, normalizarEmail(email)));
    // Sin cuenta se compara con un hash de relleno: el tiempo de respuesta no dice qué emails existen
    const valida = await this.hasher.verify(contrasena, fila?.hashContrasena);
    if (!valida || !fila) return null;

    if (this.hasher.needsRehash(fila.hashContrasena)) {
      await this.db
        .update(usuarios)
        .set({ hashContrasena: await this.hasher.hash(contrasena) })
        .where(eq(usuarios.id, fila.id));
    }
    return { id: fila.id, email: fila.email, nombre: fila.nombre };
  }

  async buscarPorId(id: string): Promise<UsuarioSesion | null> {
    const [usuario] = await this.db.select(publico).from(usuarios).where(eq(usuarios.id, id));
    return usuario ?? null;
  }
}
