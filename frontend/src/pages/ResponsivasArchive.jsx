import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import styles from './ResponsivasArchive.module.css';

const TYPE_CONFIG = {
  activo:                { label: 'Activo',    icon: '💻', color: '#E8431A', bg: '#fff0ee' },
  cuenta_plataforma:     { label: 'Cuenta',     icon: '🔐', color: '#4338ca', bg: '#eef2ff' },
  cuenta_plataforma_erp: { label: 'Cuenta ERP', icon: '🏭', color: '#0f766e', bg: '#f0fdfa' },
  cuenta_gmail:          { label: 'Gmail',      icon: '📧', color: '#b91c1c', bg: '#fef2f2' },
};

export default function ResponsivasArchive() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = currentUser.role === 'admin';
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/responsiva-archive');
    setDocs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return docs.filter((d) => {
      const matchType = !filterType || d.type === filterType;
      const matchSearch = !q || [
        d.employeeName, d.employeeIdNum, d.relatedLabel, d.generatedByName, d.fileName,
      ].some((v) => v?.toLowerCase().includes(q));
      return matchType && matchSearch;
    });
  }, [docs, search, filterType]);

  const hasFilters = filterType || search;

  const clearFilters = () => {
    setFilterType('');
    setSearch('');
  };

  const download = async (doc) => {
    setDownloadingId(doc._id);
    try {
      const resp = await api.get(`/responsiva-archive/${doc._id}/download`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo descargar el documento');
    } finally {
      setDownloadingId(null);
    }
  };

  const confirmDeleteDoc = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/responsiva-archive/${confirmDelete._id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo eliminar el documento');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Responsivas generadas</h1>
          <p className={styles.subtitle}>
            {isAdmin
              ? 'Historial de todas las responsivas en PDF generadas — de activos y de cuentas de plataformas'
              : 'Historial de las responsivas en PDF que tú generaste'}
          </p>
        </div>
      </div>

      <div className={styles.filtersGrid}>
        <select className={styles.select} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="activo">Activos</option>
          <option value="cuenta_plataforma">Cuentas de Plataformas</option>
          <option value="cuenta_plataforma_erp">Cuentas de Plataformas ERP</option>
          <option value="cuenta_gmail">Cuentas Gmail</option>
        </select>
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          placeholder="Buscar por empleado, número de empleado, detalle o quién la generó..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.exportBar}>
        <span className={styles.resultCount}>
          {filtered.length} documento{filtered.length !== 1 ? 's' : ''}
        </span>
        {hasFilters && (
          <button className={styles.btnCancel} onClick={clearFilters}>✕ Limpiar filtros</button>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Empleado</th>
              <th>Detalle</th>
              <th>Generado por</th>
              <th>Fecha</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className={styles.empty}>
                {hasFilters ? 'Ningún documento coincide con los filtros actuales.' : 'Todavía no se ha generado ninguna responsiva.'}
              </td></tr>
            )}
            {filtered.map((d) => {
              const tc = TYPE_CONFIG[d.type] || { label: d.type, icon: '📄', color: '#555', bg: '#f0f0f0' };
              return (
                <tr key={d._id}>
                  <td>
                    <span className={styles.typeBadge} style={{ color: tc.color, background: tc.bg }}>
                      {tc.icon} {tc.label}
                    </span>
                  </td>
                  <td>
                    <span className={styles.empName}>{d.employeeName}</span>
                    {d.employeeIdNum && <span className={styles.empId}> #{d.employeeIdNum}</span>}
                  </td>
                  <td className={styles.detail}>{d.relatedLabel || '—'}</td>
                  <td className={styles.generatedBy}>{d.generatedByName || '—'}</td>
                  <td className={styles.date}>
                    {new Date(d.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        className={styles.btnDownload}
                        onClick={() => download(d)}
                        disabled={downloadingId === d._id}
                      >
                        {downloadingId === d._id ? '...' : '⬇ Descargar'}
                      </button>
                      {isAdmin && (
                        <button className={styles.btnDelete} onClick={() => setConfirmDelete(d)}>
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <div className={styles.overlay} onClick={() => !deleteLoading && setConfirmDelete(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>⚠️ Eliminar documento</h2>
              <button className={styles.closeBtn} onClick={() => setConfirmDelete(null)} disabled={deleteLoading}>✕</button>
            </div>

            <div className={styles.form}>
              <p className={styles.confirmText}>
                Vas a eliminar del archivo <strong>{confirmDelete.fileName}</strong> ({confirmDelete.employeeName}).
              </p>
              <p className={styles.confirmText}>
                Esto solo borra la copia guardada aquí — no se puede deshacer.
              </p>

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setConfirmDelete(null)} disabled={deleteLoading}>
                  Cancelar
                </button>
                <button type="button" className={styles.btnDanger} onClick={confirmDeleteDoc} disabled={deleteLoading}>
                  {deleteLoading ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
