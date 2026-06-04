const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeId:      { type: String,   required: true, unique: true },
  name:            { type: String,   required: true },
  businessName:    { type: String,   default: '' },
  office:          { type: String,   default: '' },
  position:        { type: String,   default: '' },
  area:            { type: String,   default: '' },
  department:      { type: String,   default: '' },
  corporateEmails: { type: [String], default: [] },
  gmailAccounts:   { type: [String], default: [] },
  active:          { type: Boolean,  default: true },
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
