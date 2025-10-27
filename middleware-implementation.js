// app.js
// Middleware demo: logging + Bearer token auth
// Usage:
//   npm init -y
//   npm install express
//   node app.js
// Server listens on http://localhost:3000

const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const REQUIRED_TOKEN = "mysecrettoken"; // the token to accept

/* ----- Logging middleware (applied globally) ----- */
function requestLogger(req, res, next) {
  const now = new Date();
  const timestamp = now.toISOString();
  // Log method, URL, and timestamp to console
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  // Optionally attach logger info to req for later use
  req.requestTime = timestamp;
  next();
}
app.use(requestLogger);

/* ----- Bearer token auth middleware (for protected routes) ----- */
function bearerAuth(req, res, next) {
  const auth = req.get("Authorization") || "";
  // Expect header: "Authorization: Bearer mysecrettoken"
  if (!auth) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  // auth may be like: "Bearer tokenvalue"
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ error: "Malformed Authorization header. Expected 'Bearer <token>'" });
  }

  const token = parts[1];
  if (token !== REQUIRED_TOKEN) {
    return res.status(403).json({ error: "Invalid token" });
  }

  // token valid — continue
  req.user = { tokenAccepted: true }; // example of attaching info
  next();
}

/* ----- Routes ----- */

// Public route (no auth required)
app.get("/public", (req, res) => {
  res.json({
    message: "This is a public endpoint. No authentication required.",
    requestTime: req.requestTime
  });
});

// Protected route (requires Bearer token)
app.get("/protected", bearerAuth, (req, res) => {
  res.json({
    message: "You have accessed a protected endpoint.",
    requestTime: req.requestTime,
    tokenAccepted: req.user.tokenAccepted
  });
});

// Example POST protected route
app.post("/protected/data", bearerAuth, (req, res) => {
  res.json({
    message: "Protected POST received.",
    body: req.body,
    requestTime: req.requestTime
  });
});

// Fallback
app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
