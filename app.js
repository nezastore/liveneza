// 1. Impor modul-modul yang kita butuhkan
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer'); // BARU: Impor multer untuk unggahan file
const fs = require('fs'); // BARU: Impor fs untuk manajemen file

// =================================================================================
// 2. KONEKSI DAN INISIALISASI DATABASE
// =================================================================================
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) return console.error("Error membuka database:", err.message);
    
    console.log("Terhubung ke database SQLite.");
    db.serialize(() => {
        // Membuat tabel 'users' jika belum ada
        db.run(`CREATE TABLE IF NOT EXISTS users (...)`, (err) => { /* ... kode user admin ... */ });

        // BARU: Membuat tabel 'videos' untuk menyimpan daftar video
        db.run(`CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            filename TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error membuat tabel videos:", err.message);
        });
    });
});
// (Salin kode pembuatan tabel user & admin dari file sebelumnya ke sini)
// Supaya ringkas, bagian inisialisasi user admin saya sembunyikan. Pastikan Anda tetap memakainya.
db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
    if (!row) {
        bcrypt.hash('admin', 10, (err, hash) => {
            db.run("INSERT INTO users (username, password) VALUES (?, ?)", ['admin', hash]);
            console.log("User admin default ('admin'/'admin') telah dibuat.");
        });
    }
});


// =================================================================================
// 3. INISIALISASI APLIKASI DAN KONFIGURASI MULTER
// =================================================================================
const app = express();
const PORT = 3000;

// BARU: Konfigurasi Multer untuk penyimpanan video
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'videos/'); // Simpan file di folder 'videos'
    },
    filename: function (req, file, cb) {
        // Buat nama file unik untuk menghindari duplikasi
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = file.originalname.replace(/\s+/g, '_'); // Ganti spasi dengan underscore
        cb(null, uniqueSuffix + '-' + originalName);
    }
});

const upload = multer({ storage: storage });


// =================================================================================
// 4. KONFIGURASI MIDDLEWARE (SAMA SEPERTI SEBELUMNYA)
// =================================================================================
// ... (Salin semua middleware dari app.js versi 2, tidak ada perubahan di sini)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
// BARU: Sajikan juga folder 'videos' secara statis agar bisa diakses thumbnail/preview
app.use('/videos', express.static(path.join(__dirname, 'videos')));
app.use(session({
    store: new SQLiteStore({ db: 'database.sqlite', dir: './' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
const requireLogin = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
};


// =================================================================================
// 5. RUTE (ROUTES) ATAU HALAMAN
// =================================================================================

// Rute Halaman Utama/Dashboard
app.get('/', requireLogin, (req, res) => {
    // BARU: Ambil daftar video dari database sebelum merender halaman
    db.all("SELECT * FROM videos ORDER BY created_at DESC", [], (err, videos) => {
        if (err) {
            console.error(err);
            // Kirim array kosong jika ada error
            return res.render('dashboard', { username: req.session.username, videos: [] });
        }
        res.render('dashboard', { username: req.session.username, videos: videos });
    });
});

// BARU: Rute untuk menangani unggahan video
// 'upload.single('videoFile')' -> 'videoFile' harus sama dengan atribut 'name' di input form
app.post('/upload', requireLogin, upload.single('videoFile'), (req, res) => {
    // req.file berisi informasi file yang diunggah oleh multer
    // req.body berisi data lain dari form (seperti judul)
    if (!req.file) {
        return res.status(400).send('Tidak ada file yang diunggah.');
    }

    const title = req.body.videoTitle || req.file.originalname;
    const filename = req.file.filename;

    db.run("INSERT INTO videos (title, filename) VALUES (?, ?)", [title, filename], (err) => {
        if (err) {
            console.error("Error menyimpan video ke DB:", err);
            // Jika gagal, hapus file yang sudah terunggah
            fs.unlinkSync(path.join(__dirname, 'videos', filename));
            return res.status(500).send("Gagal menyimpan informasi video.");
        }
        res.redirect('/'); // Kembali ke dashboard, yang akan menampilkan video baru
    });
});


// Rute Otentikasi (SAMA SEPERTI SEBELUMNYA)
// ... (Salin rute /login GET, /login POST, dan /logout dari app.js versi 2)
app.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('login', { error: null });
});

app.post('/login', (req, res) => { /* ... kode login ... */ });
app.get('/logout', (req, res) => { /* ... kode logout ... */ });


// =================================================================================
// 6. MENJALANKAN SERVER (SAMA SEPERTI SEBELUMNYA)
// =================================================================================
app.listen(PORT, () => {
    console.log(`Server siap dijalankan. Buka http://localhost:${PORT}`);
});