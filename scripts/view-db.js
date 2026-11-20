const { db, DB_PATH, EXCEL_FILE_PATH, initDatabase, triggerExcelSync } = require('../src/db');

if (process.argv.includes('--reset')) {
  console.log('Mereset database dan memperbarui file Excel...');
  initDatabase(true);
  console.log('Database & File Excel berhasil direset!');
} else {
  triggerExcelSync();
}

console.log('==============================================================');
console.log('  SINKRONISASI DATABASE & EXCEL KERETAKITA');
console.log('  File Excel (.xlsx) :', EXCEL_FILE_PATH);
console.log('  File SQLite        :', DB_PATH);
console.log('==============================================================\n');

const bookings = db.prepare(`
  SELECT
    b.id, b.booking_code, b.contact_name, s.train_name,
    b.travel_date, b.total_passengers, b.promo_code,
    b.total_price, b.payment_method, b.payment_status, b.booking_status
  FROM bookings b
  JOIN schedules s ON s.id = b.schedule_id
  ORDER BY b.id DESC
`).all();
console.log(`[1] SHEET 1_Pemesanan_Tiket (${bookings.length} baris):`);
console.table(bookings);

const passengers = db.prepare(`
  SELECT
    p.id, p.ticket_number, b.booking_code, p.passenger_name,
    p.passenger_nik, p.carriage_number, p.seat_number, p.meal_addon, p.insurance_addon
  FROM booking_passengers p
  JOIN bookings b ON b.id = p.booking_id
  ORDER BY p.id DESC
`).all();
console.log(`\n[2] SHEET 2_Penumpang_Kursi (${passengers.length} baris):`);
console.table(passengers);

const users = db.prepare('SELECT id, name, email, phone, nik, role, loyalty_points, created_at FROM users').all();
console.log(`\n[3] SHEET 3_Data_Pelanggan (${users.length} baris):`);
console.table(users);
