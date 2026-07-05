'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const { calculateFit } = require('./sizeEngine');
const {
  createOrder, getOrderByCode, updateColors, confirmOrder,
  listOrdersForUser, listAllOrders, updateOrderStatus,
  createUser, getUserByEmail, getUserById,
  createSession, getSession, deleteSession,
  listProducts
} = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

// ===== Helpers =====
function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1e6) { reject(new Error('الطلب أكبر من المسموح')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('صيغة JSON غير صحيحة')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

function setSessionCookie(res, token, maxAge) {
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const user = getUserById(session.user_id);
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

// ===== Static file server =====
function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[\\/])+/, '');
  const fullPath = path.join(PUBLIC_DIR, filePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('ممنوع');
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(PUBLIC_DIR, '404.html'), (err2, notFoundContent) => {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(notFoundContent || '404 - الصفحة غير موجودة');
        });
        return;
      }
      res.writeHead(500);
      return res.end('خطأ في السيرفر');
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ===== Main server =====
const requestListener = async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      return res.end();
    }

    // ===== Auth: Signup =====
    if (pathname === '/api/auth/signup' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.name || !body.email || !body.password) {
        return sendJSON(res, 400, { error: 'الاسم والإيميل وكلمة السر مطلوبين' });
      }
      if (body.password.length < 6) {
        return sendJSON(res, 400, { error: 'كلمة السر لازم تكون 6 حروف على الأقل' });
      }
      const existing = getUserByEmail(body.email);
      if (existing) {
        return sendJSON(res, 409, { error: 'الإيميل ده مسجّل قبل كدا' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(body.password, salt);
      const user = createUser({ name: body.name, email: body.email, passwordHash, salt, role: body.role || 'customer' });
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      createSession(user.id, token, expiresAt);
      setSessionCookie(res, token, 7 * 24 * 60 * 60);
      return sendJSON(res, 201, { user: safeUser(user) });
    }

    // ===== Auth: Login =====
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.email || !body.password) {
        return sendJSON(res, 400, { error: 'الإيميل وكلمة السر مطلوبين' });
      }
      const user = getUserByEmail(body.email);
      if (!user) {
        return sendJSON(res, 401, { error: 'البريد الإلكتروني أو كلمة السر غير صحيحة' });
      }
      const hash = hashPassword(body.password, user.salt);
      if (hash !== user.password_hash) {
        return sendJSON(res, 401, { error: 'البريد الإلكتروني أو كلمة السر غير صحيحة' });
      }
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      createSession(user.id, token, expiresAt);
      setSessionCookie(res, token, 7 * 24 * 60 * 60);
      return sendJSON(res, 200, { user: safeUser(user) });
    }

    // ===== Auth: Logout =====
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      if (cookies.session) deleteSession(cookies.session);
      setSessionCookie(res, '', 0);
      return sendJSON(res, 200, { ok: true });
    }

    // ===== Auth: Me =====
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = getCurrentUser(req);
      return sendJSON(res, 200, { user: user || null });
    }

    // ===== Products Catalog =====
    if (pathname === '/api/products' && req.method === 'GET') {
      const category = parsedUrl.searchParams.get('category') || undefined;
      const gender = parsedUrl.searchParams.get('gender') || undefined;
      const items = listProducts({ category, gender });
      return sendJSON(res, 200, items);
    }

    // ===== API: حساب المقاس وإنشاء طلب جديد =====
    if (pathname === '/api/calculate' && req.method === 'POST') {
      const body = await readBody(req);
      const user = getCurrentUser(req);
      let result;
      try { result = calculateFit(body); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
      const order = createOrder({
        user_id: user ? user.id : null,
        name: body.name,
        phone: body.phone,
        height: Number(body.height),
        weight: Number(body.weight),
        fit: result.fit,
        chest: body.chest || null,
        waist: body.waist || null,
        shoulder: body.shoulder || null,
        size: result.size,
        confidence: result.confidence,
        bmi: result.bmi,
        alterations: result.alterations,
        gender: body.gender || 'male',
        top_category: body.top_category || 'jacket'
      });
      return sendJSON(res, 201, { ...order, matchedBlock: result.matchedBlock, targetMeasurements: result.targetMeasurements });
    }

    // ===== API: جلب بيانات طلب عن طريق كود التتبع =====
    if (pathname.match(/^\/api\/orders\/[^/]+$/) && req.method === 'GET') {
      const code = decodeURIComponent(pathname.split('/').pop());
      const order = getOrderByCode(code);
      if (!order) return sendJSON(res, 404, { error: 'الطلب غير موجود، تأكد من كود التتبع' });
      return sendJSON(res, 200, order);
    }

    // ===== API: تحديث الألوان المختارة =====
    if (pathname.match(/^\/api\/orders\/[^/]+\/colors$/) && req.method === 'PATCH') {
      const code = decodeURIComponent(pathname.split('/')[3]);
      const existing = getOrderByCode(code);
      if (!existing) return sendJSON(res, 404, { error: 'الطلب غير موجود' });
      const body = await readBody(req);
      const updated = updateColors(code, body);
      return sendJSON(res, 200, updated);
    }

    // ===== API: تأكيد الطلب =====
    if (pathname.match(/^\/api\/orders\/[^/]+\/confirm$/) && req.method === 'POST') {
      const code = decodeURIComponent(pathname.split('/')[3]);
      const existing = getOrderByCode(code);
      if (!existing) return sendJSON(res, 404, { error: 'الطلب غير موجود' });
      const body = await readBody(req);
      const user = getCurrentUser(req);
      if (!body.name || !body.phone) {
        return sendJSON(res, 400, { error: 'الاسم ورقم الهاتف مطلوبين لتأكيد الطلب' });
      }
      const updated = confirmOrder(code, { name: body.name, phone: body.phone, user_id: user ? user.id : null });
      return sendJSON(res, 200, updated);
    }

    // ===== Admin: List all orders =====
    if (pathname === '/api/admin/orders' && req.method === 'GET') {
      const user = getCurrentUser(req);
      if (!user || user.role !== 'admin') {
        return sendJSON(res, 403, { error: 'غير مصرّح' });
      }
      const orders = listAllOrders();
      return sendJSON(res, 200, orders);
    }

    // ===== Admin: Update order status =====
    if (pathname.match(/^\/api\/admin\/orders\/[^/]+\/status$/) && req.method === 'PATCH') {
      const user = getCurrentUser(req);
      if (!user || user.role !== 'admin') {
        return sendJSON(res, 403, { error: 'غير مصرّح' });
      }
      const code = decodeURIComponent(pathname.split('/')[4]);
      const body = await readBody(req);
      if (!body.status) {
        return sendJSON(res, 400, { error: 'الحالة مطلوبة' });
      }
      const updated = updateOrderStatus(code, body.status);
      if (!updated) return sendJSON(res, 404, { error: 'الطلب غير موجود' });
      return sendJSON(res, 200, updated);
    }

    // ===== My Orders =====
    if (pathname === '/api/orders' && req.method === 'GET') {
      const user = getCurrentUser(req);
      if (!user) return sendJSON(res, 401, { error: 'لازم تسجّل دخول الأول' });
      const orders = listOrdersForUser(user.id);
      return sendJSON(res, 200, orders);
    }

    if (pathname.startsWith('/api/')) {
      return sendJSON(res, 404, { error: 'مسار غير موجود' });
    }

    // ===== ملفات الموقع الثابتة =====
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'حصل خطأ غير متوقع في السيرفر' });
  }
};

const server = http.createServer(requestListener);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`✅ البس شغال على http://localhost:${PORT}`);
  });
}

module.exports = requestListener;
