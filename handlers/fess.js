const { insertData } = require('./dbHandler');

module.exports = function (packet, client) {
    const messageString = packet.payload.toString();
    console.log(`💬 [FESS MSG]: ${messageString}`);

    try {
        const data = JSON.parse(messageString);
        
        // Kirim ke tabel 'fess_data' (Pastikan tabel ini ada di Supabase)
        insertData('fess_data', data);

    } catch (err) {
        console.error('⚠️ [FESS ERROR] Data bukan JSON valid:', err.message);
    }
};