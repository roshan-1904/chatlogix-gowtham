import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@chatlogix/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@chatlogix/design-tokens': path.resolve(__dirname, '../../packages/design-tokens/src'),
      '@chatlogix/hooks': path.resolve(__dirname, '../../packages/hooks/src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3002,
    open: 'http://127.0.0.1:3002/',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
