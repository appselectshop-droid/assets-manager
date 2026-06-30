const router = require('express').Router();
const GmailAccount = require('../models/GmailAccount');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');
const { encryptPassword, decryptPassword, generatePassword, suggestEmail } = require('../utils/gmailVault');

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  try {
    const accounts = await GmailAccount.find()
      .populate('employee', 'employeeId name businessName office department active')
      .sort({ createdAt: -1 });

    const data = accounts.map((a) => {
      const obj = a.toObject();
      delete obj.passwordEncrypted;
      obj.password = decryptPassword(a.passwordEncrypted);
      return obj;
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/suggest-email', async (req, res) => {
  try {
    const employee = await Employee.findById(req.query.employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });
    const existing = await GmailAccount.find().distinct('email');
    res.json({ email: suggestEmail(employee.name, existing) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { employeeId, email, notes } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    let finalEmail = (email || '').trim().toLowerCase();
    if (!finalEmail) {
      const existing = await GmailAccount.find().distinct('email');
      finalEmail = suggestEmail(employee.name, existing);
    }
    if (!finalEmail.endsWith('@gmail.com')) {
      return res.status(400).json({ message: 'El correo debe terminar en @gmail.com' });
    }

    const dup = await GmailAccount.findOne({ email: finalEmail });
    if (dup) return res.status(400).json({ message: 'Ese correo ya está registrado' });

    const plainPassword = generatePassword();
    const account = await GmailAccount.create({
      employee: employee._id,
      email: finalEmail,
      passwordEncrypted: encryptPassword(plainPassword),
      notes: notes || '',
      createdByName: req.user.name,
    });

    if (!employee.gmailAccounts.includes(finalEmail)) {
      employee.gmailAccounts.push(finalEmail);
      await employee.save();
    }

    logAction(req.user, 'crear', 'cuenta_gmail', account._id, finalEmail, `Creó cuenta Gmail para ${employee.name}`);

    const result = account.toObject();
    delete result.passwordEncrypted;
    result.password = plainPassword;
    result.employee = { _id: employee._id, employeeId: employee.employeeId, name: employee.name, businessName: employee.businessName, office: employee.office, department: employee.department };
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const account = await GmailAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    const { notes, status, regeneratePassword } = req.body;
    if (notes !== undefined) account.notes = notes;
    if (status !== undefined) account.status = status;

    let plainPassword;
    if (regeneratePassword) {
      plainPassword = generatePassword();
      account.passwordEncrypted = encryptPassword(plainPassword);
    }
    await account.save();

    logAction(
      req.user, 'editar', 'cuenta_gmail', account._id, account.email,
      regeneratePassword ? 'Regeneró la contraseña de la cuenta Gmail' : 'Editó datos de la cuenta Gmail'
    );

    const result = account.toObject();
    delete result.passwordEncrypted;
    if (plainPassword) result.password = plainPassword;
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const account = await GmailAccount.findByIdAndDelete(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    await Employee.updateOne({ _id: account.employee }, { $pull: { gmailAccounts: account.email } });

    logAction(req.user, 'eliminar', 'cuenta_gmail', account._id, account.email, 'Eliminó cuenta Gmail');
    res.json({ message: 'Cuenta eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
