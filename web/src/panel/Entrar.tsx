import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { panel } from '../api';

export function Entrar() {
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar');
  const navegar = useNavigate();
  const cliente = useQueryClient();

  const enviar = useMutation({
    mutationFn: (d: FormData) =>
      modo === 'entrar'
        ? panel.entrar(String(d.get('email')), String(d.get('contrasena')))
        : panel.registro(String(d.get('nombre')), String(d.get('email')), String(d.get('contrasena'))),
    onSuccess: (usuario) => {
      cliente.setQueryData(['yo'], usuario);
      navegar('/panel');
    },
  });

  const alEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    enviar.mutate(new FormData(e.currentTarget));
  };

  return (
    <main className="pagina estrecha">
      <h1>{modo === 'entrar' ? 'Entra en tu panel' : 'Crea tu cuenta'}</h1>
      <p className="suave">
        {modo === 'entrar' ? 'Para ver la agenda de tu negocio.' : 'Después podrás dar de alta tu negocio.'}
      </p>
      <form className="formulario" onSubmit={alEnviar}>
        {modo === 'registro' && (
          <label className="campo">
            <span>Tu nombre</span>
            <input name="nombre" autoComplete="name" required maxLength={80} />
          </label>
        )}
        <label className="campo">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <input
            name="contrasena"
            type="password"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            required
            minLength={modo === 'registro' ? 10 : undefined}
          />
          {modo === 'registro' && <small className="suave">Al menos 10 caracteres.</small>}
        </label>
        {enviar.isError && (
          <p className="error" role="alert">
            {enviar.error.message}
          </p>
        )}
        <button type="submit" className="boton" disabled={enviar.isPending}>
          {modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
      <p className="pie-enlace">
        <button
          type="button"
          className="enlace"
          onClick={() => {
            setModo(modo === 'entrar' ? 'registro' : 'entrar');
            enviar.reset();
          }}
        >
          {modo === 'entrar' ? '¿Aún no tienes cuenta? Crea una' : 'Ya tengo cuenta'}
        </button>
      </p>
    </main>
  );
}
