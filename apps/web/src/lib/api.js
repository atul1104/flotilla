/**
 * Thin fetch wrapper. Sends cookies (credentials: include), JSON, and throws
 * a typed error the UI can switch on. Base path is proxied by Vite to the API
 * (vite.config.js). All endpoints live under /api/v1.
 */
export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const BASE = '/api/v1';

async function request(path, { method = 'GET', body, query, signal } = {}) {
  const url = query ? `${BASE}${path}?${new URLSearchParams(query)}` : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(data?.error || res.statusText, {
      status: res.status,
      code: data?.code,
      details: data?.details,
    });
  }
  return data;
}

export const api = {
  get: (path, opts) => request(path, { ...opts }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};
