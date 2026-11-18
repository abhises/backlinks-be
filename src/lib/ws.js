const { Server } = require('socket.io');
const prisma = require('./prisma');

// Reads the auth cookie (same one the REST API uses) from the handshake headers.
function tokenFromHandshake(handshake) {
  const header = handshake.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === 'token') {
      try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch { return null; }
    }
  }
  const authToken = handshake.auth && handshake.auth.token;
  return typeof authToken === 'string' ? authToken : null;
}

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;

class SocketManager {
  constructor() {
    this.io = null;
  }

  init(server) {
    const allowedOrigins = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map(url => url.trim().replace(/\/$/, ''))
      : ['http://localhost:3000'];

    if (allowedOrigins.some(url => url.includes('serpsupport.com'))) {
      ['https://serpsupport.com', 'https://www.serpsupport.com', 'https://fi.serpsupport.com', 'https://nl.serpsupport.com'].forEach(url => {
        if (!allowedOrigins.includes(url)) allowedOrigins.push(url);
      });
    }
    if (allowedOrigins.some(url => url.includes('localhost:3000'))) {
      ['http://localhost:3000', 'http://fi.localhost:3000', 'http://nl.localhost:3000'].forEach(url => {
        if (!allowedOrigins.includes(url)) allowedOrigins.push(url);
      });
    }

    this.io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // Every socket must carry a valid session. CORS alone does not protect
    // sockets: non-browser clients can send any Origin they like.
    this.io.use(async (socket, next) => {
      const token = tokenFromHandshake(socket.handshake);
      if (!token) return next(new Error('unauthorized'));
      try {
        // Lazy require: middleware/auth -> lib/prisma, avoids a load-order cycle.
        const { resolveSession } = require('../middleware/auth');
        const user = await resolveSession(token);
        if (!user) return next(new Error('unauthorized'));
        socket.data.user = user;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.data.user.userId;

      // Room joins are checked against the database, so a user can only listen
      // to threads/workspaces they belong to, and only admins hear admin events.
      socket.on('join', async (threadId) => {
        if (!isId(threadId)) return;
        try {
          const memberships = await prisma.teamMember.findMany({ where: { userId }, select: { workspaceId: true } });
          const wsIds = memberships.map(m => m.workspaceId);
          if (!wsIds.length) return;
          const thread = await prisma.exchangeThread.findFirst({
            where: {
              id: threadId,
              OR: [{ giverWorkspaceId: { in: wsIds } }, { receiverWorkspaceId: { in: wsIds } }],
            },
            select: { id: true },
          });
          if (thread) socket.join(`thread:${threadId}`);
        } catch (err) {
          console.error('Socket join error:', err.message);
        }
      });

      socket.on('leave', (threadId) => {
        if (isId(threadId)) socket.leave(`thread:${threadId}`);
      });

      socket.on('joinWorkspace', async (workspaceId) => {
        if (!isId(workspaceId)) return;
        try {
          const member = await prisma.teamMember.findFirst({ where: { userId, workspaceId }, select: { id: true } });
          if (member) socket.join(`workspace:${workspaceId}`);
        } catch (err) {
          console.error('Socket joinWorkspace error:', err.message);
        }
      });

      socket.on('leaveWorkspace', (workspaceId) => {
        if (isId(workspaceId)) socket.leave(`workspace:${workspaceId}`);
      });

      socket.on('joinAdmin', async () => {
        try {
          const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
          if (user && user.role === 'ADMIN') socket.join('admins');
        } catch (err) {
          console.error('Socket joinAdmin error:', err.message);
        }
      });

      socket.on('leaveAdmin', () => {
        socket.leave('admins');
      });
    });
  }

  broadcastToThread(threadId, message) {
    if (this.io) {
      this.io.to(`thread:${threadId}`).emit('message', message);
    }
  }

  async sendNotification(workspaceId, payload) {
    if (this.io) {
      this.io.to(`workspace:${workspaceId}`).emit('notification', payload);
    }
    try {
      await prisma.notification.create({
        data: {
          workspaceId,
          type: payload.type,
          payload: JSON.stringify(payload),
        }
      });
    } catch (err) {
      console.error('Failed to persist notification:', err);
    }
  }

  // Real-time signal only; admins fetch ticket content via the authenticated REST endpoint.
  notifyAdmins(payload) {
    if (this.io) {
      this.io.to('admins').emit('new_ticket', payload);
    }
  }

  notifyAdminsFeedback(payload) {
    if (this.io) {
      this.io.to('admins').emit('new_feedback', payload);
    }
  }

  async broadcastGlobalNotification(payload) {
    if (this.io) {
      this.io.emit('notification', payload);
    }
    try {
      const workspaces = await prisma.workspace.findMany({ select: { id: true } });
      if (workspaces.length > 0) {
        const notifications = workspaces.map(ws => ({
          workspaceId: ws.id,
          type: payload.type,
          payload: JSON.stringify(payload),
        }));
        await prisma.notification.createMany({ data: notifications });
      }
    } catch (err) {
      console.error('Failed to persist global notifications:', err);
    }
  }
}

const socketManager = new SocketManager();
module.exports = socketManager;
