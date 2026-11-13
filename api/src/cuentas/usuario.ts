/** El usuario que ve el resto de la aplicación: nunca lleva el hash de la contraseña. */
export interface UsuarioSesion {
  id: string;
  email: string;
  nombre: string;
}

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: UsuarioSesion;
  }
}

/** Como el paquete compara los emails: sin espacios, en minúsculas y con los acentos en forma NFC. */
export const normalizarEmail = (email: string) => email.trim().normalize('NFC').toLowerCase();
