const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer();
const ws = require('websocket-stream');
const mqtt = require('mqtt'); 

// --- IMPORT HANDLER DATABASE (Mimicked from bridge_itb.js) ---
let handleConveyor;
try {
  handleConveyor = require('./handlers/conveyor_database');
} catch (e) {
  console.error("❌ ERROR IMPORT HANDLER:", e);
}

// --- INITIAL STATE (Mimicked from bridge_itb.js) ---
let lastKnownState = {
  // -- SENSORS (Boolean) --
  irSensor: false,
  inductiveSensor: false,
  capacitiveSensor: false,
  positionInnerSensor: false,
  positionOuterSensor: false, 

  // -- SENSORS (Data / Integer) --
  motorSpeedSensor: 0,
  objectInnerCount: 0,
  objectOuterCount: 0,

  // -- ACTUATORS (Boolean) --
  dlPush: false,
  dlPull: false,
  ldPush: false,
  ldPull: false,
  stepperInnerRotate: false,
  stepperOuterRotate: false,
  
  // -- ACTUATORS DATA --
  stepperSpeedSetting: 0
};

// Helper: Parse Boolean
function parseBool(val) {
    if (val === undefined || val === null) return false;
    const s = val.toString().toLowerCase();
    return s === '1' || s === 'true' || s === 'on';
}

// --- 1. CONFIGURATION ---
const LOCAL_TCP_PORT = 1885;
const LOCAL_WS_PORT = 1886;
const REMOTE_HOST = 'mqtt://iot.tf.itb.ac.id';
const REMOTE_TOPIC_SUB = 'ITB/IIOT/conveyor/#'; 
const REMOTE_TOPIC_PUB_PREFIX = 'ITB/IIOT';

// --- 2. START LOCAL SERVERS ---
server.listen(LOCAL_TCP_PORT, () => console.log(`🚀 TCP Broker: ${LOCAL_TCP_PORT}`));
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(LOCAL_WS_PORT, () => console.log(`🌐 WebSocket: ${LOCAL_WS_PORT}`));

// --- 3. CONNECT TO ITB (With Fixes) ---
console.log(`🔌 Connecting to ITB (${REMOTE_HOST})...`);

// FIX 1: Add a Random Client ID to prevent conflicts
const remoteClient = mqtt.connect(REMOTE_HOST, { 
    port: 1883,
    clientId: 'bridge_' + Math.random().toString(16).substr(2, 8),
    clean: true,
    connectTimeout: 4000
});

remoteClient.on('connect', function () {
    console.log('✅ Connected to ITB Broker!');
    remoteClient.subscribe(REMOTE_TOPIC_SUB);
    
    // FIX 2: Immediate "Heartbeat" Test
    // Check your MQTT Explorer! You should see this message appear.
    remoteClient.publish('ITB/IIOT/conveyor/debug', 'Script connected', (err) => {
        if (err) console.error("❌ Test Publish Failed:", err);
        else console.log("✅ Test Publish Sent (Check MQTT Explorer for 'ITB/IIOT/conveyor/debug')");
    });
});

remoteClient.on('error', (err) => console.error("❌ ITB Connection Error:", err));
remoteClient.on('offline', () => console.warn("⚠️ ITB Client Offline"));

// --- 4. INCOMING FROM ITB -> HMI (& DB) ---
remoteClient.on('message', function (topic, message) {
    // 1. Forward to local HMI (Existing)
    aedes.publish({ topic: topic, payload: message, qos: 0, retain: false });

    // 2. Process for Database (New Logic)
    const msgString = message.toString();
    const shortTopic = topic.split('/').slice(3).join('/'); // for logging (optional)
    
    let dataChanged = false;

    // --- LOGIKA MAPPING SESUAI SCHEMA (Mimicked) ---

    // --- 1. SENSORS (Boolean) ---
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

    // --- 2. SENSORS (Integer) ---
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

    // --- 3. ACTUATORS ---
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

    // --- KIRIM KE DB ---
    if (dataChanged && handleConveyor) { 
        // console.log(`   ✨ Update State Detected for DB`);
        const packetForDB = {
          topic: topic,
          payload: JSON.stringify(lastKnownState)
        };
        try {
          // Pass remoteClient as 'client' argument, though handler might not use it
          handleConveyor(packetForDB, remoteClient);
        } catch (err) {
          console.error("   ❌ Handler Error:", err.message);
        }
    }
});

// --- 5. INCOMING FROM HMI -> ITB (THE CRITICAL PART) ---
aedes.on('publish', function (packet, client) {
    if (!client) return; // Ignore internal messages
    
    remoteClient.publish(topic, packet.payload, {qos: 0, retain: false});
});