/**
 * app.js
 * JWT Authentication demo for a simple Banking API
 *
 * Usage:
 * 1. npm init -y
 * 2. npm install express jsonwebtoken dotenv
 * 3. create a .env file (example below) OR let it use defaults
 * 4. node app.js
 *
 * .env example:
 *  PORT=3000
 *  JWT_SECRET=superdupersecret
 *  JWT_EXPIRES_IN=1h
 *
 * This is a demo only: credentials are hardcoded and accounts are in-memory.
 */

require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "superdupersecret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

/* ---------------------
   Hardcoded demo user
   --------------------- */
const demoUser = {
  username: "alice",
  password: "password123" // plain text for demo only — never do this in production
};

/* ---------------------
   In-memory account state
   --------------------- */
const accounts = {
  // keyed by username
  alice: {
    balance: 10000.0, // starting balance in currency units
    currency: "INR"
  }
};

/* ---------------------
   JWT generation helper
   --------------------- */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/* ---------------------
   Auth middleware: verify JWT Bearer token
   --------------------- */
function verifyJwt(req, res, next) {
  const authHeader = req.get("Authorization") || "";
  if (!authHeader) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ error: "Malformed Authorization header. Expected 'Bearer <token>'" });
  }

  const token = parts[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      // Token expired or invalid
      return res.status(401).json({ error: "Invalid or expired token", details: err.message });
    }
    // Attach user info to request
    req.user = decoded; // e.g., { username: "alice", iat:..., exp:... }
    next();
  });
}

/* ---------------------
   Routes
   --------------------- */

/**
 * POST /login
 * Body: { username, password }
 * Returns: { token }
 */
app.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }

  // Simple hardcoded auth
  if (username !== demoUser.username || password !== demoUser.password) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  // Create token payload (keep it small)
  const payload = { username };
  const token = generateToken(payload);
  return res.json({ token, expiresIn: JWT_EXPIRES_IN });
});

/**
 * GET /balance
 * Protected route: returns account balance for authenticated user
 */
app.get("/balance", verifyJwt, (req, res) => {
  const username = req.user.username;
  const account = accounts[username];
  if (!account) return res.status(404).json({ error: "Account not found" });

  return res.json({ username, balance: account.balance, currency: account.currency });
});

/**
 * POST /deposit
 * Protected route
 * Body: { amount } (positive number)
 */
app.post("/deposit", verifyJwt, (req, res) => {
  const username = req.user.username;
  const { amount } = req.body || {};

  if (amount === undefined) return res.status(400).json({ error: "amount is required" });
  const value = Number(amount);
  if (!isFinite(value) || value <= 0) return res.status(400).json({ error: "amount must be a positive number" });

  const account = accounts[username];
  if (!account) return res.status(404).json({ error: "Account not found" });

  account.balance += value;
  return res.json({ message: "Deposit successful", balance: account.balance, currency: account.currency });
});

/**
 * POST /withdraw
 * Protected route
 * Body: { amount } (positive number)
 */
app.post("/withdraw", verifyJwt, (req, res) => {
  const username = req.user.username;
  const { amount } = req.body || {};

  if (amount === undefined) return res.status(400).json({ error: "amount is required" });
  const value = Number(amount);
  if (!isFinite(value) || value <= 0) return res.status(400).json({ error: "amount must be a positive number" });

  const account = accounts[username];
  if (!account) return res.status(404).json({ error: "Account not found" });

  if (value > account.balance) {
    return res.status(400).json({ error: "Insufficient balance", balance: account.balance });
  }

  account.balance -= value;
  return res.json({ message: "Withdrawal successful", balance: account.balance, currency: account.currency });
});

/* ---------------------
   Health & fallback
   --------------------- */
app.get("/", (req, res) => res.json({ message: "Banking API (JWT demo). Use /login to obtain a token." }));

app.use((req, res) => res.status(404).json({ error: "Route not found" }));

/* ---------------------
   Start server
   --------------------- */
app.listen(PORT, () => {
  console.log(`🚀 Banking API running on http://localhost:${PORT}`);
  console.log(`Demo credentials: username=alice password=password123`);
  console.log(`JWT secret: ${JWT_SECRET}  (change via .env in production)`);
});
