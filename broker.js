const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer();
const ws = require('websocket-stream');
const mqtt = require('mqtt'); 

// --- 1. IMPORT HANDLER DATABASE ---
let handleConveyor;
try {
  handleConveyor = require('./handlers/conveyor_database');
} catch (e) {
  console.warn("⚠️ Warning: Handler file missing or has errors.", e);
}

// --- 2. CONFIGURATION ---
const BROKER_TCP_PORT = 1883; // For devices connecting via TCP
const BROKER_WS_PORT = 1884;  // For your Remote HMI connecting via WebSocket
const REMOTE_HOST = 'mqtt://iot.tf.itb.ac.id';
const REMOTE_TOPIC_SUB = 'ITB/IIOT/conveyor/#'; // Topic to LISTEN from ITB
const REMOTE_TOPIC_PUB_PREFIX = 'ITB/IIOT';     // Prefix to SEND to ITB

// --- 3. STATE MANAGEMENT ---
let lastKnownState = {
  irSensor: false, inductiveSensor: false, capacitiveSensor: false,
  positionInnerSensor: false, positionOuterSensor: false,
  motorSpeedSensor: 0, objectInnerCount: 0, objectOuterCount: 0,
  dlPush: false, dlPull: false, ldPush: false, ldPull: false,
  stepperInnerRotate: false, stepperOuterRotate: false, stepperSpeedSetting: 0
};

function parseBool(val) {
  if (val === undefined || val === null) return false;
  const s = val.toString().toLowerCase();
  return s === '1' || s === 'true' || s === 'on';
}

// --- 4. START YOUR BROKER SERVERS ---
// Note: These listen on 0.0.0.0 by default, accepting connections from anywhere
server.listen(BROKER_TCP_PORT, function () {
  console.log(`🚀 My Broker running on TCP port ${BROKER_TCP_PORT}`);
});

ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(BROKER_WS_PORT, function () {
  console.log(`🌐 My Broker WebSocket running on port ${BROKER_WS_PORT} (Ready for Remote HMI)`);
});

// --- 5. CONNECT TO ITB CAMPUS BROKER ---
console.log(`🔌 Connecting to ITB Campus Broker (${REMOTE_HOST})...`);
const remoteClient = mqtt.connect(REMOTE_HOST, { port: 1883 });

remoteClient.on('connect', function () {
  console.log('✅ Connected to ITB Broker!');
  remoteClient.subscribe(REMOTE_TOPIC_SUB);
  console.log(`📡 Subscribed to: ${REMOTE_TOPIC_SUB}`);
});

// --- INCOMING FROM ITB -> FORWARD TO YOUR HMI ---
remoteClient.on('message', function (topic, message) {
  const msgString = message.toString();
  
  // 1. Broadcast to your HMI (connected via WebSocket)
  aedes.publish({ topic: topic, payload: message, qos: 0, retain: false });

  // 2. Process Logic for Database
  let dataChanged = false;

  // --- SENSORS (Boolean) ---
  if (topic.includes('sensor/ir/state')) { lastKnownState.irSensor = parseBool(msgString); dataChanged = true; } 
  else if (topic.includes('sensor/inductive/state')) { lastKnownState.inductiveSensor = parseBool(msgString); dataChanged = true; }
  else if (topic.includes('sensor/capacitive/state')) { lastKnownState.capacitiveSensor = parseBool(msgString); dataChanged = true; }
  else if (topic.includes('sensor/position_inner/state')) { lastKnownState.positionInnerSensor = parseBool(msgString); dataChanged = true; }
  else if (topic.includes('sensor/position_outer/state')) { lastKnownState.positionOuterSensor = parseBool(msgString); dataChanged = true; }
  
  // --- SENSORS (Integer) ---
  else if (topic.includes('sensor/motor_speed/state')) { lastKnownState.motorSpeedSensor = parseInt(msgString) || 0; dataChanged = true; }
  else if (topic.includes('sensor/object_inner/state')) { lastKnownState.objectInnerCount = parseInt(msgString) || 0; dataChanged = true; }
  else if (topic.includes('sensor/object_outer/state')) { lastKnownState.objectOuterCount = parseInt(msgString) || 0; dataChanged = true; }
  
  // --- ACTUATORS ---
  else if (topic.endsWith('actuator/DL/push')) { lastKnownState.dlPush = parseBool(msgString); dataChanged = true; }
  else if (topic.endsWith('actuator/OL/pull') || topic.endsWith('actuator/DL/pull')) { lastKnownState.dlPull = parseBool(msgString); dataChanged = true; }
  else if (topic.endsWith('actuator/LD/push')) { lastKnownState.ldPush = parseBool(msgString); dataChanged = true; }
  else if (topic.endsWith('actuator/LD/pull')) { lastKnownState.ldPull = parseBool(msgString); dataChanged = true; }
  else if (topic.endsWith('actuator/stepper/inner')) { lastKnownState.stepperInnerRotate = parseBool(msgString); dataChanged = true; }
  else if (topic.endsWith('actuator/stepper/outer')) { lastKnownState.stepperOuterRotate = parseBool(msgString); dataChanged = true; }
  else if (topic.endsWith('actuator/stepper/speed')) { lastKnownState.stepperSpeedSetting = parseInt(msgString) || 0; dataChanged = true; }

  // --- SAVE TO DATABASE ---
  if (dataChanged) { 
      try {
        if (typeof handleConveyor === 'function') {
           const packetForDB = { topic: topic, payload: JSON.stringify(lastKnownState) };
           handleConveyor(packetForDB, remoteClient, aedes);
        }
      } catch (err) {
        console.error("❌ DB Handler Error:", err.message);
      }
  }
});

// =================================================================
// --- 6. HANDLE INCOMING COMMANDS (REMOTE HMI -> THIS BROKER) ---
// =================================================================
// This event fires whenever ANY client (including your Remote HMI)
// publishes a message to THIS broker.

aedes.on('publish', function (packet, client) {
    // 1. Safety check: Ignore internal messages (where client is null)
    if (!client) return;
    
    const topic = packet.topic;

    // 2. Filter: Only process commands starting with "from_web/conveyor/"
    if (topic.startsWith('from_web/conveyor/')) {
        const payloadStr = packet.payload.toString();
        // console.log(`🖱️ Received Command from HMI: ${topic} -> ${payloadStr}`);

        try {
            // 3. Parse JSON from HMI
            const data = JSON.parse(payloadStr);
            let rawValue = "";

            // 4. Extract Value (Handle Boolean vs Number)
            if (data.hasOwnProperty('state')) {
                // Map true -> "1", false -> "0"
                rawValue = data.state ? "1" : "0";
            } 
            else if (data.hasOwnProperty('value')) {
                // Map number -> string
                rawValue = data.value.toString();
            }

            // 5. Construct Remote Topic for ITB
            // Replace "from_web/" with "ITB/IIOT/"
            // Ex: from_web/conveyor/actuator/DL/push -> ITB/IIOT/conveyor/actuator/DL/push
            const suffix = topic.replace('from_web/', ''); 
            const targetTopic = `${REMOTE_TOPIC_PUB_PREFIX}/${suffix}`;

            // 6. Forward the RAW value to ITB Campus Broker
            if (rawValue !== "") {
                remoteClient.publish(targetTopic, rawValue);
                console.log(`   ➡️ Forwarding to ITB: ${targetTopic} -> ${rawValue}`);
            }

        } catch (e) {
            console.error(`   ❌ Error forwarding HMI command: ${e.message}`);
        }
    }
});