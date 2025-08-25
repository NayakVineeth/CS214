 Logging Middleware/logger.js
const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logFile = path.join(logsDir, "app.log");
const write = (obj) => fs.appendFile(logFile, JSON.stringify(obj) + "\n", () => {});

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    write({
      ts: new Date().toISOString(),
      level: "REQUEST",
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString(),
    });
  });
  next();
}

function info(msg, meta = {})  { write({ ts: new Date().toISOString(), level: "INFO",  msg, ...meta }); }
function error(msg, meta = {}) { write({ ts: new Date().toISOString(), level: "ERROR", msg, ...meta }); }

module.exports = { requestLogger, info, error };

