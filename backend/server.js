const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const validUsername = (value) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
const validContacts = (contacts) => Array.isArray(contacts) && contacts.length <= 5000 && contacts.every((contact) =>
  contact && typeof contact === 'object' && ['name', 'tel', 'email'].every((field) =>
    contact[field] === undefined || (Array.isArray(contact[field]) && contact[field].length <= 100 && contact[field].every((item) => typeof item === 'string' && item.length <= 500))));

app.post('/api/login', asyncRoute(async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  if (!validUsername(username)) return res.status(400).json({ error: 'Username is required (maximum 80 characters).' });

  let user = await User.findOne({ username });
  if (!user) user = await User.create({ username });
  res.json({ success: true, username: user.username, isPaid: user.isPaid, expiryDate: user.expiryDate, isExpired: false });
}));

// No payment provider is configured. Keep the legacy route but never grant access for a fake payment.
app.post('/api/pay-and-set-days', (req, res) => {
  res.status(501).json({ error: 'Online payments are not configured. No payment was taken and no plan was activated.' });
});

app.post('/api/sync-contacts', asyncRoute(async (req, res) => {
  const { username, contacts } = req.body;
  if (!validUsername(username)) return res.status(400).json({ error: 'A valid username is required.' });
  if (!validContacts(contacts)) return res.status(400).json({ error: 'Contacts must contain valid name, tel, and email lists.' });
  const user = await User.findOne({ username: username.trim() });
  if (!user) return res.status(404).json({ error: 'User not found. Sign in before syncing contacts.' });
  user.contacts = contacts.map((contact) => ({
    name: contact.name || [], tel: contact.tel || [], email: contact.email || [],
  }));
  await user.save();
  res.json({ success: true, count: user.contacts.length });
}));

app.get('/api/get-contacts/:username', asyncRoute(async (req, res) => {
  if (!validUsername(req.params.username)) return res.status(400).json({ error: 'A valid username is required.' });
  const user = await User.findOne({ username: req.params.username.trim() });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true, contacts: user.contacts, expiryDate: user.expiryDate });
}));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: 'The server could not complete the request. Please try again.' });
});

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://yt:ZRuWrQ4eR787tgqP@cluster1.aicnqwb.mongodb.net/contactSyncDB')
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch((error) => { console.error('MongoDB connection failed:', error.message); process.exitCode = 1; });
