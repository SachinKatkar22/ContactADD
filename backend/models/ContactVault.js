const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: [String], default: [] },
  tel: { type: [String], default: [] },
  email: { type: [String], default: [] },
}, { _id: false });

const contactVaultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  contacts: { type: [contactSchema], default: [] },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

module.exports = mongoose.model('ContactVault', contactVaultSchema);
