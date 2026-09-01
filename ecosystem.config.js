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
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'chatlogix-media-worker',
      script: './backend/dist/workers/mediaWorker.js',
      cwd: '/home/bitnami/chatlogix',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'media'
      },
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'media'
      },
      error_file: './logs/media-worker-error.log',
      out_file: './logs/media-worker-out.log',
      log_file: './logs/media-worker-combined.log',
      time: true,
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    }
  ],

  deploy: {
    production: {
      user: 'ubuntu',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/chatlogix.git',
      path: '/home/ubuntu/chatlogix',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
