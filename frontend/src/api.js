import axios from 'axios';
import { io } from 'socket.io-client';

export function getToken() { return localStorage.getItem('skyfall_token'); }
export function getUsuario() {
  const raw = localStorage.getItem('skyfall_usuario');
  return raw ? JSON.parse(raw) : null;
}
export function salvarSessao(token, usuario) {
  localStorage.setItem('skyfall_token', token);
  localStorage.setItem('skyfall_usuario', JSON.stringify(usuario));
}
export function sair() {
  localStorage.removeItem('skyfall_token');
  localStorage.removeItem('skyfall_usuario');
}

const BASE_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({ baseURL: `${BASE_URL}/api` });
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let socket;
export function conectarSocket() {
  if (socket) return socket;
  socket = io(BASE_URL || undefined, { auth: { token: getToken() }, reconnectionDelayMax: 3000 });
  // navegador de celular derruba a conexão em segundo plano: reconecta assim que voltar pra tela ou a internet voltar
  const reconectar = () => { if (socket && !socket.connected) socket.connect(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reconectar(); });
  window.addEventListener('online', reconectar);
  window.addEventListener('focus', reconectar);
  return socket;
}
export function getSocket() { return socket; }
