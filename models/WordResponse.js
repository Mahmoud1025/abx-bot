const mongoose = require('mongoose');

const wordResponseSchema = new mongoose.Schema({
  guildId: String,
  word: String,
  response: String,
  sendReply: Boolean,
});

module.exports = mongoose.model('WordResponse', wordResponseSchema);
