const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomInt, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const dataDir = process.env.FLICK_DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const filesDir = path.join(dataDir, 'files');
fs.mkdirSync(filesDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'flick.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, code TEXT UNIQUE, receiver TEXT, sender TEXT, connected INTEGER DEFAULT 0, expires INTEGER);
 CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, session TEXT, image BLOB, created INTEGER, expires INTEGER);
 CREATE INDEX IF NOT EXISTS image_expiry ON images(expires);
 CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, session TEXT, name TEXT, size INTEGER, mime TEXT, created INTEGER, expires INTEGER);
 CREATE INDEX IF NOT EXISTS file_expiry ON files(expires);`);
const DAY = 24 * 60 * 60 * 1000;
const token = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('hex');
const cleanup = () => {
  const now = Date.now();
  const removed = db.prepare('DELETE FROM images WHERE expires <= ?').run(now);
  for (const file of db.prepare('SELECT id FROM files WHERE expires <= ?').all(now)) {
    try { fs.rmSync(path.join(filesDir, file.id), { force: true }); db.prepare('DELETE FROM files WHERE id = ?').run(file.id); }
    catch (err) { console.error('Could not delete expired file:', err.message); }
  }
  for (const name of fs.readdirSync(filesDir)) {
    const file = path.join(filesDir, name);
    if (!db.prepare('SELECT 1 FROM files WHERE id = ?').get(name) && fs.statSync(file).mtimeMs <= now - DAY) fs.rmSync(file, { force: true });
  }
  db.prepare('DELETE FROM sessions WHERE expires <= ? AND id NOT IN (SELECT session FROM images) AND id NOT IN (SELECT session FROM files)').run(now);
  if (removed.changes) db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
};
cleanup();
setInterval(cleanup, 60 * 1000).unref();
const attempts = new Map();
setInterval(() => { const now = Date.now(); for (const [key, value] of attempts) if (value.until < now) attempts.delete(key); }, 60000).unref();
app.disable('x-powered-by');
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); next(); });
app.use(express.json({ limit: '4kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
const getSession = (req, role) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND expires > ?').get(req.params.id, Date.now());
  const auth = (req.get('Authorization') || '').replace(/^Bearer /, '');
  return session && auth && session[role] === digest(auth) ? session : null;
};
app.post('/api/sessions', async (req, res, next) => {
  try {
    const id = token(), receiver = token();
    let code;
    do { code = String(randomInt(0, 100000000)).padStart(8, '0'); } while (db.prepare('SELECT 1 FROM sessions WHERE code = ?').get(code));
    db.prepare('INSERT INTO sessions (id, code, receiver, expires) VALUES (?, ?, ?, ?)').run(id, code, digest(receiver), Date.now() + DAY);
    const url = new URL(req.body.origin || '', `${req.protocol}://${req.get('host')}`);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid origin');
    url.pathname = '/'; url.search = ''; url.hash = `join=${code}`;
    res.cookie('flick_' + id, receiver, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: DAY });
    res.json({ id, receiver, code, qr: await QRCode.toDataURL(url.toString(), { margin: 2, width: 320, color: { dark: '#171919', light: '#f9f9f2' } }) });
  } catch (err) { next(err); }
});
app.post('/api/join', (req, res) => {
  const ip = req.ip, now = Date.now();
  let limit = attempts.get(ip);
  if (!limit || limit.until < now) { limit = { count: 0, until: now + 60000 }; attempts.set(ip, limit); }
  if (++limit.count > 15) return res.status(429).json({ error: 'Too many attempts. Try again in a minute' });
  const code = String(req.body.code || '').replace(/\s/g, '');
  if (!/^\d{8}$/.test(code)) return res.status(400).json({ error: 'Enter the 8-digit code' });
  const session = db.prepare('SELECT * FROM sessions WHERE code = ? AND expires > ?').get(code, now);
  if (!session) return res.status(404).json({ error: 'That code is invalid or has expired' });
  const sender = token();
  db.prepare('UPDATE sessions SET sender = ?, connected = 1 WHERE id = ?').run(digest(sender), session.id);
  res.json({ id: session.id, sender });
});
app.get('/api/history', (req, res) => {
  const now = Date.now();
  const files = [];
  for (const part of (req.get('Cookie') || '').split(';')) {
    const match = /^\s*flick_([A-Za-z0-9_-]+)=([A-Za-z0-9_-]+)$/.exec(part);
    if (!match) continue;
    const session = db.prepare('SELECT receiver FROM sessions WHERE id = ? AND expires > ?').get(match[1], now);
    if (!session || session.receiver !== digest(match[2])) continue;
    files.push(...db.prepare('SELECT id, session, name, size, mime, created, expires FROM files WHERE session = ? AND expires > ?').all(match[1], now));
  }
  files.sort((a, b) => b.created - a.created);
  res.json({ files });
});
app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req, 'receiver');
  if (!session) return res.status(404).json({ error: 'This session has expired' });
  const receiver = req.get('Authorization').slice(7);
  res.cookie('flick_' + session.id, receiver, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: DAY });
  const image = db.prepare('SELECT id, created, expires FROM images WHERE session = ? AND expires > ? ORDER BY created DESC LIMIT 1').get(session.id, Date.now());
  const file = db.prepare('SELECT id, name, size, mime, created, expires FROM files WHERE session = ? AND expires > ? ORDER BY created DESC LIMIT 1').get(session.id, Date.now());
  res.json({ connected: !!session.connected, image: image || null, file: file || null });
});
const MAX_FILE_SIZE = 1000 * 1000 * 1000;
const upload = multer({ storage: multer.diskStorage({ destination: filesDir, filename: (req, file, cb) => cb(null, token()) }), limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
app.post('/api/sessions/:id/files', (req, res) => {
  if (!getSession(req, 'sender')) return res.status(401).json({ error: 'Your connection has expired. Connect again' });
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Choose a file smaller than 1 GB' : 'Could not read that file' });
    if (!req.file) return res.status(400).json({ error: 'Choose a file first' });
    try {
      const head = Buffer.alloc(12), fd = fs.openSync(req.file.path, 'r');
      try { fs.readSync(fd, head, 0, 12, 0); } finally { fs.closeSync(fd); }
      const mime = head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png' :
        head.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) ? 'image/jpeg' :
        head.subarray(0, 6).toString() === 'GIF87a' || head.subarray(0, 6).toString() === 'GIF89a' ? 'image/gif' :
        head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
      const now = Date.now(), name = path.basename(req.file.originalname).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255) || 'file';
      db.prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?)').run(req.file.filename, req.params.id, name, req.file.size, mime, now, now + DAY);
      db.prepare('UPDATE sessions SET expires = ? WHERE id = ?').run(now + DAY, req.params.id);
      res.json({ id: req.file.filename, expires: now + DAY });
    } catch (err) { fs.rmSync(req.file.path, { force: true }); console.error(err); res.status(500).json({ error: 'Could not save that file' }); }
  });
});
app.get('/api/sessions/:id/files/:file', (req, res) => {
  const cookie = (req.get('Cookie') || '').split('; ').find(value => value.startsWith('flick_' + req.params.id + '='));
  const receiver = cookie && cookie.slice(cookie.indexOf('=') + 1);
  const session = db.prepare('SELECT receiver FROM sessions WHERE id = ? AND expires > ?').get(req.params.id, Date.now());
  const authorized = getSession(req, 'receiver') || (session && receiver && session.receiver === digest(receiver));
  if (!authorized) return res.status(404).end();
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND session = ? AND expires > ?').get(req.params.file, req.params.id, Date.now());
  if (!file) return res.status(404).end();
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  if (req.query.preview === '1' && file.mime) { res.type(file.mime); return res.sendFile(path.join(filesDir, file.id)); }
  res.type('application/octet-stream');
  res.download(path.join(filesDir, file.id), file.name, err => { if (err && !res.headersSent) res.status(404).end(); });
});
app.get('/api/sessions/:id/images/:image', (req, res) => {
  if (!getSession(req, 'receiver')) return res.status(404).end();
  const image = db.prepare('SELECT image FROM images WHERE id = ? AND session = ? AND expires > ?').get(req.params.image, req.params.id, Date.now());
  if (!image) return res.status(404).end();
  res.type('png').send(Buffer.from(image.image));
});
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong. Please try again' }); });
if (require.main === module) app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`Flick is running on port ${process.env.PORT || 3000}`));
module.exports = { app, db, cleanup, DAY };
