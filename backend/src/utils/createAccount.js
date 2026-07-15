const GmailAccount = require('../models/GmailAccount');
const PlatformAccount = require('../models/PlatformAccount');
const PlatformAccountErp = require('../models/PlatformAccountErp');
const logAction = require('./audit');
const { encryptPassword, generatePassword, suggestEmail } = require('./gmailVault');

// Misma lógica que ya usaban los POST '/' de gmailAccounts/platformAccounts/
// platformAccountsErp — extraída aquí para poder reutilizarla también desde
// la aprobación de Solicitudes de Cuentas sin duplicarla.

async function createGmailAccount(employee, { email, notes }, user) {
  let finalEmail = (email || '').trim().toLowerCase();
  if (!finalEmail) {
    const existing = await GmailAccount.find().distinct('email');
    finalEmail = suggestEmail(employee.name, existing);
  }
  if (!finalEmail.endsWith('@gmail.com')) {
    const err = new Error('El correo debe terminar en @gmail.com');
    err.status = 400;
    throw err;
  }
  const dup = await GmailAccount.findOne({ email: finalEmail });
  if (dup) {
    const err = new Error('Ese correo ya está registrado');
    err.status = 400;
    throw err;
  }

  const plainPassword = generatePassword();
  const account = await GmailAccount.create({
    employee: employee._id,
    email: finalEmail,
    passwordEncrypted: encryptPassword(plainPassword),
    notes: notes || '',
    createdByName: user.name,
  });

  if (!employee.gmailAccounts.includes(finalEmail)) {
    employee.gmailAccounts.push(finalEmail);
    await employee.save();
  }

  logAction(user, 'crear', 'cuenta_gmail', account._id, finalEmail, `Creó cuenta Gmail para ${employee.name}`);
  return { account, plainPassword };
}

// aliasOf (ver PlatformAccount.js) solo se guarda si de verdad apunta a una
// cuenta existente — un ObjectId inválido/inventado se ignora en silencio en
// vez de tronar la creación de la cuenta.
async function resolveAliasOf(aliasOf) {
  if (!aliasOf || !/^[a-f0-9]{24}$/i.test(aliasOf)) return null;
  const parent = await PlatformAccount.findById(aliasOf).select('_id');
  return parent ? parent._id : null;
}

async function createPlatformAccount(employee, { platform, username, notes, store, aliasOf }, user) {
  if (!platform?.trim()) { const err = new Error('Indica la plataforma'); err.status = 400; throw err; }
  if (!username?.trim()) { const err = new Error('Indica el correo o usuario de la cuenta'); err.status = 400; throw err; }
  const finalPlatform = platform.trim();
  const finalUsername = username.trim().toLowerCase();

  const dup = await PlatformAccount.findOne({ platform: finalPlatform, username: finalUsername });
  if (dup) { const err = new Error('Ya existe una cuenta con ese usuario en esa plataforma'); err.status = 400; throw err; }

  const plainPassword = generatePassword();
  const account = await PlatformAccount.create({
    employee: employee._id,
    platform: finalPlatform,
    username: finalUsername,
    passwordEncrypted: encryptPassword(plainPassword),
    notes: notes || '',
    createdByName: user.name,
    store: (store || '').trim(),
    aliasOf: await resolveAliasOf(aliasOf),
  });

  logAction(user, 'crear', 'cuenta_plataforma', account._id, `${finalPlatform}: ${finalUsername}`, `Creó cuenta de ${finalPlatform} para ${employee.name}`);
  return { account, plainPassword };
}

async function createPlatformErpAccount(employee, { platform, username, notes }, user) {
  if (!platform?.trim()) { const err = new Error('Indica la plataforma'); err.status = 400; throw err; }
  if (!username?.trim()) { const err = new Error('Indica el correo o usuario de la cuenta'); err.status = 400; throw err; }
  const finalPlatform = platform.trim();
  const finalUsername = username.trim().toLowerCase();

  const dup = await PlatformAccountErp.findOne({ platform: finalPlatform, username: finalUsername });
  if (dup) { const err = new Error('Ya existe una cuenta con ese usuario en esa plataforma'); err.status = 400; throw err; }

  const plainPassword = generatePassword();
  const account = await PlatformAccountErp.create({
    employee: employee._id,
    platform: finalPlatform,
    username: finalUsername,
    passwordEncrypted: encryptPassword(plainPassword),
    notes: notes || '',
    createdByName: user.name,
  });

  logAction(user, 'crear', 'cuenta_plataforma_erp', account._id, `${finalPlatform}: ${finalUsername}`, `Creó cuenta ERP de ${finalPlatform} para ${employee.name}`);
  return { account, plainPassword };
}

module.exports = { createGmailAccount, createPlatformAccount, createPlatformErpAccount, resolveAliasOf };
