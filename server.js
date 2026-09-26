
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "priya_hardware.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const adminSessions = new Set();
const CATEGORIES = ["Paints", "Pipes", "Fittings", "Electrical", "Hardware", "Plumbing", "Tools"];

db.exec(`
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  price REAL NOT NULL DEFAULT 0,
  mrp REAL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  description TEXT,
  image TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE,
  user_id INTEGER,
  customer_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_method TEXT,
  total REAL,
  items_json TEXT,
  order_status TEXT DEFAULT 'NEW',
  payment_status TEXT DEFAULT 'PENDING',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  user_id INTEGER,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

try { db.exec("ALTER TABLE orders ADD COLUMN user_id INTEGER"); } catch (_) {}
try { db.exec("ALTER TABLE products ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP"); } catch (_) {}

const seed = [
  ["PH-PAINT-001","Asian Paints Apex 1L","Paints","Asian Paints",395,395,0,"Asian Paints Apex exterior paint, 1 litre","🎨"],
  ["PH-PIPE-001","PVC Pipe 1/2 inch - Heavy","Pipes","",75,75,0,"Heavy PVC pipe, 1/2 inch","◯"],
  ["PH-FIT-001","PVC Elbow 1/2 inch","Fittings","",10,10,0,"PVC elbow fitting, 1/2 inch","🔩"],
  ["PH-ELEC-001","Havells Switch","Electrical","Havells",20,20,0,"Havells electrical switch","💡"],
  ["PH-ELEC-002","Anchor 6A Socket","Electrical","Anchor",65,65,0,"Anchor 6 amp socket","🔌"],
  ["PH-PIPE-002","GI Pipe 1 inch","Pipes","",89,89,0,"GI pipe, priced per foot","◯"],
  ["PH-PLUMB-001","PVC Solvent 100ml","Plumbing","",70,70,0,"PVC solvent cement, 100ml","🧴"],
  ["PH-HARD-001","Door Lock 65mm","Hardware","",130,130,0,"Door lock, 65mm","🔒"],
  ["PH-HARD-002","Screw 1 inch","Hardware","",1,1,0,"Screw, 1 inch","🔩"],
  ["PH-PAINT-002","Wall Putty 40kg","Paints","",890,890,0,"Wall putty, 40kg bag","🎨"]
];
const ins = db.prepare(`INSERT OR IGNORE INTO products
(sku,name,category,brand,price,mrp,stock,description,image) VALUES(?,?,?,?,?,?,?,?,?)`);
seed.forEach(row => ins.run(...row));

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

function cookieValue(req, name) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : "";
}
function setCookie(res, name, value, maxAge) {
  res.setHeader("Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}
function getAdminToken(req) { return cookieValue(req, "ph_admin"); }
function isAdmin(req) { const t = getAdminToken(req); return !!t && adminSessions.has(t); }
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Admin login required" });
  next();
}
function getUser(req) {
  const token = cookieValue(req, "ph_customer");
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>?
  `).get(token, Date.now());
  return row || null;
}
function requireUser(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Please login first" });
  req.user = user;
  next();
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(hash, "hex"));
}
function createUserSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)")
    .run(token, userId, Date.now() + 1000 * 60 * 60 * 24 * 30);
  setCookie(res, "ph_customer", token, 60 * 60 * 24 * 30);
}
function publicUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email, phone: user.phone || "" } : null;
}
function productPayload(p) {
  const avg = db.prepare("SELECT COALESCE(AVG(rating),0) rating, COUNT(*) reviews FROM reviews WHERE product_id=?").get(p.id);
  return { ...p, rating: Number(avg.rating || 0), reviews: Number(avg.reviews || 0) };
}

app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: "ADMIN_PASSWORD is not configured on the server." });
  if (String(req.body?.password || "") !== ADMIN_PASSWORD)
    return res.status(401).json({ error: "Incorrect admin password" });
  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.add(token);
  setCookie(res, "ph_admin", token, 86400);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => {
  const token = getAdminToken(req);
  if (token) adminSessions.delete(token);
  setCookie(res, "ph_admin", "", 0);
  res.json({ ok: true });
});
app.get("/api/admin/session", (req, res) => res.json({ admin: isAdmin(req) }));

app.get("/api/auth/session", (req, res) => res.json({ user: publicUser(getUser(req)) }));
app.post("/api/auth/register", (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email and password are required." });
  if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  try {
    const info = db.prepare("INSERT INTO users(name,email,phone,password_hash) VALUES(?,?,?,?)")
      .run(String(name).trim(), String(email).trim().toLowerCase(), String(phone || "").trim(), hashPassword(password));
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
    createUserSession(res, user.id);
    res.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    res.status(400).json({ error: e.message.includes("UNIQUE") ? "Email is already registered." : e.message });
  }
});
app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(401).json({ error: "Invalid email or password." });
  createUserSession(res, user.id);
  res.json({ ok: true, user: publicUser(user) });
});
app.post("/api/auth/logout", (req, res) => {
  const token = cookieValue(req, "ph_customer");
  if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
  setCookie(res, "ph_customer", "", 0);
  res.json({ ok: true });
});

app.get("/admin.html", (req, res) => {
  if (!isAdmin(req)) return res.redirect("/admin-login.html");
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/categories", (req, res) => {
  const rows = db.prepare("SELECT DISTINCT category FROM products WHERE active=1 ORDER BY category").all();
  const set = new Set([...CATEGORIES, ...rows.map(x => x.category)]);
  res.json([...set]);
});
app.get("/api/products", (req, res) => {
  let sql = "SELECT * FROM products WHERE active=1";
  const args = [];
  const term = String(req.query.q || "").trim();
  const cat = String(req.query.category || "").trim();
  const min = Number(req.query.min || 0);
  const max = Number(req.query.max || 0);
  if (term) {
    sql += " AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR category LIKE ? OR description LIKE ?)";
    const x = `%${term}%`; args.push(x,x,x,x,x);
  }
  if (cat) { sql += " AND category=?"; args.push(cat); }
  if (min > 0) { sql += " AND price>=?"; args.push(min); }
  if (max > 0) { sql += " AND price<=?"; args.push(max); }
  sql += " ORDER BY id DESC LIMIT 500";
  res.json(db.prepare(sql).all(...args).map(productPayload));
});
app.get("/api/products/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found" });
  res.json(productPayload(p));
});
app.get("/api/products/:id/reviews", (req, res) => {
  res.json(db.prepare(`
    SELECT r.id,r.rating,r.comment,r.created_at,u.name
    FROM reviews r LEFT JOIN users u ON u.id=r.user_id
    WHERE r.product_id=? ORDER BY r.id DESC
  `).all(req.params.id));
});
app.post("/api/products/:id/reviews", requireUser, (req, res) => {
  const rating = Math.max(1, Math.min(5, Number(req.body?.rating || 0)));
  const comment = String(req.body?.comment || "").trim();
  if (!rating || !comment) return res.status(400).json({ error: "Rating and comment are required." });
  const p = db.prepare("SELECT id FROM products WHERE id=? AND active=1").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found" });
  db.prepare("INSERT INTO reviews(product_id,user_id,rating,comment) VALUES(?,?,?,?)")
    .run(p.id, req.user.id, rating, comment);
  res.json({ ok: true });
});

app.post("/api/products", requireAdmin, (req, res) => {
  const p = req.body || {};
  if (!p.name || !p.category) return res.status(400).json({ error: "Name and category required" });
  try {
    const r = db.prepare(`
      INSERT INTO products(sku,name,category,brand,price,mrp,stock,description,image)
      VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
      p.sku || `PH-${Date.now()}`, p.name, p.category, p.brand || "",
      Number(p.price) || 0, Number(p.mrp) || 0, Math.max(0, Number(p.stock) || 0),
      p.description || "", p.image || ""
    );
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put("/api/products/:id", requireAdmin, (req, res) => {
  const p = req.body || {};
  if (!p.name || !p.category) return res.status(400).json({ error: "Name and category required" });
  try {
    db.prepare(`
      UPDATE products SET sku=?,name=?,category=?,brand=?,price=?,mrp=?,stock=?,description=?,image=?
      WHERE id=?
    `).run(
      p.sku || "", p.name, p.category, p.brand || "",
      Number(p.price) || 0, Number(p.mrp) || 0, Math.max(0, Number(p.stock) || 0),
      p.description || "", p.image || "", req.params.id
    );
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/products/:id", requireAdmin, (req, res) => {
  db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/orders", (req, res) => {
  const { customer_name, phone, email, address, payment_method, items } = req.body || {};
  if (!customer_name || !phone || !address || !Array.isArray(items) || !items.length)
    return res.status(400).json({ error: "Complete checkout details required." });
  const user = getUser(req);
  let total = 0, norm = [];
  try {
    let orderNo = "";
    db.transaction(() => {
      for (const x of items) {
        const p = db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(x.id);
        if (!p) throw new Error("Product unavailable");
        const qty = Math.max(1, Number(x.qty) || 1);
        if (p.stock < qty) throw new Error(`${p.name} is out of stock`);
        total += p.price * qty;
        norm.push({ id:p.id, name:p.name, qty, price:p.price, image:p.image || "" });
        db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(qty, p.id);
      }
      orderNo = `PH${Date.now().toString().slice(-10)}`;
      db.prepare(`
        INSERT INTO orders(order_no,user_id,customer_name,phone,email,address,payment_method,total,items_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))
      `).run(orderNo, user?.id || null, customer_name, phone, email || "", address,
             payment_method || "COD", total, JSON.stringify(norm));
    })();
    res.json({ ok:true, order_no:orderNo, total });
  } catch (e) { res.status(400).json({ error:e.message }); }
});
app.get("/api/my-orders", requireUser, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC").all(req.user.id);
  res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items_json || "[]") })));
});
app.get("/api/orders", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all();
  res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items_json || "[]") })));
});
app.put("/api/orders/:id/status", requireAdmin, (req, res) => {
  const allowed = ["NEW","CONFIRMED","PROCESSING","SHIPPED","DELIVERED","CANCELLED"];
  const status = String(req.body?.status || "");
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid order status." });
  db.prepare("UPDATE orders SET order_status=? WHERE id=?").run(status, req.params.id);
  res.json({ ok:true });
});
app.get("/api/stats", requireAdmin, (req, res) => {
  res.json({
    products: db.prepare("SELECT count(*) c FROM products WHERE active=1").get().c,
    stock: db.prepare("SELECT coalesce(sum(stock),0) s FROM products WHERE active=1").get().s,
    orders: db.prepare("SELECT count(*) c FROM orders").get().c,
    sales: db.prepare("SELECT coalesce(sum(total),0) s FROM orders WHERE order_status!='CANCELLED'").get().s
  });
});

app.get("/health", (req,res) => res.json({ok:true, service:"priya-hardware"}));
app.listen(PORT, () => console.log(`Priya Hardware running on port ${PORT}`));
