import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { OFFICES } from '../config/assetFields';
import styles from './NetworkLayouts.module.css';

function UploadModal({ onClose, onDone }) {
  const [name, setName] = useState('');
  const [office, setOffice] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Falta el nombre del plano.'); return; }
    if (!file) { setError('Falta la imagen del plano.'); return; }
    setSaving(true);
    try {
      const data = new FormData();
      data.append('name', name);
      data.append('office', office);
      data.append('image', file);
      await api.post('/network-layouts', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo subir el plano');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>🛰️</span>
          <h2 className={styles.modalTitle}>Subir plano</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && <p className={styles.formError}>{error}</p>}
            <div className={styles.field}>
              <label>Nombre *</label>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Polanco - Piso 2" />
            </div>
            <div className={styles.field}>
              <label>Sucursal (opcional)</label>
              <select className={styles.input} value={office} onChange={(e) => setOffice(e.target.value)}>
                <option value="">Sin especificar</option>
                {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Imagen del plano *</label>
              <input className={styles.input} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Subiendo...' : 'Subir plano'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function LayoutCard({ layout, onOpen, onDelete }) {
  const [thumbUrl, setThumbUrl] = useState(null);

  useEffect(() => {
    let revoke;
    api.get(`/network-layouts/${layout._id}/image`, { responseType: 'blob' })
      .then((resp) => {
        const url = URL.createObjectURL(resp.data);
        revoke = url;
        setThumbUrl(url);
      })
      .catch(() => setThumbUrl(null));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [layout._id]);

  return (
    <div className={styles.card} onClick={onOpen}>
      {thumbUrl ? (
        <img className={styles.thumb} src={thumbUrl} alt={layout.name} />
      ) : (
        <div className={styles.thumbPlaceholder}>🗺️</div>
      )}
      <div className={styles.cardBody}>
        <p className={styles.cardName}>{layout.name}</p>
        <p className={styles.cardOffice}>{layout.office || 'Sin sucursal especificada'}</p>
        <div className={styles.cardFooter}>
          <span className={styles.cardCount}>🎯 {layout.deviceCount} dispositivo{layout.deviceCount !== 1 ? 's' : ''}</span>
          <button type="button" className={styles.cardDelete} onClick={(e) => { e.stopPropagation(); onDelete(layout); }}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

export default function NetworkLayouts() {
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/network-layouts');
    setLayouts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (layout) => {
    if (!confirm(`¿Eliminar el plano "${layout.name}" y todos sus dispositivos? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/network-layouts/${layout._id}`);
    load();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🛰️</div>
          <div>
            <h1 className={styles.title}>Planos de Red</h1>
            <p className={styles.subtitle}>Ubicación de cámaras, NVRs, APs y switches sobre el plano de cada sucursal.</p>
          </div>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowUpload(true)}>+ Subir plano</button>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : layouts.length === 0 ? (
        <div className={styles.empty}>
          <p>Todavía no hay ningún plano subido.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {layouts.map((l) => (
            <LayoutCard key={l._id} layout={l} onOpen={() => navigate(`/network-layouts/${l._id}`)} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load(); }} />
      )}
    </div>
  );
}
