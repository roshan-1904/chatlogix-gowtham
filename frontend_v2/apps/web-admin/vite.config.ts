/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@chatlogix/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@chatlogix/design-tokens': path.resolve(__dirname, '../../packages/design-tokens/src'),
      '@chatlogix/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@chatlogix/hooks': path.resolve(__dirname, '../../packages/hooks/src'),
      '@chatlogix/schemas': path.resolve(__dirname, '../../packages/schemas/src'),
      '@chatlogix/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@chatlogix/config': path.resolve(__dirname, '../../packages/config/src'),
      '@chatlogix/auth': path.resolve(__dirname, '../../packages/auth/src'),
    },
  },
  server: {
    port: 3001,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});

