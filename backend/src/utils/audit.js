const AuditLog = require('../models/AuditLog');

async function logAction(user, action, entity, entityId, entityName, details) {
  try {
    await AuditLog.create({
      userId:   user.id,
      userName: user.name,
      action,
      entity,
      entityId: String(entityId),
      entityName,
      details,
    });
  } catch (_) {
    // audit failure must never break the main operation
  }
}

module.exports = logAction;
