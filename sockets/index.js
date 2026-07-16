// sockets/index.js
// Initializes Socket.io server and exports a singleton `io` instance.
// Import getIO() anywhere in the codebase to emit events without passing io around.

import { Server } from 'socket.io';

let io = null;

/**
 * Initialize Socket.io with the HTTP server.
 * Call this once in index.js during startup.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(` Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(` Client disconnected: ${socket.id}`);
    });
  });

  console.log('🔌 Socket.io initialized');
  return io;
}

/**
 * Get the singleton io instance.
 * Throws if called before initSockets().
 */
export function getIO() {
  if (!io) throw new Error('Socket.io not initialized. Call initSockets() first.');
  return io;
}
