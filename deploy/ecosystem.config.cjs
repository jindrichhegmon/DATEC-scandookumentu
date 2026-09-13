// pm2 start deploy/ecosystem.config.cjs   (na VPS jako uživatel jhnapps)
module.exports = {
  apps: [{
    name: 'datec-scandookumentu',
    script: 'server.mjs',
    cwd: __dirname + '/..',
    env: { NODE_ENV: 'production', TZ: 'Europe/Prague' },
    max_memory_restart: '300M',
    autorestart: true,
  }],
};
