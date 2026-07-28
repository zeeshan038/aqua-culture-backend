import 'dotenv/config';
import ModbusRTU from 'modbus-serial';
import pushService from '../utils/pushService.js';

// Default Modbus register map for Arduino Opta
const REGISTER_MAP = {
  ph:          { address: 0,  count: 2 },
  temperature: { address: 2,  count: 2 },
  do2:         { address: 4,  count: 2 },
  no2:         { address: 6,  count: 2 },
  no3:         { address: 8,  count: 2 },
  nh4:         { address: 10, count: 2 },
}; 

class ModbusService {
  constructor(io, prisma) {
    this.io = io;
    this.prisma = prisma;
    this.client = new ModbusRTU();
    this.connected = false;
    this.mockMode = false;
    this.intervalId = null;
  }


  registersToFloat(registers) {
    const buf = Buffer.alloc(4);
    buf.writeUInt16BE(registers[0], 0);
    buf.writeUInt16BE(registers[1], 2);
    return parseFloat(buf.readFloatBE(0).toFixed(3));
  }

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
    const port = process.env.MODBUS_PORT || '/dev/ttyUSB0';
    const baud = parseInt(process.env.MODBUS_BAUD || '4800');
    const unitId = parseInt(process.env.MODBUS_UNIT_ID || '1');
    try {
      await this.client.connectRTUBuffered(port, { baudRate: baud });
      this.client.setID(unitId);
      this.client.setTimeout(5000);
      this.connected = true;
      this.mockMode = false;
      console.log(`Modbus RTU connected via Serial to ${port} (${baud} baud)`);
    } catch (err) {
      console.warn(`Modbus RTU not available (${err.message}). Running in MOCK mode.`);
      this.connected = false;
      this.mockMode = true;
    }
  }

  async readSensors() {
    if (this.mockMode) return this.generateMockData();
    try {
      const readings = {};
      for (const [sensor, { address, count }] of Object.entries(REGISTER_MAP)) {
        const data = await this.client.readHoldingRegisters(address, count);
        readings[sensor] = this.registersToFloat(data.data);
      }
      return readings;
    } catch (err) {
      console.error(`Modbus read timeout/error for sensor: ${err.message}`);
      // Try to reconnect instead of permanently going mock
      console.warn('Attempting Modbus reconnect...');
      try {
        this.client.close();
      } catch (_) {}
      await this.connect();
      return null; // skip this poll cycle
    }
  }

  async poll() {
    const raw = await this.readSensors();
    if (!raw) return; // skip cycle during reconnect
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

      // Emit live data via socket.io
      const payload = {
        ...calibrated,
        serial_no: serialNo,
        timestamp: new Date().toISOString(),
        mock: this.mockMode,
      };
      this.io.emit('sensor_update', payload);

      // Check alarm rules
      await this.checkAlarms(calibrated);

    } catch (err) {
      console.error('❌ Poll error:', err.message);
    }
  }

  async checkAlarms(readings) {
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

        if (triggered) {
          const msg = rule.message ||
            `⚠️ ALARM: ${rule.sensor.toUpperCase()} is ${value} (${rule.condition} ${rule.threshold})`;

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
          this.io.emit('alarm_triggered', { sensor: rule.sensor, value, message: msg });

          // Push alert
          await pushService.sendAlert(msg);
        }
      }
    } catch (err) {
      console.error('❌ Alarm check error:', err.message);
    }
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
