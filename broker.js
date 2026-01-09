const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer();
const ws = require('websocket-stream');
const mqtt = require('mqtt'); // Client library to connect to ITB

// --- 1. IMPORT HANDLER DATABASE ---
let handleConveyor;
try {
  handleConveyor = require('./handlers/conveyor_database');
} catch (e) {
  console.warn("⚠️ Warning: Handler file missing or has errors.", e);
}

// --- 2. CONFIGURATION ---
const LOCAL_MQTT_PORT = 1883; // TCP Port for local devices
const LOCAL_WS_PORT = 1884;   // WebSocket Port for HMI/Dashboard
const REMOTE_HOST = 'mqtt://iot.tf.itb.ac.id';
const REMOTE_TOPIC = 'ITB/IIOT/conveyor/#';

// --- 3. STATE MANAGEMENT (Friend's Logic) ---
// This stores the aggregated state for your Drizzle Schema
let lastKnownState = {
  // -- SENSORS (Boolean) --
  irSensor: false,
  inductiveSensor: false,
  capacitiveSensor: false,
  positionInnerSensor: false,
  positionOuterSensor: false,
  // -- SENSORS (Data) --
  motorSpeedSensor: 0,
  objectInnerCount: 0,
  objectOuterCount: 0,
  // -- ACTUATORS --
  dlPush: false,
  dlPull: false,
  ldPush: false,
  ldPull: false,
  stepperInnerRotate: false,
  stepperOuterRotate: false,
  stepperSpeedSetting: 0
};

function parseBool(val) {
  if (val === undefined || val === null) return false;
  const s = val.toString().toLowerCase();
  return s === '1' || s === 'true' || s === 'on';
}

// --- 4. START LOCAL SERVERS (Restoring WebSocket) ---

// A. Start TCP Broker
server.listen(LOCAL_MQTT_PORT, function () {
  console.log(`🚀 Local MQTT Broker running on TCP port ${LOCAL_MQTT_PORT}`);
});

// B. Start WebSocket Broker (This fixes your HMI connection)
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(LOCAL_WS_PORT, function () {
  console.log(`🌐 Local WebSocket MQTT running on port ${LOCAL_WS_PORT}`);
});

// --- 5. CONNECT TO REMOTE ITB BROKER (The Bridge) ---
console.log(`🔌 Connecting to Remote ITB Broker (${REMOTE_HOST})...`);
const remoteClient = mqtt.connect(REMOTE_HOST, { port: 1883 });

remoteClient.on('connect', function () {
  console.log('✅ Connected to ITB Broker!');
  remoteClient.subscribe(REMOTE_TOPIC);
  console.log(`📡 Subscribed to: ${REMOTE_TOPIC}`);
});

remoteClient.on('message', function (topic, message) {
  const msgString = message.toString();
  
  // 1. Log incoming data
  const shortTopic = topic.split('/').slice(3).join('/');
  // console.log(`📩 [REMOTE] .../${shortTopic} -> ${msgString}`);

  // 2. Broadcast to Local WebSocket Clients (HMI)
  // This allows your HMI to see the live data coming from ITB
  aedes.publish({
    topic: topic,
    payload: message,
    qos: 0,
    retain: false
  });

  // 3. Process Logic for Database (Friend's Logic)
  let dataChanged = false;

  // --- SENSORS (Boolean) ---
  if (topic.includes('sensor/ir/state')) {
      lastKnownState.irSensor = parseBool(msgString);
      dataChanged = true;
  } 
  else if (topic.includes('sensor/inductive/state')) {
      lastKnownState.inductiveSensor = parseBool(msgString);
      dataChanged = true;
  }
  else if (topic.includes('sensor/capacitive/state')) {
      lastKnownState.capacitiveSensor = parseBool(msgString);
      dataChanged = true;
  }
  else if (topic.includes('sensor/position_inner/state')) {
      lastKnownState.positionInnerSensor = parseBool(msgString);
      dataChanged = true;
  }
  else if (topic.includes('sensor/position_outer/state')) {
      lastKnownState.positionOuterSensor = parseBool(msgString);
      dataChanged = true;
  }
  // --- SENSORS (Integer) ---
  else if (topic.includes('sensor/motor_speed/state')) {
      lastKnownState.motorSpeedSensor = parseInt(msgString) || 0;
      dataChanged = true;
  }
  else if (topic.includes('sensor/object_inner/state')) {
      lastKnownState.objectInnerCount = parseInt(msgString) || 0;
      dataChanged = true;
  }
  else if (topic.includes('sensor/object_outer/state')) {
      lastKnownState.objectOuterCount = parseInt(msgString) || 0;
      dataChanged = true;
  }
  // --- ACTUATORS ---
  else if (topic.endsWith('actuator/DL/push')) {
      lastKnownState.dlPush = parseBool(msgString);
      dataChanged = true;
  }
  else if (topic.endsWith('actuator/OL/pull') || topic.endsWith('actuator/DL/pull')) {
      lastKnownState.dlPull = parseBool(msgString);
      dataChanged = true;
  }
  else if (topic.endsWith('actuator/LD/push')) {
      lastKnownState.ldPush = parseBool(msgString);
      dataChanged = true;
  }
  else if (topic.endsWith('actuator/LD/pull')) {
      lastKnownState.ldPull = parseBool(msgString);
      dataChanged = true;
  }
  else if (topic.endsWith('actuator/stepper/inner')) {
      lastKnownState.stepperInnerRotate = parseBool(msgString);
      dataChanged = true;
  }
  else if (topic.endsWith('actuator/stepper/outer')) {
      lastKnownState.stepperOuterRotate = parseBool(msgString);
      dataChanged = true;
  }
  else if (topic.endsWith('actuator/stepper/speed')) {
      lastKnownState.stepperSpeedSetting = parseInt(msgString) || 0;
      dataChanged = true;
  }

  // --- SAVE TO DATABASE ---
  if (dataChanged) { 
      const packetForDB = {
        topic: topic,
        payload: JSON.stringify(lastKnownState) // Wrap state as JSON for handler
      };
      
      try {
        if (typeof handleConveyor === 'function') {
           // We pass 'remoteClient' here to satisfy function signature if needed
           handleConveyor(packetForDB, remoteClient, aedes);
        }
      } catch (err) {
        console.error("❌ DB Handler Error:", err.message);
      }
  }
});

// --- 6. HANDLE LOCAL PUBLISHES (Optional) ---
// If your HMI publishes buttons back to this script
aedes.on('publish', function (packet, client) {
    if (client) {
        // If HMI sends a command, you might want to forward it to ITB broker?
        // remoteClient.publish(packet.topic, packet.payload);
        // console.log('Forwarding local command to ITB:', packet.topic);
    }
});