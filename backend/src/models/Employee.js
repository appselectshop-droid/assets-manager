const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  department: { type: String, default: '' },
  position: { type: String, default: '' },
  email: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
