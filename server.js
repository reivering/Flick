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
 CREATE INDEX IF NOT EXISTS file_expiry ON files(expires);
 CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, session TEXT, name TEXT, size INTEGER, fingerprint TEXT, created INTEGER, expires INTEGER);
 CREATE INDEX IF NOT EXISTS upload_expiry ON uploads(expires);
 CREATE TABLE IF NOT EXISTS shares (token_hash TEXT PRIMARY KEY, file_id TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS share_expiry ON shares(expires);`);
for (const [table, column] of [['sessions', 'receiver_name'], ['sessions', 'sender_name'], ['files', 'sender_name']]) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(field => field.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
}
const DAY = 24 * 60 * 60 * 1000;
const token = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('hex');
const deviceName = (value, fallback) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 40) || fallback : fallback;
const cleanup = () => {
  const now = Date.now();
  db.prepare('DELETE FROM shares WHERE expires <= ? OR file_id NOT IN (SELECT id FROM files)').run(now);
  const removed = db.prepare('DELETE FROM images WHERE expires <= ?').run(now);
  for (const file of db.prepare('SELECT id FROM files WHERE expires <= ?').all(now)) {
    try { fs.rmSync(path.join(filesDir, file.id), { force: true }); db.prepare('DELETE FROM files WHERE id = ?').run(file.id); }
    catch (err) { console.error('Could not delete expired file:', err.message); }
  }
  for (const upload of db.prepare('SELECT id FROM uploads WHERE expires <= ?').all(now)) {
    try { if (!db.prepare('SELECT 1 FROM files WHERE id = ?').get(upload.id)) fs.rmSync(path.join(filesDir, upload.id), { force: true }); db.prepare('DELETE FROM uploads WHERE id = ?').run(upload.id); }
    catch (err) { console.error('Could not delete expired upload:', err.message); }
  }
  for (const name of fs.readdirSync(filesDir)) {
    const file = path.join(filesDir, name);
    if (!db.prepare('SELECT 1 FROM files WHERE id = ?').get(name) && !db.prepare('SELECT 1 FROM uploads WHERE id = ?').get(name) && fs.statSync(file).mtimeMs <= now - DAY) fs.rmSync(file, { force: true });
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
app.use('/vendor/hashes', express.static(path.join(__dirname, 'node_modules', '@noble', 'hashes')));
app.use('/vendor/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build')));
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
    const receiverName = deviceName(req.body.receiverName, 'Receiving device');
    db.prepare('INSERT INTO sessions (id, code, receiver, expires, receiver_name) VALUES (?, ?, ?, ?, ?)').run(id, code, digest(receiver), Date.now() + DAY, receiverName);
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
  const senderName = deviceName(req.body.senderName, 'Sending device');
  db.prepare('UPDATE sessions SET sender = ?, sender_name = ?, connected = 1 WHERE id = ?').run(digest(sender), senderName, session.id);
  res.json({ id: session.id, sender, code, receiverName: session.receiver_name || 'Receiving device', senderName });
});
app.get('/api/history', (req, res) => {
  const now = Date.now();
  const files = [];
  for (const part of (req.get('Cookie') || '').split(';')) {
    const match = /^\s*flick_([A-Za-z0-9_-]+)=([A-Za-z0-9_-]+)$/.exec(part);
    if (!match) continue;
    const session = db.prepare('SELECT receiver FROM sessions WHERE id = ? AND expires > ?').get(match[1], now);
    if (!session || session.receiver !== digest(match[2])) continue;
    files.push(...db.prepare('SELECT id, session, name, size, mime, created, expires, sender_name FROM files WHERE session = ? AND expires > ?').all(match[1], now));
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
  const file = db.prepare('SELECT id, name, size, mime, created, expires, sender_name FROM files WHERE session = ? AND expires > ? ORDER BY created DESC, rowid DESC LIMIT 1').get(session.id, Date.now());
  const files = db.prepare('SELECT id, session, name, size, mime, created, expires, sender_name FROM files WHERE session = ? AND expires > ? ORDER BY created DESC, rowid DESC').all(session.id, Date.now());
  res.json({ connected: !!session.connected, senderName: session.sender_name || 'Sending device', image: image || null, file: file || null, files });
});
const MAX_FILE_SIZE = 1000 * 1000 * 1000;
const CHUNK_SIZE = 4 * 1024 * 1024;
function fileMime(filePath) {
  const head = Buffer.alloc(16), fd = fs.openSync(filePath, 'r');
  try { fs.readSync(fd, head, 0, head.length, 0); } finally { fs.closeSync(fd); }
  if (head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (head.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString())) return 'image/gif';
  if (head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (head.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (head.subarray(4, 8).toString() === 'ftyp') return 'video/mp4';
  if (head.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'))) return 'video/webm';
  if (head.subarray(0, 4).toString() === 'OggS') return 'video/ogg';
  return null;
}
app.post('/api/sessions/:id/uploads', (req, res) => {
  if (!getSession(req, 'sender')) return res.status(401).json({ error: 'Your connection has expired. Connect again' });
  const { name, size, fingerprint } = req.body;
  if (typeof name !== 'string' || !name.length || !Number.isSafeInteger(size) || size < 0 || size >= MAX_FILE_SIZE || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) return res.status(400).json({ error: 'Invalid file details' });
  const safeName = path.basename(name).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255) || 'file';
  let item = db.prepare('SELECT * FROM uploads WHERE session = ? AND fingerprint = ? AND size = ? AND name = ? AND expires > ?').get(req.params.id, fingerprint, size, safeName, Date.now());
  if (!item) {
    const id = token(), now = Date.now();
    fs.writeFileSync(path.join(filesDir, id), '', { flag: 'wx' });
    db.prepare('INSERT INTO uploads VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.params.id, safeName, size, fingerprint, now, now + DAY);
    item = { id, size };
  }
  const offset = fs.statSync(path.join(filesDir, item.id)).size;
  db.prepare('UPDATE sessions SET expires = ? WHERE id = ?').run(Date.now() + DAY, req.params.id);
  const complete = !!db.prepare('SELECT 1 FROM files WHERE id = ? AND expires > ?').get(item.id, Date.now());
  res.json({ id: item.id, offset, chunkSize: CHUNK_SIZE, complete });
});
app.put('/api/sessions/:id/uploads/:upload', express.raw({ type: 'application/octet-stream', limit: CHUNK_SIZE }), (req, res) => {
  if (!getSession(req, 'sender')) return res.status(401).json({ error: 'Your connection has expired. Connect again' });
  const item = db.prepare('SELECT * FROM uploads WHERE id = ? AND session = ? AND expires > ?').get(req.params.upload, req.params.id, Date.now());
  if (!item) return res.status(404).json({ error: 'Upload expired. Start it again' });
  if (db.prepare('SELECT 1 FROM files WHERE id = ? AND expires > ?').get(item.id, Date.now())) return res.json({ id: item.id, offset: item.size, complete: true });
  const filePath = path.join(filesDir, item.id), offset = fs.statSync(filePath).size, requested = Number(req.get('Upload-Offset'));
  if (!Number.isSafeInteger(requested) || requested !== offset) return res.status(409).json({ error: 'Upload position changed', offset });
  if (!Buffer.isBuffer(req.body) || req.body.length > CHUNK_SIZE || offset + req.body.length > item.size || (!req.body.length && offset !== item.size)) return res.status(400).json({ error: 'Invalid upload chunk' });
  fs.appendFileSync(filePath, req.body);
  const next = offset + req.body.length;
  if (next === item.size) {
    const now = Date.now();
    db.exec('BEGIN');
    try {
      const session = db.prepare('SELECT sender_name FROM sessions WHERE id = ?').get(item.session);
      db.prepare('INSERT INTO files (id, session, name, size, mime, created, expires, sender_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(item.id, item.session, item.name, item.size, fileMime(filePath), now, now + DAY, session?.sender_name || 'Sending device');
      db.prepare('UPDATE uploads SET expires = ? WHERE id = ?').run(now + DAY, item.id);
      db.prepare('UPDATE sessions SET expires = ? WHERE id = ?').run(now + DAY, item.session);
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
    return res.json({ id: item.id, offset: next, complete: true });
  }
  res.json({ id: item.id, offset: next, complete: false });
});

const upload = multer({ storage: multer.diskStorage({ destination: filesDir, filename: (req, file, cb) => cb(null, token()) }), limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
app.post('/api/sessions/:id/files', (req, res) => {
  if (!getSession(req, 'sender')) return res.status(401).json({ error: 'Your connection has expired. Connect again' });
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Choose a file smaller than 1 GB' : 'Could not read that file' });
    if (!req.file) return res.status(400).json({ error: 'Choose a file first' });
    try {
      const mime = fileMime(req.file.path);
      const now = Date.now(), name = path.basename(req.file.originalname).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255) || 'file';
      const session = db.prepare('SELECT sender_name FROM sessions WHERE id = ?').get(req.params.id);
      db.prepare('INSERT INTO files (id, session, name, size, mime, created, expires, sender_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(req.file.filename, req.params.id, name, req.file.size, mime, now, now + DAY, session?.sender_name || 'Sending device');
      db.prepare('UPDATE sessions SET expires = ? WHERE id = ?').run(now + DAY, req.params.id);
      res.json({ id: req.file.filename, expires: now + DAY });
    } catch (err) { fs.rmSync(req.file.path, { force: true }); console.error(err); res.status(500).json({ error: 'Could not save that file' }); }
  });
});
function receiverAllowed(req) {
  const cookie = (req.get('Cookie') || '').split('; ').find(value => value.startsWith('flick_' + req.params.id + '='));
  const receiver = cookie && cookie.slice(cookie.indexOf('=') + 1);
  const session = db.prepare('SELECT receiver FROM sessions WHERE id = ? AND expires > ?').get(req.params.id, Date.now());
  return getSession(req, 'receiver') || (session && receiver && session.receiver === digest(receiver));
}
app.delete('/api/sessions/:id/files/:file', (req, res) => {
  if (!receiverAllowed(req) || req.get('X-Flick-Request') !== '1') return res.status(404).end();
  const file = db.prepare('SELECT id FROM files WHERE id = ? AND session = ? AND expires > ?').get(req.params.file, req.params.id, Date.now());
  if (!file) return res.status(404).json({ error: 'This file is no longer available' });
  fs.rmSync(path.join(filesDir, file.id), { force: true });
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  db.prepare('DELETE FROM uploads WHERE id = ?').run(file.id);
  db.prepare('DELETE FROM shares WHERE file_id = ?').run(file.id);
  res.json({ deleted: true });
});
app.post('/api/sessions/:id/files/:file/share', (req, res) => {
  if (!receiverAllowed(req) || req.get('X-Flick-Request') !== '1') return res.status(404).end();
  const file = db.prepare('SELECT id, expires FROM files WHERE id = ? AND session = ? AND expires > ?').get(req.params.file, req.params.id, Date.now());
  if (!file) return res.status(404).json({ error: 'This file is no longer available' });
  const shareToken = token();
  db.prepare('INSERT INTO shares VALUES (?, ?, ?)').run(digest(shareToken), file.id, file.expires);
  res.json({ token: shareToken, expires: file.expires });
});
function sharedFile(req) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(req.params.share)) return null;
  const now = Date.now();
  return db.prepare('SELECT files.* FROM shares JOIN files ON files.id = shares.file_id WHERE shares.token_hash = ? AND shares.expires > ? AND files.expires > ?').get(digest(req.params.share), now, now);
}
function serveFile(req, res, file) {
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  if (req.query.preview === '1' && file.mime) { res.type(file.mime); return res.sendFile(path.join(filesDir, file.id)); }
  res.type('application/octet-stream');
  res.download(path.join(filesDir, file.id), file.name, err => { if (err && !res.headersSent) res.status(404).end(); });
}
app.get('/api/shared/:share', (req, res) => {
  const file = sharedFile(req);
  if (!file) return res.status(404).json({ error: 'This link has expired or the file was deleted' });
  res.json({ name: file.name, size: file.size, mime: file.mime, expires: file.expires, sender_name: file.sender_name });
});
app.get('/api/shared/:share/file', (req, res) => {
  const file = sharedFile(req);
  if (!file) return res.status(404).end();
  serveFile(req, res, file);
});
app.get('/api/sessions/:id/files/:file', (req, res) => {
  if (!receiverAllowed(req)) return res.status(404).end();
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND session = ? AND expires > ?').get(req.params.file, req.params.id, Date.now());
  if (!file) return res.status(404).end();
  serveFile(req, res, file);
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
