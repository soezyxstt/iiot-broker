const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer();
const ws = require('websocket-stream');
const mqtt = require('mqtt'); 

// --- 1. CONFIGURATION ---
const LOCAL_TCP_PORT = 1883;
const LOCAL_WS_PORT = 1884;
const REMOTE_HOST = 'ws://iot.tf.itb.ac.id';
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
    port: 1884,
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

// --- 4. INCOMING FROM ITB -> HMI ---
remoteClient.on('message', function (topic, message) {
    // Forward to local HMI
    aedes.publish({ topic: topic, payload: message, qos: 0, retain: false });
});

// --- 5. INCOMING FROM HMI -> ITB (THE CRITICAL PART) ---
aedes.on('publish', function (packet, client) {
    if (!client) return; // Ignore internal messages
    
    const topic = packet.topic;

    if (topic.startsWith('from_web/conveyor/')) {
        const payloadStr = packet.payload.toString();
        console.log(`INPUT: ${topic} -> ${payloadStr}`);

        try {
            const data = JSON.parse(payloadStr);
            let rawValue = "";

            if (data.hasOwnProperty('state')) {
                rawValue = data.state ? "1" : "0";
            } else if (data.hasOwnProperty('value')) {
                rawValue = data.value.toString();
            }

            const suffix = topic.replace('from_web/', ''); 
            const targetTopic = `${REMOTE_TOPIC_PUB_PREFIX}/${suffix}`;

            if (rawValue !== "") {
                console.log(`   Attempting send to ITB: [${targetTopic}] Payload: [${rawValue}]`);
                
                // FIX 3: Explicit Buffer & Error Callback
                remoteClient.publish(targetTopic, Buffer.from(rawValue), { qos: 0, retain: false }, function (err) {
                    if (err) {
                        console.error(`   ❌ PUBLISH ERROR: ${err.message}`);
                    } else {
                        console.log(`   ✅ SUCCESS: Sent to ITB!`);
                    }
                });
            }

        } catch (e) {
            console.error(`   ❌ PARSE ERROR: ${e.message}`);
        }
    }
});