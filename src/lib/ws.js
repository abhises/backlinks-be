const { Server } = require('socket.io');

class SocketManager {
  constructor() {
    this.io = null;
  }

  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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

  sendNotification(workspaceId, payload) {
    if (this.io) {
      this.io.to(`workspace:${workspaceId}`).emit('notification', payload);
    }
  }
}

const socketManager = new SocketManager();
module.exports = socketManager;
