import { useEffect, useState } from 'react';
import api from '../services/api';
import styles from './Page.module.css';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// Avisos del carrusel de Mesa de Ayuda (2026-08-05) — pedido explícito del
// usuario: el panel de "Sistema de tickets" en la página de inicio del
// portal de empleado debe rotar también con avisos que Sistemas suba. Cada
// aviso es una imagen ya diseñada (Canva/PowerPoint, con el logo/estilo de
// la empresa) — no se reconstruye ese diseño con campos sueltos aquí, sería
// menos flexible; solo se administra el título (para identificarlo en esta
// lista) y si está activo/en qué orden aparece.
export default function Announcements() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/announcements').then(({ data }) => setItems(data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f && !ALLOWED_MIME.includes(f.type)) {
      setError('Solo se aceptan JPG, PNG o WEBP.');
      e.target.value = '';
      return;
    }
    setError('');
    setFile(f || null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) { setError('Elige la imagen del aviso.'); return; }
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('image', file);
      await api.post('/announcements', form);
      setTitle('');
      setFile(null);
      e.target.reset();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo subir el aviso.');
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (item) => {
    await api.put(`/announcements/${item._id}`, { active: !item.active });
    load();
  };

  const move = async (item, dir) => {
    const idx = items.findIndex((i) => i._id === item._id);
    const swapWith = items[idx + dir];
    if (!swapWith) return;
    await Promise.all([
      api.put(`/announcements/${item._id}`, { order: swapWith.order }),
      api.put(`/announcements/${swapWith._id}`, { order: item.order }),
    ]);
    load();
  };

  const handleDelete = async (item) => {
    if (!confirm(`¿Eliminar el aviso "${item.title || 'sin título'}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/announcements/${item._id}`);
    load();
  };

  return (
    <div>
      <div className={styles.detailHeader}>
        <div>
          <h1 className={styles.title}>Avisos de Mesa de Ayuda</h1>
          <p className={styles.subtitle}>
            Rotan junto con "Sistema de tickets" en la página de inicio del portal de empleado.
          </p>
        </div>
      </div>

      <form onSubmit={handleUpload} className={styles.form} style={{ marginBottom: '1.5rem', maxWidth: 480 }}>
        {error && <p className={styles.empty} style={{ color: '#dc2626' }}>{error}</p>}
        <div className={styles.field}>
          <label>Título (solo para identificarlo aquí, no se muestra en el carrusel)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. No tocar la bandeja de la impresora" />
        </div>
        <div className={styles.field}>
          <label>Imagen del aviso (JPG, PNG o WEBP)</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={uploading}>
          {uploading ? 'Subiendo...' : '+ Subir aviso'}
        </button>
      </form>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>Todavía no hay avisos.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Imagen</th><th>Título</th><th>Estatus</th><th>Orden</th><th>Acción</th></tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item._id}>
                  <td>
                    <img
                      src={`${api.defaults.baseURL}/announcements/${item._id}/image`}
                      alt={item.title || 'Aviso'}
                      style={{ width: 160, borderRadius: 6, display: 'block' }}
                    />
                  </td>
                  <td>{item.title || <span className={styles.textMuted}>Sin título</span>}</td>
                  <td>
                    <span className={styles.statusBadge} style={item.active
                      ? { color: '#16a34a', background: '#f0fdf4' }
                      : { color: '#999', background: '#f5f5f5' }}>
                      {item.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button className={styles.btnEdit} onClick={() => move(item, -1)} disabled={i === 0}>↑</button>{' '}
                    <button className={styles.btnEdit} onClick={() => move(item, 1)} disabled={i === items.length - 1}>↓</button>
                  </td>
                  <td className={styles.actions}>
                    <button className={styles.btnEdit} onClick={() => toggleActive(item)}>
                      {item.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(item)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
