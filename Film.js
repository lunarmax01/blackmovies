// Film.js
const mongoose = require('mongoose');

const filmSchema = new mongoose.Schema({
  title: String,
  year: Number,
  genre: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Film', filmSchema);
