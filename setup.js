const fs = require('fs');
const crypto = require('crypto');

const envPath = '.env';

// Cek apakah file .env sudah ada
if (!fs.existsSync(envPath)) {
    console.log('File .env tidak ditemukan. Membuat file baru...');
    
    // Generate secret acak yang aman (64 karakter hex)
    const secret = crypto.randomBytes(32).toString('hex');
    
    // Siapkan konten untuk file .env
    const envContent = `SESSION_SECRET=${secret}\n`;
    
    // Tulis konten ke dalam file .env
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ File .env berhasil dibuat dengan SESSION_SECRET yang baru.');
} else {
    console.log('ℹ️ File .env sudah ada. Tidak ada tindakan yang diperlukan.');
}
