const router = require('express').Router();
const ResponsivaArchive = require('../models/ResponsivaArchive');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const responsivaViewerOnly = require('../middleware/responsivaViewerOnly');

router.use(auth, responsivaViewerOnly);

// Lista el histórico sin traer el binario del PDF (serían decenas de MB en una sola respuesta).
// Los admins ven todo; cualquier otro usuario con acceso solo ve lo que él mismo generó.
router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { generatedBy: req.user.id };
    const docs = await ResponsivaArchive.find(filter)
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
    if (req.user.role !== 'admin' && String(doc.generatedBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Solo puedes descargar responsivas que tú mismo generaste' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    res.end(doc.pdfData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Borrar del archivo queda reservado a administradores.
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const doc = await ResponsivaArchive.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
    res.json({ message: 'Documento eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
