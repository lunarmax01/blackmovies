// functions/searchFilms.js
const Film = require('./Film');

async function searchFilms(query) {
  const regex = new RegExp(query, 'i'); // Katta-kichik harflarga sezgir emas
  return await Film.find({ title: regex }).limit(10);
}

module.exports = searchFilms;
