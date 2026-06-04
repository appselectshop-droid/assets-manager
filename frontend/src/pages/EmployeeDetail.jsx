import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ASSET_TYPE_LABELS, TYPE_ICONS } from '../config/assetFields';
import styles from './EmployeeDetail.module.css';
import pageStyles from './Page.module.css';

const TYPE_TABS = [
  { key: '',              label: 'Todos',             icon: '📋' },
  { key: 'laptop',        label: 'Laptop',            icon: '💻' },
  { key: 'escritorio',    label: 'Escritorio',        icon: '🖥️' },
  { key: 'all_in_one',    label: 'All-in-One',        icon: '🖥️' },
  { key: 'celular',       label: 'Celular',           icon: '📱' },
  { key: 'tablet',        label: 'Tablet',            icon: '📱' },
  { key: 'monitor',       label: 'Monitor',           icon: '🖥️' },
  { key: 'mouse',         label: 'Mouse',             icon: '🖱️' },
  { key: 'teclado',       label: 'Teclado',           icon: '⌨️' },
  { key: 'cargador_laptop',  label: 'Cargador Laptop',  icon: '🔌' },
  { key: 'cargador_celular', label: 'Cargador Celular', icon: '🔌' },
  { key: 'accesorio',     label: 'Accesorio',         icon: '🎧' },
  { key: 'otro',          label: 'Otro',              icon: '📦' },
];

function assetSearchText(a) {
  return [
    a.brand, a.model, a.serialNumber, a.inventoryTag,
    a.specs?.imei, a.specs?.imei2, a.specs?.lineNumber,
    a.specs?.carrier, a.specs?.contractNumber, a.specs?.businessName,
    a.specs?.processor, a.specs?.ram,
  ].filter(Boolean).join(' ').toLowerCase();
}

function AssetCard({ asset, selected, onSelect }) {
  const isPhone = ['celular', 'tablet'].includes(asset.type);
  const isComputo = ['laptop', 'escritorio', 'all_in_one'].includes(asset.type);

  return (
    <div
      className={`${styles.assetCard} ${selected ? styles.assetCardSelected : ''}`}
      onClick={() => onSelect(asset._id)}
    >
      <div className={styles.cardCheck}>
        {selected ? '✓' : ''}
      </div>
      <div className={styles.cardIcon}>{TYPE_ICONS[asset.type] || '📦'}</div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.cardType}>{ASSET_TYPE_LABELS[asset.type] || asset.type}</span>
          <span className={styles.cardBrand}>{asset.brand} {asset.model}</span>
        </div>
        <div className={styles.cardMeta}>
          {asset.serialNumber && <span>Serie: <strong>{asset.serialNumber}</strong></span>}
          {asset.inventoryTag  && <span>Inv: <strong>{asset.inventoryTag}</strong></span>}
          {isPhone && asset.specs?.imei       && <span>IMEI: <strong>{asset.specs.imei}</strong></span>}
          {isPhone && asset.specs?.lineNumber && <span>Línea: <strong>{asset.specs.lineNumber}</strong></span>}
          {isPhone && asset.specs?.carrier    && <span>{asset.specs.carrier}</span>}
          {isComputo && asset.specs?.processor && <span>{asset.specs.processor}</span>}
          {isComputo && asset.specs?.ram       && <span>{asset.specs.ram}</span>}
          {asset.specs?.contractNumber && <span>Contrato: <strong>{asset.specs.contractNumber}</strong></span>}
        </div>
      </div>
    </div>
  );
}

function AssignModal({ employee, onClose, onDone }) {
  const [allAssets, setAllAssets] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/assets?status=disponible').then(({ data }) => setAllAssets(data));
  }, []);

  const filtered = allAssets.filter((a) => {
    const matchType = !typeFilter || a.type === typeFilter;
    const matchSearch = !search || assetSearchText(a).includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    try {
      await api.post('/assignments', { employee: employee._id, asset: selected, notes });
      onDone();
      onClose();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al asignar');
    } finally {
      setLoading(false);
    }
  };

  const selectedAsset = allAssets.find((a) => a._id === selected);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.assignModal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.assignHeader}>
          <div>
            <h2 className={styles.assignTitle}>Asignar activo</h2>
            <p className={styles.assignSub}>Para: <strong>{employee.name}</strong></p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tipo tabs */}
        <div className={styles.typeTabs}>
          {TYPE_TABS.map((t) => {
            const count = t.key
              ? allAssets.filter((a) => a.type === t.key).length
              : allAssets.length;
            if (t.key && count === 0) return null;
            return (
              <button
                key={t.key}
                className={`${styles.typeTab} ${typeFilter === t.key ? styles.typeTabActive : ''}`}
                onClick={() => { setTypeFilter(t.key); setSelected(''); setSearch(''); }}
              >
                <span>{t.icon}</span>
                <span className={styles.typeTabLabel}>{t.label}</span>
                <span className={styles.typeTabCount}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Búsqueda */}
        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            placeholder="Buscar por serie, IMEI, línea, marca, modelo, contrato..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(''); }}
            autoFocus
          />
          {search && (
            <button className={styles.clearSearch} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Lista de activos */}
        <div className={styles.assetList}>
          {filtered.length === 0 ? (
            <div className={styles.emptyList}>
              <span>🔍</span>
              <p>Sin activos disponibles{typeFilter ? ` del tipo seleccionado` : ''}</p>
            </div>
          ) : (
            filtered.map((a) => (
              <AssetCard
                key={a._id}
                asset={a}
                selected={selected === a._id}
                onSelect={setSelected}
              />
            ))
          )}
        </div>

        {/* Footer con activo seleccionado + notas + botón */}
        <form onSubmit={handleAssign} className={styles.assignFooter}>
          {selectedAsset ? (
            <div className={styles.selectedSummary}>
              <span className={styles.selectedIcon}>{TYPE_ICONS[selectedAsset.type]}</span>
              <div>
                <p className={styles.selectedName}>{selectedAsset.brand} {selectedAsset.model}</p>
                <p className={styles.selectedSub}>
                  {ASSET_TYPE_LABELS[selectedAsset.type]}
                  {selectedAsset.serialNumber && ` · ${selectedAsset.serialNumber}`}
                </p>
              </div>
            </div>
          ) : (
            <p className={styles.noSelection}>Selecciona un activo de la lista</p>
          )}

          <div className={styles.footerRow}>
            <input
              className={styles.notesInput}
              placeholder="Notas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button
              type="submit"
              className={styles.btnAssign}
              disabled={!selected || loading}
            >
              {loading ? 'Asignando...' : 'Asignar'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [showAssign, setShowAssign] = useState(false);

  const load = async () => {
    const res = await api.get(`/employees/${id}`);
    setData(res.data);
  };

  useEffect(() => { load(); }, [id]);

  const handleReturn = async (assignmentId) => {
    if (!confirm('¿Regresar este activo?')) return;
    await api.delete(`/assignments/${assignmentId}`);
    load();
  };

  if (!data) return <p style={{ padding: '2rem', color: '#888' }}>Cargando...</p>;

  const { employee, assignments } = data;

  return (
    <div>
      <button className={pageStyles.btnBack} onClick={() => navigate('/employees')}>← Volver</button>

      <div className={pageStyles.detailHeader}>
        <div>
          <h1 className={pageStyles.title}>{employee.name}</h1>
          <p className={pageStyles.subtitle}>
            No. <strong>{employee.employeeId}</strong>
            {employee.businessName && ` · ${employee.businessName}`}
            {employee.office       && ` · ${employee.office}`}
            {employee.position     && ` · ${employee.position}`}
            {employee.area         && ` · ${employee.area}`}
            {employee.department   && ` · ${employee.department}`}
          </p>
          {(employee.corporateEmails?.length > 0) && (
            <p className={pageStyles.subtitle}>
              📧 {employee.corporateEmails.join(' · ')}
            </p>
          )}
          {(employee.gmailAccounts?.length > 0) && (
            <p className={pageStyles.subtitle}>
              📨 {employee.gmailAccounts.join(' · ')}
            </p>
          )}
        </div>
        <button className={pageStyles.btnPrimary} onClick={() => setShowAssign(true)}>
          + Asignar activo
        </button>
      </div>

      <h2 className={pageStyles.sectionTitle}>Activos asignados ({assignments.length})</h2>

      {assignments.length === 0 ? (
        <p className={pageStyles.empty}>Este empleado no tiene activos asignados.</p>
      ) : (
        <div className={pageStyles.tableWrap}>
          <table className={pageStyles.table}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Marca / Modelo</th>
                <th>No. Serie</th>
                <th>Etiqueta</th>
                <th>Fecha asignación</th>
                <th>Notas</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a._id}>
                  <td>
                    <span className={pageStyles.typeBadge}>
                      {TYPE_ICONS[a.asset.type]} {ASSET_TYPE_LABELS[a.asset.type] || a.asset.type}
                    </span>
                  </td>
                  <td><strong>{a.asset.brand}</strong> {a.asset.model}</td>
                  <td><code>{a.asset.serialNumber || '—'}</code></td>
                  <td>{a.asset.inventoryTag || '—'}</td>
                  <td>{new Date(a.assignedDate).toLocaleDateString('es-MX')}</td>
                  <td>{a.notes || '—'}</td>
                  <td>
                    <button className={pageStyles.btnDelete} onClick={() => handleReturn(a._id)}>
                      Regresar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAssign && (
        <AssignModal
          employee={employee}
          onClose={() => setShowAssign(false)}
          onDone={load}
        />
      )}
    </div>
  );
}
