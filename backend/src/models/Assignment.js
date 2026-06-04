const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assignedDate: { type: Date, default: Date.now },
  returnDate: { type: Date },
  notes: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Assignment', assignmentSchema);
