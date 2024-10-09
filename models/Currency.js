const mongoose = require('mongoose');

const currencySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  lastDaily: { type: Date, default: null } // حقل جديد لتتبع آخر مرة حصل فيها المستخدم على المكافأة اليومية
});

module.exports = mongoose.model('Currency', currencySchema);
