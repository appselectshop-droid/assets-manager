const router = require('express').Router();
const PlatformAccount = require('../models/PlatformAccount');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const platformManagerOnly = require('../middleware/platformManagerOnly');
const logAction = require('../utils/audit');
const { encryptPassword, decryptPassword, generatePassword } = require('../utils/gmailVault');

router.use(auth, platformManagerOnly);

router.get('/', async (req, res) => {
  try {
    const accounts = await PlatformAccount.find()
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

router.post('/', async (req, res) => {
  try {
    const { employeeId, platform, username, notes } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });
    if (!platform?.trim()) return res.status(400).json({ message: 'Indica la plataforma' });
    if (!username?.trim()) return res.status(400).json({ message: 'Indica el correo o usuario de la cuenta' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const finalPlatform = platform.trim();
    const finalUsername = username.trim().toLowerCase();

    const dup = await PlatformAccount.findOne({ platform: finalPlatform, username: finalUsername });
    if (dup) return res.status(400).json({ message: 'Ya existe una cuenta con ese usuario en esa plataforma' });

    const plainPassword = generatePassword();
    const account = await PlatformAccount.create({
      employee: employee._id,
      platform: finalPlatform,
      username: finalUsername,
      passwordEncrypted: encryptPassword(plainPassword),
      notes: notes || '',
      createdByName: req.user.name,
    });

    logAction(req.user, 'crear', 'cuenta_plataforma', account._id, `${finalPlatform}: ${finalUsername}`, `Creó cuenta de ${finalPlatform} para ${employee.name}`);

    const result = account.toObject();
    delete result.passwordEncrypted;
    result.password = plainPassword;
    result.employee = { _id: employee._id, employeeId: employee.employeeId, name: employee.name, businessName: employee.businessName, office: employee.office, department: employee.department };
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Da de alta una cuenta que ya existía fuera del gestor (ej. se creó manualmente
// antes de tener esta página) capturando la contraseña real que ya tiene.
router.post('/import', async (req, res) => {
  try {
    const { employeeId, platform, username, password, notes } = req.body;
    if (!employeeId) return res.status(400).json({ message: 'Selecciona un empleado' });
    if (!platform?.trim()) return res.status(400).json({ message: 'Indica la plataforma' });
    if (!username?.trim()) return res.status(400).json({ message: 'Indica el correo o usuario de la cuenta' });
    if (!password) return res.status(400).json({ message: 'Captura la contraseña actual de la cuenta' });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });

    const finalPlatform = platform.trim();
    const finalUsername = username.trim().toLowerCase();

    const dup = await PlatformAccount.findOne({ platform: finalPlatform, username: finalUsername });
    if (dup) return res.status(400).json({ message: 'Ya existe una cuenta con ese usuario en esa plataforma' });

    const account = await PlatformAccount.create({
      employee: employee._id,
      platform: finalPlatform,
      username: finalUsername,
      passwordEncrypted: encryptPassword(password),
      notes: notes || '',
      createdByName: req.user.name,
    });

    logAction(req.user, 'crear', 'cuenta_plataforma', account._id, `${finalPlatform}: ${finalUsername}`, `Registró contraseña de cuenta existente de ${finalPlatform} para ${employee.name}`);

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
    const account = await PlatformAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    const { notes, status, regeneratePassword, manualPassword, unassign, employeeId } = req.body;
    if (notes !== undefined) account.notes = notes;
    if (status !== undefined) account.status = status;

    let plainPassword;
    if (regeneratePassword) {
      plainPassword = generatePassword();
      account.passwordEncrypted = encryptPassword(plainPassword);
    } else if (manualPassword) {
      if (account.passwordManuallySet) {
        return res.status(400).json({ message: 'Ya se corrigió la contraseña manualmente una vez; usa "Regenerar" para cambios futuros.' });
      }
      plainPassword = manualPassword;
      account.passwordEncrypted = encryptPassword(manualPassword);
      account.passwordManuallySet = true;
    }

    let auditAction = 'editar';
    let auditDetails = `Editó datos de la cuenta de ${account.platform}`;
    if (regeneratePassword) auditDetails = `Regeneró la contraseña de la cuenta de ${account.platform}`;
    if (manualPassword) auditDetails = `Corrigió manualmente la contraseña de la cuenta de ${account.platform} (única vez)`;

    if (unassign) {
      account.employee = null;
      auditAction = 'devolver';
      auditDetails = `Liberó la cuenta de ${account.platform} (quedó disponible para reciclar)`;
    } else if (employeeId) {
      const newEmployee = await Employee.findById(employeeId);
      if (!newEmployee) return res.status(404).json({ message: 'Empleado no encontrado' });
      account.employee = newEmployee._id;
      auditAction = 'asignar';
      auditDetails = `Asignó la cuenta de ${account.platform} a ${newEmployee.name}`;
    }

    await account.save();

    logAction(req.user, auditAction, 'cuenta_plataforma', account._id, `${account.platform}: ${account.username}`, auditDetails);

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
    const account = await PlatformAccount.findByIdAndDelete(req.params.id);
    if (!account) return res.status(404).json({ message: 'Cuenta no encontrada' });

    logAction(req.user, 'eliminar', 'cuenta_plataforma', account._id, `${account.platform}: ${account.username}`, `Eliminó cuenta de ${account.platform}`);
    res.json({ message: 'Cuenta eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
