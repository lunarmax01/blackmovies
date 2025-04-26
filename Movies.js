const mongoose = require('mongoose');

// Movie Schema
const movieSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true 
  },
  videoId: { 
    type: String, 
    required: false 
  },
  number: { 
    type: Number, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Model definition
const Movie = mongoose.model('Movie', movieSchema);

module.exports = Movie;
