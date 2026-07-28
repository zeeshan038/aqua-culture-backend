// utils/modbusService.js
// Polls Arduino Opta via Modbus TCP and emits readings
// Falls back to realistic mock data when the device is not connected

import 'dotenv/config';
import ModbusRTU from 'modbus-serial';
import pushService from './pushService.js';
import { emitSensorUpdate } from '../sockets/sensorSocket.js';
import { emitAlarmTriggered } from '../sockets/alarmSocket.js';

// Default Modbus register map for Arduino Opta
// Each sensor occupies 2 registers (32-bit float, big-endian)
const REGISTER_MAP = {
  ph: { address: 0, count: 2 },
  temperature: { address: 2, count: 2 },
  do2: { address: 4, count: 2 },
  no2: { address: 6, count: 2 },
  no3: { address: 8, count: 2 },
  nh4: { address: 10, count: 2 },
};

class ModbusService {
  constructor(prisma) {
    this.prisma = prisma;
    this.client = new ModbusRTU();
    this.connected = false;
    this.mockMode = false;
    this.intervalId = null;
  }

  // Parse two Modbus registers into a 32-bit float (for float-based sensors)
  registersToFloat(registers) {
    const buf = Buffer.alloc(4);
    buf.writeUInt16BE(registers[0], 0);
    buf.writeUInt16BE(registers[1], 2);
    return parseFloat(buf.readFloatBE(0).toFixed(3));
  }

  // Parse a single 16-bit integer register with a scale divisor
  // e.g. raw=658, scale=100 → 6.58
  registerToScaled(raw, scale) {
    return parseFloat((raw / scale).toFixed(3));
  }

  // Realistic mock data for development without hardware
  generateMockData() {
    return {
      ph: 0.0,
      temperature: 0.0,
      do2: 0.0,
      no2: 0.0,
      no3: 0.0,
      nh4: 0.0,
    };
  }

  async connect() {
    try {
      if (process.env.MODBUS_CONNECTION_TYPE === 'serial') {
        const path = process.env.MODBUS_SERIAL_PATH || '/dev/ttyUSB0';
        const baudRate = parseInt(process.env.MODBUS_BAUD_RATE || '9600');
        await this.client.connectRTUBuffered(path, {
          baudRate,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
        });
        console.log(`🔌 Modbus RTU connected via Serial to ${path} (${baudRate} baud)`);
      } else {
        await this.client.connectTCP(process.env.MODBUS_HOST || '192.168.1.100', {
          port: parseInt(process.env.MODBUS_PORT || '502'),
        });
        console.log('🔌 Modbus TCP connected to Arduino Opta');
      }
      this.client.setID(parseInt(process.env.MODBUS_UNIT_ID || '1'));
      this.client.setTimeout(3000);
      this.connected = true;
      this.mockMode = false;
    } catch (err) {
      console.warn(`⚠️  Modbus not available (${err.message}). Running in MOCK mode.`);
      this.connected = false;
      this.mockMode = true;
    }
  }

  async readSensors() {
    if (this.mockMode) return { readings: this.generateMockData(), connected: new Set() };

    const readings = {};
    const connectedSensors = new Set();
    const isDirectSerial = process.env.MODBUS_CONNECTION_TYPE === 'serial';
    const mockVals = this.generateMockData();

    // ── Serial Register Map (based on bus scan results) ──────────────────
    // Unit ID 2: pH+Temp sensor (16-bit integers)
    //   Register 0 → pH        (raw ÷ 100, e.g. 658 → 6.58)
    //   Register 1 → Temp °C   (raw ÷ 10,  e.g. 260 → 26.0)
    // Unit ID 1: DO2 sensor (if present on bus)
    //   Register 2 → DO2 mg/L  (raw ÷ 100)
    //   Register 4 → Temp      (raw ÷ 10, backup)
    const serialMap = [
      { sensor: 'ph', unitId: 2, address: 0, count: 1, scale: 100 },
      { sensor: 'temperature', unitId: 2, address: 1, count: 1, scale: 10 },
      { sensor: 'do2', unitId: 1, address: 2, count: 1, scale: 100, optional: true },
      { sensor: 'no2', unitId: 1, address: 6, count: 1, scale: 100, optional: true },
      { sensor: 'no3', unitId: 1, address: 8, count: 1, scale: 100, optional: true },
      { sensor: 'nh4', unitId: 1, address: 10, count: 1, scale: 100, optional: true },
    ];

    // ── TCP Register Map (Arduino Opta 32-bit floats) ─────────────────────
    const tcpMap = Object.entries(REGISTER_MAP).map(([sensor, cfg]) => ({
      sensor, ...cfg, unitId: parseInt(process.env.MODBUS_UNIT_ID || '1'), scale: null,
    }));

    const mapToUse = isDirectSerial ? serialMap : tcpMap;

    // Start with fallback values for all sensors
    Object.assign(readings, mockVals);

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (const config of mapToUse) {
      try {
        this.client.setID(config.unitId);
        const data = await this.client.readHoldingRegisters(config.address, config.count);

        if (config.scale !== null) {
          // 16-bit integer sensor (e.g. pH/Temp from Unit ID 2)
          readings[config.sensor] = this.registerToScaled(data.data[0], config.scale);
        } else {
          // 32-bit float sensor (e.g. Arduino Opta over TCP)
          readings[config.sensor] = this.registersToFloat(data.data);
        }
        connectedSensors.add(config.sensor);
      } catch (err) {
        if (!config.optional) {
          console.warn(`⚠️ Modbus read error for ${config.sensor} (Unit ID: ${config.unitId}): ${err.message}`);
        }
      }
      await delay(150);
    }

    return { readings, connected: connectedSensors };
  }

  async poll() {
    const { readings: raw, connected: connectedSet } = await this.readSensors();
    // ── Sensor Connection Status ──────────────────────────────
    const sensorMeta = {
      ph: { label: 'pH', unit: '' },
      temperature: { label: 'Temperature', unit: '°C' },
      do2: { label: 'DO2', unit: 'mg/L' },
      no2: { label: 'NO2', unit: 'mg/L' },
      no3: { label: 'NO3', unit: 'mg/L' },
      nh4: { label: 'NH4', unit: 'mg/L' },
    };
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🔌 Sensor Status Report');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const [key, meta] of Object.entries(sensorMeta)) {
      const isConnected = connectedSet.has(key);
      const status = isConnected ? '✅ CONNECTED   ' : '❌ DISCONNECTED';
      const reading = isConnected ? `${raw[key]} ${meta.unit}` : '–';
      console.log(`  ${status} | ${meta.label.padEnd(12)} | ${reading}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    const serialNo = process.env.SERIAL_NO || 'OPTA-001';

    try {
      // Fetch calibration offsets via Prisma
      const calibrations = await this.prisma.calibration.findMany();
      const calMap = {};
      calibrations.forEach(c => {
        calMap[c.sensor] = { offset: c.offsetVal, scale: c.scaleVal };
      });


      const calibrated = {};
      for (const [key, value] of Object.entries(raw)) {
        const cal = calMap[key] || { offset: 0, scale: 1 };
        calibrated[key] = parseFloat(((value * cal.scale) + cal.offset).toFixed(3));
      }

      // Save to DB via Prisma
      await this.prisma.sensorLog.create({
        data: {
          ph: calibrated.ph,
          temperature: calibrated.temperature,
          do2: calibrated.do2,
          no2: calibrated.no2,
          no3: calibrated.no3,
          nh4: calibrated.nh4,
          serialNo,
        },
      });

      const alarmState = await this.checkAlarms(calibrated);

      // Emit live data + alarm state via socket.io
      emitSensorUpdate({
        ...calibrated,
        serial_no: serialNo,
        timestamp: new Date().toISOString(),
        mock: this.mockMode,
        alarms: alarmState,   // e.g. { ph: false, temperature: false, no2: true }
      });

    } catch (err) {
      console.error('❌ Poll error:', err.message);
    }
  }

  async checkAlarms(readings) {
    // Build alarm state map — every sensor starts as false (no alarm)
    const alarmState = {
      ph: false, temperature: false, do2: false,
      no2: false, no3: false, nh4: false,
    };

    try {
      const rules = await this.prisma.alarmRule.findMany({
        where: { isActive: true },
      });

      for (const rule of rules) {
        const value = readings[rule.sensor];
        if (value === undefined) continue;

        const triggered =
          (rule.condition === 'above' && value > rule.threshold) ||
          (rule.condition === 'below' && value < rule.threshold);

        // Mark sensor as in alarm — even if cooldown skips the notification
        if (triggered) alarmState[rule.sensor] = true;

        if (triggered) {
          const msg = rule.message ||
            `⚠️ ALARM: ${rule.sensor.toUpperCase()} is ${value} (${rule.condition} ${rule.threshold})`;

          const existingActiveAlarm = await this.prisma.alarmHistory.findFirst({
            where: {
              ruleId: rule.id,
              acknowledged: false,
            },
          });

          if (existingActiveAlarm) {
            // Update the existing active alarm's timestamp and value
            await this.prisma.alarmHistory.update({
              where: { id: existingActiveAlarm.id },
              data: {
                triggeredAt: new Date(),
                value,
              },
            });
            // Emit alarm to frontend for live updates, but don't send another push notification
            emitAlarmTriggered({ sensor: rule.sensor, value, message: msg });
          } else {
            // Log to alarm history via Prisma
            await this.prisma.alarmHistory.create({
              data: {
                ruleId: rule.id,
                sensor: rule.sensor,
                value,
                message: msg,
              },
            });

            // Emit alarm to frontend
            emitAlarmTriggered({ sensor: rule.sensor, value, message: msg });

            // Push alert
            await pushService.sendAlert(msg);
          }
        }
      }
    } catch (err) {
      console.error('❌ Alarm check error:', err.message);
    }

    return alarmState;
  }

  start() {
    const interval = parseInt(process.env.MODBUS_POLL_INTERVAL_MS || '3000');
    this.intervalId = setInterval(() => this.poll(), interval);
    console.log(`📡 Sensor polling started (every ${interval}ms)`);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.connected) this.client.close();
  }
}

export default ModbusService;
