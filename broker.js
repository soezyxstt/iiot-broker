const mqtt = require('mqtt');

// --- 1. IMPORT HANDLER DATABASE ---
let handleConveyor;
try {
  handleConveyor = require('./handlers/conveyor_database');
} catch (e) {
  console.error("❌ ERROR IMPORT HANDLER:", e);
  process.exit(1);
}

// --- 2. INITIAL STATE (SESUAI SCHEMA DRIZZLE BARU) ---
let lastKnownState = {
  // -- SENSORS (Boolean) --
  irSensor: false,
  inductiveSensor: false,
  capacitiveSensor: false,
  positionInnerSensor: false,
  positionOuterSensor: false, // Schema kamu define ini Boolean, jadi kita pakai false/true

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

// Helper: Ubah apapun jadi Boolean
function parseBool(val) {
    if (val === undefined || val === null) return false;
    const s = val.toString().toLowerCase();
    return s === '1' || s === 'true' || s === 'on';
}

// --- 3. KONFIGURASI SERVER ---
const HOST = 'mqtt://iot.tf.itb.ac.id';
const PORT = 1883;
const TOPIC_TARGET = 'ITB/IIOT/conveyor/#'; 

console.log(`🔌 Connecting to ${HOST}...`);
const client = mqtt.connect(HOST, { port: PORT });

client.on('connect', function () {
  console.log('✅ BERHASIL CONNECT!');
  client.subscribe(TOPIC_TARGET);
  console.log(`📡 Memantau Topik Schema Baru: ${TOPIC_TARGET}`);
});

client.on('message', function (topic, message) {
  const msgString = message.toString();
  
  // Tampilkan Log Raw
  const shortTopic = topic.split('/').slice(3).join('/'); // ambil suffix aja
  console.log(`📩 [TERIMA] .../${shortTopic} -> ${msgString}`);

  let dataChanged = false;

  // =========================================================
  // LOGIKA MAPPING SESUAI SCHEMA DRIZZLE BARU
  // =========================================================

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
      // Sesuai schema: boolean("position_outer_sensor")
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

  // --- 3. ACTUATORS (Support Actuator & Feedback topic) ---
  
  // DL PUSH
  else if (topic.endsWith('actuator/DL/push')) {
      lastKnownState.dlPush = parseBool(msgString);
      dataChanged = true;
  }
  // DL PULL (Note: Di PDF namanya OL/pull tapi di schema kamu dlPull, kita sesuaikan)
  else if (topic.endsWith('actuator/OL/pull') || topic.endsWith('actuator/DL/pull')) {
      lastKnownState.dlPull = parseBool(msgString);
      dataChanged = true;
  }
  // LD PUSH
  else if (topic.endsWith('actuator/LD/push')) {
      lastKnownState.ldPush = parseBool(msgString);
      dataChanged = true;
  }
  // LD PULL
  else if (topic.endsWith('actuator/LD/pull')) {
      lastKnownState.ldPull = parseBool(msgString);
      dataChanged = true;
  }
  // STEPPER INNER
  else if (topic.endsWith('actuator/stepper/inner')) {
      lastKnownState.stepperInnerRotate = parseBool(msgString);
      dataChanged = true;
  }
  // STEPPER OUTER
  else if (topic.endsWith('actuator/stepper/outer')) {
      lastKnownState.stepperOuterRotate = parseBool(msgString);
      dataChanged = true;
  }
  // STEPPER SPEED SETTING
  else if (topic.endsWith('actuator/stepper/speed')) {
      lastKnownState.stepperSpeedSetting = parseInt(msgString) || 0;
      dataChanged = true;
  }

  // --- KIRIM KE DB ---
  if (dataChanged) { 
      // console.log(`   ✨ Update State Detected`);
      const packetForDB = {
        topic: topic,
        payload: JSON.stringify(lastKnownState)
      };
      try {
        handleConveyor(packetForDB, client);
      } catch (err) {
        console.error("   ❌ Handler Error:", err.message);
      }
  } else {
      console.log("   ⚠️ Topik tidak dikenali di Schema baru.");
  }
});