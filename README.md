# Sprout — Smart Plant Dashboard

A responsive HTML/CSS/JavaScript dashboard for your Arduino + Python serial/MQTT bridge.

## Files
- `index.html` — page structure
- `style.css` — responsive design
- `script.js` — MQTT connection, live readings and controls

## MQTT topics
| Topic | Direction | Payload |
|---|---|---|
| `iot/plant/moisture` | broker → website | numeric moisture value |
| `iot/plant/pump/set` | website → broker → Python bridge | `ON` or `OFF` |
| `iot/plant/pump/state` | broker → website | `ON` or `OFF` |
| `iot/plant/mode` | both directions | `AUTO` or `MANUAL` |

## Important: configure MQTT over WebSockets

Browsers cannot connect directly to raw MQTT on port `1883`. Your broker must expose a WebSocket listener, for example `ws://localhost:9001` for local testing. Set the URL in **Connection settings**.

If the dashboard is hosted on GitHub Pages, `localhost` means the visitor's own device, not your computer. Use a broker URL reachable from the visitor's device and preferably secure `wss://` with authentication. Do not expose an unauthenticated MQTT broker publicly.

Your Python bridge currently connects to `127.0.0.1:1883`; that can remain unchanged if the WebSocket listener and MQTT listener belong to the same Mosquitto broker.

## Run locally
Open `index.html` in a browser, or use a local static server such as VS Code Live Server. Enter the broker WebSocket URL in Connection settings.

## Moisture calibration
The dashboard assumes `iot/plant/moisture` is already a percentage from 0–100. If your Arduino publishes raw ADC values (such as 0–1023), calibrate/map them in `script.js` before displaying them as percentages.
