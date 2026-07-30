import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import prisma from './config/db.js';
import routes from './routes/index.js';
import ModbusService from './utils/modbusService.js';
import { startAlarmChecker } from './cron/alarmChecker.js';
import { initSockets } from './sockets/index.js';

const app = express();
const server = http.createServer(app);

// Socket.io Setup
const io = initSockets(server);

// Middleware 
app.use(cors({ 
  origin: ['http://localhost:5173', 'https://hmi-water-quality.vercel.app'], 
  credentials: true 
}));
app.use(express.json());

//router
app.use('/api',routes)

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`\nAquaMonitor Gateway running on http://localhost:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV}`);
  console.log(` Database: ${process.env.DATABASE_URL}`);
  console.log(`\n Starting Modbus polling service...`);

  const modbus = new ModbusService(prisma);
  app.set('modbus', modbus);
  await modbus.connect();
  modbus.start();

  // Start alarm checker (every 30 seconds)
  startAlarmChecker(io, 30_000);
});

export { app, server };
