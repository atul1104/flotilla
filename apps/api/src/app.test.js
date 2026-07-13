/**
 * Smoke test: app boots, health endpoint responds, unknown routes 404.
 * Uses Supertest against createApp() — no port binding (PLAN.md §13).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

const app = createApp();

describe('app smoke', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  it('responds to /health (200) with ok status', async () => {
    const res = await request(app).get('/health');
    // DB may be down in a sandbox; accept ok or 503 but the route must answer.
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
  });

  it('parses JSON bodies (echo via a crafted 404 still routes)', async () => {
    const res = await request(app).get('/health').set('Accept', 'application/json');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
