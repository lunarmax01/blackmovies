const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  first_name: { type: String },
  username: { type: String }
});

module.exports = mongoose.model('User', userSchema);
