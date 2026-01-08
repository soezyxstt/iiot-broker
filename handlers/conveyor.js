// handlers/conveyor.js

// === 1. STATE MANAGEMENT (Hanya di dalam modul ini) ===
const currentPlcState = {
    point_id: 'O0',
    ir_reading: 0,
    inductive_reading: 0,
    capacitive_reading: 0
};

// === 2. FUNGSI PUBLIKASI AGREGASI ===
// Fungsi ini menerima 'aedes' sebagai dependensi (dependency injection)
// agar bisa melakukan publikasi (publish) kembali ke broker.
function publishAggregatedState(aedesInstance) {
    const { point_id, ir_reading, inductive_reading, capacitive_reading } = currentPlcState;

    // Logika Klasifikasi (Tidak Berubah)
    let state = "empty"; 
    if (ir_reading === 1 || capacitive_reading === 1) {
        if (inductive_reading === 1) {
            state = "occupied_metallic";
        } else {
            state = "occupied_non_metallic";
        }
    } else {
        state = "empty";
    }

    // Buat Payload dan Timestamp (Tidak Berubah)
    const payloadObject = {
        "point_id": point_id,
        "state": state,
        // ... (data mentah lainnya)
    };
    payloadObject.timestamp = new Date().toISOString(); 
    
    // Tentukan Topic Tujuan
    // Kita kembalikan topik menjadi seperti sebelumnya (misalnya: conveyor/outer/point/1/state)
    const topic = `conveyor/outer/point/${point_id.slice(-1)}/state`; 

    const payloadString = JSON.stringify(payloadObject);

    // Publikasikan menggunakan instance aedes yang diberikan
    aedesInstance.publish({
        topic: topic,
        payload: payloadString,
        qos: 1, 
        retain: false
    }, (err) => {
        if (err) {
            console.error(`[CONV_HANDLER_ERROR] Gagal memublikasikan topik ${topic}:`, err);
        } else {
            console.log(`[CONV_HANDLER] Berhasil memublikasikan: ${topic}`);
        }
    });
}

// === 3. FUNGSI UTAMA (HANDLER) yang diekspor ===
module.exports = function(packet, client, aedesInstance) {
    
    const topic = packet.topic;
    
    // Topik yang menjadi sumber data mentah PLC
    const RAW_IR_TOPIC = 'conveyor/raw/ir_sensor';
    const RAW_INDUCTIVE_TOPIC = 'conveyor/raw/inductive_sensor';
    const RAW_CAPACITIVE_TOPIC = 'conveyor/raw/capacitive_sensor';
    const RAW_POSITION_TOPIC = 'conveyor/raw/point_id'; // Topik yang menjadi TRIGGER

    try {
        const payloadValue = JSON.parse(packet.payload.toString()).value;

        // A. Update State Management Berdasarkan Topik
        if (topic === RAW_IR_TOPIC) {
            currentPlcState.ir_reading = payloadValue;
        } else if (topic === RAW_INDUCTIVE_TOPIC) {
            currentPlcState.inductive_reading = payloadValue;
        } else if (topic === RAW_CAPACITIVE_TOPIC) {
            currentPlcState.capacitive_reading = payloadValue;
        
        // B. TRIGGER FUNGSI AGREGASI HANYA KETIKA POSISI BERUBAH
        } else if (topic === RAW_POSITION_TOPIC) {
            currentPlcState.point_id = payloadValue;
            console.log(`[CONV_TRIGGER] Posisi berubah menjadi ${payloadValue}. Memublikasikan State gabungan.`);
            
            // Panggil fungsi agregasi dan publikasi
            publishAggregatedState(aedesInstance);
        }

    } catch (e) {
        console.error(`[CONV_HANDLER_ERROR] Gagal memproses payload topik ${topic}:`, e.message);
    }
};
