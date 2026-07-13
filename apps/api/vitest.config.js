// Load apps/api/.env before tests so config.js validates and the health smoke
// test hits the real local DB. (CI sets these via job env instead.)
import 'dotenv/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    pool: 'forks',
    testTimeout: 15_000,
  },
});
