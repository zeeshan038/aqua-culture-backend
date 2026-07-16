import { getIO } from './index.js';

/**
 * Emit an alarm trigger event to all connected clients.
 * Frontend listens with: socket.on('alarm_triggered', (data) => { })
 *
 * @param {Object} data
 * @param {string} data.sensor   - e.g. 'ph', 'temperature'
 * @param {number} data.value    - the current sensor reading
 * @param {string} data.message  - human-readable alarm message
 */
export function emitAlarmTriggered(data) {
  getIO().emit('alarm_triggered', data);
}
