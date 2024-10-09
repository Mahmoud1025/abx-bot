const mongoose = require('mongoose');

const logConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  rolegive: String,
  banUnban: String,
  clear: String,
  kick: String,
  muteVoice: String,
  muteUnmute: String,
  lockUnlock: String,
  timeoutUntimeout: String,
  warn: String,
  warnRemove: String,
});

module.exports = mongoose.model('LogConfig', logConfigSchema);
