// dump-registers.mjs
// Run: node dump-registers.mjs
// Reads all registers from known Unit IDs to figure out correct mapping

import 'dotenv/config';
import ModbusRTU from 'modbus-serial';

const PORT = process.env.MODBUS_SERIAL_PATH || '/dev/ttyUSB0';
const BAUD = parseInt(process.env.MODBUS_BAUD_RATE || '4800');

const client = new ModbusRTU();

async function dump() {
  console.log(`\n📋 Register Dump — ${PORT} at ${BAUD} baud\n`);

  await client.connectRTUBuffered(PORT, {
    baudRate: BAUD, dataBits: 8, stopBits: 1, parity: 'none',
  });
  client.setTimeout(2000);

  // Scan Unit IDs 1 and 2 (both found or expected on the bus)
  for (const unitId of [1, 2]) {
    client.setID(unitId);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Unit ID: ${unitId}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Try Holding Registers (FC03) — addresses 0..19
    console.log('  Holding Registers (FC03):');
    for (let addr = 0; addr <= 19; addr++) {
      try {
        const data = await client.readHoldingRegisters(addr, 1);
        const raw = data.data[0];
        console.log(`    Reg ${String(addr).padStart(2)}  →  raw: ${String(raw).padStart(6)}  |  ÷10: ${(raw / 10).toFixed(1).padStart(8)}  |  ÷100: ${(raw / 100).toFixed(2).padStart(8)}  |  ÷1000: ${(raw / 1000).toFixed(3).padStart(8)}`);
      } catch (err) {
        console.log(`    Reg ${String(addr).padStart(2)}  →  (no response)`);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Try Input Registers (FC04) — addresses 0..19
    console.log('  Input Registers (FC04):');
    for (let addr = 0; addr <= 19; addr++) {
      try {
        const data = await client.readInputRegisters(addr, 1);
        const raw = data.data[0];
        console.log(`    Reg ${String(addr).padStart(2)}  →  raw: ${String(raw).padStart(6)}  |  ÷10: ${(raw / 10).toFixed(1).padStart(8)}  |  ÷100: ${(raw / 100).toFixed(2).padStart(8)}  |  ÷1000: ${(raw / 1000).toFixed(3).padStart(8)}`);
      } catch (err) {
        console.log(`    Reg ${String(addr).padStart(2)}  →  (no response)`);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    console.log('');
  }

  client.close();
  console.log('Done.\n');
}

dump().catch(console.error);
