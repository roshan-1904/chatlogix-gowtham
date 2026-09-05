import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite automatically loads environment variables from:
// - .env                # loaded in all cases
// - .env.local          # loaded in all cases, ignored by git
// - .env.[mode]         # only loaded in specified mode (e.g., .env.production)
// - .env.[mode].local   # only loaded in specified mode, ignored by git
//
// Variables must be prefixed with VITE_ to be exposed to client code
//
// IMPORTANT: We use loadEnv() to manually load env vars in vite.config.ts
// because the config file is evaluated before Vite automatically loads .env files

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables manually (Vite hasn't loaded them yet at config time)
  // This ensures .env.production is loaded when mode === 'production'
  const env = loadEnv(mode, process.cwd(), '');

  // reCAPTCHA site key is fetched at runtime from GET /api/auth/recaptcha-params (Firebase Identity Toolkit).
  const apiUrl = env.VITE_API_URL || '';

  if (mode === 'production' && !apiUrl) {
    throw new Error(
      '❌ VITE_API_URL is missing!\nProduction builds require the backend API URL.\n'
    );
  }

  if (mode === 'development' && !apiUrl) {
    console.warn('\n⚠️  VITE_API_URL is not set; defaulting to http://localhost:8000/api at runtime.\n');
  }

  return {
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
      host: '127.0.0.1',
      port: 3000,
      open: 'http://127.0.0.1:3000/login',
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});

