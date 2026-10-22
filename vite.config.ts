import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Static SPA, deployable as-is to Cloudflare Pages (build output: dist/).
export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
});
