import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Cookie-auth API + (Phase 2) Socket.IO, proxied to the Express server.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', changeOrigin: true, ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy vendor libs out of the app chunk (Phase 8).
          recharts: ['recharts'],
          markdown: ['react-markdown', 'remark-gfm', 'rehype-sanitize'],
          query: ['@tanstack/react-query', '@tanstack/react-virtual'],
          router: ['react-router-dom'],
          socket: ['socket.io-client'],
        },
      },
    },
  },
});
