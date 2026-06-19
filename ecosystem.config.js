module.exports = {
  apps: [{
    name: 'backlink-backend',
    script: 'src/index.js',
    interpreter: 'node',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
