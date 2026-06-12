import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // In dev, the frontend talks to the local backend without CORS/env config.
      '/api': 'http://localhost:3001',
    },
  },
});
