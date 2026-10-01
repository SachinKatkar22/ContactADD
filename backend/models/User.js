const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
  passwordHash: { type: String, required: true },
});

module.exports = mongoose.model('User', userSchema);
