const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const {
  db,
  DB_PATH,
  EXCEL_FILE_PATH,
  hashPassword,
  verifyPassword,
  triggerExcelSync
} = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const MEAL_PRICES = {
  'Tanpa Makanan': 0,
  'Nasi Goreng Parahyangan': 38000,
  'Chicken Bento KAI': 42000,
  'Empal Gentong Kereta': 45000,
  'Paket Kopi & Croissant': 28000
};

const INSURANCE_PRICE_PER_PAX = 15000;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('Ukuran data terlalu besar'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error('Format permintaan tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

function getAuthenticatedUser(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const session = db.prepare(`
    SELECT s.token, u.id, u.name, u.email, u.phone, u.nik, u.role, u.loyalty_points, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now', 'localtime')
  `).get(token);

  return session || null;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, datetime('now', 'localtime', '+7 days'))
  `).run(token, userId);
  return token;
}

function generateBookingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const code = `KAI-${suffix}`;
    const existing = db.prepare('SELECT id FROM bookings WHERE booking_code = ?').get(code);
    if (!existing) return code;
  }
  return `KAI-${Date.now().toString(36).toUpperCase()}`;
}

function calculatePromoDiscount(promoCode, baseSubtotal) {
  if (!promoCode || promoCode === '-') return { discount: 0, promo: null };
  const promo = db.prepare('SELECT * FROM promos WHERE UPPER(code) = UPPER(?)').get(promoCode.trim());
  if (!promo) return { discount: 0, promo: null, error: 'Kode promo tidak ditemukan.' };
  if (baseSubtotal < promo.min_purchase) {
    return {
      discount: 0,
      promo: null,
      error: `Minimum pembelian untuk promo ${promo.code} adalah Rp ${Number(promo.min_purchase).toLocaleString('id-ID')}.`
    };
  }
  let discount = 0;
  if (promo.discount_type === 'PERCENT') {
    discount = Math.round((baseSubtotal * promo.discount_value) / 100);
    if (promo.max_discount && discount > promo.max_discount) {
      discount = promo.max_discount;
    }
  } else {
    discount = promo.discount_value;
  }
  return { discount: Math.min(discount, baseSubtotal), promo };
}

function getBookingDetailByCode(bookingCode) {
  const booking = db.prepare(`
    SELECT
      b.*,
      s.train_code,
      s.train_name,
      s.train_class,
      s.sub_class,
      s.departure_time,
      s.arrival_time,
      s.duration,
      s.facilities,
      s.price AS price_per_seat,
      orig.code AS origin_code,
      orig.name AS origin_name,
      orig.city AS origin_city,
      dest.code AS destination_code,
      dest.name AS destination_name,
      dest.city AS destination_city
    FROM bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN stations orig ON orig.id = s.origin_station_id
    JOIN stations dest ON dest.id = s.destination_station_id
    WHERE UPPER(b.booking_code) = UPPER(?)
  `).get(bookingCode);

  if (!booking) return null;

  const passengers = db.prepare(`
    SELECT
      id, passenger_name, passenger_nik, passenger_type,
      carriage_number, seat_number, ticket_number,
      meal_addon, insurance_addon
    FROM booking_passengers
    WHERE booking_id = ?
    ORDER BY id ASC
  `).all(booking.id);

  return {
    ...booking,
    passengers
  };
}

async function handleApi(req, res, urlObj) {
  const pathname = urlObj.pathname;
  const method = req.method;

  try {
    // 1. Health Check
    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok' });
    }

    // 2. Auth: Register
    if (method === 'POST' && pathname === '/api/auth/register') {
      const body = await parseJsonBody(req);
      const name = (body.name || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const phone = (body.phone || '').trim();
      const nik = (body.nik || '').trim();
      const password = body.password || '';

      if (!name || !email || !phone || !nik || !password) {
        return sendJson(res, 400, { error: 'Mohon lengkapi seluruh kolom pendaftaran.' });
      }
      if (nik.length < 8) {
        return sendJson(res, 400, { error: 'Nomor Identitas (NIK) minimal 8 digit.' });
      }
      if (password.length < 6) {
        return sendJson(res, 400, { error: 'Kata sandi minimal 6 karakter.' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
      if (existing) {
        return sendJson(res, 409, { error: 'Alamat email ini sudah terdaftar. Silakan masuk ke akun Anda.' });
      }

      const { salt, hash } = hashPassword(password);
      const result = db.prepare(`
        INSERT INTO users (name, email, phone, nik, password_hash, salt, role, loyalty_points)
        VALUES (?, ?, ?, ?, ?, ?, 'Member', 500)
      `).run(name, email, phone, nik, hash, salt);

      const userId = Number(result.lastInsertRowid);
      // Automatically add the user themselves to their saved_passengers list
      db.prepare(`
        INSERT INTO saved_passengers (user_id, passenger_name, passenger_nik, passenger_type)
        VALUES (?, ?, ?, 'Dewasa')
      `).run(userId, name, nik);

      const token = createSession(userId);
      const user = db.prepare('SELECT id, name, email, phone, nik, role, loyalty_points, created_at FROM users WHERE id = ?').get(userId);

      triggerExcelSync();

      return sendJson(res, 201, {
        message: 'Pendaftaran berhasil! Anda mendapatkan bonus 500 RailPoints.',
        token,
        user
      });
    }

    // 3. Auth: Login
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await parseJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';

      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email dan kata sandi wajib diisi.' });
      }

      const userRow = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
      if (!userRow || !verifyPassword(password, userRow.salt, userRow.password_hash)) {
        return sendJson(res, 401, { error: 'Email atau kata sandi yang Anda masukkan salah.' });
      }

      const token = createSession(userRow.id);
      const user = {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        phone: userRow.phone,
        nik: userRow.nik,
        role: userRow.role,
        loyalty_points: userRow.loyalty_points,
        created_at: userRow.created_at
      };

      return sendJson(res, 200, {
        message: `Selamat datang kembali, ${user.name}!`,
        token,
        user
      });
    }

    // 3b. Auth: Reset / Forgot Password
    if (method === 'POST' && pathname === '/api/auth/reset-password') {
      const body = await parseJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const identity = (body.identity || '').trim();
      const newPassword = body.new_password || '';

      if (!email || !identity || !newPassword) {
        return sendJson(res, 400, {
          error: 'Mohon isi Alamat Email, NIK / No. Telepon terdaftar, dan Kata Sandi Baru.'
        });
      }

      if (newPassword.length < 6) {
        return sendJson(res, 400, {
          error: 'Kata sandi baru minimal 6 karakter.'
        });
      }

      const userRow = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
      if (!userRow) {
        return sendJson(res, 404, {
          error: 'Alamat email tersebut tidak ditemukan dalam sistem.'
        });
      }

      const cleanIdentity = identity.replace(/\s+/g, '');
      const matchNik = userRow.nik && userRow.nik.trim() === cleanIdentity;
      const matchPhone = userRow.phone && userRow.phone.trim() === cleanIdentity;

      if (!matchNik && !matchPhone) {
        return sendJson(res, 401, {
          error: 'Verifikasi gagal: Nomor NIK atau Nomor Telepon tidak sesuai dengan akun email tersebut.'
        });
      }

      const { salt, hash } = hashPassword(newPassword);
      db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, userRow.id);

      // Invalidate old sessions and create a fresh session
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userRow.id);
      const token = createSession(userRow.id);

      const user = {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        phone: userRow.phone,
        nik: userRow.nik,
        role: userRow.role,
        loyalty_points: userRow.loyalty_points,
        created_at: userRow.created_at
      };

      triggerExcelSync();

      return sendJson(res, 200, {
        message: 'Kata sandi berhasil diperbarui! Anda telah masuk kembali ke akun Anda.',
        token,
        user
      });
    }

    // 4. Auth: Logout
    if (method === 'POST' && pathname === '/api/auth/logout') {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      }
      return sendJson(res, 200, { message: 'Anda telah keluar dari akun.' });
    }

    // 5. Auth: Me & Profile
    if (method === 'GET' && pathname === '/api/auth/me') {
      const user = getAuthenticatedUser(req);
      if (!user) {
        return sendJson(res, 401, { error: 'Sesi telah berakhir.' });
      }
      const savedPassengers = db.prepare('SELECT * FROM saved_passengers WHERE user_id = ? ORDER BY id ASC').all(user.id);
      return sendJson(res, 200, { user, saved_passengers: savedPassengers });
    }

    if (method === 'PUT' && pathname === '/api/auth/profile') {
      const user = getAuthenticatedUser(req);
      if (!user) {
        return sendJson(res, 401, { error: 'Silakan masuk terlebih dahulu.' });
      }
      const body = await parseJsonBody(req);
      const name = (body.name || user.name).trim();
      const phone = (body.phone || user.phone).trim();
      const nik = (body.nik || user.nik).trim();

      db.prepare('UPDATE users SET name = ?, phone = ?, nik = ? WHERE id = ?').run(name, phone, nik, user.id);
      const updated = db.prepare('SELECT id, name, email, phone, nik, role, loyalty_points, created_at FROM users WHERE id = ?').get(user.id);
      triggerExcelSync();
      return sendJson(res, 200, { message: 'Data profil Anda berhasil diperbarui.', user: updated });
    }

    // 6. Saved Passengers Management
    if (method === 'GET' && pathname === '/api/saved-passengers') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 200, { saved_passengers: [] });
      const rows = db.prepare('SELECT * FROM saved_passengers WHERE user_id = ? ORDER BY id ASC').all(user.id);
      return sendJson(res, 200, { saved_passengers: rows });
    }

    if (method === 'POST' && pathname === '/api/saved-passengers') {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Silakan masuk untuk menyimpan daftar penumpang.' });
      const body = await parseJsonBody(req);
      const name = (body.passenger_name || '').trim();
      const nik = (body.passenger_nik || '').trim();
      const type = (body.passenger_type || 'Dewasa').trim();
      if (!name || !nik) {
        return sendJson(res, 400, { error: 'Nama dan NIK penumpang wajib diisi.' });
      }
      db.prepare(`
        INSERT INTO saved_passengers (user_id, passenger_name, passenger_nik, passenger_type)
        VALUES (?, ?, ?, ?)
      `).run(user.id, name, nik, type);
      const rows = db.prepare('SELECT * FROM saved_passengers WHERE user_id = ? ORDER BY id ASC').all(user.id);
      return sendJson(res, 201, { message: 'Data penumpang berhasil disimpan ke daftar cepat.', saved_passengers: rows });
    }

    const delPaxMatch = pathname.match(/^\/api\/saved-passengers\/(\d+)$/);
    if (method === 'DELETE' && delPaxMatch) {
      const user = getAuthenticatedUser(req);
      if (!user) return sendJson(res, 401, { error: 'Silakan masuk terlebih dahulu.' });
      db.prepare('DELETE FROM saved_passengers WHERE id = ? AND user_id = ?').run(Number(delPaxMatch[1]), user.id);
      const rows = db.prepare('SELECT * FROM saved_passengers WHERE user_id = ? ORDER BY id ASC').all(user.id);
      return sendJson(res, 200, { message: 'Penumpang dihapus dari daftar.', saved_passengers: rows });
    }

    // 7. Promos
    if (method === 'GET' && pathname === '/api/promos') {
      const promos = db.prepare('SELECT * FROM promos ORDER BY id ASC').all();
      return sendJson(res, 200, { promos });
    }

    if (method === 'POST' && pathname === '/api/promos/validate') {
      const body = await parseJsonBody(req);
      const code = (body.code || '').trim();
      const subtotal = Number(body.subtotal || 0);
      const resPromo = calculatePromoDiscount(code, subtotal);
      if (resPromo.error) {
        return sendJson(res, 400, { error: resPromo.error });
      }
      return sendJson(res, 200, {
        valid: true,
        promo: resPromo.promo,
        discount_amount: resPromo.discount,
        message: `Voucher ${resPromo.promo.code} berhasil dipasang! Anda hemat Rp ${resPromo.discount.toLocaleString('id-ID')}.`
      });
    }

    // 8. Stations
    if (method === 'GET' && pathname === '/api/stations') {
      const stations = db.prepare('SELECT * FROM stations ORDER BY city ASC, name ASC').all();
      return sendJson(res, 200, { stations });
    }

    // 9. Schedules Search & Filter
    if (method === 'GET' && pathname === '/api/schedules') {
      const origin = (urlObj.searchParams.get('origin') || '').trim();
      const destination = (urlObj.searchParams.get('destination') || '').trim();
      const trainClass = (urlObj.searchParams.get('train_class') || '').trim();
      const travelDate = (urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10)).trim();
      const queryText = (urlObj.searchParams.get('q') || '').trim().toLowerCase();

      let sql = `
        SELECT
          s.*,
          orig.code AS origin_code,
          orig.name AS origin_name,
          orig.city AS origin_city,
          dest.code AS destination_code,
          dest.name AS destination_name,
          dest.city AS destination_city,
          (
            SELECT COUNT(*)
            FROM booking_passengers bp
            JOIN bookings b ON b.id = bp.booking_id
            WHERE b.schedule_id = s.id
              AND b.travel_date = ?
              AND b.booking_status != 'DIBATALKAN'
          ) AS booked_seats
        FROM schedules s
        JOIN stations orig ON orig.id = s.origin_station_id
        JOIN stations dest ON dest.id = s.destination_station_id
        WHERE s.status = 'AKTIF'
      `;
      const params = [travelDate];

      if (origin && origin !== 'ALL') {
        if (/^\d+$/.test(origin)) {
          sql += ' AND s.origin_station_id = ?';
          params.push(Number(origin));
        } else {
          sql += ' AND UPPER(orig.code) = UPPER(?)';
          params.push(origin);
        }
      }

      if (destination && destination !== 'ALL') {
        if (/^\d+$/.test(destination)) {
          sql += ' AND s.destination_station_id = ?';
          params.push(Number(destination));
        } else {
          sql += ' AND UPPER(dest.code) = UPPER(?)';
          params.push(destination);
        }
      }

      if (trainClass && trainClass !== 'ALL') {
        sql += ' AND LOWER(s.train_class) = LOWER(?)';
        params.push(trainClass);
      }

      if (queryText) {
        sql += ` AND (
          LOWER(s.train_name) LIKE ? OR
          LOWER(s.train_code) LIKE ? OR
          LOWER(orig.city) LIKE ? OR
          LOWER(dest.city) LIKE ? OR
          LOWER(orig.name) LIKE ? OR
          LOWER(dest.name) LIKE ?
        )`;
        const likeVal = `%${queryText}%`;
        params.push(likeVal, likeVal, likeVal, likeVal, likeVal, likeVal);
      }

      sql += ' ORDER BY s.departure_time ASC';

      const rows = db.prepare(sql).all(...params);
      const schedules = rows.map((row) => ({
        ...row,
        booked_seats: Number(row.booked_seats || 0),
        available_seats: Math.max(0, Number(row.total_seats) - Number(row.booked_seats || 0)),
        travel_date: travelDate
      }));

      return sendJson(res, 200, { schedules, travel_date: travelDate });
    }

    // 10. Schedule Occupied Seats
    const seatMatch = pathname.match(/^\/api\/schedules\/(\d+)\/seats$/);
    if (method === 'GET' && seatMatch) {
      const scheduleId = Number(seatMatch[1]);
      const travelDate = (urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10)).trim();

      const schedule = db.prepare(`
        SELECT
          s.*,
          orig.code AS origin_code, orig.name AS origin_name, orig.city AS origin_city,
          dest.code AS destination_code, dest.name AS destination_name, dest.city AS destination_city
        FROM schedules s
        JOIN stations orig ON orig.id = s.origin_station_id
        JOIN stations dest ON dest.id = s.destination_station_id
        WHERE s.id = ?
      `).get(scheduleId);

      if (!schedule) {
        return sendJson(res, 404, { error: 'Jadwal kereta tidak ditemukan.' });
      }

      const occupiedSeats = db.prepare(`
        SELECT
          bp.carriage_number,
          bp.seat_number
        FROM booking_passengers bp
        JOIN bookings b ON b.id = bp.booking_id
        WHERE b.schedule_id = ?
          AND b.travel_date = ?
          AND b.booking_status != 'DIBATALKAN'
      `).all(scheduleId, travelDate);

      return sendJson(res, 200, {
        schedule,
        travel_date: travelDate,
        occupied_seats: occupiedSeats
      });
    }

    // 11. Create Booking
    if (method === 'POST' && pathname === '/api/bookings') {
      const user = getAuthenticatedUser(req);
      const body = await parseJsonBody(req);

      const scheduleId = Number(body.schedule_id);
      const travelDate = (body.travel_date || '').trim();
      const contactName = (body.contact_name || (user ? user.name : '')).trim();
      const contactEmail = (body.contact_email || (user ? user.email : '')).trim();
      const contactPhone = (body.contact_phone || (user ? user.phone : '')).trim();
      const paymentMethod = (body.payment_method || 'Virtual Account BCA').trim();
      const promoCodeInput = (body.promo_code || '').trim().toUpperCase();
      const payNow = body.pay_now !== false;
      const passengers = Array.isArray(body.passengers) ? body.passengers : [];

      if (!scheduleId || !travelDate || !contactName || !contactEmail || !contactPhone) {
        return sendJson(res, 400, { error: 'Mohon lengkapi data pemesan dan tanggal keberangkatan.' });
      }

      if (passengers.length === 0 || passengers.length > 6) {
        return sendJson(res, 400, { error: 'Jumlah penumpang antara 1 hingga 6 orang.' });
      }

      const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
      if (!schedule) {
        return sendJson(res, 404, { error: 'Jadwal kereta tidak ditemukan.' });
      }

      const requestedSeatsSet = new Set();
      let addonsTotal = 0;

      for (let i = 0; i < passengers.length; i++) {
        const p = passengers[i];
        if (!p.passenger_name || !p.passenger_nik || !p.carriage_number || !p.seat_number) {
          return sendJson(res, 400, {
            error: `Data penumpang ke-${i + 1} belum lengkap (Nama, NIK, Gerbong, dan Nomor Kursi wajib diisi).`
          });
        }
        const seatKey = `${p.carriage_number}-${p.seat_number.toUpperCase()}`;
        if (requestedSeatsSet.has(seatKey)) {
          return sendJson(res, 400, {
            error: `Kursi Gerbong ${p.carriage_number} Nomor ${p.seat_number} dipilih lebih dari satu kali.`
          });
        }
        requestedSeatsSet.add(seatKey);

        const mealName = p.meal_addon || 'Tanpa Makanan';
        addonsTotal += Number(MEAL_PRICES[mealName] || 0);
        if (p.insurance_addon === 'Ya' || p.insurance_addon === true) {
          addonsTotal += INSURANCE_PRICE_PER_PAX;
        }
      }

      const baseTicketPrice = Number(schedule.price) * passengers.length;
      const promoResult = calculatePromoDiscount(promoCodeInput, baseTicketPrice);
      const discountAmount = promoResult.discount || 0;
      const appliedPromoCode = promoResult.promo ? promoResult.promo.code : '-';
      const totalPrice = Math.max(0, baseTicketPrice + addonsTotal - discountAmount);

      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        const checkSeatStmt = db.prepare(`
          SELECT bp.id
          FROM booking_passengers bp
          JOIN bookings b ON b.id = bp.booking_id
          WHERE b.schedule_id = ?
            AND b.travel_date = ?
            AND b.booking_status != 'DIBATALKAN'
            AND bp.carriage_number = ?
            AND UPPER(bp.seat_number) = UPPER(?)
        `);

        for (const p of passengers) {
          const taken = checkSeatStmt.get(scheduleId, travelDate, Number(p.carriage_number), p.seat_number);
          if (taken) {
            db.exec('ROLLBACK');
            return sendJson(res, 409, {
              error: `Maaf, Kursi ${p.seat_number} di Gerbong ${p.carriage_number} baru saja terisi. Silakan pilih kursi lain.`
            });
          }
        }

        const bookingCode = generateBookingCode();
        const totalPassengers = passengers.length;
        const paymentStatus = payNow ? 'LUNAS' : 'MENUNGGU_PEMBAYARAN';
        const bookingStatus = 'AKTIF';

        const insertBooking = db.prepare(`
          INSERT INTO bookings (
            booking_code, user_id, schedule_id, travel_date,
            total_passengers, promo_code, discount_amount, addons_total,
            total_price, payment_method, payment_status, booking_status,
            contact_name, contact_email, contact_phone, paid_at
          ) VALUES (
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ${payNow ? "datetime('now', 'localtime')" : 'NULL'}
          )
        `);

        const bookingRes = insertBooking.run(
          bookingCode,
          user ? user.id : null,
          scheduleId,
          travelDate,
          totalPassengers,
          appliedPromoCode,
          discountAmount,
          addonsTotal,
          totalPrice,
          paymentMethod,
          paymentStatus,
          bookingStatus,
          contactName,
          contactEmail,
          contactPhone
        );

        const bookingId = Number(bookingRes.lastInsertRowid);
        const suffixCode = bookingCode.replace('KAI-', '');

        const insertPassenger = db.prepare(`
          INSERT INTO booking_passengers (
            booking_id, passenger_name, passenger_nik,
            passenger_type, carriage_number, seat_number,
            ticket_number, meal_addon, insurance_addon
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        passengers.forEach((p, idx) => {
          const ticketNumber = `TKT-${suffixCode}-${String(idx + 1).padStart(2, '0')}`;
          const mealAddon = p.meal_addon || 'Tanpa Makanan';
          const insAddon = p.insurance_addon === 'Ya' || p.insurance_addon === true ? 'Ya' : 'Tidak';
          insertPassenger.run(
            bookingId,
            p.passenger_name.trim(),
            p.passenger_nik.trim(),
            (p.passenger_type || 'Dewasa').trim(),
            Number(p.carriage_number),
            p.seat_number.trim().toUpperCase(),
            ticketNumber,
            mealAddon,
            insAddon
          );
        });

        // Award loyalty points if user is logged in
        if (user) {
          const earnedPoints = Math.max(50, Math.round(totalPrice / 5000));
          db.prepare('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?').run(earnedPoints, user.id);
        }

        db.exec('COMMIT');

        triggerExcelSync();

        const createdBooking = getBookingDetailByCode(bookingCode);
        return sendJson(res, 201, {
          message: payNow
            ? 'Pembayaran berhasil! E-Ticket Anda telah diterbitkan.'
            : 'Pesanan berhasil dibuat. Silakan selesaikan pembayaran Anda.',
          booking: createdBooking
        });
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch (_) {}
        throw txErr;
      }
    }

    // 12. List Bookings
    if (method === 'GET' && pathname === '/api/bookings') {
      const user = getAuthenticatedUser(req);
      const codeQuery = (urlObj.searchParams.get('code') || '').trim();

      if (codeQuery) {
        const detail = getBookingDetailByCode(codeQuery);
        return sendJson(res, 200, { bookings: detail ? [detail] : [] });
      }

      let rows = [];
      if (user) {
        rows = db.prepare(`
          SELECT booking_code
          FROM bookings
          WHERE user_id = ? OR LOWER(contact_email) = LOWER(?)
          ORDER BY id DESC
        `).all(user.id, user.email);
      } else {
        rows = db.prepare('SELECT booking_code FROM bookings ORDER BY id DESC LIMIT 12').all();
      }

      const bookings = rows.map((r) => getBookingDetailByCode(r.booking_code)).filter(Boolean);
      return sendJson(res, 200, { bookings });
    }

    // 13. Get Single Booking by Code
    const bookingCodeMatch = pathname.match(/^\/api\/bookings\/([A-Za-z0-9-]+)$/);
    if (method === 'GET' && bookingCodeMatch) {
      const code = bookingCodeMatch[1];
      const detail = getBookingDetailByCode(code);
      if (!detail) {
        return sendJson(res, 404, { error: `Kode Booking "${code}" tidak ditemukan.` });
      }
      return sendJson(res, 200, { booking: detail });
    }

    // 14. Pay Booking
    const payMatch = pathname.match(/^\/api\/bookings\/([A-Za-z0-9-]+)\/pay$/);
    if (method === 'POST' && payMatch) {
      const code = payMatch[1];
      const existing = getBookingDetailByCode(code);
      if (!existing) {
        return sendJson(res, 404, { error: 'Pesanan tidak ditemukan.' });
      }
      if (existing.booking_status === 'DIBATALKAN') {
        return sendJson(res, 400, { error: 'Tiket yang sudah dibatalkan tidak dapat dibayar.' });
      }

      db.prepare(`
        UPDATE bookings
        SET payment_status = 'LUNAS',
            booking_status = 'AKTIF',
            paid_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(existing.id);

      triggerExcelSync();

      return sendJson(res, 200, {
        message: 'Pembayaran berhasil dikonfirmasi! E-Ticket Anda sudah aktif.',
        booking: getBookingDetailByCode(code)
      });
    }

    // 15. Reschedule Booking (Ubah Tanggal Perjalanan)
    const rescheduleMatch = pathname.match(/^\/api\/bookings\/([A-Za-z0-9-]+)\/reschedule$/);
    if (method === 'POST' && rescheduleMatch) {
      const code = rescheduleMatch[1];
      const existing = getBookingDetailByCode(code);
      if (!existing) {
        return sendJson(res, 404, { error: 'Pesanan tidak ditemukan.' });
      }
      if (existing.booking_status === 'DIBATALKAN') {
        return sendJson(res, 400, { error: 'Tiket yang sudah dibatalkan tidak dapat diubah jadwalnya.' });
      }

      const body = await parseJsonBody(req);
      const newDate = (body.travel_date || '').trim();
      if (!newDate) {
        return sendJson(res, 400, { error: 'Pilih tanggal keberangkatan yang baru.' });
      }

      db.prepare('UPDATE bookings SET travel_date = ? WHERE id = ?').run(newDate, existing.id);
      triggerExcelSync();

      return sendJson(res, 200, {
        message: `Jadwal keberangkatan berhasil diubah ke tanggal ${newDate}.`,
        booking: getBookingDetailByCode(code)
      });
    }

    // 16. Cancel Booking
    const cancelMatch = pathname.match(/^\/api\/bookings\/([A-Za-z0-9-]+)\/cancel$/);
    if (method === 'POST' && cancelMatch) {
      const code = cancelMatch[1];
      const existing = getBookingDetailByCode(code);
      if (!existing) {
        return sendJson(res, 404, { error: 'Pesanan tidak ditemukan.' });
      }

      db.prepare(`
        UPDATE bookings
        SET booking_status = 'DIBATALKAN',
            payment_status = CASE WHEN payment_status = 'LUNAS' THEN 'REFUND DANA' ELSE 'DIBATALKAN' END
        WHERE id = ?
      `).run(existing.id);

      triggerExcelSync();

      return sendJson(res, 200, {
        message: 'Tiket berhasil dibatalkan. Kuota kursi telah dikembalikan.',
        booking: getBookingDetailByCode(code)
      });
    }

    return sendJson(res, 404, { error: 'Layanan tidak ditemukan.' });
  } catch (err) {
    console.error('[Server Error]', err);
    return sendJson(res, 500, { error: err.message || 'Terjadi gangguan pada server.' });
  }
}

function serveStaticFile(req, res, pathname) {
  let targetPath = pathname === '/' ? '/index.html' : pathname;
  targetPath = path.normalize(targetPath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, targetPath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      const indexFallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFallback, (readErr, content) => {
        if (readErr) {
          res.writeHead(404);
          return res.end('Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(fullPath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        return res.end('Internal Server Error');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (urlObj.pathname.startsWith('/api/')) {
    handleApi(req, res, urlObj);
  } else {
    serveStaticFile(req, res, urlObj.pathname);
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('==============================================================');
    console.log(`  KERETAKITA - Portal Resmi Pemesanan Tiket Kereta Api`);
    console.log(`  Website Live    : http://localhost:${PORT}`);
    console.log(`  File Excel Live : ${EXCEL_FILE_PATH}`);
    console.log(`  Database SQLite : ${DB_PATH}`);
    console.log('==============================================================');
  });
}

module.exports = { server, handleApi };
