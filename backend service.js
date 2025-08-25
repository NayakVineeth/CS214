// Backend_Frontend_Test_Submission/server.js
const express = require("express");
const { requestLogger, info, error } = require("../Logging Middleware/logger");

const app = express();
app.use(express.json());
app.use(requestLogger);

const PORT = process.env.PORT || 3000;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;

// In-memory store (OK for this test)
const links = new Map(); // code -> { url, createdAt, expiresAt, clicks[] }

function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}
function genCode(len = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
function maskIp(ip) {
  if (!ip) return "unknown";
  const clean = ip.replace("::ffff:", "");
  const parts = clean.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.*` : clean;
}

/** Create Short URL
 * POST /shorturls
 * body: { url: string, validity?: minutes (int), shortcode?: [a-zA-Z0-9]{4,12} }
 * 201 -> { shortcode, shortLink, expiry }
 */
app.post("/shorturls", (req, res) => {
  const { url, validity, shortcode } = req.body || {};
  if (!url || !isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'Invalid or missing "url". Must be http/https.' });
  }

  let minutes = 30;
  if (validity !== undefined) {
    if (!Number.isInteger(validity) || validity <= 0) {
      return res.status(400).json({ error: '"validity" must be a positive integer (minutes).' });
    }
    minutes = validity;
  }

  let code = shortcode;
  if (code !== undefined) {
    if (!/^[A-Za-z0-9]{4,12}$/.test(code)) {
      return res.status(400).json({ error: '"shortcode" must be 4–12 alphanumeric characters.' });
    }
    if (links.has(code)) return res.status(409).json({ error: "Shortcode already in use." });
  } else {
    // auto-generate unique
    for (let i = 0; i < 10 && (!code || links.has(code)); i++) code = genCode(6);
    if (!code || links.has(code)) return res.status(500).json({ error: "Failed to generate unique shortcode." });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);
  links.set(code, { url, createdAt: now, expiresAt, clicks: [] });

  info("Short URL created", { shortcode: code, url, expiry: expiresAt.toISOString() });

  return res.status(201).json({
    shortcode: code,
    shortLink: `${BASE}/${code}`,
    expiry: expiresAt.toISOString(),
  });
});

/** Stats
 * GET /shorturls/:code
 * 200 -> { shortcode, longUrl, createdAt, expiry, clickCount, clicks[] }
 */
app.get("/shorturls/:code", (req, res) => {
  const { code } = req.params;
  const rec = links.get(code);
  if (!rec) return res.status(404).json({ error: "Shortcode not found." });

  return res.json({
    shortcode: code,
    longUrl: rec.url,
    createdAt: rec.createdAt.toISOString(),
    expiry: rec.expiresAt.toISOString(),
    clickCount: rec.clicks.length,
    clicks: rec.clicks, // each: { ts, referrer, ip }
  });
});

/** Redirection
 * GET /:code  -> 302 Location: <original url>
 * 404 if not found, 410 if expired
 */
app.get("/:code", (req, res) => {
  const { code } = req.params;
  if (code === "shorturls") return res.status(404).json({ error: "Not found." }); // avoid clash
  const rec = links.get(code);
  if (!rec) return res.status(404).json({ error: "Shortcode not found." });
  if (rec.expiresAt.getTime() < Date.now()) return res.status(410).json({ error: "Link expired." });

  const ref = req.get("referer") || req.get("referrer") || null;
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
  rec.clicks.push({ ts: new Date().toISOString(), referrer: ref, ip: maskIp(ip) });

  info("Redirect", { shortcode: code, referrer: ref });
  return res.redirect(302, rec.url);
});

// Error handler (no console)
app.use((err, req, res, next) => {
  error("Unhandled error", { message: err.message });
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  info("Service started", { port: PORT, base: BASE });
});
