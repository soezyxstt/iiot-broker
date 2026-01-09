const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Gagal baca .env (Pastikan SUPABASE_SERVICE_KEY ada)");
}
const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

module.exports = async function (packet, client) {
  if (!supabase) return;

  try {
    let data;
    // Parsing JSON
    if (typeof packet.payload === 'object') {
        data = packet.payload;
        if (typeof data === 'string') try { data = JSON.parse(data); } catch(e) {}
    } else {
        try { data = JSON.parse(packet.payload.toString()); } catch(e) { return; }
    }
    if (typeof data === 'string') try { data = JSON.parse(data); } catch(e) {}

    // --- MAPPING KE KOLOM DATABASE (SNAKE_CASE) ---
    // Kiri: Nama Kolom di Database (Drizzle Schema)
    // Kanan: Nama Variabel di JS (Bridge State)
    
    const insertPayload = {
      // SENSORS
      ir_sensor:             data.irSensor ?? false,
      inductive_sensor:      data.inductiveSensor ?? false,
      capacitive_sensor:     data.capacitiveSensor ?? false,
      position_inner_sensor: data.positionInnerSensor ?? false,
      position_outer_sensor: data.positionOuterSensor ?? false, // Boolean sesuai schema

      // DATA REGISTERS
      motor_speed_sensor:    data.motorSpeedSensor ?? 0,
      object_inner_count:    data.objectInnerCount ?? 0,
      object_outer_count:    data.objectOuterCount ?? 0,

      // ACTUATORS
      dl_push:               data.dlPush ?? false,
      dl_pull:               data.dlPull ?? false,
      ld_push:               data.ldPush ?? false,
      ld_pull:               data.ldPull ?? false,
      stepper_inner_rotate:  data.stepperInnerRotate ?? false,
      stepper_outer_rotate:  data.stepperOuterRotate ?? false,
      stepper_speed_setting: data.stepperSpeedSetting ?? 0
    };

    // Insert ke tabel 'conveyor_logs'
    const { error } = await supabase.from('conveyor_logs').insert([insertPayload]);

    if (error) {
      console.error("❌ [DB Error]:", error.message);
    } else {
      console.log(`✅ [DB Success] Saved! (InnerObj: ${insertPayload.object_inner_count} | OuterObj: ${insertPayload.object_outer_count})`);
    }

  } catch (err) {
    console.error("❌ [Handler Crash]:", err.message);
  }
};