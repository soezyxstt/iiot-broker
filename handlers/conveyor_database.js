// handlers/conveyor.js
const { insertData } = require('./dbHandler');

module.exports = function (packet, client) {
    const messageString = packet.payload.toString();
    console.log(`📦 [CONVEYOR] Raw Data: ${messageString}`);

    try {
        // 1. Terima data mentah dari MQTT (Anggaplah formatnya camelCase)
        const raw = JSON.parse(messageString);

        // 2. MAPPING: Ubah ke format Database (snake_case)
        // Kita buat object baru yang kuncinya SAMA PERSIS dengan nama kolom database
        const dbPayload = {
            // -- Linear Actuators --
            la1_forward: Boolean(raw.la1Forward),   // Pastikan jadi true/false
            la1_backward: Boolean(raw.la1Backward),
            la2_forward: Boolean(raw.la2Forward),
            la2_backward: Boolean(raw.la2Backward),

            // -- Stepper Relays --
            stepper1_relay: Boolean(raw.stepper1Relay),
            stepper2_relay: Boolean(raw.stepper2Relay),

            // -- Proximity Relays --
            ir_relay: Boolean(raw.irRelay),
            inductive_relay: Boolean(raw.inductiveRelay),
            capacitive_relay: Boolean(raw.capacitiveRelay),

            // -- Sensor Inputs --
            ir_sensor: Boolean(raw.irSensor),
            inductive_sensor: Boolean(raw.inductiveSensor),
            capacitive_sensor: Boolean(raw.capacitiveSensor),

            // -- Stepper Feedback (Numeric) --
            stepper1_rpm: Number(raw.stepper1Rpm),
            stepper1_pos: Number(raw.stepper1Position),
            stepper2_rpm: Number(raw.stepper2Rpm),
            stepper2_pos: Number(raw.stepper2Position),

            // -- System Health --
            is_power_live: Boolean(raw.isPowerLive),

            // -- Outer Points (Hati-hati dengan ENUM!) --
            // Pastikan nilainya cuma: 'empty', 'occupied', atau 'occupied_metallic'
            outer_point_1: raw.outerPoint1 || 'empty', 
            outer_point_2: raw.outerPoint2 || 'empty',
            outer_point_3: raw.outerPoint3 || 'empty',
            outer_point_4: raw.outerPoint4 || 'empty',
            outer_point_5: raw.outerPoint5 || 'empty',

            // -- Inner Points --
            inner_point_1_occupied: Boolean(raw.innerPoint1Occupied),
            inner_point_2_occupied: Boolean(raw.innerPoint2Occupied),
            inner_point_3_occupied: Boolean(raw.innerPoint3Occupied),
            inner_point_4_occupied: Boolean(raw.innerPoint4Occupied),
            inner_point_5_occupied: Boolean(raw.innerPoint5Occupied),
        };

        // 3. Kirim payload yang sudah rapi ke Database
        insertData('machine_logs', dbPayload);

    } catch (err) {
        console.error('⚠️ [CONVEYOR ERROR] Mapping Gagal:', err.message);
    }
};