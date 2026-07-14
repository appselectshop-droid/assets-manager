import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
// Mismos estilos que Solicitudes de Cuentas/Ingreso/Recursos — misma
// tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const EMPTY = { name: '', description: '', responsibleName: '', responsibleArea: '', notes: '' };

function EditModal({ app, onClose, onDone }) {
  const [form, setForm] = useState(app ? {
    name: app.name || '',
    description: app.description || '',
    responsibleName: app.responsibleName || '',
    responsibleArea: app.responsibleArea || '',
    notes: app.notes || '',
  } : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Falta el nombre de la aplicación.'); return; }
    setError('');
    setSaving(true);
    try {
      if (app) await api.put(`/internal-apps/${app._id}`, form);
      else await api.post('/internal-apps', form);
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la aplicación');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🗂️</span>
          <h2 className={styles.modalTitle}>{app ? 'Editar aplicación' : 'Nueva aplicación'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && <p className={styles.formError}>{error}</p>}
            <div className={styles.field}>
              <label>Nombre *</label>
              <input className={styles.input} value={form.name} onChange={set('name')} placeholder="Ej. Cuentas por Pagar" />
            </div>
            <div className={styles.field}>
              <label>Descripción</label>
              <textarea className={styles.input} rows={2} value={form.description} onChange={set('description')}
                placeholder="Ej. Sistema donde se capturan y autorizan pagos a proveedores" />
            </div>
            <div className={styles.field}>
              <label>Responsable (a quién avisar si el ticket es de esta app)</label>
              <input className={styles.input} value={form.responsibleName} onChange={set('responsibleName')} placeholder="Ej. Héctor Ramírez" />
            </div>
            <div className={styles.field}>
              <label>Área o departamento</label>
              <input className={styles.input} value={form.responsibleArea} onChange={set('responsibleArea')} placeholder="Ej. Costos y SKU" />
            </div>
            <div className={styles.field}>
              <label>Notas (opcional)</label>
              <textarea className={styles.input} rows={2} value={form.notes} onChange={set('notes')}
                placeholder="Cualquier otro detalle útil para Sistemas" />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Catálogo admin-only de aplicaciones internas — pedido del director de
// Finanzas para que Sistemas sepa a dónde enrutar un ticket de aplicativo
// (ver CHANGELOG). Todavía no se liga desde Reportar Ticket ni desde
// Tickets — es la pieza base del catálogo, esa conexión queda pendiente.
export default function InternalApps() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null); // null = cerrado, {} = crear, app = editar
  const [uploadingId, setUploadingId] = useState(null);
  const uploadTargetId = useRef(null);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/internal-apps');
    setApps(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (app) => {
    if (!confirm(`¿Eliminar "${app.name}" del catálogo? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/internal-apps/${app._id}`);
    load();
  };

  const openUploadPicker = (id) => {
    uploadTargetId.current = id;
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después
    const id = uploadTargetId.current;
    if (!file || !id) return;

    setUploadingId(id);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/internal-apps/${id}/document`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo subir el documento');
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoveDocument = async (app) => {
    if (!confirm(`¿Quitar la documentación de "${app.name}"? La aplicación se queda en el catálogo.`)) return;
    await api.delete(`/internal-apps/${app._id}/document`);
    load();
  };

  const handleViewDocument = async (app) => {
    try {
      const resp = await api.get(`/internal-apps/${app._id}/document`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: resp.headers['content-type'] });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo abrir el documento');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Aplicaciones Internas</h1>
          <p className={styles.subtitle}>
            Catálogo de aplicativos internos con su responsable y documentación — para saber hacia dónde
            enrutar un ticket cuando es sobre un sistema específico (ej. "Cuentas por Pagar", "Aplicativo de Ventas").
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setEditTarget({})}>+ Nueva aplicación</button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={handleFileChosen}
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Responsable</th>
              <th>Documentación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className={styles.empty}>Cargando...</td></tr>}
            {!loading && apps.length === 0 && (
              <tr><td colSpan={5} className={styles.empty}>Todavía no hay ninguna aplicación en el catálogo</td></tr>
            )}
            {apps.map((app) => (
              <tr key={app._id}>
                <td className={styles.nameCell}>{app.name}</td>
                <td className={styles.reasonCell}>{app.description || <span className={styles.muted}>—</span>}</td>
                <td>
                  {app.responsibleName || app.responsibleArea
                    ? [app.responsibleName, app.responsibleArea].filter(Boolean).join(' — ')
                    : <span className={styles.muted}>Sin asignar</span>}
                </td>
                <td>
                  {app.documentFileName ? (
                    <div className={styles.actions}>
                      <button className={styles.btnView} onClick={() => handleViewDocument(app)}>📎 Ver</button>
                      <button className={styles.btnView} onClick={() => openUploadPicker(app._id)} disabled={uploadingId === app._id}>
                        {uploadingId === app._id ? '...' : 'Reemplazar'}
                      </button>
                      <button className={styles.btnReject} onClick={() => handleRemoveDocument(app)}>Quitar</button>
                    </div>
                  ) : (
                    <button className={styles.btnView} onClick={() => openUploadPicker(app._id)} disabled={uploadingId === app._id}>
                      {uploadingId === app._id ? 'Subiendo...' : '📤 Subir documento'}
                    </button>
                  )}
                </td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.btnView} onClick={() => setEditTarget(app)}>Editar</button>
                    <button className={styles.btnReject} onClick={() => handleDelete(app)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTarget !== null && (
        <EditModal
          app={editTarget._id ? editTarget : null}
          onClose={() => setEditTarget(null)}
          onDone={() => { setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}
