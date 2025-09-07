require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer');
const fs = require('fs');

// =================================================================================
// 2. KONEKSI DAN INISIALISASI DATABASE (VERSI PERBAIKAN)
// =================================================================================
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        return console.error("Error membuka database:", err.message);
    } 
    
    console.log("Terhubung ke database SQLite.");

    // db.serialize() memastikan perintah di dalamnya berjalan satu per satu
    db.serialize(() => {
        // Perintah 1: Membuat tabel 'users'
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`, (err) => {
            if (err) return console.error("Error membuat tabel users:", err.message);

            // Perintah 2: Cek apakah user 'admin' sudah ada (hanya berjalan setelah tabel dibuat)
            const defaultUsername = 'admin';
            db.get("SELECT * FROM users WHERE username = ?", [defaultUsername], (err, row) => {
                if (err) return console.error("Error query user:", err.message);
                
                if (!row) {
                    // Perintah 3: Buat user admin jika belum ada
                    const defaultPassword = 'admin';
                    bcrypt.hash(defaultPassword, 10, (err, hash) => {
                        if (err) return console.error("Error hashing password:", err);
                        db.run("INSERT INTO users (username, password) VALUES (?, ?)", [defaultUsername, hash], (err) => {
                            if (err) return console.error("Error membuat user admin:", err);
                            console.log("User admin default ('admin'/'admin') telah dibuat.");
                        });
                    });
                }
            });
        });

        // Perintah 4: Membuat tabel 'videos' (dijalankan bersamaan dengan blok users)
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


// =================================================================================
// 3. INISIALISASI APLIKASI DAN KONFIGURASI MULTER
// =================================================================================
const app = express();
const PORT = 3000;

// Konfigurasi Multer untuk penyimpanan video
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
// 4. KONFIGURASI MIDDLEWARE
// =================================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
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
    db.all("SELECT * FROM videos ORDER BY created_at DESC", [], (err, videos) => {
        if (err) {
            console.error(err);
            return res.render('dashboard', { username: req.session.username, videos: [] });
        }
        res.render('dashboard', { username: req.session.username, videos: videos });
    });
});

// Rute untuk menangani unggahan video
app.post('/upload', requireLogin, upload.single('videoFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('Tidak ada file yang diunggah.');
    }

    const title = req.body.videoTitle || req.file.originalname;
    const filename = req.file.filename;

    db.run("INSERT INTO videos (title, filename) VALUES (?, ?)", [title, filename], (err) => {
        if (err) {
            console.error("Error menyimpan video ke DB:", err);
            fs.unlinkSync(path.join(__dirname, 'videos', filename));
            return res.status(500).send("Gagal menyimpan informasi video.");
        }
        res.redirect('/');
    });
});


// Rute Otentikasi
app.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('login', { error: "Username dan password tidak boleh kosong." });
    }

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) {
            return res.render('login', { error: "Username atau password salah." });
        }

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (isMatch) {
                req.session.userId = user.id;
                req.session.username = user.username;
                res.redirect('/');
            } else {
                res.render('login', { error: "Username atau password salah." });
            }
        });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});


// =================================================================================
// 6. MENJALANKAN SERVER
// =================================================================================
app.listen(PORT, () => {
    console.log(`Server siap dijalankan. Buka http://localhost:${PORT}`);
});
