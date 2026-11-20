const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { syncDatabaseToExcel, EXCEL_FILE_PATH } = require('./excel-sync');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'keretakita.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function triggerExcelSync() {
  return syncDatabaseToExcel(db);
}

function initDatabase(forceReset = false) {
  // Check if schema is outdated (missing promo_code on bookings or facilities on schedules)
  let needsRebuild = forceReset;
  if (!needsRebuild) {
    try {
      const cols = db.prepare("PRAGMA table_info('bookings')").all();
      if (cols.length > 0 && !cols.some((c) => c.name === 'promo_code')) {
        needsRebuild = true;
      }
    } catch (_) {
      needsRebuild = true;
    }
  }

  if (needsRebuild) {
    db.exec(`
      DROP TABLE IF EXISTS booking_passengers;
      DROP TABLE IF EXISTS bookings;
      DROP TABLE IF EXISTS saved_passengers;
      DROP TABLE IF EXISTS promos;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS schedules;
      DROP TABLE IF EXISTS stations;
      DROP TABLE IF EXISTS users;
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      nik TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      loyalty_points INTEGER NOT NULL DEFAULT 250,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_passengers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      passenger_name TEXT NOT NULL,
      passenger_nik TEXT NOT NULL,
      passenger_type TEXT NOT NULL DEFAULT 'Dewasa',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      region TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      train_code TEXT NOT NULL,
      train_name TEXT NOT NULL,
      train_class TEXT NOT NULL,
      sub_class TEXT NOT NULL DEFAULT 'AA',
      origin_station_id INTEGER NOT NULL,
      destination_station_id INTEGER NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      duration TEXT NOT NULL,
      price INTEGER NOT NULL,
      carriages_count INTEGER NOT NULL DEFAULT 3,
      seats_per_carriage INTEGER NOT NULL DEFAULT 40,
      total_seats INTEGER NOT NULL DEFAULT 120,
      facilities TEXT NOT NULL DEFAULT 'AC, Stopkontak, Bagasi 20kg, Restorasi, Kursi Reclining',
      status TEXT NOT NULL DEFAULT 'AKTIF',
      FOREIGN KEY (origin_station_id) REFERENCES stations(id),
      FOREIGN KEY (destination_station_id) REFERENCES stations(id)
    );

    CREATE TABLE IF NOT EXISTS promos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      discount_type TEXT NOT NULL,
      discount_value INTEGER NOT NULL,
      min_purchase INTEGER NOT NULL DEFAULT 0,
      max_discount INTEGER NOT NULL DEFAULT 100000,
      badge TEXT NOT NULL DEFAULT 'PROMO SPESIAL',
      valid_until TEXT NOT NULL DEFAULT '31 Des 2026'
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      schedule_id INTEGER NOT NULL,
      travel_date TEXT NOT NULL,
      total_passengers INTEGER NOT NULL,
      promo_code TEXT NOT NULL DEFAULT '-',
      discount_amount INTEGER NOT NULL DEFAULT 0,
      addons_total INTEGER NOT NULL DEFAULT 0,
      total_price INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'LUNAS',
      booking_status TEXT NOT NULL DEFAULT 'AKTIF',
      contact_name TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );

    CREATE TABLE IF NOT EXISTS booking_passengers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      passenger_name TEXT NOT NULL,
      passenger_nik TEXT NOT NULL,
      passenger_type TEXT NOT NULL DEFAULT 'Dewasa',
      carriage_number INTEGER NOT NULL,
      seat_number TEXT NOT NULL,
      ticket_number TEXT NOT NULL UNIQUE,
      meal_addon TEXT NOT NULL DEFAULT 'Tanpa Makanan',
      insurance_addon TEXT NOT NULL DEFAULT 'Tidak',
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );
  `);

  seedInitialData();
  triggerExcelSync();
}

function seedInitialData() {
  const stationCount = db.prepare('SELECT COUNT(*) as count FROM stations').get().count;
  if (stationCount > 0) {
    return;
  }

  // Master Data Only: Promos, Stations & Train Schedules
  // Users, Saved Passengers, Sessions, Bookings, and Booking Passengers start 100% empty!

  // 1. Seed Promos
  const insertPromo = db.prepare(`
    INSERT INTO promos (code, title, description, discount_type, discount_value, min_purchase, max_discount, badge, valid_until)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPromo.run(
    'KERETAHEMAT',
    'Diskon Langsung Rp 50.000 Semua Rute',
    'Potongan langsung Rp 50.000 untuk pemesanan tiket kereta api rute mana saja dengan minimum transaksi Rp 200.000.',
    'FIXED',
    50000,
    200000,
    50000,
    'PALING POPULER',
    '31 Des 2026'
  );
  insertPromo.run(
    'RAILTRIP15',
    'Diskon 15% Kelas Eksekutif & Luxury',
    'Nikmati perjalanan nyaman dengan potongan 15% (maksimal Rp 120.000) untuk seluruh jadwal kereta api.',
    'PERCENT',
    15,
    250000,
    120000,
    'EKSKLUSIF',
    '31 Des 2026'
  );
  insertPromo.run(
    'WEEKENDKAI',
    'Voucher Liburan Hemat Rp 35.000',
    'Potongan hemat Rp 35.000 tanpa syarat kelas kereta dengan minimum transaksi Rp 150.000.',
    'FIXED',
    35000,
    150000,
    35000,
    'PROMO LIBURAN',
    '31 Des 2026'
  );
  insertPromo.run(
    'KELUARGA100',
    'Paket Rombongan & Keluarga Hemat Rp 100.000',
    'Hemat Rp 100.000 untuk perjalanan bersama keluarga atau rekan dengan minimum transaksi Rp 600.000.',
    'FIXED',
    100000,
    600000,
    100000,
    'HEMAT KELUARGA',
    '31 Des 2026'
  );

  // 2. Seed Stations
  const stations = [
    ['GMR', 'Stasiun Gambir', 'Jakarta Pusat', 'DAOP 1 Jakarta'],
    ['PSE', 'Stasiun Pasar Senen', 'Jakarta Pusat', 'DAOP 1 Jakarta'],
    ['BD', 'Stasiun Bandung', 'Bandung', 'DAOP 2 Bandung'],
    ['CN', 'Stasiun Cirebon Kejaksan', 'Cirebon', 'DAOP 3 Cirebon'],
    ['PWT', 'Stasiun Purwokerto', 'Purwokerto', 'DAOP 5 Purwokerto'],
    ['SMT', 'Stasiun Semarang Tawang', 'Semarang', 'DAOP 4 Semarang'],
    ['YK', 'Stasiun Yogyakarta Tugu', 'Yogyakarta', 'DAOP 6 Yogyakarta'],
    ['LPN', 'Stasiun Lempuyangan', 'Yogyakarta', 'DAOP 6 Yogyakarta'],
    ['SLO', 'Stasiun Solo Balapan', 'Surakarta (Solo)', 'DAOP 6 Yogyakarta'],
    ['MN', 'Stasiun Madiun', 'Madiun', 'DAOP 7 Madiun'],
    ['SBI', 'Stasiun Surabaya Pasarturi', 'Surabaya', 'DAOP 8 Surabaya'],
    ['SGU', 'Stasiun Surabaya Gubeng', 'Surabaya', 'DAOP 8 Surabaya'],
    ['ML', 'Stasiun Malang', 'Malang', 'DAOP 8 Surabaya']
  ];

  const insertStation = db.prepare(`
    INSERT INTO stations (code, name, city, region)
    VALUES (?, ?, ?, ?)
  `);

  const stationMap = {};
  for (const [code, name, city, region] of stations) {
    const res = insertStation.run(code, name, city, region);
    stationMap[code] = Number(res.lastInsertRowid);
  }

  // 3. Seed Train Schedules
  const facExec = 'AC Dingin, Kursi Reclining 140°, Stopkontak & USB, Restorasi, Bagasi 20kg, Bantal & Selimut';
  const facLux = 'Sleeper Seat 180°, Layar Hiburan Pribadi, Makanan & Minuman Gratis, WiFi, Lounge Eksklusif';
  const facBis = 'AC Dingin, Kursi Empuk 2-2, Stopkontak, Restorasi, Bagasi 20kg';
  const facEco = 'AC Dingin, Kursi Ergonomis New Generation, Stopkontak, Restorasi, Bagasi 20kg';

  const schedules = [
    // Jakarta (GMR) <-> Bandung (BD)
    ['KA-34', 'Argo Parahyangan', 'Eksekutif', 'AA', 'GMR', 'BD', '07:25', '10:10', '2j 45m', 250000, 3, 40, facExec],
    ['KA-34L', 'Argo Parahyangan Panoramic', 'Luxury', 'LUX', 'GMR', 'BD', '07:25', '10:10', '2j 45m', 450000, 3, 40, facLux],
    ['KA-36', 'Argo Parahyangan', 'Ekonomi', 'CA', 'GMR', 'BD', '08:15', '11:05', '2j 50m', 150000, 3, 40, facEco],
    ['KA-40', 'Papandayan Ekspres', 'Eksekutif', 'AB', 'GMR', 'BD', '13:10', '15:55', '2j 45m', 245000, 3, 40, facExec],
    ['KA-42', 'Argo Parahyangan Sore', 'Eksekutif', 'AA', 'GMR', 'BD', '15:30', '18:15', '2j 45m', 250000, 3, 40, facExec],
    ['KA-44', 'Argo Parahyangan Malam', 'Eksekutif', 'AB', 'GMR', 'BD', '18:30', '21:15', '2j 45m', 260000, 3, 40, facExec],
    ['KA-35', 'Argo Parahyangan Pagi', 'Eksekutif', 'AA', 'BD', 'GMR', '06:00', '08:45', '2j 45m', 250000, 3, 40, facExec],
    ['KA-43', 'Argo Parahyangan Sore', 'Eksekutif', 'AA', 'BD', 'GMR', '16:10', '18:55', '2j 45m', 250000, 3, 40, facExec],
    ['KA-45', 'Argo Parahyangan Ekonomi', 'Ekonomi', 'CA', 'BD', 'GMR', '16:10', '18:55', '2j 45m', 150000, 3, 40, facEco],

    // Jakarta (GMR / PSE) <-> Yogyakarta (YK / LPN)
    ['KA-68', 'Taksaka Pagi', 'Eksekutif', 'AA', 'GMR', 'YK', '09:20', '15:35', '6j 15m', 560000, 3, 40, facExec],
    ['KA-68L', 'Taksaka Luxury Sleeper', 'Luxury', 'LUX', 'GMR', 'YK', '09:20', '15:35', '6j 15m', 1150000, 3, 40, facLux],
    ['KA-70', 'Taksaka Malam', 'Eksekutif', 'AA', 'GMR', 'YK', '21:40', '03:55', '6j 15m', 580000, 3, 40, facExec],
    ['KA-67', 'Taksaka Pagi', 'Eksekutif', 'AA', 'YK', 'GMR', '08:45', '15:00', '6j 15m', 560000, 3, 40, facExec],
    ['KA-140', 'Senja Utama YK', 'Bisnis', 'BA', 'PSE', 'YK', '19:05', '02:00', '6j 55m', 380000, 3, 40, facBis],
    ['KA-142', 'Fajar Utama YK', 'Ekonomi', 'CA', 'PSE', 'YK', '07:00', '14:10', '7j 10m', 290000, 3, 40, facEco],
    ['KA-218', 'Progo New Generation', 'Ekonomi', 'CB', 'PSE', 'LPN', '22:30', '06:05', '7j 35m', 210000, 3, 40, facEco],

    // Jakarta (GMR / PSE) <-> Surabaya (SBI / SGU)
    ['KA-2', 'Argo Bromo Anggrek Pagi', 'Eksekutif', 'AA', 'GMR', 'SBI', '08:20', '16:25', '8j 05m', 690000, 3, 40, facExec],
    ['KA-2L', 'Argo Bromo Compartment Suite', 'Luxury', 'LUX', 'GMR', 'SBI', '08:20', '16:25', '8j 05m', 1450000, 3, 40, facLux],
    ['KA-4', 'Argo Bromo Anggrek Malam', 'Eksekutif', 'AA', 'GMR', 'SBI', '20:30', '04:35', '8j 05m', 710000, 3, 40, facExec],
    ['KA-1', 'Argo Bromo Anggrek Pagi', 'Eksekutif', 'AA', 'SBI', 'GMR', '09:10', '17:15', '8j 05m', 690000, 3, 40, facExec],
    ['KA-76', 'Bima Eksekutif', 'Eksekutif', 'AA', 'GMR', 'SGU', '17:00', '03:20', '10j 20m', 640000, 3, 40, facExec],
    ['KA-106', 'Gaya Baru Malam Selatan', 'Ekonomi', 'CA', 'PSE', 'SGU', '11:00', '23:35', '12j 35m', 340000, 3, 40, facEco],

    // Jakarta (GMR) <-> Solo (SLO) / Semarang (SMT) / Malang (ML) / Cirebon (CN)
    ['KA-8', 'Argo Lawu', 'Eksekutif', 'AA', 'GMR', 'SLO', '20:45', '03:45', '7j 00m', 590000, 3, 40, facExec],
    ['KA-10', 'Argo Dwipangga', 'Eksekutif', 'AA', 'GMR', 'SLO', '08:50', '15:50', '7j 00m', 580000, 3, 40, facExec],
    ['KA-14', 'Argo Muria', 'Eksekutif', 'AA', 'GMR', 'SMT', '07:00', '12:15', '5j 15m', 430000, 3, 40, facExec],
    ['KA-13', 'Argo Muria Sore', 'Eksekutif', 'AA', 'SMT', 'GMR', '16:30', '21:45', '5j 15m', 430000, 3, 40, facExec],
    ['KA-56', 'Gajayana', 'Eksekutif', 'AA', 'GMR', 'ML', '18:50', '07:05', '12j 15m', 740000, 3, 40, facExec],
    ['KA-26', 'Argo Cheribon', 'Eksekutif', 'AA', 'GMR', 'CN', '08:30', '11:25', '2j 55m', 230000, 3, 40, facExec],

    // Bandung (BD) <-> Yogyakarta (YK) / Surabaya (SGU)
    ['KA-92', 'Lodaya Pagi', 'Eksekutif', 'AA', 'BD', 'YK', '06:55', '13:30', '6j 35m', 420000, 3, 40, facExec],
    ['KA-94', 'Lodaya Bisnis', 'Bisnis', 'BA', 'BD', 'YK', '06:55', '13:30', '6j 35m', 310000, 3, 40, facBis],
    ['KA-66', 'Turangga Malam', 'Eksekutif', 'AA', 'BD', 'SGU', '18:10', '04:20', '10j 10m', 610000, 3, 40, facExec],

    // Yogyakarta (YK) <-> Surabaya (SGU)
    ['KA-96', 'Sancaka Pagi', 'Eksekutif', 'AA', 'YK', 'SGU', '06:45', '10:45', '4j 00m', 350000, 3, 40, facExec],
    ['KA-98', 'Sancaka Ekonomi', 'Ekonomi', 'CA', 'YK', 'SGU', '06:45', '10:45', '4j 00m', 230000, 3, 40, facEco],
    ['KA-97', 'Sancaka Sore', 'Eksekutif', 'AA', 'SGU', 'YK', '17:00', '21:00', '4j 00m', 350000, 3, 40, facExec]
  ];

  const insertSchedule = db.prepare(`
    INSERT INTO schedules (
      train_code, train_name, train_class, sub_class,
      origin_station_id, destination_station_id,
      departure_time, arrival_time, duration, price,
      carriages_count, seats_per_carriage, total_seats, facilities
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of schedules) {
    const [
      code, name, trainClass, subClass,
      origCode, destCode, depTime, arrTime, duration, price,
      carriages, seatsPerCarriage, facilities
    ] = s;
    insertSchedule.run(
      code,
      name,
      trainClass,
      subClass,
      stationMap[origCode],
      stationMap[destCode],
      depTime,
      arrTime,
      duration,
      price,
      carriages,
      seatsPerCarriage,
      carriages * seatsPerCarriage,
      facilities
    );
  }
}

initDatabase(false);

module.exports = {
  db,
  DB_PATH,
  EXCEL_FILE_PATH,
  hashPassword,
  verifyPassword,
  initDatabase,
  triggerExcelSync
};
