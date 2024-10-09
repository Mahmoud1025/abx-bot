const mongoose = require('mongoose');

// تعريف المخطط لتخزين بيانات المستوى والـ XP والرتب
const levelSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // ID المستخدم
  level: { type: Number, default: 1 },  // مستوى المستخدم
  xp: { type: Number, default: 0 },  // نقاط XP الخاصة بالمستخدم
  rank: { type: Number }  // رتبة المستخدم بناءً على نقاط الـ XP
});

module.exports = mongoose.model('Level', levelSchema);
