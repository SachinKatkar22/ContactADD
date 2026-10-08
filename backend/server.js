const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const User = require('./models/User');
const ContactVault = require('./models/ContactVault');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const validUsername = (value) => typeof value === 'string' && /^[\p{L}\p{N}_.-]{3,40}$/u.test(value.trim());
const validPassword = (value) => typeof value === 'string' && value.length >= 8 && value.length <= 128;
const validContacts = (contacts) => Array.isArray(contacts) && contacts.length <= 5000 && contacts.every((contact) =>
  contact && typeof contact === 'object' && ['name', 'tel', 'email'].every((field) =>
    contact[field] === undefined || (Array.isArray(contact[field]) && contact[field].length <= 100 && contact[field].every((item) => typeof item === 'string' && item.length <= 500))));
const validRetentionDays = (days) => Number.isInteger(days) && days >= 1 && days <= 3650;

function issueToken(user) {
  return jwt.sign({ username: user.username }, process.env.JWT_SECRET, { subject: user.id, expiresIn: '7d' });
}

const requireAuth = (req, res, next) => {
  const match = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    req.auth = jwt.verify(match[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
  }
};

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

app.post('/api/register', asyncRoute(async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const { password } = req.body;
  if (!validUsername(username)) return res.status(400).json({ error: 'Username must be 3–40 letters, numbers, dots, dashes, or underscores.' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 8–128 characters.' });
  if (await User.exists({ username })) return res.status(409).json({ error: 'That username is already registered. Sign in instead or choose another username.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ username, passwordHash });
  res.status(201).json({ success: true, username: user.username, token: issueToken(user) });
}));

app.post('/api/login', asyncRoute(async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const { password } = req.body;
  if (!validUsername(username) || typeof password !== 'string') return res.status(400).json({ error: 'Enter your username and password.' });
  const user = await User.findOne({ username });
  const passwordMatches = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!passwordMatches) return res.status(401).json({ error: 'Incorrect username or password.' });
  res.json({ success: true, username: user.username, token: issueToken(user) });
}));

// --- INSTANT 12-DIGIT UTR VALIDATION & ACTIVATION ---
app.post('/api/pay/verify-utr', requireAuth, asyncRoute(async (req, res) => {
  const { retentionDays, utrNumber } = req.body;
  if (!validRetentionDays(retentionDays)) return res.status(400).json({ error: 'Choose a valid number of days (1 to 3650).' });
  
  const cleanUtr = typeof utrNumber === 'string' ? utrNumber.trim() : '';
  
  // Strict 12-digit UTR check
  const isTwelveDigits = /^\d{12}$/.test(cleanUtr);
  if (!isTwelveDigits) {
    return res.status(400).json({ error: 'Payment Failed: A valid UPI transaction ID (UTR) must be exactly 12 digits.' });
  }

  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
  const vault = await ContactVault.findOneAndUpdate(
    { userId: req.auth.sub },
    { $set: { expiresAt },$setOnInsert: { contacts: [] } },
    { upsert: true, new: true }
  );

  res.json({ success: true, expiresAt: vault.expiresAt, message: 'Payment verified successfully!' });
}));

app.post('/api/sync-contacts', requireAuth, asyncRoute(async (req, res) => {
  const { contacts } = req.body;
  const vaultCheck = await ContactVault.findOne({ userId: req.auth.sub });
  
  if (!vaultCheck || !vaultCheck.expiresAt || vaultCheck.expiresAt <= new Date()) {
    return res.status(403).json({ error: 'Your storage plan has expired. Please activate your vault to continue.' });
  }
  if (!validContacts(contacts)) return res.status(400).json({ error: 'Contacts must contain valid name, tel, and email lists.' });

  const vault = await ContactVault.findOneAndUpdate(
    { userId: req.auth.sub },
    {
      $set: {
        contacts: contacts.map((contact) => ({ name: contact.name || [], tel: contact.tel || [], email: contact.email || [] })),
      }
    },
    { new: true, runValidators: true },
  );
  res.json({ success: true, count: vault.contacts.length, expiresAt: vault.expiresAt });
}));

app.get('/api/get-contacts/:username', requireAuth, asyncRoute(async (req, res) => {
  if (req.params.username !== req.auth.username) return res.status(403).json({ error: 'You can only access your own contacts.' });
  
  const vault = await ContactVault.findOne({ userId: req.auth.sub });
  
  if (vault && vault.expiresAt && vault.expiresAt <= new Date()) {
    await ContactVault.deleteOne({ _id: vault._id });
    return res.json({ success: true, contacts: [], expiresAt: null, expired: true });
  }
  
  res.json({ success: true, contacts: vault?.contacts || [], expiresAt: vault?.expiresAt || null, expired: false });
}));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (error.code === 11000) return res.status(409).json({ error: 'That username is already registered. Sign in instead.' });
  res.status(error.status || 500).json({ error: 'The server could not complete the request. Please try again.' });
});

const PORT = process.env.PORT || 5000;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Set JWT_SECRET to a random value of at least 32 characters in the backend environment.');
}
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/contactSyncDB')
  .then(async () => {
    await Promise.all([User.createIndexes(), ContactVault.createIndexes()]);
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((error) => { console.error('MongoDB connection failed:', error.message); process.exitCode = 1; });