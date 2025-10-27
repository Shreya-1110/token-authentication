/**
 * app.js
 * Account Transfer System (no DB transactions)
 *
 * Usage:
 * 1. npm init -y
 * 2. npm install express mongoose
 * 3. node app.js
 *
 * Defaults to MongoDB at mongodb://127.0.0.1:27017/bankDB
 */

const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/bankDB";
const PORT = process.env.PORT || 3000;

/* ---------- Mongoose setup ---------- */
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB:", MONGO_URI))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

const accountSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true },
    balance: { type: Number, required: true, min: 0 }
  },
  { versionKey: false }
);

const Account = mongoose.model("Account", accountSchema);

/* ---------- Seed sample accounts (if none exist) ---------- */
async function seedIfEmpty() {
  const c = await Account.countDocuments();
  if (c === 0) {
    await Account.insertMany([
      { username: "alice", name: "Alice Rao", balance: 10000 },
      { username: "bob", name: "Bob Singh", balance: 5000 },
      { username: "charlie", name: "Charlie Iyer", balance: 2000 }
    ]);
    console.log("Seeded sample accounts: alice, bob, charlie");
  } else {
    console.log("Accounts exist in DB (count =", c + ")");
  }
}
seedIfEmpty().catch((err) => console.error("Seeding error:", err));

/* ---------- Helper: format account for output (avoid exposing internals) ---------- */
function accountView(acc) {
  if (!acc) return null;
  return { username: acc.username, name: acc.name, balance: acc.balance };
}

/* ---------- Routes ---------- */

/**
 * GET /accounts
 * List all accounts (for testing/demo)
 */
app.get("/accounts", async (req, res) => {
  try {
    const accounts = await Account.find({}, { _id: 0, username: 1, name: 1, balance: 1 });
    res.json(accounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /accounts/:username
 * Get a single account
 */
app.get("/accounts/:username", async (req, res) => {
  try {
    const acc = await Account.findOne({ username: req.params.username });
    if (!acc) return res.status(404).json({ error: "Account not found" });
    res.json(accountView(acc));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /transfer
 * Body: { from: "alice", to: "bob", amount: 2500 }
 *
 * Logic:
 * 1. Validate input.
 * 2. Ensure 'to' account exists.
 * 3. Atomically debit 'from' using findOneAndUpdate({ username: from, balance: { $gte: amount } }, { $inc: { balance: -amount } })
 *    - If null returned => either sender not found or insufficient balance.
 * 4. Credit 'to' with $inc: { balance: amount }.
 * 5. If credit fails, attempt rollback: credit 'from' with $inc:{ balance: amount } (best-effort).
 */
app.post("/transfer", async (req, res) => {
  const { from, to, amount } = req.body || {};

  // Basic validation
  if (!from || !to || amount === undefined) {
    return res.status(400).json({ error: "Required fields: from, to, amount" });
  }
  if (from === to) return res.status(400).json({ error: "Sender and recipient must be different" });

  const value = Number(amount);
  if (!isFinite(value) || value <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  try {
    // Ensure recipient exists BEFORE debiting sender
    const recipient = await Account.findOne({ username: to });
    if (!recipient) return res.status(404).json({ error: "Recipient account not found" });

    // Atomically debit sender only if sufficient balance
    const debited = await Account.findOneAndUpdate(
      { username: from, balance: { $gte: value } }, // query ensures balance >= amount
      { $inc: { balance: -value } },
      { new: true } // return the updated sender doc
    );

    if (!debited) {
      // Could be: sender not found OR insufficient balance
      const senderExists = await Account.exists({ username: from });
      if (!senderExists) return res.status(404).json({ error: "Sender account not found" });
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Now credit the recipient
    const creditRes = await Account.updateOne({ username: to }, { $inc: { balance: value } });
    if (creditRes.matchedCount === 0) {
      // Extremely unlikely because we checked earlier, but handle just in case.
      // Attempt to rollback the debit (best-effort).
      try {
        await Account.updateOne({ username: from }, { $inc: { balance: value } });
        console.error("Credit failed, rollback attempted: sender refunded");
      } catch (rollbackErr) {
        console.error("Critical: credit failed and rollback also failed:", rollbackErr);
      }
      return res.status(500).json({ error: "Failed to credit recipient; sender refunded (if possible)" });
    }

    // Successful transfer
    const updatedSender = await Account.findOne({ username: from }, { _id: 0, username: 1, name: 1, balance: 1 });
    const updatedRecipient = await Account.findOne({ username: to }, { _id: 0, username: 1, name: 1, balance: 1 });

    return res.json({
      message: "Transfer successful",
      amount: value,
      from: accountView(updatedSender),
      to: accountView(updatedRecipient)
    });
  } catch (err) {
    console.error("Transfer error:", err);
    return res.status(500).json({ error: "Server error during transfer" });
  }
});

/* ---------- Start server ---------- */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log(" GET /accounts");
  console.log(" GET /accounts/:username");
  console.log(" POST /transfer   (body: {from, to, amount})");
});
