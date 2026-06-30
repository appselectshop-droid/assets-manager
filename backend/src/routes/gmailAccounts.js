const router = require('express').Router();
const GmailAccount = require('../models/GmailAccount');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const gmailManagerOnly = require('../middleware/gmailManagerOnly');
const logAction = require('../utils/audit');
const { encryptPassword, decryptPassword, generatePassword, suggestEmail } = require('../utils/gmailVault');

router.use(auth, gmailManagerOnly);

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

// Correos ya cargados en Employee.gmailAccounts[] (alta de empleado) que todavía
// no tienen contraseña guardada en el gestor.
router.get('/unregistered', async (req, res) => {
  try {
    const employees = await Employee.find({ gmailAccounts: { $exists: true, $ne: [] } })
      .select('employeeId name businessName office department gmailAccounts');
    const registeredEmails = new Set(await GmailAccount.find().distinct('email'));

    const pending = [];
    employees.forEach((emp) => {
      (emp.gmailAccounts || []).forEach((raw) => {
        const email = (raw || '').trim().toLowerCase();
        if (email && !registeredEmails.has(email)) {
          pending.push({
            email,
            employee: {
              _id: emp._id,
              employeeId: emp.employeeId,
              name: emp.name,
              businessName: emp.businessName,
              office: emp.office,
              department: emp.department,
            },
          });
        }
      });
    });
    res.json(pending);
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

// Da de alta en el gestor una cuenta que ya existía en Employee.gmailAccounts[]
// (creada antes de este módulo) capturando la contraseña real que ya tiene en Gmail.
router.post('/import', async (req, res) => {
  try {
    const { employeeId, email, password, notes } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });
    if (!password) return res.status(400).json({ message: 'Captura la contraseña actual de la cuenta' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const finalEmail = (email || '').trim().toLowerCase();
    if (!finalEmail.endsWith('@gmail.com')) {
      return res.status(400).json({ message: 'El correo debe terminar en @gmail.com' });
    }

    const dup = await GmailAccount.findOne({ email: finalEmail });
    if (dup) return res.status(400).json({ message: 'Ese correo ya está registrado en el gestor' });

    const account = await GmailAccount.create({
      employee: employee._id,
      email: finalEmail,
      passwordEncrypted: encryptPassword(password),
      notes: notes || '',
      createdByName: req.user.name,
    });

    if (!employee.gmailAccounts.includes(finalEmail)) {
      employee.gmailAccounts.push(finalEmail);
      await employee.save();
    }

    logAction(req.user, 'crear', 'cuenta_gmail', account._id, finalEmail, `Registró contraseña de cuenta Gmail existente de ${employee.name}`);

    const result = account.toObject();
    delete result.passwordEncrypted;
    result.password = password;
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
