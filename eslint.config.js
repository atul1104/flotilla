// ESLint flat config (v9). Plain JS, ESM. No TypeScript — Zod schemas are the
// runtime contract layer (PLAN.md §3). This is the static-analysis gate in CI.
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.vite/**',
      '**/coverage/**',
      'apps/api/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  // Browser/Vite apps: React-friendly globals + JSX var-tracking.
  {
    files: ['apps/web/**/*.{js,jsx}', 'apps/landing/**/*.{js,jsx}'],
    plugins: { react },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // new JSX transform
      'react/prop-types': 'off',
    },
  },
  // Tests: Vitest/Playwright globals.
  {
    files: ['**/*.test.js', '**/*.spec.js', 'tests/**/*.{js,jsx}', 'e2e/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.worker } },
  },
  // Vite/node config files + Prisma-generated client: relax.
  {
    files: ['**/*.config.js', '**/vite.config.js', 'apps/api/prisma/**/*.js'],
    rules: { 'no-undef': 'off' },
  },
  prettier,
];
