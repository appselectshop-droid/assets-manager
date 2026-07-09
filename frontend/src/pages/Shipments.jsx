import { useEffect, useState } from 'react';
import api from '../services/api';
import { ASSET_TYPE_LABELS, OFFICES } from '../config/assetFields';
// Mismos estilos que Solicitudes de Cuentas — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

const REASON_OPTIONS = [
  'Mantenimiento / Reparación interna',
  'Reparación externa (garantía / proveedor)',
  'Préstamo temporal',
  'Baja definitiva / Desincorporación',
  'Otro',
];

const STATUS_CONFIG = {
  enviado:     { label: 'Enviado',     color: '#d97706', bg: '#fffbeb', icon: '📦' },
  en_transito: { label: 'En tránsito', color: '#2563eb', bg: '#eff6ff', icon: '🚚' },
  recibido:    { label: 'Recibido',    color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
};

const EMPTY_ITEM = { assetRef: '', type: '', description: '', serialOrImei: '', condition: '', itemStatus: '' };
const EMPTY_FORM = {
  requesterName: '', requesterDepartment: '', requesterPosition: '', requesterRef: '',
  originOffice: '', destinationOffice: '', recipientName: '',
  items: [{ ...EMPTY_ITEM }],
  reason: '', reasonOther: '', notes: '', returnDate: '',
};

function ItemRow({ item, onChange, onRemove, assets, canRemove }) {
  const [search, setSearch] = useState('');
  const matches = search.trim().length < 2 ? [] : assets.filter((a) => {
    const q = search.toLowerCase();
    return [a.brand, a.model, a.serialNumber, a.inventoryTag].filter(Boolean).some((v) => v.toLowerCase().includes(q));
  }).slice(0, 6);

  const pick = (asset) => {
    onChange({
      ...item,
      assetRef: asset._id,
      type: ASSET_TYPE_LABELS[asset.type] || asset.type,
      description: [asset.brand, asset.model].filter(Boolean).join(' '),
      serialOrImei: asset.serialNumber || asset.specs?.imei || '',
    });
    setSearch('');
  };

  const set = (key) => (e) => onChange({ ...item, [key]: e.target.value });

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: '0.75rem', marginBottom: '0.6rem', position: 'relative' }}>
      <div className={styles.field} style={{ marginBottom: '0.5rem' }}>
        <label>Buscar activo existente (opcional)</label>
        <input className={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Marca, modelo, serie o etiqueta..." />
        {matches.length > 0 && (
          <div className={styles.nameDropdown}>
            {matches.map((a) => (
              <button type="button" key={a._id} className={styles.nameOption} onClick={() => pick(a)}>
                {[a.brand, a.model].filter(Boolean).join(' ')} — {a.serialNumber || a.inventoryTag || 'sin serie'}
              </button>
            ))}
          </div>
        )}
        {item.assetRef && <p className={styles.hint} style={{ color: '#16a34a' }}>✓ Vinculado a un activo existente — al confirmarse la recepción, su ubicación se actualiza sola.</p>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
        <div className={styles.field}>
          <label>Tipo</label>
          <input className={styles.input} value={item.type} onChange={set('type')} placeholder="Laptop" />
        </div>
        <div className={styles.field}>
          <label>Descripción / Modelo</label>
          <input className={styles.input} value={item.description} onChange={set('description')} placeholder="Lenovo" />
        </div>
        <div className={styles.field}>
          <label>No. Serie / IMEI</label>
          <input className={styles.input} value={item.serialOrImei} onChange={set('serialOrImei')} />
        </div>
        <div className={styles.field}>
          <label>Condición</label>
          <select className={styles.input} value={item.condition} onChange={set('condition')}>
            <option value="">—</option>
            <option value="Buena">Buena</option>
            <option value="Regular">Regular</option>
            <option value="Mala">Mala</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Estado</label>
          <select className={styles.input} value={item.itemStatus} onChange={set('itemStatus')}>
            <option value="">—</option>
            <option value="Nueva">Nueva</option>
            <option value="Usada">Usada</option>
          </select>
        </div>
      </div>
      {canRemove && (
        <button type="button" className={styles.btnReject} style={{ marginTop: '0.5rem' }} onClick={onRemove}>Quitar equipo</button>
      )}
    </div>
  );
}

function CreateModal({ onClose, onDone }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [employees, setEmployees] = useState([]);
  const [assets, setAssets] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data.filter((e) => e.active)));
    api.get('/assets', { params: { status: 'disponible' } }).then(({ data }) => setAssets(data));
  }, []);

  const empMatches = empSearch.trim().length < 2 ? [] : employees.filter((e) => e.name.toLowerCase().includes(empSearch.toLowerCase())).slice(0, 6);

  const pickRequester = (emp) => {
    setForm((f) => ({ ...f, requesterName: emp.name, requesterDepartment: emp.department || '', requesterPosition: emp.position || '', requesterRef: emp._id }));
    setEmpSearch(emp.name);
    setShowEmpDropdown(false);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setItem = (idx) => (updated) => setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? updated : it)) }));
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const handleSubmit = async () => {
    setError('');
    if (!form.requesterName.trim()) return setError('Falta el nombre del solicitante.');
    if (!form.originOffice.trim()) return setError('Falta la sucursal de origen.');
    if (!form.destinationOffice.trim()) return setError('Falta la sucursal de destino.');
    if (!form.recipientName.trim()) return setError('Falta el destinatario.');
    if (!form.reason) return setError('Selecciona el motivo de salida.');
    if (form.reason === 'Otro' && !form.reasonOther.trim()) return setError('Especifica el motivo.');
    if (form.items.some((it) => !it.type.trim() && !it.description.trim())) {
      return setError('Completa al menos tipo o descripción de cada equipo.');
    }
    setSaving(true);
    try {
      const { data } = await api.post('/shipments', form);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear el envío.');
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    const link = `${window.location.origin}/confirmar-envio/${result.confirmToken}`;
    return (
      <div className={styles.overlay} onClick={onDone}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>✅ Envío creado — {result.folio}</h2>
            <button className={styles.closeBtn} onClick={onDone}>✕</button>
          </div>
          <div className={styles.modalBody}>
            <p className={styles.modalHint}>Comparte este link con {result.recipientName} (WhatsApp, correo, etc.) para que confirme la recepción cuando le llegue:</p>
            <div className={styles.passwordBox} style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>{link}</div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={() => navigator.clipboard.writeText(link)}>Copiar link</button>
              <button type="button" className={styles.btnPrimary} onClick={onDone}>Listo</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>📦</span>
          <h2 className={styles.modalTitle}>Nueva salida de equipo</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.field} style={{ position: 'relative' }}>
            <label>Solicitante</label>
            <input className={styles.input} value={empSearch || form.requesterName}
              onChange={(e) => { setEmpSearch(e.target.value); setForm((f) => ({ ...f, requesterName: e.target.value, requesterRef: '' })); setShowEmpDropdown(true); }}
              onFocus={() => setShowEmpDropdown(true)}
              onBlur={() => setTimeout(() => setShowEmpDropdown(false), 150)}
              placeholder="Nombre de quien solicita..." />
            {showEmpDropdown && empMatches.length > 0 && (
              <div className={styles.nameDropdown}>
                {empMatches.map((emp) => (
                  <button type="button" key={emp._id} className={styles.nameOption} onClick={() => pickRequester(emp)}>{emp.name}</button>
                ))}
              </div>
            )}
          </div>
          <div className={styles.field}>
            <label>Departamento / Puesto</label>
            <input className={styles.input} value={[form.requesterDepartment, form.requesterPosition].filter(Boolean).join(' · ')} readOnly placeholder="Se llena al elegir de la lista" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div className={styles.field}>
              <label>Sucursal origen</label>
              <input className={styles.input} list="offices-list" value={form.originOffice} onChange={set('originOffice')} placeholder="Corporativo Polanco" />
            </div>
            <div className={styles.field}>
              <label>Sucursal destino</label>
              <input className={styles.input} list="offices-list" value={form.destinationOffice} onChange={set('destinationOffice')} placeholder="Tepotzotlán II" />
            </div>
          </div>
          <datalist id="offices-list">
            {OFFICES.map((o) => <option key={o} value={o} />)}
          </datalist>

          <div className={styles.field}>
            <label>Destinatario (quién recibe)</label>
            <input className={styles.input} value={form.recipientName} onChange={set('recipientName')} placeholder="Felipe Gómez" />
          </div>

          <div className={styles.field} style={{ marginTop: '0.5rem' }}>
            <label>Equipos en salida</label>
          </div>
          {form.items.map((item, idx) => (
            <ItemRow key={idx} item={item} onChange={setItem(idx)} onRemove={() => removeItem(idx)} assets={assets} canRemove={form.items.length > 1} />
          ))}
          <button type="button" className={styles.btnCancel} onClick={addItem} style={{ marginBottom: '0.75rem' }}>+ Agregar otro equipo</button>

          <div className={styles.field}>
            <label>Motivo de salida</label>
            <select className={styles.input} value={form.reason} onChange={set('reason')}>
              <option value="">— Selecciona —</option>
              {REASON_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {form.reason === 'Otro' && (
            <div className={styles.field}>
              <label>Especifica el motivo</label>
              <input className={styles.input} value={form.reasonOther} onChange={set('reasonOther')} />
            </div>
          )}
          {(form.reason === 'Préstamo temporal' || form.reason === 'Mantenimiento / Reparación interna' || form.reason === 'Reparación externa (garantía / proveedor)') && (
            <div className={styles.field}>
              <label>Fecha de retorno esperada (opcional)</label>
              <input className={styles.input} type="date" value={form.returnDate} onChange={set('returnDate')} />
            </div>
          )}
          <div className={styles.field}>
            <label>Observaciones (opcional)</label>
            <textarea className={styles.input} value={form.notes} onChange={set('notes')} />
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>
              {saving ? 'Creando...' : 'Crear envío'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ shipment, onClose }) {
  const sc = STATUS_CONFIG[shipment.status];
  const link = `${window.location.origin}/confirmar-envio/${shipment.confirmToken}`;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{sc.icon}</span>
          <h2 className={styles.modalTitle}>{shipment.folio}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
          <p className={styles.modalHint} style={{ marginTop: '0.5rem' }}>
            {shipment.originOffice} → {shipment.destinationOffice} — Para: {shipment.recipientName}
          </p>
          <p className={styles.modalHint}>Solicitó: {shipment.requesterName}{shipment.requesterDepartment && ` · ${shipment.requesterDepartment}`}</p>
          <div className={styles.field}>
            <label>Motivo</label>
            <p>{shipment.reason}{shipment.reasonOther ? `: ${shipment.reasonOther}` : ''}</p>
          </div>
          <div className={styles.field}>
            <label>Equipos ({shipment.items.length})</label>
            {shipment.items.map((it, i) => (
              <p key={i} style={{ fontSize: '0.85rem', margin: '0.2rem 0' }}>
                {it.type} — {it.description} {it.serialOrImei && `(${it.serialOrImei})`} {it.condition && `· ${it.condition}`} {it.itemStatus && `· ${it.itemStatus}`}
              </p>
            ))}
          </div>
          {shipment.notes && (
            <div className={styles.field}>
              <label>Observaciones</label>
              <p>{shipment.notes}</p>
            </div>
          )}
          {shipment.returnDate && (
            <div className={styles.field}>
              <label>Fecha de retorno esperada</label>
              <p>{new Date(shipment.returnDate).toLocaleDateString('es-MX')}</p>
            </div>
          )}
          {shipment.status === 'recibido' && (
            <div className={styles.field}>
              <label>Confirmado por</label>
              <p>{shipment.receivedByName} — {new Date(shipment.receivedAt).toLocaleString('es-MX')}</p>
              {shipment.receivedNotes && <p style={{ fontSize: '0.82rem', color: '#666' }}>{shipment.receivedNotes}</p>}
            </div>
          )}
          {shipment.status !== 'recibido' && (
            <div className={styles.field}>
              <label>Link de confirmación (para el destinatario)</label>
              <div className={styles.passwordBox} style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{link}</div>
              <button type="button" className={styles.btnCancel} style={{ marginTop: '0.4rem' }} onClick={() => navigator.clipboard.writeText(link)}>Copiar link</button>
            </div>
          )}
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Shipments() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = async () => {
    setLoading(true);
    const params = filterStatus ? { status: filterStatus } : {};
    const { data } = await api.get('/shipments', { params });
    setShipments(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const markTransit = async (s) => {
    setBusyId(s._id);
    try {
      await api.put(`/shipments/${s._id}/transit`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo actualizar el estatus');
    } finally {
      setBusyId(null);
    }
  };

  const downloadPdf = async (s) => {
    setDownloadingId(s._id);
    try {
      const resp = await api.get(`/shipments/${s._id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Salida_${s.folio}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo descargar el PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (s) => {
    if (!confirm(`¿Eliminar el envío ${s.folio}? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/shipments/${s._id}`);
    load();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Envíos entre Sucursales</h1>
          <p className={styles.subtitle}>Salidas de equipo — rastreo tipo paquetería: enviado, en tránsito y recibido (confirmado por el destinatario).</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ Nueva salida</button>
      </div>

      <div className={styles.tabs}>
        {['', 'enviado', 'en_transito', 'recibido'].map((st) => (
          <button
            key={st || 'todos'}
            className={`${styles.tab} ${filterStatus === st ? styles.tabActive : ''}`}
            onClick={() => setFilterStatus(st)}
          >
            {st ? STATUS_CONFIG[st].label : 'Todos'}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Ruta</th>
              <th>Destinatario</th>
              <th>Equipos</th>
              <th>Motivo</th>
              <th>Fecha</th>
              <th>Estatus</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className={styles.empty}>Cargando...</td></tr>}
            {!loading && shipments.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>Sin envíos registrados</td></tr>
            )}
            {shipments.map((s) => {
              const sc = STATUS_CONFIG[s.status];
              return (
                <tr key={s._id}>
                  <td className={styles.nameCell}>{s.folio}</td>
                  <td>{s.originOffice} → {s.destinationOffice}</td>
                  <td>{s.recipientName}</td>
                  <td>{s.items.length} equipo{s.items.length !== 1 ? 's' : ''}</td>
                  <td className={styles.reasonCell}>{s.reason}</td>
                  <td className={styles.date}>{new Date(s.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td><span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.icon} {sc.label}</span></td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnView} onClick={() => setDetailTarget(s)}>Ver</button>
                      {s.status === 'enviado' && (
                        <button className={styles.btnApprove} onClick={() => markTransit(s)} disabled={busyId === s._id}>
                          {busyId === s._id ? '...' : 'Marcar en tránsito'}
                        </button>
                      )}
                      <button className={styles.btnView} onClick={() => downloadPdf(s)} disabled={downloadingId === s._id}>
                        {downloadingId === s._id ? '...' : '⬇ PDF'}
                      </button>
                      {currentUser.role === 'admin' && (
                        <button className={styles.btnReject} onClick={() => handleDelete(s)}>Eliminar</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />
      )}
      {detailTarget && (
        <DetailModal shipment={detailTarget} onClose={() => setDetailTarget(null)} />
      )}
    </div>
  );
}
