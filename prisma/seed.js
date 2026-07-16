// prisma/seed.js
// Seeds default calibration rows and settings
// Run: node prisma/seed.js  (after db:push or db:migrate)

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Default calibration rows for all 6 sensors
  const sensors = ['ph', 'temperature', 'do2', 'no2', 'no3', 'nh4'];
  for (const sensor of sensors) {
    await prisma.calibration.upsert({
      where:  { sensor },
      update: {},
      create: { sensor, offsetVal: 0, scaleVal: 1 },
    });
  }

  // Default system settings for the frontend UI
  const defaults = [
    { key: 'pushplus_token',      value: '' },
    { key: 'modbus_host',         value: '192.168.1.100' },
    { key: 'modbus_port',         value: '502' },
    { key: 'poll_interval_ms',    value: '3000' },
    { key: 'serial_number',       value: 'OPTA-001' },
    { key: 'kiosk_lockdown',      value: 'true' },
    { key: 'local_data_logging',  value: 'true' },
    { key: 'auto_brightness',     value: 'false' },
    { key: 'screen_brightness',   value: '80' },
    { key: 'touch_sensitivity',   value: '70' }
  ];
  for (const s of defaults) {
    await prisma.setting.upsert({
      where:  { key: s.key },
      update: {},
      create: s,
    });
  }

  console.log('✅ Seed complete!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
