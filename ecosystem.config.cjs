module.exports = {
  apps: [
    {
      name: 'snapfeed-admin',
      script: 'src/adminServer.js',
      cwd: '/home/qareem/Projects/Personal/gossip.ugaplex.com',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        ADMIN_PORT: 3001,
        SITE_URL: 'http://localhost:3000',
      },
    },
    {
      name: 'snapfeed-public',
      script: 'src/server.js',
      cwd: '/home/qareem/Projects/Personal/gossip.ugaplex.com',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        SITE_URL: 'http://localhost:3000',
      },
    },
  ],
};
