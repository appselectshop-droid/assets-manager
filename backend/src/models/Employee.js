const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeId:      { type: String,   required: true, unique: true },
  name:            { type: String,   required: true },
  businessName:    { type: String,   default: '' },
  office:          { type: String,   default: '' },
  position:        { type: String,   default: '' },
  area:            { type: String,   default: '' },
  department:      { type: String,   default: '' },
  phone:           { type: String,   default: '' },
  corporateEmails: { type: [String], default: [] },
  gmailAccounts:   { type: [String], default: [] },
  active:          { type: Boolean,  default: true },

  // Acceso al portal de empleado (Mesa de Ayuda → Mis Tickets) — nadie lo
  // da de alta a mano: cualquier empleado activo puede "activarse" solo la
  // primera vez que entra (correo corporativo o no. de empleado + una
  // contraseña que elige él mismo), ver routes/employeeAuth.js. `password`
  // null significa que todavía no se ha activado.
  password:      { type: String, default: null },
  passwordSetAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
