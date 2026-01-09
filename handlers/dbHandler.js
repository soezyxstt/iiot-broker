require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Ambil config dari .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Cek jika .env belum dibuat/kosong
if (!supabaseUrl || !supabaseKey) {
    console.error("❌ [DB FATAL] SUPABASE_URL atau SERVICE_KEY tidak ditemukan di .env");
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fungsi Universal Simpan Data
 * @param {string} tableName - Nama tabel di Supabase
 * @param {object} payload - Data JSON
 */
async function insertData(tableName, payload) {
    try {
        const { data, error } = await supabase
            .from(tableName)
            .insert([payload])
            .select();

        if (error) {
            console.error(`❌ [DB Error - ${tableName}]:`, error.message);
            return null;
        }

        console.log(`✅ [DB Saved - ${tableName}]:`, JSON.stringify(data));
        return data;

    } catch (err) {
        console.error(`❌ [System Error]:`, err);
        return null;
    }
}

module.exports = { insertData };