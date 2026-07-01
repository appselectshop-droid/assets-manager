const router = require('express').Router();
const ResponsivaArchive = require('../models/ResponsivaArchive');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

router.use(auth, adminOnly);

// Lista el histórico sin traer el binario del PDF (serían decenas de MB en una sola respuesta).
router.get('/', async (req, res) => {
  try {
    const docs = await ResponsivaArchive.find()
      .select('-pdfData')
      .populate('employee', 'employeeId name businessName office department active')
      .sort({ createdAt: -1 })
      .limit(1000);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const doc = await ResponsivaArchive.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    res.end(doc.pdfData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
