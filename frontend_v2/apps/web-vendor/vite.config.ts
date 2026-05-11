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

  // Validate required environment variables at build time
  const recaptchaKey = env.VITE_RECAPTCHA_SITE_KEY || '';

  // Warn in development if env vars are missing
  if (mode === 'development') {
    if (!recaptchaKey || recaptchaKey.includes('your-') || recaptchaKey.includes('placeholder')) {
      console.warn(
        '\n⚠️  Missing or placeholder environment variables detected:\n' +
        '  - VITE_RECAPTCHA_SITE_KEY\n' +
        '\nPlease create .env.local file with these variables.\n' +
        'See env.template for reference.\n'
      );
    } else {
      console.log('✅ reCAPTCHA Site Key loaded from .env files');
    }
  }

  // Error in production build if critical env vars are missing
  if (mode === 'production') {
    if (!recaptchaKey || recaptchaKey.includes('your-') || recaptchaKey.includes('placeholder')) {
      console.error('\n❌ Environment variable validation failed:');
      console.error('  VITE_RECAPTCHA_SITE_KEY:', recaptchaKey ? `"${recaptchaKey.substring(0, 20)}..."` : '(empty)');
      console.error('\n📁 Looking for .env files in:', process.cwd());
      throw new Error(
        '❌ VITE_RECAPTCHA_SITE_KEY is missing or contains placeholder value!\n' +
        'Production builds require a valid reCAPTCHA site key.\n' +
        'Set it in .env.production or as an environment variable before building.\n' +
        `Current value: ${recaptchaKey ? `"${recaptchaKey.substring(0, 30)}..."` : '(empty)'}`
      );
    }
    console.log('✅ reCAPTCHA Site Key validated for production build');
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
      port: 3000,
      open: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});

