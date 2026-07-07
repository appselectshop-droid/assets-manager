const mongoose = require('mongoose');

// Solicitudes de alta/modificación/baja de cuentas y accesos (Gmail,
// Plataformas de venta, ERP) que llegan desde la página pública de
// solicitud (frontend/src/pages/SolicitarCuenta.jsx, sin login) o desde el
// webhook de Power Automate/Microsoft Forms (ver routes/accountRequests.js).
// Cada una se revisa y aprueba/rechaza a mano antes de crear la cuenta real;
// nunca se crea nada automáticamente solo con lo que llega del formulario.
//
// Cuando alguien marca varios tipos a la vez en el formulario unificado
// (ej. Gmail + ERP), se crea UN documento por tipo — cada uno solo trae los
// datos de su propia sección — para que un revisor de ERP nunca vea los
// datos de la parte de Gmail/Plataformas de esa misma solicitud, y viceversa.
// `submissionGroup` solo sirve para saber que vinieron del mismo llenado.
const accountRequestSchema = new mongoose.Schema({
  requestType: { type: String, enum: ['gmail', 'platform', 'platform_erp'], required: true },
  actionType:  { type: String, enum: ['alta', 'modificacion', 'baja'], default: 'alta' },
  submissionGroup: { type: String, default: '' },

  // Datos del solicitante — tal cual vino del formulario, texto libre, puede
  // no coincidir exacto con un Employee real; se empareja a mano al aprobar.
  employeeName:    { type: String, required: true },
  employeeIdNum:   { type: String, default: '' },
  position:        { type: String, default: '' },
  department:      { type: String, default: '' },
  directManager:   { type: String, default: '' },
  currentEmail:    { type: String, default: '' },
  phone:           { type: String, default: '' },
  businessName:    { type: String, default: '' },

  platform:          { type: String, default: '' }, // no aplica si requestType === 'gmail'
  username:          { type: String, default: '' }, // correo/usuario deseado, si lo pidieron
  reason:            { type: String, default: '' }, // justificación / funciones
  validity:          { type: String, default: '' }, // vigencia (indefinida / fecha límite)
  referenceProfile:  { type: String, default: '' },
  requestedByEmail:  { type: String, default: '' }, // quién llenó el formulario

  // Específico Gmail
  gmailDisplayName:       { type: String, default: '' }, // nombre para mostrar
  gmailAccountKind:       { type: String, default: '' }, // individual / compartida
  gmailMainUse:           { type: String, default: '' },
  gmailRecoveryPhone:     { type: String, default: '' },
  gmailSharedResponsible: { type: String, default: '' },

  // Específico Plataformas de venta — una fila por plataforma marcada, cada
  // una con su propia tienda/cuenta y permisos.
  platforms: [{
    platform: String,
    store: String,
    permissions: {
      ventas:        Boolean,
      publicaciones: Boolean,
      inventarios:   Boolean,
      envio:         Boolean,
      pagos:         Boolean,
      facturas:      Boolean,
      admin:         Boolean,
    },
  }],

  // Específico ERP
  erpGroupCompanies: { type: String, default: '' },
  erpModules:         [String],
  erpModuleOther:     { type: String, default: '' },
  erpAccessLevel:     { type: String, default: '' },

  // Aceptación de las obligaciones/responsabilidades — sustituye a la firma
  // autógrafa en un formulario en línea (mensaje de datos, Art. 89/97 del
  // Código de Comercio).
  acceptedTerms: { type: Boolean, default: false },
  acceptedAt:    { type: Date },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} }, // payload completo, por si acaso

  status: { type: String, enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente' },

  // Se llenan al resolver la solicitud
  matchedEmployee:   { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  createdAccountId:  { type: mongoose.Schema.Types.ObjectId },
  reviewedByName:    { type: String, default: '' },
  reviewedAt:        { type: Date },
  rejectionReason:   { type: String, default: '' },

  // PDF de la solicitud tal como se llenó, generado al momento de enviarla
  // (igual que las Responsivas: se guarda en Mongo, no en disco, porque
  // Render no persiste el filesystem entre despliegues).
  pdfData:  { type: Buffer },
  fileName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('AccountRequest', accountRequestSchema);
