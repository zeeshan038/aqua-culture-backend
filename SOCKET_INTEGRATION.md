# AquaMonitor — Socket.io Integration Guide
> **For Frontend Developers**  
> Backend: Node.js + Express + Socket.io v4  
> Real-time data is pushed from the server every **3 seconds** via WebSocket.

---

## 1. Setup

Install the client library:
```bash
npm install socket.io-client
```

Connect to the server:
```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

> **Production URL**: Replace `http://localhost:3000` with the deployed server URL.

---

## 2. Events — Server → Client (Listen)

### `sensor_update`
Emitted every **3 seconds** with the latest calibrated sensor readings + alarm state.

```js
socket.on('sensor_update', (data) => {
  console.log(data);
});
```

**Payload:**
```json
{
  "ph":          7.42,
  "temperature": 24.8,
  "do2":         6.15,
  "no2":         0.85,
  "no3":         12.4,
  "nh4":         0.12,
  "serial_no":   "OPTA-001",
  "timestamp":   "2026-07-16T06:59:00.000Z",
  "mock":        false,
  "alarms": {
    "ph":          false,
    "temperature": false,
    "do2":         false,
    "no2":         true,
    "no3":         false,
    "nh4":         false
  }
}
```

| Field | Type | Description |
|---|---|---|
| `ph` | `number` | pH level |
| `temperature` | `number` | Temperature in °C |
| `do2` | `number` | Dissolved oxygen in mg/L |
| `no2` | `number` | Nitrite (NO2-N) in mg/L |
| `no3` | `number` | Nitrate (NO3-N) in mg/L |  
| `nh4` | `number` | Ammonium (NH4+) in mg/L |
| `serial_no` | `string` | Device serial number |
| `timestamp` | `string` | ISO 8601 UTC timestamp |
| `mock` | `boolean` | `true` = no hardware connected, using simulated data |
| `alarms` | `object` | Per-sensor alarm state — `true` = threshold breached → show **red** |

#### Alarm Color Logic
```js
socket.on('sensor_update', (data) => {
  Object.keys(data.alarms).forEach(sensor => {
    const card = document.getElementById(`card-${sensor}`);
    if (data.alarms[sensor]) {
      card.classList.add('alarm');      // → red border, red value
    } else {
      card.classList.remove('alarm');   // → normal teal
    }
  });
});
```

---

### `alarm_triggered`
Emitted **immediately** when a sensor breaches an alarm rule threshold.
Use this for popup notifications / toast alerts.

```js
socket.on('alarm_triggered', (data) => {
  console.log(data);
});
```

**Payload:**
```json
{
  "sensor":  "no2",
  "value":   0.85,
  "message": "⚠️ ALARM: NO2 is 0.85 (above 0.50)"
}
```

| Field | Type | Description |
|---|---|---|
| `sensor` | `string` | Sensor key (`ph`, `temperature`, `do2`, `no2`, `no3`, `nh4`) |
| `value` | `number` | The current reading that triggered the alarm |
| `message` | `string` | Human-readable alarm description |

> **Note:** `alarm_triggered` fires every poll cycle while the breach continues.  
> Implement a client-side cooldown/dedup if you want to show the toast only once.

---

## 3. Sensor Reference

| Key | Label | Unit |
|---|---|---|
| `ph` | pH Level | pH |
| `temperature` | Temperature | °C |
| `do2` | Dissolved Oxygen (DO) | mg/L |
| `no2` | Nitrite (NO2-N) | mg/L |
| `no3` | Nitrate (NO3-N) | mg/L |
| `nh4` | Ammonium (NH4+) | mg/L |

---

## 4. Complete React Example

```jsx
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:5000';

export default function Dashboard() {
  const [sensors, setSensors]     = useState({});
  const [alarms, setAlarms]       = useState({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('sensor_update', (data) => {
      const { alarms: alarmState, ...readings } = data;
      setSensors(readings);
      setAlarms(alarmState);
    });

    socket.on('alarm_triggered', (alarm) => {
      // Show a toast / notification
      console.warn('ALARM:', alarm.sensor, alarm.value, alarm.message);
    });

    return () => socket.disconnect();
  }, []);

  return (
    <div>
      <p>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      {Object.entries(sensors).map(([key, value]) => (
        <div key={key} style={{ color: alarms[key] ? 'red' : 'teal' }}>
          {key}: {value}  {alarms[key] && '⚠ ALARM'}
        </div>
      ))}
    </div>
  );
}
```

---

## 5. Live Tester

A ready-made HTML tester is included in the project:

```
socket-tester.html
```

Open it directly in a browser (no build tool needed). It shows:
- Live sensor cards with real-time values
- Red pulsing card when alarm is active
- Full event log with timestamps
- Alarm feed panel

---

## 6. REST API Endpoints (Supplementary)

These are available alongside sockets for initial data load:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sensor/latest` | Latest single sensor reading |
| `GET` | `/api/sensor/history?page=1&limit=50&from=ISO&to=ISO` | Paginated history |
| `GET` | `/api/sensor/stats?sensor=ph&period=24h` | Min/max/avg stats |
| `GET` | `/api/alarm/get-all` | All alarm rules |
| `POST` | `/api/alarm/create` | Create alarm rule |
| `PUT` | `/api/alarm/update/:id` | Update alarm rule |
| `DELETE` | `/api/alarm/delete/:id` | Delete alarm rule |
| `GET` | `/api/alarm/history` | Alarm trigger history |
| `POST` | `/api/alarm/test-telegram` | Test Telegram notification |

> **Tip:** Use `GET /api/sensor/latest` on page load to populate the dashboard immediately, then switch to `sensor_update` socket for live updates.

---

## 7. Summary

```
Backend polls Arduino Opta every 3s
  → calibrates readings
  → saves to DB
  → checks alarm rules
  → emits  sensor_update     ← dashboard live values + alarm state
  → emits  alarm_triggered   ← popup/toast notification (when breached)
```

Frontend needs to listen for **2 events** only:
1. `sensor_update` → update all card values + apply red color from `alarms` map
2. `alarm_triggered` → show notification/toast
