// scan-modbus.mjs
// Run: node scan-modbus.mjs
// Scans all Modbus Unit IDs to find which sensor(s) respond on the bus

import ModbusRTU from 'modbus-serial';

const PORT     = process.env.MODBUS_SERIAL_PATH || '/dev/ttyUSB0';
const BAUD     = parseInt(process.env.MODBUS_BAUD_RATE  || '4800');
const START_ID = 1;
const END_ID   = 20; // scan IDs 1–20 (expand if needed)

const client = new ModbusRTU();

async function scan() {
  console.log(`\n🔍 Scanning Modbus bus on ${PORT} at ${BAUD} baud...`);
  console.log(`   Testing Unit IDs ${START_ID}–${END_ID}\n`);

  try {
    await client.connectRTUBuffered(PORT, { baudRate: BAUD, dataBits: 8, stopBits: 1, parity: 'none' });
    client.setTimeout(1500);
  } catch (err) {
    console.error(`❌ Cannot open serial port: ${err.message}`);
    process.exit(1);
  }

  const found = [];

  for (let id = START_ID; id <= END_ID; id++) {
    client.setID(id);
    // Try reading 4 registers from address 0 (FC03 Holding Registers)
    try {
      const data = await client.readHoldingRegisters(0, 4);
      console.log(`✅ Unit ID ${id} responded! Raw registers: [${data.data.join(', ')}]`);
      found.push({ id, type: 'holding', registers: data.data });
    } catch (_) {
      // Try Input Registers (FC04) as fallback
      try {
        const data = await client.readInputRegisters(0, 4);
        console.log(`✅ Unit ID ${id} responded (Input Registers)! Raw: [${data.data.join(', ')}]`);
        found.push({ id, type: 'input', registers: data.data });
      } catch (__) {
        process.stdout.write(`.`); // silent dot for no response
      }
    }
    // Small delay between queries
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (found.length === 0) {
    console.log('❌ No devices found. Check wiring, baud rate, or expand scan range.');
  } else {
    console.log(`✅ Found ${found.length} device(s):`);
    found.forEach(d => console.log(`   • Unit ID ${d.id} (${d.type} registers)`));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  client.close();
}

scan().catch(console.error);
