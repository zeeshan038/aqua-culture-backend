// sockets/sensorSocket.js
// Emits live sensor readings to all connected frontend clients.
// Called by ModbusService after every successful poll.

import { getIO } from './index.js';

/**
 * Emit a live sensor reading to all connected clients.
 * Frontend listens with: socket.on('sensor_update', (data) => { })
 *
 * @param {Object} data - Calibrated sensor values + metadata
 * @param {number} data.ph
 * @param {number} data.temperature
 * @param {number} data.do2
 * @param {number} data.no2
 * @param {number} data.no3
 * @param {number} data.nh4
 * @param {string} data.serial_no
 * @param {string} data.timestamp  - ISO string
 * @param {boolean} data.mock      - true if running without hardware
 */
export function emitSensorUpdate(data) {
  getIO().emit('sensor_update', data);
}
