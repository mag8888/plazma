module.exports = {
  apps: [
    {
      name: 'plazma-bot',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
      },
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
