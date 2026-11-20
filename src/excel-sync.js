const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CSV_DIR = path.join(DATA_DIR, 'csv');
const EXCEL_FILE_PATH = path.join(DATA_DIR, 'Database_KeretaKita.xlsx');

// CRC32 Table for standard ZIP creation (.xlsx container)
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a valid ZIP buffer from an array of { name: string, data: Buffer }
 */
function createZipArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressedBuf = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(String(entry.data), 'utf8');
    const compressedBuf = zlib.deflateRawSync(uncompressedBuf);
    const crc = crc32(uncompressedBuf);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // UTF-8 flag
    localHeader.writeUInt16LE(8, 8);          // Compression: Deflate (8)
    localHeader.writeUInt16LE(0, 10);         // Mod time
    localHeader.writeUInt16LE(0x21, 12);      // Mod date
    localHeader.writeUInt32LE(crc, 14);       // CRC32
    localHeader.writeUInt32LE(compressedBuf.length, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedBuf.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28);         // Extra field length
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, compressedBuf);

    // Central directory file header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by
    centralHeader.writeUInt16LE(20, 6);         // Version needed
    centralHeader.writeUInt16LE(0x0800, 8);     // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10);         // Compression: Deflate
    centralHeader.writeUInt16LE(0, 12);         // Mod time
    centralHeader.writeUInt16LE(0x21, 14);      // Mod date
    centralHeader.writeUInt32LE(crc, 16);       // CRC32
    centralHeader.writeUInt32LE(compressedBuf.length, 20);
    centralHeader.writeUInt32LE(uncompressedBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // Extra length
    centralHeader.writeUInt16LE(0, 32);         // Comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk number
    centralHeader.writeUInt16LE(0, 36);         // Internal attrs
    centralHeader.writeUInt32LE(0, 38);         // External attrs
    centralHeader.writeUInt32LE(offset, 42);    // Local header offset
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + compressedBuf.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // EOCD signature
  eocd.writeUInt16LE(0, 4);                     // Disk number
  eocd.writeUInt16LE(0, 6);                     // Central dir start disk
  eocd.writeUInt16LE(entries.length, 8);        // Entries on disk
  eocd.writeUInt16LE(entries.length, 10);       // Total entries
  eocd.writeUInt32LE(centralDirBuf.length, 12); // Central dir size
  eocd.writeUInt32LE(offset, 16);               // Central dir offset
  eocd.writeUInt16LE(0, 20);                    // Comment length

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

function escapeXml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getExcelColumnName(colIndex) {
  let dividend = colIndex + 1;
  let columnName = '';
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnName;
}

function buildWorksheetXml(columns, rows) {
  // Compute column widths automatically
  const colWidths = columns.map((col) => {
    let maxLen = col.header.length;
    for (const r of rows) {
      const val = r[col.key];
      const strLen = val !== null && val !== undefined ? String(val).length : 0;
      if (strLen > maxLen) maxLen = strLen;
    }
    return Math.min(Math.max(maxLen + 4, 12), 42);
  });

  const colsXml = colWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const sheetRowsXml = [];

  // Header Row (Row 1, style s="1" -> Navy Blue Header with White Bold Text)
  const headerCells = columns
    .map((col, cIdx) => {
      const cellRef = `${getExcelColumnName(cIdx)}1`;
      return `<c r="${cellRef}" t="inlineStr" s="1"><is><t>${escapeXml(col.header)}</t></is></c>`;
    })
    .join('');
  sheetRowsXml.push(`<row r="1" ht="24" customHeight="1">${headerCells}</row>`);

  // Data Rows
  rows.forEach((rowObj, rIdx) => {
    const rowNumber = rIdx + 2;
    const cellsXml = columns
      .map((col, cIdx) => {
        const cellRef = `${getExcelColumnName(cIdx)}${rowNumber}`;
        const rawVal = rowObj[col.key];
        if (rawVal === null || rawVal === undefined || rawVal === '') {
          return `<c r="${cellRef}" t="inlineStr" s="2"><is><t></t></is></c>`;
        }
        if (col.type === 'number' && typeof rawVal === 'number' && !Number.isNaN(rawVal)) {
          return `<c r="${cellRef}" s="3"><v>${rawVal}</v></c>`;
        }
        return `<c r="${cellRef}" t="inlineStr" s="2"><is><t>${escapeXml(rawVal)}</t></is></c>`;
      })
      .join('');
    sheetRowsXml.push(`<row r="${rowNumber}" ht="19">${cellsXml}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>${sheetRowsXml.join('')}</sheetData>
</worksheet>`;
}

function buildXlsxBuffer(sheets) {
  const contentTypesOverrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${contentTypesOverrides}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookSheetsXml = sheets
    .map(
      (s, i) =>
        `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    )
    .join('');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheetsXml}</sheets>
</workbook>`;

  const workbookRelsItems = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('');

  const stylesRelId = `rId${sheets.length + 1}`;
  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRelsItems}
  <Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="10"/><color rgb="FF1E293B"/><name val="Segoe UI"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0B1F3A"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" horizontal="right"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  const entries = [
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { name: 'xl/styles.xml', data: stylesXml }
  ];

  sheets.forEach((s, i) => {
    entries.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: buildWorksheetXml(s.columns, s.rows)
    });
  });

  return createZipArchive(entries);
}

function buildCsvContent(columns, rows) {
  const escapeCsvCell = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const dataLines = rows.map((r) => columns.map((c) => escapeCsvCell(r[c.key])).join(','));
  // Add UTF-8 BOM so Microsoft Excel opens UTF-8 CSV cleanly
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Synchronizes all SQLite tables into:
 * 1. c:\webdev\project_2\data\Database_KeretaKita.xlsx (Multi-Sheet Excel Workbook)
 * 2. c:\webdev\project_2\data\csv\*.csv (Individual Excel-ready CSV files)
 */
function syncDatabaseToExcel(db) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR, { recursive: true });

    const bookings = db.prepare(`
      SELECT
        b.id,
        b.booking_code,
        s.train_code,
        s.train_name,
        s.train_class,
        orig.name || ' (' || orig.code || ')' AS origin_station,
        dest.name || ' (' || dest.code || ')' AS destination_station,
        b.travel_date,
        s.departure_time,
        s.arrival_time,
        b.total_passengers,
        b.promo_code,
        b.discount_amount,
        b.addons_total,
        b.total_price,
        b.payment_method,
        b.payment_status,
        b.booking_status,
        b.contact_name,
        b.contact_email,
        b.contact_phone,
        b.paid_at,
        b.created_at
      FROM bookings b
      JOIN schedules s ON s.id = b.schedule_id
      JOIN stations orig ON orig.id = s.origin_station_id
      JOIN stations dest ON dest.id = s.destination_station_id
      ORDER BY b.id DESC
    `).all();

    const passengers = db.prepare(`
      SELECT
        bp.id,
        bp.ticket_number,
        b.booking_code,
        bp.passenger_name,
        bp.passenger_nik,
        bp.passenger_type,
        s.train_name || ' (' || s.train_code || ')' AS train_info,
        s.train_class,
        b.travel_date,
        bp.carriage_number,
        bp.seat_number,
        bp.meal_addon,
        bp.insurance_addon,
        b.payment_status,
        b.booking_status
      FROM booking_passengers bp
      JOIN bookings b ON b.id = bp.booking_id
      JOIN schedules s ON s.id = b.schedule_id
      ORDER BY bp.id DESC
    `).all();

    const users = db.prepare(`
      SELECT
        id,
        name,
        email,
        phone,
        nik,
        role,
        loyalty_points,
        created_at
      FROM users
      ORDER BY id DESC
    `).all();

    const schedules = db.prepare(`
      SELECT
        s.id,
        s.train_code,
        s.train_name,
        s.train_class,
        s.sub_class,
        orig.code AS origin_code,
        orig.name AS origin_name,
        orig.city AS origin_city,
        dest.code AS destination_code,
        dest.name AS destination_name,
        dest.city AS destination_city,
        s.departure_time,
        s.arrival_time,
        s.duration,
        s.price,
        s.total_seats,
        s.facilities
      FROM schedules s
      JOIN stations orig ON orig.id = s.origin_station_id
      JOIN stations dest ON dest.id = s.destination_station_id
      ORDER BY s.id ASC
    `).all();

    const stations = db.prepare(`
      SELECT id, code, name, city, region
      FROM stations
      ORDER BY id ASC
    `).all();

    const sheets = [
      {
        name: '1_Pemesanan_Tiket',
        csvFile: '1_Pemesanan_Tiket.csv',
        columns: [
          { key: 'id', header: 'ID Transaksi', type: 'number' },
          { key: 'booking_code', header: 'Kode Booking (PNR)' },
          { key: 'booking_status', header: 'Status Tiket' },
          { key: 'payment_status', header: 'Status Pembayaran' },
          { key: 'train_code', header: 'No. KA' },
          { key: 'train_name', header: 'Nama Kereta' },
          { key: 'train_class', header: 'Kelas' },
          { key: 'origin_station', header: 'Stasiun Asal' },
          { key: 'destination_station', header: 'Stasiun Tujuan' },
          { key: 'travel_date', header: 'Tanggal Berangkat' },
          { key: 'departure_time', header: 'Jam Berangkat' },
          { key: 'arrival_time', header: 'Jam Tiba' },
          { key: 'total_passengers', header: 'Jml Penumpang', type: 'number' },
          { key: 'promo_code', header: 'Kode Promo' },
          { key: 'discount_amount', header: 'Diskon (Rp)', type: 'number' },
          { key: 'addons_total', header: 'Add-ons (Rp)', type: 'number' },
          { key: 'total_price', header: 'Total Bayar (Rp)', type: 'number' },
          { key: 'payment_method', header: 'Metode Pembayaran' },
          { key: 'contact_name', header: 'Nama Pemesan' },
          { key: 'contact_email', header: 'Email Pemesan' },
          { key: 'contact_phone', header: 'No. HP Pemesan' },
          { key: 'paid_at', header: 'Waktu Lunas' },
          { key: 'created_at', header: 'Waktu Pemesanan' }
        ],
        rows: bookings
      },
      {
        name: '2_Penumpang_Kursi',
        csvFile: '2_Penumpang_Kursi.csv',
        columns: [
          { key: 'id', header: 'ID Penumpang', type: 'number' },
          { key: 'ticket_number', header: 'Nomor E-Ticket' },
          { key: 'booking_code', header: 'Kode Booking (PNR)' },
          { key: 'passenger_name', header: 'Nama Lengkap Penumpang' },
          { key: 'passenger_nik', header: 'NIK / No. Identitas' },
          { key: 'passenger_type', header: 'Kategori' },
          { key: 'train_info', header: 'Kereta Api' },
          { key: 'train_class', header: 'Kelas' },
          { key: 'travel_date', header: 'Tanggal Keberangkatan' },
          { key: 'carriage_number', header: 'Gerbong', type: 'number' },
          { key: 'seat_number', header: 'Nomor Kursi' },
          { key: 'meal_addon', header: 'Pre-Order Makanan' },
          { key: 'insurance_addon', header: 'Asuransi Perjalanan' },
          { key: 'payment_status', header: 'Status Bayar' },
          { key: 'booking_status', header: 'Status Tiket' }
        ],
        rows: passengers
      },
      {
        name: '3_Data_Pelanggan',
        csvFile: '3_Data_Pelanggan.csv',
        columns: [
          { key: 'id', header: 'ID User', type: 'number' },
          { key: 'name', header: 'Nama Lengkap' },
          { key: 'email', header: 'Alamat Email' },
          { key: 'phone', header: 'No. Telepon / WhatsApp' },
          { key: 'nik', header: 'NIK / No. KTP' },
          { key: 'loyalty_points', header: 'RailPoints', type: 'number' },
          { key: 'created_at', header: 'Tanggal Terdaftar' }
        ],
        rows: users
      },
      {
        name: '4_Jadwal_Kereta',
        csvFile: '4_Jadwal_Kereta.csv',
        columns: [
          { key: 'id', header: 'ID Jadwal', type: 'number' },
          { key: 'train_code', header: 'Kode KA' },
          { key: 'train_name', header: 'Nama Kereta Api' },
          { key: 'train_class', header: 'Kelas Layanan' },
          { key: 'sub_class', header: 'Subkelas' },
          { key: 'origin_code', header: 'Kode Asal' },
          { key: 'origin_name', header: 'Stasiun Asal' },
          { key: 'origin_city', header: 'Kota Asal' },
          { key: 'destination_code', header: 'Kode Tujuan' },
          { key: 'destination_name', header: 'Stasiun Tujuan' },
          { key: 'destination_city', header: 'Kota Tujuan' },
          { key: 'departure_time', header: 'Jam Berangkat' },
          { key: 'arrival_time', header: 'Jam Tiba' },
          { key: 'duration', header: 'Durasi' },
          { key: 'price', header: 'Harga Tiket (Rp)', type: 'number' },
          { key: 'total_seats', header: 'Kapasitas Kursi', type: 'number' },
          { key: 'facilities', header: 'Fasilitas Kereta' }
        ],
        rows: schedules
      },
      {
        name: '5_Daftar_Stasiun',
        csvFile: '5_Daftar_Stasiun.csv',
        columns: [
          { key: 'id', header: 'ID Stasiun', type: 'number' },
          { key: 'code', header: 'Kode Stasiun' },
          { key: 'name', header: 'Nama Stasiun' },
          { key: 'city', header: 'Kota / Kabupaten' },
          { key: 'region', header: 'Wilayah Daerah Operasi (DAOP)' }
        ],
        rows: stations
      }
    ];

    const xlsxBuffer = buildXlsxBuffer(sheets);
    try {
      fs.writeFileSync(EXCEL_FILE_PATH, xlsxBuffer);
    } catch (writeErr) {
      // If the user currently has Database_KeretaKita.xlsx open in Microsoft Excel (file locked on Windows),
      // write to a companion file so no data is ever lost and server never crashes.
      const fallbackPath = path.join(DATA_DIR, 'Database_KeretaKita_Terbaru.xlsx');
      fs.writeFileSync(fallbackPath, xlsxBuffer);
    }

    // Write individual CSV files as well
    for (const s of sheets) {
      const csvPath = path.join(CSV_DIR, s.csvFile);
      try {
        fs.writeFileSync(csvPath, buildCsvContent(s.columns, s.rows), 'utf8');
      } catch (_) {}
    }

    return EXCEL_FILE_PATH;
  } catch (err) {
    console.error('[Excel Sync Error]', err.message);
    return null;
  }
}

module.exports = {
  syncDatabaseToExcel,
  EXCEL_FILE_PATH,
  CSV_DIR
};
