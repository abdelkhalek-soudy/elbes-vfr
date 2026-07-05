'use strict';

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'db', 'orders.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_code TEXT UNIQUE NOT NULL,
    user_id INTEGER,
    name TEXT,
    phone TEXT,
    height REAL NOT NULL,
    weight REAL NOT NULL,
    fit TEXT NOT NULL,
    chest REAL,
    waist REAL,
    shoulder REAL,
    size INTEGER NOT NULL,
    confidence INTEGER NOT NULL,
    bmi REAL,
    alterations TEXT NOT NULL,
    gender TEXT DEFAULT 'male',
    top_category TEXT DEFAULT 'jacket',
    jacket_color TEXT DEFAULT 'كحلي ليلي',
    shirt_color TEXT DEFAULT 'أبيض كلاسيك',
    pants_color TEXT DEFAULT 'كحلي ليلي',
    shoes_color TEXT DEFAULT 'بني تبغ',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,      -- tshirt | pants | jacket | shoes
    gender TEXT NOT NULL,        -- male | female | unisex
    name TEXT NOT NULL,
    color_name TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    brand TEXT DEFAULT 'البس Basics'
  );
`);

// Support migrating existing DB if needed
try { db.exec('ALTER TABLE orders ADD COLUMN user_id INTEGER;'); } catch (e) { }
try { db.exec('ALTER TABLE orders ADD COLUMN gender TEXT DEFAULT "male";'); } catch (e) { }
try { db.exec('ALTER TABLE orders ADD COLUMN top_category TEXT DEFAULT "jacket";'); } catch (e) { }

function generateTrackingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  let exists = true;
  while (exists) {
    code = 'VFR-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const row = db.prepare('SELECT 1 FROM orders WHERE tracking_code = ?').get(code);
    exists = !!row;
  }
  return code;
}

function createOrder(data) {
  const now = new Date().toISOString();
  const trackingCode = generateTrackingCode();
  const stmt = db.prepare(`
    INSERT INTO orders
      (tracking_code, user_id, name, phone, height, weight, fit, chest, waist, shoulder,
       size, confidence, bmi, alterations, gender, top_category, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `);
  stmt.run(
    trackingCode,
    data.user_id ?? null,
    data.name || null,
    data.phone || null,
    data.height,
    data.weight,
    data.fit,
    data.chest ?? null,
    data.waist ?? null,
    data.shoulder ?? null,
    data.size,
    data.confidence,
    data.bmi ?? null,
    JSON.stringify(data.alterations),
    data.gender || 'male',
    data.top_category || 'jacket',
    now,
    now
  );
  return getOrderByCode(trackingCode);
}

function listOrdersForUser(userId) {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  return rows.map(r => ({ ...r, alterations: JSON.parse(r.alterations) }));
}

function listAllOrders() {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  return rows.map(r => ({ ...r, alterations: JSON.parse(r.alterations) }));
}

function updateOrderStatus(code, status) {
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE tracking_code = ?').run(status, now, code);
  return getOrderByCode(code);
}

function createUser({ name, email, passwordHash, salt, role }) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO users (name, email, password_hash, salt, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(name, email.toLowerCase(), passwordHash, salt, role || 'customer', now);
  return getUserById(info.lastInsertRowid);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) || null;
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function createSession(userId, token, expiresAt) {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, expiresAt, now);
}

function getSession(token) {
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    deleteSession(token);
    return null;
  }
  return row;
}

function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function listProducts(filters = {}) {
  let query = 'SELECT * FROM products WHERE 1=1';
  const args = [];
  if (filters.category) { query += ' AND category = ?'; args.push(filters.category); }
  if (filters.gender) { query += " AND (gender = ? OR gender = 'unisex')"; args.push(filters.gender); }
  query += ' ORDER BY id ASC';
  return db.prepare(query).all(...args);
}

function seedProductsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  if (count > 0) return;
  const items = [
    // تيشرتات رجالي
    ['tshirt', 'male', 'تيشرت أساسي', 'أبيض', '#f5f2ea'],
    ['tshirt', 'male', 'تيشرت أساسي', 'أسود', '#141414'],
    ['tshirt', 'male', 'تيشرت أساسي', 'كحلي', '#1b2a41'],
    ['tshirt', 'male', 'تيشرت أساسي', 'رمادي', '#7a7f87'],
    // تيشرتات حريمي
    ['tshirt', 'female', 'تيشرت أساسي', 'أبيض', '#f5f2ea'],
    ['tshirt', 'female', 'تيشرت أساسي', 'وردي', '#e3aebb'],
    ['tshirt', 'female', 'تيشرت أساسي', 'أسود', '#141414'],
    ['tshirt', 'female', 'تيشرت أساسي', 'بيج', '#d8c7ab'],
    // جواكت (unisex بألوان مختلفة)
    ['jacket', 'unisex', 'جاكيت كلاسيك', 'كحلي ليلي', '#1b2a41'],
    ['jacket', 'unisex', 'جاكيت كلاسيك', 'بني تبغ', '#6b4a30'],
    ['jacket', 'unisex', 'جاكيت كلاسيك', 'أسود', '#141414'],
    ['jacket', 'female', 'جاكيت نسائي', 'بيج', '#d8c7ab'],
    // بناطيل رجالي
    ['pants', 'male', 'بنطلون قماش', 'كحلي', '#1b2a41'],
    ['pants', 'male', 'بنطلون قماش', 'رمادي فحمي', '#3a3a3a'],
    ['pants', 'male', 'جينز', 'أزرق غامق', '#2b3f5c'],
    // بناطيل حريمي
    ['pants', 'female', 'بنطلون قماش', 'أسود', '#141414'],
    ['pants', 'female', 'جينز', 'أزرق فاتح', '#7c9db3'],
    ['pants', 'female', 'بنطلون قماش', 'بيج', '#d8c7ab'],
    // أحذية unisex
    ['shoes', 'unisex', 'سنيكرز', 'أبيض', '#f0f0f0'],
    ['shoes', 'unisex', 'سنيكرز', 'أسود', '#141414'],
    ['shoes', 'male', 'حذاء كلاسيك', 'بني تبغ', '#6b4a30'],
    ['shoes', 'female', 'حذاء كعب', 'أسود', '#141414']
  ];
  const stmt = db.prepare('INSERT INTO products (category, gender, name, color_name, color_hex) VALUES (?, ?, ?, ?, ?)');
  items.forEach(i => stmt.run(...i));
}

seedProductsIfEmpty();

function getOrderByCode(code) {
  const row = db.prepare('SELECT * FROM orders WHERE tracking_code = ?').get(code);
  if (!row) return null;
  return {
    ...row,
    alterations: JSON.parse(row.alterations)
  };
}

function updateColors(code, colors) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE orders SET
      jacket_color = COALESCE(?, jacket_color),
      shirt_color  = COALESCE(?, shirt_color),
      pants_color  = COALESCE(?, pants_color),
      shoes_color  = COALESCE(?, shoes_color),
      gender = COALESCE(?, gender),
      top_category = COALESCE(?, top_category),
      updated_at = ?
    WHERE tracking_code = ?
  `);
  stmt.run(
    colors.jacket ?? null,
    colors.shirt ?? null,
    colors.pants ?? null,
    colors.shoes ?? null,
    colors.gender ?? null,
    colors.top_category ?? null,
    now,
    code
  );
  return getOrderByCode(code);
}

function confirmOrder(code, contact) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE orders SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      user_id = COALESCE(?, user_id),
      status = 'confirmed',
      updated_at = ?
    WHERE tracking_code = ?
  `);
  stmt.run(contact.name ?? null, contact.phone ?? null, contact.user_id ?? null, now, code);
  return getOrderByCode(code);
}

module.exports = {
  db, createOrder, getOrderByCode, updateColors, confirmOrder,
  listOrdersForUser, listAllOrders, updateOrderStatus,
  createUser, getUserByEmail, getUserById,
  createSession, getSession, deleteSession,
  listProducts
};
