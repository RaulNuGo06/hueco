import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ErrorApi } from './api';
import { App } from './App';
import './estilos.css';

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // Un 4xx no se arregla reintentando
      retry: (veces, error) => !(error instanceof ErrorApi && error.estado < 500) && veces < 2,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
