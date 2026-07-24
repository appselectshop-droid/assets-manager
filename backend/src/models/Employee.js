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

  // Cuenta de USO MÚLTIPLE (ej. "Auxiliar Devoluciones" para Safeguarding) —
  // pedido explícito del usuario (2026-07-24): antes de esto no había forma
  // de dar de alta un login compartido sin fingir que era un empleado real.
  // Sigue siendo un Employee normal a propósito (reutiliza TODO el mismo
  // login/activación del portal, ver employeeAuth.js) — lo único que cambia
  // es que se excluye de /employees/public-lookup (para que no aparezca como
  // sugerencia en Solicitar Cuenta/Recurso/Ingreso/Baja/Confirmar Envío) y
  // que Solicitar Cuenta y Solicitar Recurso la rechazan del lado del
  // servidor si de todos modos alguien la escribe a mano (ver
  // routes/accountRequests.js y routes/resourceRequests.js) — no tiene
  // sentido que una cuenta compartida pida un Gmail o un recurso personal.
  // Sí puede seguir entrando al portal y reportando/viendo tickets — para
  // eso existe.
  isSharedAccount: { type: Boolean, default: false },

  // Acceso al portal de empleado (Mesa de Ayuda → Mis Tickets) — nadie lo
  // da de alta a mano: cualquier empleado activo puede "activarse" solo la
  // primera vez que entra (correo corporativo o no. de empleado + una
  // contraseña que elige él mismo), ver routes/employeeAuth.js. `password`
  // null significa que todavía no se ha activado.
  password:      { type: String, default: null },
  passwordSetAt: { type: Date },

  // Quién puede ver/enviar "Alta de un nuevo ingreso" desde Mesa de Ayuda —
  // pedido explícito: solo RH (no cualquier empleado), para que Sistemas no
  // reciba solicitudes de ingreso de quien no debería mandarlas. El link
  // público (/solicitar-ingreso) sigue funcionando sin este permiso — a
  // propósito, por si RH lo comparte para que alguien más lo llene en su
  // nombre; esto solo controla si la tarjeta aparece en el menú.
  canManageOnboarding: { type: Boolean, default: false },

  // Mismo criterio que canManageOnboarding, pero para el flujo de BAJAS
  // (pedido explícito del usuario, sesión 2026-07-20): dos permisos
  // separados a propósito, para poder darle acceso a bajas a gente
  // distinta de quien maneja altas.
  // - canRequestOffboarding: el jefe que reporta que alguien de su equipo
  //   causa baja (puede ser de cualquier área/departamento, no solo RH).
  // - canManageOffboarding: quien de RH revisa esas solicitudes antes de
  //   avisarle a Sistemas para que libere los activos.
  canRequestOffboarding: { type: Boolean, default: false },
  canManageOffboarding:  { type: Boolean, default: false },

  // Firma escaneada reutilizable — hoy solo aplica a Felipe en Envíos (ver
  // routes/shipments.js): sube una foto de su hoja de recepción firmada UNA
  // vez desde el link público de confirmación, y de ahí en adelante se
  // estampa sola en el PDF de "Formato de Recepción" de todos sus envíos,
  // sin volver a pedírsela. Solo JPG/PNG (lo que pdfkit puede dibujar
  // directo con doc.image() sin conversión adicional).
  signatureImageData:     { type: Buffer },
  signatureImageMimeType: { type: String, default: '' },
  signatureUploadedAt:    { type: Date },

  // Notificaciones push del portal (Mesa de Ayuda) — pedido explícito del
  // usuario (2026-07-24): que le llegue un aviso tipo WhatsApp cuando
  // Sistemas responde su ticket, sin tener que tener la pestaña abierta. Un
  // array porque la misma persona puede tener el navegador suscrito desde
  // más de un dispositivo (celular Y computadora). Cada entrada es
  // exactamente lo que entrega `PushSubscription.toJSON()` del navegador —
  // ver routes/pushSubscriptions.js y utils/webPush.js.
  pushSubscriptions: [{
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
    },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
