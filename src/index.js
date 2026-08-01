require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const workspaceRoutes = require('./routes/workspaces');
const threadRoutes = require('./routes/threads');
const messageRoutes = require('./routes/messages');
const linkRoutes = require('./routes/links');
const notificationRoutes = require('./routes/notifications');

const app = express();

// Use Helmet for standard security headers
app.use(helmet());

// Trust the reverse proxy (like Nginx) to get the real client IP from X-Forwarded-For headers
app.set('trust proxy', 1);

// Middleware - Parsed from env array, stripping trailing slashes for clean strict domain matching
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim().replace(/\/$/, ''))
  : ['http://localhost:3000'];

// Explicitly ensure variations and subdomains are present if serpsupport is declared
if (allowedOrigins.some(url => url.includes('serpsupport.com'))) {
  ['https://serpsupport.com', 'https://www.serpsupport.com', 'https://fi.serpsupport.com', 'https://nl.serpsupport.com'].forEach(url => {
    if (!allowedOrigins.includes(url)) allowedOrigins.push(url);
  });
}
if (allowedOrigins.some(url => url.includes('localhost:3000'))) {
  ['http://localhost:3000', 'http://www.localhost:3000', 'http://fi.localhost:3000', 'http://nl.localhost:3000'].forEach(url => {
    if (!allowedOrigins.includes(url)) allowedOrigins.push(url);
  });
}

app.use(cors({
  origin: (origin, callback) => {
    // Normalizing browser origin string to strip trailing slashes just in case
    const normalizedOrigin = origin ? origin.replace(/\/$/, '') : null;

    const isSubdomain = normalizedOrigin && (
      normalizedOrigin.endsWith('.serpsupport.com') ||
      normalizedOrigin.endsWith('.localhost:3000') ||
      normalizedOrigin === 'https://serpsupport.com' ||
      normalizedOrigin === 'http://localhost:3000'
    );

    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin) || isSubdomain) {
      callback(null, true);
    } else {
      console.error(`[CORS Blocked] Origin: ${origin} was not found in:`, allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
app.use('/api/notifications', notificationRoutes);

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// Root health check for platforms that ping /
app.get('/', (req, res) => {
  res.status(200).send('BackLink Exchange API is running');
});

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

// Force 7860 on Hugging Face Spaces (which sets SPACE_ID), otherwise use .env PORT or default to 4000
const PORT = process.env.SPACE_ID ? 7860 : (process.env.PORT || 4000);
const server = http.createServer(app);

// Initialize WebSockets
wsManager.init(server);

// Initialize Matcher Cron Job
require('./jobs/matcher');

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BackLink Exchange API running on port ${PORT}`);
});

module.exports = app;