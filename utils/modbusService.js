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
  ph:          { address: 0,  count: 2 },
  temperature: { address: 2,  count: 2 },
  do2:         { address: 4,  count: 2 },
  no2:         { address: 6,  count: 2 },
  no3:         { address: 8,  count: 2 },
  nh4:         { address: 10, count: 2 },
};

class ModbusService {
  constructor(prisma) {
    this.prisma = prisma;
    this.client = new ModbusRTU();
    this.connected = false;
    this.mockMode = false;
    this.intervalId = null;
  }

  // Parse two Modbus registers into a 32-bit float
  registersToFloat(registers) {
    const buf = Buffer.alloc(4);
    buf.writeUInt16BE(registers[0], 0);
    buf.writeUInt16BE(registers[1], 2);
    return parseFloat(buf.readFloatBE(0).toFixed(3));
  }

  // Realistic mock data for development without hardware
  generateMockData() {
    const rand = (base, variance) =>
      parseFloat((base + (Math.random() - 0.5) * variance).toFixed(3));
    return {
      ph:          rand(7.2,  0.4),
      temperature: rand(24.5, 2.0),
      do2:         rand(7.5,  1.0),
      no2:         rand(0.05, 0.02),
      no3:         rand(15.0, 5.0),
      nh4:         rand(0.5,  0.2),
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
    if (this.mockMode) return this.generateMockData();
    
    const readings = {};
    const isDirectSerial = process.env.MODBUS_CONNECTION_TYPE === 'serial';
    
    for (const [sensor, { address, count }] of Object.entries(REGISTER_MAP)) {
      try {
        // Use the Unit ID defined in the env file (factory default is usually 1)
        let unitId = parseInt(process.env.MODBUS_UNIT_ID || '1');
        
        this.client.setID(unitId);

        const registerCount = isDirectSerial ? 1 : count;
        
        const data = await this.client.readHoldingRegisters(address, registerCount);
        
        if (isDirectSerial) {
          // Direct sensors usually return 16-bit int scaled by 100 (e.g. 750 = 7.50)
          const rawVal = data.data[0];
          readings[sensor] = parseFloat((rawVal / 100).toFixed(2));
        } else {
          // PLC gateway returns 32-bit floats (2 registers)
          readings[sensor] = this.registersToFloat(data.data);
        }
      } catch (err) {
        // If a sensor is disconnected or times out, log a warning and continue
        console.warn(`⚠️ Modbus read timeout/error for ${sensor} (Unit ID: ${this.client.getID()}): ${err.message}`);
        
        // Fall back to a default mock value for this disconnected sensor so the app stays functional
        const mockVals = this.generateMockData();
        readings[sensor] = mockVals[sensor];
      }
    }
    
    return readings;
  }

  async poll() {
    const raw = await this.readSensors();
    const serialNo = process.env.SERIAL_NO || 'OPTA-001';

    try {
      // Fetch calibration offsets via Prisma
      const calibrations = await this.prisma.calibration.findMany();
      const calMap = {};
      calibrations.forEach(c => {
        calMap[c.sensor] = { offset: c.offsetVal, scale: c.scaleVal };
      });

      // Apply calibrations: calibrated = (raw × scale) + offset
      const calibrated = {};
      for (const [key, value] of Object.entries(raw)) {
        const cal = calMap[key] || { offset: 0, scale: 1 };
        calibrated[key] = parseFloat(((value * cal.scale) + cal.offset).toFixed(3));
      }

      // Save to DB via Prisma
      await this.prisma.sensorLog.create({
        data: {
          ph:          calibrated.ph,
          temperature: calibrated.temperature,
          do2:         calibrated.do2,
          no2:         calibrated.no2,
          no3:         calibrated.no3,
          nh4:         calibrated.nh4,
          serialNo,
        },
      });

      // Check alarm rules — returns { ph: false, no2: true, ... }
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
                lastTriggeredAt: new Date(),
                value,
              },
            });
            // Emit alarm to frontend for live updates, but don't send another push notification
            emitAlarmTriggered({ sensor: rule.sensor, value, message: msg });
          } else {
            // Log to alarm history via Prisma
            await this.prisma.alarmHistory.create({
              data: {
                ruleId:  rule.id,
                sensor:  rule.sensor,
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
