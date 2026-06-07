const { Server } = require('socket.io');
const prisma = require('./prisma');

class SocketManager {
  constructor() {
    this.io = null;
  }

  init(server) {
    const allowedOrigins = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
      : ['http://localhost:3000'];

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

    this.io.on('connection', (socket) => {
      socket.on('join', (threadId) => {
        if (threadId) {
          socket.join(`thread:${threadId}`);
        }
      });

      socket.on('leave', (threadId) => {
        if (threadId) {
          socket.leave(`thread:${threadId}`);
        }
      });

      socket.on('joinWorkspace', (workspaceId) => {
        if (workspaceId) {
          socket.join(`workspace:${workspaceId}`);
        }
      });

      socket.on('leaveWorkspace', (workspaceId) => {
        if (workspaceId) {
          socket.leave(`workspace:${workspaceId}`);
        }
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
