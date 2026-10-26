import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API runs on :3000; proxying keeps the browser on one origin in development.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
