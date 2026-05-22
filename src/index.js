require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const workspaceRoutes = require('./routes/workspaces');
const threadRoutes = require('./routes/threads');
const messageRoutes = require('./routes/messages');
const linkRoutes = require('./routes/links');

const app = express();

// Middleware
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'unknown'
    }
  };

  try {
    const prisma = require('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = 'healthy';
  } catch (error) {
    health.status = 'error';
    health.services.database = 'unhealthy';
    health.error = error.message;
  }

  const httpStatus = health.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(health);
});

app.get('/api/health', (req, res) => {
  res.redirect('/health');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/links', linkRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const http = require('http');
const wsManager = require('./lib/ws');

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

// Initialize WebSockets
wsManager.init(server);

server.listen(PORT, () => {
  console.log(`🚀 BackLink Exchange API running on port ${PORT}`);
});

module.exports = app;
