/**
 * Web push registration (Phase 6, improvement #8). Registers the service worker
 * and, on user opt-in, subscribes via PushManager with the server's VAPID public
 * key and POSTs the subscription. Silent no-ops when push isn't supported.
 */
import { api } from './api';

let swReady = null;

/** Register the service worker (idempotent). Resolves to the registration. */
export function registerSW() {
  if (swReady) return swReady;
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  swReady = navigator.serviceWorker.register('/sw.js').catch(() => null);
  return swReady;
}

function base64UrlToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Request notification permission + subscribe. Returns the PushSubscription on
 * success, or null if permission denied / push unsupported.
 */
export async function enablePush() {
  const reg = await registerSW();
  if (!reg || !('PushManager' in window)) return null;
  const { publicKey } = await api.get('/push/vapid-public');
  if (!publicKey) return null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    });
  }
  await api.post('/push/subscribe', {
    endpoint: sub.endpoint,
    keys: sub.toJSON().keys,
    expirationTime: sub.expirationTime ?? null,
  });
  return sub;
}
