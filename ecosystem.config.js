module.exports = {
  apps: [
    {
      name: 'chatlogix-backend',
      script: './backend/dist/index.js',
      cwd: '/home/bitnami/chatlogix',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
      // Box has 447Mi total RAM shared with Postgres, Redis, and nginx -- '1G'
      // is bigger than the whole instance, so it never actually protects
      // anything before the OS OOM-killer acts on some other process instead.
      max_memory_restart: '250M',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
      kill_timeout: 5000,
      // Fork + a single port cannot zero-downtime reload: PM2 starts the new
      // process before the old one releases :3000 → EADDRINUSE crash loop.
      // Deploy uses `pm2 restart` (stop then start). wait_ready is unused.
      wait_ready: false
    }
    // chatlogix-media-worker retired from production PM2 — media fetch now
    // runs on the chatlogix-media-fetcher Lambda (SQS-triggered off
    // MEDIA_FETCH_QUEUE_URL). backend/src/workers/mediaWorker.ts still exists
    // as a local-dev/manual-fallback runner sharing the same processJob()
    // logic (services/mediaFetchProcessor.ts) — run it directly with
    // `npm run worker:media` if needed, it's just no longer PM2-managed.
  ],

  deploy: {
    production: {
      user: 'ubuntu',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/chatlogix.git',
      path: '/home/ubuntu/chatlogix',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 restart ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
