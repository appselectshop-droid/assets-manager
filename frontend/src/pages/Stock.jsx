import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { ASSET_TYPE_LABELS, ACCESSORY_TYPE_LABELS, TYPE_ICONS } from '../config/assetFields';
import styles from './Stock.module.css';

const ALL_LABELS = { ...ASSET_TYPE_LABELS, ...ACCESSORY_TYPE_LABELS };

const STOCK_SECTIONS = [
  { key: 'computo',      label: 'Equipo de cómputo', icon: '💻', types: ['laptop', 'escritorio', 'all_in_one'] },
  { key: 'moviles',      label: 'Móviles',            icon: '📱', types: ['celular', 'cargador_celular'] },
  { key: 'tablets',      label: 'Tablets',             icon: '📱', types: ['tablet'] },
  { key: 'perifericos',  label: 'Periféricos',         icon: '🖥️', types: ['monitor', 'mouse', 'teclado', 'cargador_laptop', 'kit_perifericos', 'audifonos', 'webcam', 'hub_usb'] },
  { key: 'impresion',    label: 'Impresión',            icon: '🖨️', types: ['impresora', 'escaner'] },
  { key: 'cables',       label: 'Cables',               icon: '🔌', types: ['cable'] },
  { key: 'consumibles',  label: 'Consumibles',          icon: '🧹', types: ['consumible'] },
  { key: 'herramientas', label: 'Herramientas',         icon: '🔧', types: ['herramienta'] },
  { key: 'otros',        label: 'Otros',                icon: '📦', types: ['accesorio', 'otro'] },
];

function buildGroups(assets) {
  const map = {};
  for (const a of assets) {
    if (a.status === 'baja') {
      // still count baja items but handle separately
    }
    let key = a.type;
    let label = ALL_LABELS[a.type] || a.type;

    if (a.type === 'cable') {
      const sub = a.specs?.cableType || 'Sin tipo';
      key = `cable__${sub}`;
      label = `Cable — ${sub}`;
    } else if (a.type === 'consumible') {
      const sub = a.specs?.consumibleType || 'Sin tipo';
      key = `consumible__${sub}`;
      label = sub;
    }

    if (!map[key]) {
      map[key] = {
        key, label,
        baseType: a.type,
        icon: TYPE_ICONS[a.type] || '📦',
        total: 0, disponible: 0, asignado: 0, baja: 0,
        available: [],
      };
    }
    map[key].total++;
    map[key][a.status] = (map[key][a.status] || 0) + 1;
    if (a.status === 'disponible') map[key].available.push(a);
  }
  return map;
}

function AssignModal({ group, onClose, onAssigned }) {
  const [selected, setSelected] = useState(group.available.length === 1 ? group.available[0] : null);
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [assignTo, setAssignTo] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data));
  }, []);

  const filteredEmps = employees.filter((e) => {
    const q = empSearch.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.employeeId.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const handleAssign = async () => {
    if (!selected || !assignTo) { setError('Selecciona un artículo y un empleado.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.put(`/assets/${selected._id}`, { status: 'asignado' });
      await api.post('/assignments', { employee: assignTo._id, asset: selected._id, notes });
      onAssigned();
    } catch (e) {
      setError(e.response?.data?.message || 'Error al asignar');
      setLoading(false);
    }
  };

  const itemLabel = (a) => {
    const name = [a.brand, a.model].filter(Boolean).join(' ') || ALL_LABELS[a.type] || a.type;
    const tag = a.inventoryTag || a.serialNumber;
    return { name, tag };
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{group.icon}</span>
          <h2 className={styles.modalTitle}>Asignar — {group.label}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}

          {/* Item selection */}
          <div>
            <span className={styles.modalLabel}>Artículo a asignar ({group.available.length} disponibles)</span>
            <div className={styles.itemList}>
              {group.available.map((a) => {
                const { name, tag } = itemLabel(a);
                const isActive = selected?._id === a._id;
                return (
                  <label
                    key={a._id}
                    className={`${styles.itemOption} ${isActive ? styles.itemOptionActive : ''}`}
                  >
                    <input
                      type="radio"
                      name="stockItem"
                      value={a._id}
                      checked={isActive}
                      onChange={() => setSelected(a)}
                      style={{ accentColor: '#E8431A', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1 }}>{name}</span>
                    {tag && <span className={styles.itemOptTag}>{tag}</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Employee selection */}
          <div>
            <span className={styles.modalLabel}>Empleado</span>
            {assignTo ? (
              <div className={styles.empSelected}>
                <div className={styles.empSelectedInfo}>
                  <span className={styles.empSelAvatar}>
                    {assignTo.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className={styles.empSelName}>{assignTo.name}</p>
                    <p className={styles.empSelSub}>
                      {assignTo.employeeId}{assignTo.department && ` · ${assignTo.department}`}
                    </p>
                  </div>
                </div>
                <button className={styles.btnChange} onClick={() => { setAssignTo(null); setEmpSearch(''); }}>
                  Cambiar
                </button>
              </div>
            ) : (
              <div className={styles.empSearchWrap}>
                <input
                  className={styles.empInput}
                  placeholder="Buscar por nombre, número de empleado..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  autoFocus
                />
                {empSearch && (
                  <div className={styles.empDropdown}>
                    {filteredEmps.length === 0 ? (
                      <p className={styles.empEmpty}>Sin resultados</p>
                    ) : (
                      filteredEmps.map((emp) => (
                        <button
                          key={emp._id}
                          type="button"
                          className={styles.empOption}
                          onClick={() => { setAssignTo(emp); setEmpSearch(''); }}
                        >
                          <span className={styles.empAvatar}>
                            {emp.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <p className={styles.empName}>{emp.name}</p>
                            <p className={styles.empSub}>
                              {emp.employeeId}{emp.department && ` · ${emp.department}`}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <span className={styles.modalLabel}>Notas (opcional)</span>
            <input
              className={styles.notesInput}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones sobre la entrega..."
            />
          </div>

          <div className={styles.modalActions}>
            <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button
              className={styles.btnPrimary}
              onClick={handleAssign}
              disabled={loading || !selected || !assignTo}
            >
              {loading ? 'Asignando...' : 'Confirmar asignación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Stock() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignGroup, setAssignGroup] = useState(null);

  const load = async () => {
    const { data } = await api.get('/assets');
    setAssets(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const groups = useMemo(() => buildGroups(assets), [assets]);

  const totalDisp = assets.filter((a) => a.status === 'disponible').length;
  const totalAsig = assets.filter((a) => a.status === 'asignado').length;
  const totalBaja = assets.filter((a) => a.status === 'baja').length;

  if (loading) return (
    <div className={styles.page}>
      <p style={{ color: '#aaa', marginTop: '2rem' }}>Cargando inventario...</p>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Disponibilidad de Inventario</h1>
        <p className={styles.pageSubtitle}>
          {assets.length} registros totales —{' '}
          <strong style={{ color: '#16a34a' }}>{totalDisp} disponibles</strong>
          {' · '}
          <strong style={{ color: '#d97706' }}>{totalAsig} asignados</strong>
          {' · '}
          <span style={{ color: '#dc2626' }}>{totalBaja} de baja</span>
        </p>
      </div>

      {STOCK_SECTIONS.map((section) => {
        const sectionGroups = Object.values(groups)
          .filter((g) => section.types.includes(g.baseType))
          .sort((a, b) => b.total - a.total);

        if (sectionGroups.length === 0) return null;

        const sectionDisp = sectionGroups.reduce((s, g) => s + g.disponible, 0);

        return (
          <div key={section.key} className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>{section.icon}</span>
              <span>{section.label}</span>
              <span className={styles.sectionDisp}>
                {sectionDisp > 0 ? `${sectionDisp} disponibles` : 'Sin stock disponible'}
              </span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tipo / Artículo</th>
                    <th style={{ textAlign: 'center' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Disponibles</th>
                    <th style={{ textAlign: 'center' }}>Asignados</th>
                    <th style={{ textAlign: 'center' }}>Baja</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sectionGroups.map((group) => (
                    <tr key={group.key} className={group.disponible === 0 ? styles.rowDimmed : ''}>
                      <td>
                        <div className={styles.typeCell}>
                          <span className={styles.typeIcon}>{group.icon}</span>
                          <span className={styles.typeLabel}>{group.label}</span>
                        </div>
                      </td>
                      <td className={styles.numCell}>
                        <span className={styles.numTotal}>{group.total}</span>
                      </td>
                      <td className={styles.numCell}>
                        <span className={group.disponible > 0 ? styles.numDisp : styles.numDispZero}>
                          {group.disponible}
                        </span>
                      </td>
                      <td className={styles.numCell}>
                        <span className={styles.numAsig}>{group.asignado || 0}</span>
                      </td>
                      <td className={styles.numCell}>
                        <span className={styles.numBaja}>{group.baja || 0}</span>
                      </td>
                      <td>
                        {group.disponible > 0 ? (
                          <button
                            className={styles.btnAssign}
                            onClick={() => setAssignGroup(group)}
                          >
                            Asignar
                          </button>
                        ) : (
                          <span className={styles.noStock}>Sin stock</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {assignGroup && (
        <AssignModal
          key={assignGroup.key}
          group={assignGroup}
          onClose={() => setAssignGroup(null)}
          onAssigned={() => { setAssignGroup(null); load(); }}
        />
      )}
    </div>
  );
}
