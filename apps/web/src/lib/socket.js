import { io } from 'socket.io-client';

// Same-origin via the Vite proxy (vite.config.js), so the session cookie
// authenticates the socket. /client namespace; /daemon is server-only (Phase 4).
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io('/client', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) socket.disconnect();
}
