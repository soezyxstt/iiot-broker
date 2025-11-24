const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer();
const ws = require('websocket-stream');

// --- MODULAR IMPORTS ---
// We wrap these in try-catch so if a file is missing, the broker still starts
let handleConveyor, handleFess;
try {
  handleConveyor = require('./handlers/conveyor');
  handleFess = require('./handlers/fess');
} catch (e) {
  console.warn("⚠️ Warning: One or more handler files are missing or have syntax errors.");
  console.error(e);
}

// --- CONFIGURATION ---
const MQTT_PORT = 1883;
const WS_PORT = 1884;

// --- ROUTING LOGIC ---
aedes.on('publish', function (packet, client) {
  // 1. Ignore internal system messages (client is null)
  if (!client) return;

  const topic = packet.topic;

  // 2. Route to Project A
  if (topic.startsWith('conveyor/')) {
    try {
      if (handleConveyor) handleConveyor(packet, client);
    } catch (err) {
      console.error(`[ROUTER ERROR] Conveyor handler crashed: ${err.message}`);
    }
  } 
  // 3. Route to Project B
  else if (topic.startsWith('fess/')) {
    try {
      if (handleFess) handleFess(packet, client);
    } catch (err) {
      console.error(`[ROUTER ERROR] FESS handler crashed: ${err.message}`);
    }
  }
  // 4. Unhandled Topics (Optional logging)
  else {
    console.log(`[INFO] Unhandled topic: ${topic}`);
  }
});

// --- STANDARD EVENT LOGGING ---
aedes.on('client', (client) => {
  console.log(`[CONNECT] Client ${client.id} connected`);
});

aedes.on('clientDisconnect', (client) => {
  console.log(`[DISCONNECT] Client ${client.id} disconnected`);
});

aedes.on('clientError', (client, err) => {
  console.log(`[ERROR] Client ${client ? client.id : 'unknown'} error:`, err.message);
});

// --- SERVER STARTUP ---

// 1. Start TCP (Standard MQTT)
server.listen(MQTT_PORT, function () {
  console.log(`🚀 MQTT Broker running on TCP port ${MQTT_PORT}`);
});

// 2. Start WebSocket (Browser clients)
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(WS_PORT, function () {
  console.log(`🌐 WebSocket MQTT running on port ${WS_PORT}`);
});