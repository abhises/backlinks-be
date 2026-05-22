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
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
