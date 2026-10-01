const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: [String], default: [] },
  tel: { type: [String], default: [] },
  email: { type: [String], default: [] },
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
  contacts: { type: [contactSchema], default: [] },
  isPaid: { type: Boolean, default: false },
  expiryDate: { type: Date, default: null },
});

module.exports = mongoose.model('User', userSchema);
