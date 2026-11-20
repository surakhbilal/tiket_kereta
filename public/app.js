// Global Frontend State
const state = {
  theme: localStorage.getItem('keretakita_theme') || 'light',
  token: localStorage.getItem('keretakita_token') || null,
  user: null,
  savedPassengers: [],
  stations: [],
  promos: [],
  schedules: [],
  allSchedulesDirectory: [],
  myBookings: [],
  tripType: 'oneway',
  timeFilter: 'ALL',

  // Active Booking Wizard State
  bookingSchedule: null,
  bookingTravelDate: '',
  occupiedSeats: [],
  selectedCarriage: 1,
  activePassengerIndex: 0,
  passengers: [],
  appliedPromoCode: '',
  appliedDiscountAmount: 0
};

const SEAT_COLUMNS = ['A', 'B', 'C', 'D'];
const ROWS_PER_CARRIAGE = 10;

const MEAL_OPTIONS = [
  { name: 'Tanpa Makanan', label: 'Tanpa Pre-Order Makanan (Rp 0)', price: 0 },
  { name: 'Nasi Goreng Parahyangan', label: 'Nasi Goreng Parahyangan (+Rp 38.000)', price: 38000 },
  { name: 'Chicken Bento KAI', label: 'Chicken Bento KAI (+Rp 42.000)', price: 42000 },
  { name: 'Empal Gentong Kereta', label: 'Empal Gentong Khas Cirebon (+Rp 45.000)', price: 45000 },
  { name: 'Paket Kopi & Croissant', label: 'Paket Kopi & Croissant Hangat (+Rp 28.000)', price: 28000 }
];

const INSURANCE_PRICE = 15000;

// Helpers
function formatRupiah(amount) {
  return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
}

function formatDateIndo(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function getClassBadgeHtml(trainClass) {
  const cls = (trainClass || '').toLowerCase();
  let badgeClass = 'class-eksekutif';
  if (cls.includes('luxury')) badgeClass = 'class-luxury';
  else if (cls.includes('bisnis')) badgeClass = 'class-bisnis';
  else if (cls.includes('ekonomi')) badgeClass = 'class-ekonomi';
  return `<span class="class-badge ${badgeClass}">${escapeHtml(trainClass)}</span>`;
}

function getStatusBadgeHtml(paymentStatus, bookingStatus) {
  if (bookingStatus === 'DIBATALKAN') {
    return `<span class="status-badge status-batal">DIBATALKAN &bull; ${escapeHtml(paymentStatus)}</span>`;
  }
  if (paymentStatus === 'LUNAS') {
    return `<span class="status-badge status-lunas">&#10003; LUNAS &bull; E-TICKET TERBIT</span>`;
  }
  return `<span class="status-badge status-pending">MENUNGGU PEMBAYARAN</span>`;
}

function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4200);
}

async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  const response = await fetch(url, {
    ...options,
    headers
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Terjadi kendala saat memproses permintaan.');
  }
  return data;
}

/**
 * Generates a deterministic SVG QR Code visual for E-Ticket Boarding Pass & QRIS Payment
 */
function generateQrSvg(seedText, size = 110) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const grid = 15;
  const cell = size / grid;
  let rects = '';

  const isFinder = (r, c) =>
    (r < 4 && c < 4) || (r < 4 && c >= grid - 4) || (r >= grid - 4 && c < 4);

  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      let fill = false;
      if (isFinder(r, c)) {
        const lr = r >= grid - 4 ? r - (grid - 4) : r;
        const lc = c >= grid - 4 ? c - (grid - 4) : c;
        fill = lr === 0 || lr === 3 || lc === 0 || lc === 3 || (lr >= 1 && lr <= 2 && lc >= 1 && lc <= 2);
      } else {
        hash ^= (r * 31 + c * 17) & 0xff;
        hash = Math.imul(hash, 16777619);
        fill = (Math.abs(hash) % 10) < 5;
      }
      if (fill) {
        rects += `<rect x="${(c * cell).toFixed(1)}" y="${(r * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="#0b1f3a"/>`;
      }
    }
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">${rects}</svg>`;
}

// Theme Toggle (Light / Dark Mode)
function applyTheme(theme) {
  state.theme = theme;
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  const iconEl = document.getElementById('theme-icon');
  const labelEl = document.getElementById('theme-label');
  if (iconEl && labelEl) {
    iconEl.innerHTML = isDark
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    labelEl.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';
  }
}

function toggleTheme() {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('keretakita_theme', nextTheme);
  applyTheme(nextTheme);
}

// Close profile dropdown when clicking outside
window.addEventListener('click', (e) => {
  const menu = document.getElementById('profile-dropdown-menu');
  const wrapper = document.querySelector('.profile-menu-wrapper');
  if (menu && wrapper && !wrapper.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

// Initialization
window.addEventListener('DOMContentLoaded', async () => {
  applyTheme(state.theme);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const dateInput = document.getElementById('search-date');
  dateInput.value = today;
  dateInput.min = today;

  const returnDateInput = document.getElementById('search-return-date');
  returnDateInput.value = tomorrow;
  returnDateInput.min = today;

  const rescheduleDateInput = document.getElementById('reschedule-new-date');
  rescheduleDateInput.min = today;

  renderDateStrip(today);

  await checkAuthSession();
  await loadStations();
  await Promise.all([
    searchSchedules(),
    loadScheduleDirectory(),
    loadPromos(),
    loadMyBookings()
  ]);
});

// Tab Navigation
function switchTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tabName);
  });

  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabName === 'schedules') {
    loadScheduleDirectory();
  } else if (tabName === 'promos') {
    loadPromos();
  } else if (tabName === 'my-tickets') {
    loadMyBookings();
  }
}

// Modals
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Trip Type Toggle (One-Way vs Round-Trip)
function toggleTripType(type) {
  state.tripType = type;
  document.getElementById('pill-oneway').classList.toggle('active', type === 'oneway');
  document.getElementById('pill-roundtrip').classList.toggle('active', type === 'roundtrip');
  document.getElementById('return-date-group').classList.toggle('hidden', type !== 'roundtrip');
  document.getElementById('search-grid-container').classList.toggle('roundtrip-grid', type === 'roundtrip');
}

// 7-Day Interactive Date Strip
function renderDateStrip(selectedDateStr) {
  const container = document.getElementById('date-strip-container');
  const baseDate = new Date();
  const pillsHtml = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const dayName = i === 0 ? 'Hari Ini' : i === 1 ? 'Besok' : d.toLocaleDateString('id-ID', { weekday: 'short' });
    const dayDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

    pillsHtml.push(`
      <button
        type="button"
        class="date-pill-btn ${iso === selectedDateStr ? 'active' : ''}"
        onclick="selectDateFromStrip('${iso}')"
      >
        <div class="day-name">${escapeHtml(dayName)}</div>
        <div class="day-date">${escapeHtml(dayDate)}</div>
      </button>
    `);
  }

  container.innerHTML = pillsHtml.join('');
}

function selectDateFromStrip(dateStr) {
  document.getElementById('search-date').value = dateStr;
  renderDateStrip(dateStr);
  searchSchedules();
}

function onSearchDateChanged() {
  const val = document.getElementById('search-date').value;
  renderDateStrip(val);
  searchSchedules();
}

// Authentication & Member Profile
async function checkAuthSession() {
  if (!state.token) {
    renderNavAuth();
    return;
  }
  try {
    const data = await apiFetch('/api/auth/me');
    state.user = data.user;
    state.savedPassengers = data.saved_passengers || [];
  } catch (_) {
    state.token = null;
    state.user = null;
    state.savedPassengers = [];
    localStorage.removeItem('keretakita_token');
  }
  renderNavAuth();
}

function renderNavAuth() {
  const container = document.getElementById('nav-auth-area');
  if (state.user) {
    const initials = state.user.name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const pts = Number(state.user.loyalty_points || 0).toLocaleString('id-ID');

    container.innerHTML = `
      <div class="profile-menu-wrapper">
        <button type="button" class="profile-trigger-btn" onclick="toggleProfileDropdown(event)">
          <div class="profile-badge-icon">${escapeHtml(initials)}</div>
          <div class="profile-trigger-info">
            <span class="profile-trigger-name">${escapeHtml(state.user.name)}</span>
            <span class="profile-trigger-points">&#9733; ${pts} RailPoints</span>
          </div>
          <span class="profile-chevron">&#9662;</span>
        </button>

        <div id="profile-dropdown-menu" class="profile-dropdown-menu hidden">
          <div class="profile-dropdown-header">
            <strong>${escapeHtml(state.user.name)}</strong>
            <span>${escapeHtml(state.user.email)}</span>
            <span style="color:var(--orange-500); font-weight:700; margin-top:4px;">
              ${escapeHtml(state.user.role || 'Member')} &bull; &#9733; ${pts} RailPoints
            </span>
          </div>
          <button type="button" class="profile-dropdown-item" onclick="closeProfileDropdown(); openProfileModal();">
            <span>&#128100;</span>
            <span>Profil &amp; Penumpang Tersimpan</span>
          </button>
          <button type="button" class="profile-dropdown-item" onclick="closeProfileDropdown(); switchTab('my-tickets');">
            <span>&#127915;</span>
            <span>Tiket &amp; Pesanan Saya</span>
          </button>
          <button type="button" class="profile-dropdown-item" onclick="closeProfileDropdown(); openChangePasswordFromProfile();">
            <span>&#128274;</span>
            <span>Ubah Kata Sandi</span>
          </button>
          <button type="button" class="profile-dropdown-item danger" onclick="closeProfileDropdown(); handleLogout();">
            <span>&#10162;</span>
            <span>Keluar dari Akun</span>
          </button>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button type="button" class="btn btn-sm btn-outline" onclick="openAuthModal('login')">Masuk</button>
      <button type="button" class="btn btn-sm btn-primary" onclick="openAuthModal('register')">Daftar</button>
    `;
  }
}

function toggleProfileDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById('profile-dropdown-menu');
  if (menu) menu.classList.toggle('hidden');
}

function closeProfileDropdown() {
  const menu = document.getElementById('profile-dropdown-menu');
  if (menu) menu.classList.add('hidden');
}

function openChangePasswordFromProfile() {
  openAuthModal('forgot');
  if (state.user) {
    document.getElementById('forgot-email').value = state.user.email || '';
    document.getElementById('forgot-identity').value = state.user.nik || state.user.phone || '';
  }
}

function openAuthModal(mode = 'login') {
  switchAuthMode(mode);
  openModal('auth-modal');
}

function switchAuthMode(mode) {
  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';

  const tabsBar = document.getElementById('auth-tabs-bar');
  if (tabsBar) tabsBar.classList.toggle('hidden', isForgot);

  document.getElementById('tab-btn-login').classList.toggle('active', isLogin);
  document.getElementById('tab-btn-register').classList.toggle('active', isRegister);

  document.getElementById('login-form').classList.toggle('hidden', !isLogin);
  document.getElementById('register-form').classList.toggle('hidden', !isRegister);
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) forgotForm.classList.toggle('hidden', !isForgot);

  const titles = {
    login: 'Masuk ke Akun KeretaKita',
    register: 'Daftar Member KeretaKita',
    forgot: 'Atur Ulang Kata Sandi'
  };
  document.getElementById('auth-modal-title').textContent = titles[mode] || titles.login;
}

async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const identity = document.getElementById('forgot-identity').value.trim();
  const newPassword = document.getElementById('forgot-new-password').value;
  const confirmPassword = document.getElementById('forgot-confirm-password').value;

  if (newPassword !== confirmPassword) {
    showToast('Konfirmasi kata sandi baru tidak cocok.', 'error');
    return;
  }

  try {
    const data = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email,
        identity,
        new_password: newPassword
      })
    });
    state.token = data.token;
    localStorage.setItem('keretakita_token', data.token);
    await checkAuthSession();
    document.getElementById('forgot-form').reset();
    closeModal('auth-modal');
    showToast(data.message);
    await loadMyBookings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function fillDemoLogin(email, password) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = password;
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    state.token = data.token;
    localStorage.setItem('keretakita_token', data.token);
    await checkAuthSession();
    closeModal('auth-modal');
    showToast(data.message);
    await loadMyBookings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('reg-name').value,
    nik: document.getElementById('reg-nik').value,
    email: document.getElementById('reg-email').value,
    phone: document.getElementById('reg-phone').value,
    password: document.getElementById('reg-password').value
  };

  try {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    state.token = data.token;
    localStorage.setItem('keretakita_token', data.token);
    await checkAuthSession();
    closeModal('auth-modal');
    showToast(data.message);
    await loadMyBookings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleLogout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {}
  state.token = null;
  state.user = null;
  state.savedPassengers = [];
  localStorage.removeItem('keretakita_token');
  renderNavAuth();
  showToast('Anda telah keluar dari akun.');
  await loadMyBookings();
}

// Profile & Saved Passengers Modal
function openProfileModal() {
  if (!state.user) return openAuthModal('login');
  document.getElementById('prof-name').value = state.user.name;
  document.getElementById('prof-nik').value = state.user.nik;
  document.getElementById('prof-phone').value = state.user.phone;

  document.getElementById('profile-loyalty-banner').innerHTML = `
    <div>
      <div style="font-size:0.75rem; color:#93c5fd; font-weight:700;">STATUS KEANGGOTAAN</div>
      <div style="font-size:1.1rem; font-weight:800;">${escapeHtml(state.user.name)} &bull; ${escapeHtml(state.user.role)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:0.75rem; color:#cbd5e1;">SALDO POIN</div>
      <div style="font-size:1.25rem; font-weight:800; color:#fed7aa;">&#9733; ${Number(state.user.loyalty_points || 0).toLocaleString('id-ID')} RailPoints</div>
    </div>
  `;

  renderSavedPassengersList();
  openModal('profile-modal');
}

function renderSavedPassengersList() {
  const container = document.getElementById('saved-passengers-list');
  if (state.savedPassengers.length === 0) {
    container.innerHTML = `<div class="text-sm text-muted">Belum ada penumpang tersimpan.</div>`;
    return;
  }
  container.innerHTML = state.savedPassengers
    .map(
      (p) => `
      <div class="saved-pax-row">
        <div>
          <strong>${escapeHtml(p.passenger_name)}</strong> &bull; NIK: <code>${escapeHtml(p.passenger_nik)}</code> (${escapeHtml(p.passenger_type)})
        </div>
        <button type="button" class="btn btn-sm btn-outline" onclick="deleteSavedPassenger(${p.id})">Hapus</button>
      </div>
    `
    )
    .join('');
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  try {
    const data = await apiFetch('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('prof-name').value,
        nik: document.getElementById('prof-nik').value,
        phone: document.getElementById('prof-phone').value
      })
    });
    state.user = data.user;
    renderNavAuth();
    showToast(data.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleAddSavedPassenger(e) {
  e.preventDefault();
  try {
    const data = await apiFetch('/api/saved-passengers', {
      method: 'POST',
      body: JSON.stringify({
        passenger_name: document.getElementById('new-saved-name').value,
        passenger_nik: document.getElementById('new-saved-nik').value,
        passenger_type: document.getElementById('new-saved-type').value
      })
    });
    state.savedPassengers = data.saved_passengers;
    document.getElementById('new-saved-name').value = '';
    document.getElementById('new-saved-nik').value = '';
    renderSavedPassengersList();
    showToast(data.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteSavedPassenger(id) {
  try {
    const data = await apiFetch(`/api/saved-passengers/${id}`, { method: 'DELETE' });
    state.savedPassengers = data.saved_passengers;
    renderSavedPassengersList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Promos
async function loadPromos() {
  const data = await apiFetch('/api/promos');
  state.promos = data.promos || [];
  const container = document.getElementById('promos-grid-container');
  container.innerHTML = state.promos
    .map(
      (p) => `
      <div class="promo-card">
        <div>
          <span class="promo-badge">${escapeHtml(p.badge)}</span>
          <h3>${escapeHtml(p.title)}</h3>
          <p class="text-sm text-muted">${escapeHtml(p.description)}</p>
        </div>
        <div class="promo-code-box">
          <div>
            <div class="text-sm text-muted">Kode Voucher:</div>
            <code>${escapeHtml(p.code)}</code>
          </div>
          <button type="button" class="btn btn-sm btn-primary" onclick="usePromoFromCatalog('${escapeHtml(p.code)}')">
            Pakai Voucher
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

function usePromoFromCatalog(code) {
  state.appliedPromoCode = code;
  document.getElementById('search-active-promo-indicator').innerHTML = `
    <span class="badge-new">&#10003; Voucher Aktif: ${escapeHtml(code)}</span>
  `;
  showToast(`Kode voucher ${code} disiapkan! Pilih jadwal kereta Anda.`);
  switchTab('search');
}

// Stations & Search
async function loadStations() {
  const data = await apiFetch('/api/stations');
  state.stations = data.stations || [];

  const originSelect = document.getElementById('search-origin');
  const destSelect = document.getElementById('search-destination');

  const optionsHtml = state.stations
    .map((s) => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.city)} — ${escapeHtml(s.name)} (${escapeHtml(s.code)})</option>`)
    .join('');

  originSelect.innerHTML = `<option value="ALL">Semua Stasiun Asal</option>` + optionsHtml;
  destSelect.innerHTML = `<option value="ALL">Semua Stasiun Tujuan</option>` + optionsHtml;
}

function swapStations() {
  const originEl = document.getElementById('search-origin');
  const destEl = document.getElementById('search-destination');
  const temp = originEl.value;
  originEl.value = destEl.value;
  destEl.value = temp;
  searchSchedules();
}

function applyQuickRoute(originCode, destCode) {
  document.getElementById('search-origin').value = originCode;
  document.getElementById('search-destination').value = destCode;
  searchSchedules();
}

function setTimeFilter(timeWindow) {
  state.timeFilter = timeWindow;
  document.querySelectorAll('.time-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-time') === timeWindow);
  });
  renderScheduleResults();
}

function resetSearchFilters() {
  state.timeFilter = 'ALL';
  document.getElementById('filter-sort').value = 'dep_asc';
  document.getElementById('search-class').value = 'ALL';
  document.querySelectorAll('.time-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-time') === 'ALL');
  });
  searchSchedules();
}

function handleSearchSubmit(e) {
  e.preventDefault();
  searchSchedules();
}

async function searchSchedules() {
  const origin = document.getElementById('search-origin').value;
  const destination = document.getElementById('search-destination').value;
  const date = document.getElementById('search-date').value;
  const trainClass = document.getElementById('search-class').value;

  const params = new URLSearchParams({
    origin,
    destination,
    date,
    train_class: trainClass
  });

  const data = await apiFetch(`/api/schedules?${params.toString()}`);
  state.schedules = data.schedules || [];
  renderScheduleResults(date);
}

function renderScheduleResults(travelDateInput) {
  const travelDate = travelDateInput || document.getElementById('search-date').value;
  const container = document.getElementById('schedule-results-list');
  const subtitle = document.getElementById('results-subtitle');
  const sortMode = document.getElementById('filter-sort').value;

  // Apply Time Filter
  let list = state.schedules.filter((s) => {
    if (state.timeFilter === 'ALL') return true;
    const hour = parseInt((s.departure_time || '00:00').slice(0, 2), 10);
    if (state.timeFilter === 'PAGI') return hour >= 0 && hour < 12;
    if (state.timeFilter === 'SIANG') return hour >= 12 && hour < 15;
    if (state.timeFilter === 'SORE') return hour >= 15 && hour < 18;
    if (state.timeFilter === 'MALAM') return hour >= 18 && hour <= 23;
    return true;
  });

  // Apply Sort
  list.sort((a, b) => {
    if (sortMode === 'price_asc') return a.price - b.price;
    if (sortMode === 'price_desc') return b.price - a.price;
    if (sortMode === 'dep_desc') return b.departure_time.localeCompare(a.departure_time);
    return a.departure_time.localeCompare(b.departure_time);
  });

  subtitle.textContent = `Menampilkan ${list.length} jadwal kereta api untuk ${formatDateIndo(travelDate)}`;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 36px; text-align: center;">
        <h3>Jadwal Kereta Tidak Ditemukan</h3>
        <p class="text-muted" style="margin: 8px 0 18px;">Tidak ada jadwal keberangkatan yang cocok dengan filter rute/waktu ini. Coba reset filter atau tampilkan semua rute.</p>
        <button type="button" class="btn btn-primary" onclick="applyQuickRoute('ALL', 'ALL'); resetSearchFilters();">
          Lihat Semua Rute Tersedia
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = list
    .map((s) => {
      const availClass = s.available_seats === 0 ? 'full' : s.available_seats < 20 ? 'low' : '';
      const facilitiesArr = (s.facilities || 'AC, Stopkontak, Restorasi, Bagasi 20kg')
        .split(',')
        .map((f) => `<span class="amenity-tag">${escapeHtml(f.trim())}</span>`)
        .join('');

      return `
        <div class="schedule-card-wrapper">
          <div class="schedule-card">
            <div class="train-info">
              <h3>${escapeHtml(s.train_name)}</h3>
              <div class="train-meta">
                <span><strong>${escapeHtml(s.train_code)}</strong></span>
                <span>&bull;</span>
                ${getClassBadgeHtml(s.train_class)}
                <span>Subkelas ${escapeHtml(s.sub_class)}</span>
              </div>
            </div>

            <div class="route-timeline">
              <div class="time-point">
                <span class="time">${escapeHtml(s.departure_time)}</span>
                <span class="station">${escapeHtml(s.origin_name)} (${escapeHtml(s.origin_code)})</span>
                <span class="city">${escapeHtml(s.origin_city)}</span>
              </div>

              <div class="duration-track">
                <span>${escapeHtml(s.duration)}</span>
                <div class="track-line"></div>
                <span>Langsung</span>
              </div>

              <div class="time-point" style="text-align: right;">
                <span class="time">${escapeHtml(s.arrival_time)}</span>
                <span class="station">${escapeHtml(s.destination_name)} (${escapeHtml(s.destination_code)})</span>
                <span class="city">${escapeHtml(s.destination_city)}</span>
              </div>
            </div>

            <div class="price-seat-col">
              <div class="price-amount">${formatRupiah(s.price)}</div>
              <div class="price-unit">/ penumpang</div>
              <div class="seat-avail ${availClass}">
                ${s.available_seats > 0 ? `Tersedia ${s.available_seats} kursi` : 'Habis Terpesan'}
              </div>
            </div>

            <div>
              <button
                type="button"
                class="btn btn-accent"
                ${s.available_seats === 0 ? 'disabled' : ''}
                onclick="openBookingModal(${s.id}, '${escapeHtml(travelDate)}')"
              >
                Pilih Tiket
              </button>
            </div>
          </div>

          <div class="schedule-card-footer">
            <div class="amenities-preview">
              ${facilitiesArr}
            </div>
            <div class="policy-pills">
              <span>&#10003; Bisa Reschedule</span>
              <span>&#10003; Bisa Refund</span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

// Directory Tab
async function loadScheduleDirectory() {
  const today = document.getElementById('search-date').value || new Date().toISOString().slice(0, 10);
  const data = await apiFetch(`/api/schedules?date=${today}`);
  state.allSchedulesDirectory = data.schedules || [];
  renderScheduleDirectory();
}

function renderScheduleDirectory() {
  const filterVal = (document.getElementById('directory-filter-input').value || '').trim().toLowerCase();
  const tbody = document.getElementById('directory-table-body');
  const today = document.getElementById('search-date').value || new Date().toISOString().slice(0, 10);

  const filtered = state.allSchedulesDirectory.filter((s) => {
    if (!filterVal) return true;
    return (
      s.train_name.toLowerCase().includes(filterVal) ||
      s.train_code.toLowerCase().includes(filterVal) ||
      s.origin_name.toLowerCase().includes(filterVal) ||
      s.origin_city.toLowerCase().includes(filterVal) ||
      s.destination_name.toLowerCase().includes(filterVal) ||
      s.destination_city.toLowerCase().includes(filterVal) ||
      s.train_class.toLowerCase().includes(filterVal)
    );
  });

  tbody.innerHTML = filtered
    .map(
      (s) => `
      <tr>
        <td><code>${escapeHtml(s.train_code)}</code></td>
        <td><strong>${escapeHtml(s.train_name)}</strong></td>
        <td>${getClassBadgeHtml(s.train_class)}</td>
        <td>${escapeHtml(s.origin_name)} (${escapeHtml(s.origin_code)})</td>
        <td>${escapeHtml(s.destination_name)} (${escapeHtml(s.destination_code)})</td>
        <td><strong>${escapeHtml(s.departure_time)} WIB</strong></td>
        <td><strong>${escapeHtml(s.arrival_time)} WIB</strong></td>
        <td>${escapeHtml(s.duration)}</td>
        <td><strong style="color:var(--orange-600);">${formatRupiah(s.price)}</strong></td>
        <td>${s.available_seats} kursi tersedia</td>
        <td>
          <button type="button" class="btn btn-sm btn-primary" onclick="openBookingModal(${s.id}, '${escapeHtml(today)}')">
            Pesan Tiket
          </button>
        </td>
      </tr>
    `
    )
    .join('');
}

// Booking Wizard & Interactive Seat Selection
async function openBookingModal(scheduleId, travelDate) {
  try {
    const data = await apiFetch(`/api/schedules/${scheduleId}/seats?date=${encodeURIComponent(travelDate)}`);
    state.bookingSchedule = data.schedule;
    state.bookingTravelDate = data.travel_date;
    state.occupiedSeats = data.occupied_seats || [];
    state.selectedCarriage = 1;
    state.activePassengerIndex = 0;
    state.appliedDiscountAmount = 0;

    const requestedPaxCount = Number(document.getElementById('search-passengers').value) || 1;
    state.passengers = [];

    for (let i = 0; i < requestedPaxCount; i++) {
      const autoSeat = findNextAvailableSeat();
      state.passengers.push({
        passenger_name: i === 0 && state.user ? state.user.name : '',
        passenger_nik: i === 0 && state.user ? state.user.nik : '',
        passenger_type: 'Dewasa',
        carriage_number: autoSeat.carriage_number,
        seat_number: autoSeat.seat_number,
        meal_addon: 'Tanpa Makanan',
        insurance_addon: true
      });
    }

    document.getElementById('contact-name').value = state.user ? state.user.name : '';
    document.getElementById('contact-email').value = state.user ? state.user.email : '';
    document.getElementById('contact-phone').value = state.user ? state.user.phone : '';
    document.getElementById('booking-promo-input').value = state.appliedPromoCode || '';

    document.getElementById('booking-modal-subtitle').textContent = `${state.bookingSchedule.train_name} (${state.bookingSchedule.train_code}) • ${formatDateIndo(travelDate)}`;

    document.getElementById('booking-train-summary').innerHTML = `
      <div>
        <div style="font-size: 0.75rem; color: #93c5fd; font-weight: 700;">KERETA KEBERANGKATAN</div>
        <div style="font-size: 1.12rem; font-weight: 800;">
          ${escapeHtml(state.bookingSchedule.train_name)} (${escapeHtml(state.bookingSchedule.train_code)}) &mdash; ${escapeHtml(state.bookingSchedule.train_class)}
        </div>
        <div style="font-size: 0.85rem; color: #dbeafe;">
          ${escapeHtml(state.bookingSchedule.origin_name)} (${escapeHtml(state.bookingSchedule.departure_time)} WIB) &rarr;
          ${escapeHtml(state.bookingSchedule.destination_name)} (${escapeHtml(state.bookingSchedule.arrival_time)} WIB)
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 0.75rem; color: #cbd5e1;">Tanggal Perjalanan</div>
        <div style="font-weight: 800;">${escapeHtml(formatDateIndo(travelDate))}</div>
      </div>
    `;

    renderSavedPassengersQuickBar();
    renderBookingPassengersForm();
    renderSeatMap();

    if (state.appliedPromoCode) {
      await applyBookingPromo(true);
    } else {
      updateCheckoutTotals();
    }

    openModal('booking-modal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderSavedPassengersQuickBar() {
  const bar = document.getElementById('booking-saved-pax-bar');
  if (!state.savedPassengers || state.savedPassengers.length === 0) {
    bar.innerHTML = `
      <span class="text-sm text-muted">Tips:</span>
      <button type="button" class="chip-btn" onclick="copyContactToFirstPassenger()">
        Isi Penumpang 1 Sama dengan Pemesan
      </button>
    `;
    return;
  }

  const chips = state.savedPassengers
    .map(
      (sp, idx) => `
      <button type="button" class="chip-btn" onclick="fillPassengerFromSaved(${idx})">
        + ${escapeHtml(sp.passenger_name)}
      </button>
    `
    )
    .join('');

  bar.innerHTML = `
    <span class="text-sm" style="font-weight:700; color:var(--navy-900);">Isi Cepat Penumpang Tersimpan:</span>
    ${chips}
  `;
}

function copyContactToFirstPassenger() {
  syncPassengerInputState();
  state.passengers[0].passenger_name = document.getElementById('contact-name').value;
  renderBookingPassengersForm();
}

function fillPassengerFromSaved(savedIdx) {
  syncPassengerInputState();
  const sp = state.savedPassengers[savedIdx];
  if (!sp) return;
  const targetIdx = state.activePassengerIndex;
  state.passengers[targetIdx].passenger_name = sp.passenger_name;
  state.passengers[targetIdx].passenger_nik = sp.passenger_nik;
  state.passengers[targetIdx].passenger_type = sp.passenger_type || 'Dewasa';
  renderBookingPassengersForm();
  showToast(`Data ${sp.passenger_name} diisi ke Penumpang ${targetIdx + 1}.`);
}

function isSeatOccupiedInDb(carriageNumber, seatNumber) {
  return state.occupiedSeats.some(
    (s) => Number(s.carriage_number) === Number(carriageNumber) && s.seat_number.toUpperCase() === seatNumber.toUpperCase()
  );
}

function isSeatTakenByOtherPassenger(carriageNumber, seatNumber, excludeIndex = -1) {
  return state.passengers.some(
    (p, idx) =>
      idx !== excludeIndex &&
      Number(p.carriage_number) === Number(carriageNumber) &&
      p.seat_number.toUpperCase() === seatNumber.toUpperCase()
  );
}

function findNextAvailableSeat() {
  for (let c = 1; c <= 3; c++) {
    for (let r = 1; r <= ROWS_PER_CARRIAGE; r++) {
      for (const col of SEAT_COLUMNS) {
        const seatNo = `${r}${col}`;
        if (!isSeatOccupiedInDb(c, seatNo) && !isSeatTakenByOtherPassenger(c, seatNo, -1)) {
          return { carriage_number: c, seat_number: seatNo };
        }
      }
    }
  }
  return { carriage_number: 1, seat_number: '1A' };
}

function syncPassengerInputState() {
  state.passengers.forEach((p, idx) => {
    const nameEl = document.getElementById(`pax-name-${idx}`);
    const nikEl = document.getElementById(`pax-nik-${idx}`);
    const typeEl = document.getElementById(`pax-type-${idx}`);
    const mealEl = document.getElementById(`pax-meal-${idx}`);
    const insEl = document.getElementById(`pax-ins-${idx}`);
    if (nameEl) p.passenger_name = nameEl.value;
    if (nikEl) p.passenger_nik = nikEl.value;
    if (typeEl) p.passenger_type = typeEl.value;
    if (mealEl) p.meal_addon = mealEl.value;
    if (insEl) p.insurance_addon = insEl.checked;
  });
}

function changeBookingPassengerCount(delta) {
  syncPassengerInputState();
  const nextCount = state.passengers.length + delta;
  if (nextCount < 1 || nextCount > 4) {
    showToast('Pemesanan online mendukung 1 hingga 4 penumpang per transaksi.', 'error');
    return;
  }

  if (delta > 0) {
    const autoSeat = findNextAvailableSeat();
    state.passengers.push({
      passenger_name: '',
      passenger_nik: '',
      passenger_type: 'Dewasa',
      carriage_number: autoSeat.carriage_number,
      seat_number: autoSeat.seat_number,
      meal_addon: 'Tanpa Makanan',
      insurance_addon: true
    });
    state.activePassengerIndex = state.passengers.length - 1;
  } else {
    state.passengers.pop();
    state.activePassengerIndex = Math.min(state.activePassengerIndex, state.passengers.length - 1);
  }

  renderBookingPassengersForm();
  renderSeatMap();
  updateCheckoutTotals();
}

function setActivePassengerForSeat(index) {
  syncPassengerInputState();
  state.activePassengerIndex = index;
  state.selectedCarriage = state.passengers[index].carriage_number;
  renderBookingPassengersForm();
  renderSeatMap();
}

function renderBookingPassengersForm() {
  document.getElementById('booking-pax-count-label').textContent = `${state.passengers.length} Penumpang`;
  const container = document.getElementById('booking-passengers-container');

  container.innerHTML = state.passengers
    .map((p, idx) => {
      const mealOptionsHtml = MEAL_OPTIONS.map(
        (m) => `<option value="${escapeHtml(m.name)}" ${p.meal_addon === m.name ? 'selected' : ''}>${escapeHtml(m.label)}</option>`
      ).join('');

      return `
        <div class="passenger-card ${idx === state.activePassengerIndex ? 'active-pax' : ''}" onclick="setActivePassengerForSeat(${idx})">
          <div class="passenger-card-header">
            <span>Penumpang ${idx + 1} ${idx === state.activePassengerIndex ? '&bull; Aktif Memilih Kursi' : ''}</span>
            <span class="seat-pill-indicator">Gerbong ${p.carriage_number} &bull; Kursi ${escapeHtml(p.seat_number)}</span>
          </div>
          <div class="form-row-3">
            <div class="form-group" style="margin-bottom:0;">
              <label>Nama Lengkap (Sesuai KTP)</label>
              <input
                type="text"
                id="pax-name-${idx}"
                class="form-control form-control-sm"
                placeholder="Nama lengkap penumpang"
                value="${escapeHtml(p.passenger_name)}"
                oninput="state.passengers[${idx}].passenger_name = this.value"
                required
              />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label>NIK / Nomor Identitas</label>
              <input
                type="text"
                id="pax-nik-${idx}"
                class="form-control form-control-sm"
                placeholder="16 digit NIK KTP"
                value="${escapeHtml(p.passenger_nik)}"
                oninput="state.passengers[${idx}].passenger_nik = this.value"
                required
              />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label>Kategori Penumpang</label>
              <select
                id="pax-type-${idx}"
                class="form-control form-control-sm"
                onchange="state.passengers[${idx}].passenger_type = this.value"
              >
                <option value="Dewasa" ${p.passenger_type === 'Dewasa' ? 'selected' : ''}>Dewasa</option>
                <option value="Anak" ${p.passenger_type === 'Anak' ? 'selected' : ''}>Anak-anak</option>
                <option value="Lansia" ${p.passenger_type === 'Lansia' ? 'selected' : ''}>Lansia</option>
              </select>
            </div>
          </div>

          <div class="addons-row">
            <div class="form-group" style="margin-bottom:0;">
              <label>Pre-Order Kuliner Restorasi</label>
              <select
                id="pax-meal-${idx}"
                class="form-control form-control-sm"
                onchange="state.passengers[${idx}].meal_addon = this.value; updateCheckoutTotals();"
              >
                ${mealOptionsHtml}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0; justify-content:center;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:18px;">
                <input
                  type="checkbox"
                  id="pax-ins-${idx}"
                  ${p.insurance_addon ? 'checked' : ''}
                  onchange="state.passengers[${idx}].insurance_addon = this.checked; updateCheckoutTotals();"
                />
                <span>Perlindungan Perjalanan (+Rp 15.000)</span>
              </label>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  const paxTabs = document.getElementById('seat-map-passenger-tabs');
  paxTabs.innerHTML = state.passengers
    .map(
      (p, idx) => `
      <button
        type="button"
        class="seat-pax-tab ${idx === state.activePassengerIndex ? 'active' : ''}"
        onclick="setActivePassengerForSeat(${idx})"
      >
        Penumpang ${idx + 1}: G${p.carriage_number}/${escapeHtml(p.seat_number)}
      </button>
    `
    )
    .join('');
}

function selectCarriage(carriageNo) {
  state.selectedCarriage = carriageNo;
  renderSeatMap();
}

function pickSeat(seatNumber) {
  const c = state.selectedCarriage;
  if (isSeatOccupiedInDb(c, seatNumber)) return;

  if (isSeatTakenByOtherPassenger(c, seatNumber, state.activePassengerIndex)) {
    showToast(`Kursi ${seatNumber} di Gerbong ${c} sudah dipilih untuk penumpang lain.`, 'error');
    return;
  }

  syncPassengerInputState();
  state.passengers[state.activePassengerIndex].carriage_number = c;
  state.passengers[state.activePassengerIndex].seat_number = seatNumber;
  renderBookingPassengersForm();
  renderSeatMap();
}

function renderSeatMap() {
  document.querySelectorAll('#carriage-buttons .carriage-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx + 1 === state.selectedCarriage);
  });

  const grid = document.getElementById('seat-grid-container');
  const rowsHtml = [];

  for (let row = 1; row <= ROWS_PER_CARRIAGE; row++) {
    const renderSeatBtn = (col) => {
      const seatNo = `${row}${col}`;
      const occupiedDb = isSeatOccupiedInDb(state.selectedCarriage, seatNo);
      const selectedByIndex = state.passengers.findIndex(
        (p) => Number(p.carriage_number) === Number(state.selectedCarriage) && p.seat_number === seatNo
      );

      if (occupiedDb) {
        return `<button type="button" class="seat-btn occupied" disabled title="Kursi sudah terisi">${seatNo}</button>`;
      }
      if (selectedByIndex !== -1) {
        return `<button type="button" class="seat-btn selected" onclick="pickSeat('${seatNo}')" title="Kursi Penumpang ${selectedByIndex + 1}">${seatNo} (P${selectedByIndex + 1})</button>`;
      }
      return `<button type="button" class="seat-btn" onclick="pickSeat('${seatNo}')">${seatNo}</button>`;
    };

    rowsHtml.push(`
      <div class="seat-row">
        ${renderSeatBtn('A')}
        ${renderSeatBtn('B')}
        <span class="row-number">${row}</span>
        ${renderSeatBtn('C')}
        ${renderSeatBtn('D')}
      </div>
    `);
  }

  grid.innerHTML = rowsHtml.join('');
}

function quickPickPromo(code) {
  document.getElementById('booking-promo-input').value = code;
  applyBookingPromo(false);
}

async function applyBookingPromo(silent = false) {
  if (!state.bookingSchedule) return;
  const code = (document.getElementById('booking-promo-input').value || '').trim();
  if (!code) {
    state.appliedPromoCode = '';
    state.appliedDiscountAmount = 0;
    updateCheckoutTotals();
    return;
  }

  const baseSubtotal = Number(state.bookingSchedule.price) * state.passengers.length;
  try {
    const data = await apiFetch('/api/promos/validate', {
      method: 'POST',
      body: JSON.stringify({ code, subtotal: baseSubtotal })
    });
    state.appliedPromoCode = data.promo.code;
    state.appliedDiscountAmount = data.discount_amount;
    if (!silent) showToast(data.message);
  } catch (err) {
    state.appliedPromoCode = '';
    state.appliedDiscountAmount = 0;
    if (!silent) showToast(err.message, 'error');
  }
  updateCheckoutTotals();
}

function computeAddonsTotal() {
  let addons = 0;
  for (const p of state.passengers) {
    const mealObj = MEAL_OPTIONS.find((m) => m.name === p.meal_addon);
    if (mealObj) addons += mealObj.price;
    if (p.insurance_addon) addons += INSURANCE_PRICE;
  }
  return addons;
}

function updateCheckoutTotals() {
  if (!state.bookingSchedule) return;
  const unitPrice = Number(state.bookingSchedule.price);
  const count = state.passengers.length;
  const baseTotal = unitPrice * count;
  const addonsTotal = computeAddonsTotal();
  const discount = Math.min(state.appliedDiscountAmount || 0, baseTotal);
  const grandTotal = Math.max(0, baseTotal + addonsTotal - discount);

  document.getElementById('checkout-pax-count').textContent = `${count} Orang`;
  document.getElementById('checkout-base-price').textContent = formatRupiah(baseTotal);
  document.getElementById('checkout-addons-price').textContent = formatRupiah(addonsTotal);
  document.getElementById('checkout-promo-code').textContent = state.appliedPromoCode || '-';
  document.getElementById('checkout-discount-amount').textContent = `- ${formatRupiah(discount)}`;
  document.getElementById('checkout-total-price').textContent = formatRupiah(grandTotal);
}

async function handleBookingSubmit(e) {
  e.preventDefault();
  syncPassengerInputState();

  // Create booking as pending first, then show the Payment Gateway Checkout Modal!
  const payload = {
    schedule_id: state.bookingSchedule.id,
    travel_date: state.bookingTravelDate,
    contact_name: document.getElementById('contact-name').value,
    contact_email: document.getElementById('contact-email').value,
    contact_phone: document.getElementById('contact-phone').value,
    payment_method: document.getElementById('booking-payment-method').value,
    promo_code: state.appliedPromoCode || '',
    pay_now: false,
    passengers: state.passengers.map((p) => ({
      ...p,
      insurance_addon: p.insurance_addon ? 'Ya' : 'Tidak'
    }))
  };

  try {
    const data = await apiFetch('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    closeModal('booking-modal');
    await Promise.all([
      searchSchedules(),
      loadScheduleDirectory(),
      loadMyBookings()
    ]);

    openPaymentGatewayModal(data.booking);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Payment Gateway Modal
function openPaymentGatewayModal(booking) {
  const isQris = booking.payment_method.toLowerCase().includes('qris');
  const vaNumber = '8801 ' + String(booking.id).padStart(4, '0') + ' ' + booking.contact_phone.slice(-4).padStart(4, '8');

  document.getElementById('payment-modal-body').innerHTML = `
    <div class="payment-box">
      <div class="text-sm text-muted">Metode Pembayaran Dipilih</div>
      <h4 style="color:var(--navy-900); font-size:1.1rem; margin: 4px 0 10px;">${escapeHtml(booking.payment_method)}</h4>

      ${
        isQris
          ? `<div style="margin: 12px auto; background:#fff; padding:12px; display:inline-block; border-radius:10px; border:1px solid var(--slate-200);">
               ${generateQrSvg(booking.booking_code + '-QRIS', 140)}
               <div class="text-sm text-muted" style="margin-top:6px;">Scan QRIS dengan aplikasi Bank / E-Wallet</div>
             </div>`
          : `<div>
               <div class="text-sm text-muted">Nomor Virtual Account Pembayaran:</div>
               <div class="va-number-box">${escapeHtml(vaNumber)}</div>
             </div>`
      }

      <div style="margin-top: 8px;">
        <div class="text-sm text-muted">Total Tagihan</div>
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--orange-600);">${formatRupiah(booking.total_price)}</div>
      </div>
    </div>

    <div style="background:var(--white); border:1px solid var(--slate-200); border-radius:8px; padding:14px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;" class="text-sm">
        <span class="text-muted">Kode Booking (PNR)</span>
        <strong><code>${escapeHtml(booking.booking_code)}</code></strong>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;" class="text-sm">
        <span class="text-muted">Kereta &amp; Rute</span>
        <strong>${escapeHtml(booking.train_name)} (${escapeHtml(booking.origin_code)} &rarr; ${escapeHtml(booking.destination_code)})</strong>
      </div>
      <div style="display:flex; justify-content:space-between;" class="text-sm">
        <span class="text-muted">Tanggal Perjalanan</span>
        <strong>${escapeHtml(formatDateIndo(booking.travel_date))}</strong>
      </div>
    </div>
  `;

  document.getElementById('payment-modal-footer').innerHTML = `
    <button type="button" class="btn btn-outline" onclick="payLaterHandler('${escapeHtml(booking.booking_code)}')">
      Bayar Nanti (Simpan di Tiket Saya)
    </button>
    <button type="button" class="btn btn-success" onclick="confirmBookingPayment('${escapeHtml(booking.booking_code)}', true)">
      &#10003; Saya Sudah Membayar
    </button>
  `;

  openModal('payment-modal');
}

function payLaterHandler(bookingCode) {
  closeModal('payment-modal');
  showToast(`Pesanan ${bookingCode} tersimpan di menu Tiket Saya. Silakan selesaikan pembayaran sebelum keberangkatan.`);
  switchTab('my-tickets');
}

// My Bookings & PNR Lookup
async function loadMyBookings() {
  const data = await apiFetch('/api/bookings');
  state.myBookings = data.bookings || [];
  document.getElementById('nav-ticket-badge').textContent = state.myBookings.length;
  const mobileBadge = document.getElementById('mobile-ticket-badge');
  if (mobileBadge) mobileBadge.textContent = state.myBookings.length;
  renderMyBookingsList();
}

async function handlePnrLookup(e) {
  e.preventDefault();
  const code = (document.getElementById('pnr-search-input').value || '').trim();
  if (!code) {
    return loadMyBookings();
  }
  const data = await apiFetch(`/api/bookings?code=${encodeURIComponent(code)}`);
  state.myBookings = data.bookings || [];
  renderMyBookingsList();
  if (state.myBookings.length === 0) {
    showToast(`Pesanan dengan Kode Booking "${code}" tidak ditemukan.`, 'error');
  }
}

function renderMyBookingsList() {
  const container = document.getElementById('my-bookings-list');
  if (state.myBookings.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 32px; text-align: center;">
        <h3>Belum Ada Riwayat Perjalanan</h3>
        <p class="text-muted" style="margin: 8px 0 18px;">Tiket yang Anda pesan akan muncul secara otomatis di halaman ini.</p>
        <button type="button" class="btn btn-primary" onclick="switchTab('search')">Cari &amp; Pesan Tiket Sekarang</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.myBookings
    .map((b) => {
      const paxChips = (b.passengers || [])
        .map(
          (p) =>
            `<span class="pax-chip"><strong>${escapeHtml(p.passenger_name)}</strong> &bull; Gerbong ${p.carriage_number} / Kursi ${escapeHtml(p.seat_number)}${
              p.meal_addon && p.meal_addon !== 'Tanpa Makanan' ? ` &bull; &#127857; ${escapeHtml(p.meal_addon)}` : ''
            }</span>`
        )
        .join('');

      return `
        <div class="booking-item-card">
          <div class="booking-item-top">
            <div style="display:flex; align-items:center; gap: 12px; flex-wrap:wrap;">
              <span>Kode Booking: <span class="pnr-tag">${escapeHtml(b.booking_code)}</span></span>
              ${getStatusBadgeHtml(b.payment_status, b.booking_status)}
            </div>
            <div class="text-sm text-muted">
              Waktu Pesan: ${escapeHtml(b.created_at)} &bull; Pembayaran: <strong>${escapeHtml(b.payment_method)}</strong>
            </div>
          </div>

          <div class="booking-item-body">
            <div>
              <h3 style="color: var(--navy-900); margin-bottom: 4px;">
                ${escapeHtml(b.train_name)} (${escapeHtml(b.train_code)}) &mdash; ${escapeHtml(b.train_class)}
              </h3>
              <div class="text-sm">
                <strong>${escapeHtml(b.origin_name)} (${escapeHtml(b.departure_time)} WIB)</strong> &rarr;
                <strong>${escapeHtml(b.destination_name)} (${escapeHtml(b.arrival_time)} WIB)</strong>
              </div>
              <div class="text-sm text-muted">
                Tanggal Keberangkatan: <strong>${escapeHtml(formatDateIndo(b.travel_date))}</strong>
              </div>
              <div class="passenger-chips">${paxChips}</div>
            </div>

            <div>
              <div class="text-sm text-muted">Total Pembayaran (${b.total_passengers} Penumpang)</div>
              <div style="font-size: 1.28rem; font-weight: 800; color: var(--orange-600);">
                ${formatRupiah(b.total_price)}
              </div>
              ${
                b.discount_amount > 0
                  ? `<div class="text-sm" style="color:var(--green-700); font-weight:700;">Hemat ${formatRupiah(b.discount_amount)} (${escapeHtml(b.promo_code)})</div>`
                  : ''
              }
            </div>

            <div class="booking-actions">
              <button type="button" class="btn btn-sm btn-primary" onclick="showEticketModal('${escapeHtml(b.booking_code)}')">
                Boarding Pass &amp; E-Ticket
              </button>
              ${
                b.payment_status === 'MENUNGGU_PEMBAYARAN' && b.booking_status === 'AKTIF'
                  ? `<button type="button" class="btn btn-sm btn-success" onclick='openPaymentGatewayModal(${JSON.stringify(b).replace(/'/g, "&#39;")})'>Bayar Sekarang</button>`
                  : ''
              }
              ${
                b.booking_status === 'AKTIF'
                  ? `<button type="button" class="btn btn-sm btn-outline" onclick="openRescheduleModal('${escapeHtml(b.booking_code)}', '${escapeHtml(b.travel_date)}')">Ubah Jadwal</button>`
                  : ''
              }
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function showEticketModal(bookingCode) {
  try {
    const data = await apiFetch(`/api/bookings/${encodeURIComponent(bookingCode)}`);
    const b = data.booking;

    const passengerRows = (b.passengers || [])
      .map(
        (p, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><code>${escapeHtml(p.ticket_number)}</code></td>
          <td><strong>${escapeHtml(p.passenger_name)}</strong></td>
          <td>${escapeHtml(p.passenger_nik)}</td>
          <td><strong>Gerbong ${p.carriage_number} / Kursi ${escapeHtml(p.seat_number)}</strong></td>
          <td>${escapeHtml(p.meal_addon || 'Tanpa Makanan')}</td>
          <td>${p.insurance_addon === 'Ya' ? '&#10003; Aktif' : '-'}</td>
        </tr>
      `
      )
      .join('');

    document.getElementById('eticket-modal-content').innerHTML = `
      <div class="eticket-sheet">
        <div class="eticket-header">
          <div>
            <div style="font-size: 0.74rem; color: #93c5fd; font-weight: 800; letter-spacing:0.05em;">E-TICKET &amp; BOARDING PASS RESMI</div>
            <div style="font-size: 1.28rem; font-weight: 800;">PT KeretaKita Indonesia</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.74rem; color: #cbd5e1;">KODE BOOKING (PNR)</div>
            <div style="font-size: 1.45rem; font-weight: 800; font-family: Consolas, monospace; color: #fed7aa;">
              ${escapeHtml(b.booking_code)}
            </div>
          </div>
        </div>

        <div class="eticket-body">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px; flex-wrap:wrap; gap:8px;">
            <div>
              <strong>Status Tiket:</strong> ${getStatusBadgeHtml(b.payment_status, b.booking_status)}
            </div>
            <div class="text-sm text-muted">
              Tanggal Keberangkatan: <strong>${escapeHtml(formatDateIndo(b.travel_date))}</strong>
            </div>
          </div>

          <div class="eticket-top-grid">
            <div style="display:grid; grid-template-columns: 1.2fr 1fr auto 1fr; gap: 14px; align-items:center;">
              <div>
                <div class="text-sm text-muted">Kereta Api</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: var(--navy-900);">
                  ${escapeHtml(b.train_name)} (${escapeHtml(b.train_code)})
                </div>
                <div style="margin-top:4px;">${getClassBadgeHtml(b.train_class)}</div>
              </div>
              <div>
                <div class="text-sm text-muted">Berangkat</div>
                <div style="font-size: 1.18rem; font-weight: 800;">${escapeHtml(b.departure_time)} WIB</div>
                <div class="text-sm">${escapeHtml(b.origin_name)} (${escapeHtml(b.origin_code)})</div>
              </div>
              <div style="text-align:center;">
                <div class="text-sm text-muted">Durasi</div>
                <div style="font-weight:800;">&rarr; ${escapeHtml(b.duration)} &rarr;</div>
              </div>
              <div style="text-align:right;">
                <div class="text-sm text-muted">Tiba</div>
                <div style="font-size: 1.18rem; font-weight: 800;">${escapeHtml(b.arrival_time)} WIB</div>
                <div class="text-sm">${escapeHtml(b.destination_name)} (${escapeHtml(b.destination_code)})</div>
              </div>
            </div>

            <div class="qr-box">
              ${generateQrSvg(b.booking_code, 88)}
              <div style="font-size:0.68rem; font-weight:700; color:var(--slate-600); margin-top:4px;">SCAN GATE STASIUN</div>
            </div>
          </div>

          <h4 style="margin-bottom: 8px; color: var(--navy-900);">Daftar Penumpang, Kursi &amp; Layanan Tambahan</h4>
          <div class="table-responsive" style="margin-bottom: 16px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>No. E-Ticket</th>
                  <th>Nama Penumpang</th>
                  <th>NIK / Identitas</th>
                  <th>Gerbong &amp; Kursi</th>
                  <th>Kuliner Restorasi</th>
                  <th>Asuransi</th>
                </tr>
              </thead>
              <tbody>${passengerRows}</tbody>
            </table>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; background: var(--slate-50); padding: 13px 16px; border-radius: 8px; border: 1px solid var(--slate-200); flex-wrap:wrap; gap:10px;">
            <div class="text-sm">
              <div><strong>Pemesan:</strong> ${escapeHtml(b.contact_name)} (${escapeHtml(b.contact_email)} / ${escapeHtml(b.contact_phone)})</div>
              <div><strong>Metode Pembayaran:</strong> ${escapeHtml(b.payment_method)} ${b.promo_code && b.promo_code !== '-' ? `&bull; Promo: <code>${escapeHtml(b.promo_code)}</code>` : ''}</div>
            </div>
            <div style="text-align:right;">
              <div class="text-sm text-muted">Total Pembayaran</div>
              <div style="font-size: 1.28rem; font-weight: 800; color: var(--orange-600);">${formatRupiah(b.total_price)}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('eticket-modal-actions').innerHTML = `
      ${
        b.payment_status === 'MENUNGGU_PEMBAYARAN' && b.booking_status === 'AKTIF'
          ? `<button type="button" class="btn btn-success" onclick="confirmBookingPayment('${escapeHtml(b.booking_code)}', false)">Konfirmasi Pembayaran Sekarang</button>`
          : ''
      }
      ${
        b.booking_status === 'AKTIF'
          ? `<button type="button" class="btn btn-outline" onclick="openRescheduleModal('${escapeHtml(b.booking_code)}', '${escapeHtml(b.travel_date)}')">Ubah Jadwal (Reschedule)</button>
             <button type="button" class="btn btn-danger" onclick="cancelBooking('${escapeHtml(b.booking_code)}')">Batalkan Tiket</button>`
          : ''
      }
      <button type="button" class="btn btn-outline" onclick="window.print()">Cetak Boarding Pass</button>
      <button type="button" class="btn btn-primary" onclick="closeModal('eticket-modal')">Tutup</button>
    `;

    openModal('eticket-modal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmBookingPayment(bookingCode, fromGateway = false) {
  try {
    const data = await apiFetch(`/api/bookings/${encodeURIComponent(bookingCode)}/pay`, {
      method: 'POST'
    });
    if (fromGateway) closeModal('payment-modal');
    showToast(data.message);
    await Promise.all([checkAuthSession(), loadMyBookings()]);
    showEticketModal(bookingCode);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openRescheduleModal(bookingCode, currentDate) {
  closeModal('eticket-modal');
  document.getElementById('reschedule-booking-code').value = bookingCode;
  document.getElementById('reschedule-pnr-label').textContent = bookingCode;
  document.getElementById('reschedule-new-date').value = currentDate;
  openModal('reschedule-modal');
}

async function handleRescheduleSubmit(e) {
  e.preventDefault();
  const code = document.getElementById('reschedule-booking-code').value;
  const newDate = document.getElementById('reschedule-new-date').value;
  try {
    const data = await apiFetch(`/api/bookings/${encodeURIComponent(code)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ travel_date: newDate })
    });
    closeModal('reschedule-modal');
    showToast(data.message);
    await Promise.all([searchSchedules(), loadMyBookings()]);
    showEticketModal(code);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelBooking(bookingCode) {
  try {
    const data = await apiFetch(`/api/bookings/${encodeURIComponent(bookingCode)}/cancel`, {
      method: 'POST'
    });
    showToast(data.message);
    closeModal('eticket-modal');
    await Promise.all([
      searchSchedules(),
      loadScheduleDirectory(),
      loadMyBookings()
    ]);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
