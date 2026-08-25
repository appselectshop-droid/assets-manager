import { useEffect, useState } from 'react';
import api from '../services/api';
import { ASSET_TYPE_LABELS } from '../config/assetFields';
// Mismos estilos que Solicitudes de Cuentas — misma tabla/modal, contenido distinto
// (mismo criterio ya usado por CreateShipmentModal.jsx).
import styles from '../pages/AccountRequests.module.css';

// Duplicado a propósito del enum del backend (backend/src/models/AssetBaja.js)
// — mismo criterio que REASON_OPTIONS en CreateShipmentModal.jsx: el
// frontend no importa nada del backend, se mantienen sincronizados a mano.
export const REASON_OPTIONS = [
  'Venta',
  'Robo o extravío',
  'Descompuesto sin reparación posible',
  'Obsolescencia',
  'Otro',
];
export const CONDITION_OPTIONS = ['Bueno', 'Regular', 'Dañado'];
export const PAYMENT_METHOD_OPTIONS = ['Efectivo', 'Transferencia', 'Descuento vía nómina', 'Otro'];

const EMPTY_FORM = {
  asset: '',
  condition: 'Bueno', conditionNotes: '', dataWiped: false,
  reason: '', reasonOther: '',
  buyerType: '', buyerEmployee: '', buyerName: '', buyerIdNumber: '', buyerPhone: '', buyerAddress: '',
  saleAmount: '', paymentMethod: '', paymentMethodOther: '', paymentDate: '', saleReference: '',
};

export default function CreateAssetBajaModal({ onClose, onDone }) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Sin filtro de status: a diferencia de Envíos (solo activos ya
    // disponibles), aquí también se puede dar de baja un activo que sigue
    // asignado — el backend lo devuelve solo antes de marcarlo en baja.
    // Los que ya están en baja se excluyen aquí para no volver a elegirlos.
    api.get('/assets').then(({ data }) => setAssets(data.filter((a) => a.status !== 'baja')));
    api.get('/employees').then(({ data }) => setEmployees(data.filter((e) => e.active)));
  }, []);

  const isVenta = form.reason === 'Venta';

  const assetMatches = assetSearch.trim().length < 2 ? [] : assets.filter((a) => {
    const q = assetSearch.toLowerCase();
    return [a.brand, a.model, a.serialNumber, a.inventoryTag].filter(Boolean).some((v) => v.toLowerCase().includes(q));
  }).slice(0, 6);

  const pickAsset = (asset) => {
    setSelectedAsset(asset);
    setForm((f) => ({ ...f, asset: asset._id }));
    setAssetSearch('');
  };

  const empMatches = empSearch.trim().length < 2 ? [] : employees.filter((e) => e.name.toLowerCase().includes(empSearch.toLowerCase())).slice(0, 6);

  const pickBuyerEmployee = (emp) => {
    setForm((f) => ({ ...f, buyerEmployee: emp._id, buyerName: emp.name }));
    setEmpSearch(emp.name);
    setShowEmpDropdown(false);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    setError('');
    if (!form.asset) return setError('Elige el activo a dar de baja.');
    if (!form.reason) return setError('Selecciona el motivo de baja.');
    if (form.reason === 'Otro' && !form.reasonOther.trim()) return setError('Especifica el motivo.');
    if (isVenta) {
      if (!form.buyerType) return setError('Indica si el comprador es empleado o externo.');
      if (!form.buyerName.trim()) return setError('Falta el nombre del comprador.');
      if (!form.saleAmount || Number(form.saleAmount) <= 0) return setError('Falta el monto de venta.');
      if (!form.paymentMethod) return setError('Selecciona la forma de pago.');
    }
    setSaving(true);
    try {
      await api.post('/asset-bajas', {
        ...form,
        saleAmount: form.saleAmount ? Number(form.saleAmount) : undefined,
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo registrar la baja.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🗑️</span>
          <h2 className={styles.modalTitle}>Nueva baja de activo</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.field} style={{ position: 'relative' }}>
            <label>Activo a dar de baja</label>
            {!selectedAsset ? (
              <>
                <input className={styles.input} value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Busca por marca, modelo, serie o etiqueta..." />
                {assetMatches.length > 0 && (
                  <div className={styles.empDropdown}>
                    {assetMatches.map((a) => (
                      <button type="button" key={a._id} className={styles.empOption} onClick={() => pickAsset(a)}>
                        {ASSET_TYPE_LABELS[a.type] || a.type} — {[a.brand, a.model].filter(Boolean).join(' ')} — {a.serialNumber || a.inventoryTag || 'sin serie'}
                        {a.status === 'asignado' ? ' (asignado — se devuelve automáticamente)' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className={styles.matchedTag}>
                ✓ {ASSET_TYPE_LABELS[selectedAsset.type] || selectedAsset.type} — {[selectedAsset.brand, selectedAsset.model].filter(Boolean).join(' ')} — {selectedAsset.serialNumber || selectedAsset.inventoryTag || 'sin serie'}
                {' '}<button type="button" className={styles.btnCancel} style={{ marginLeft: '0.5rem', padding: '0.1rem 0.5rem' }} onClick={() => { setSelectedAsset(null); setForm((f) => ({ ...f, asset: '' })); }}>Cambiar</button>
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div className={styles.field}>
              <label>Condición del equipo</label>
              <select className={styles.input} value={form.condition} onChange={set('condition')}>
                {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.field} style={{ justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: '0.4rem', display: 'flex' }}>
              <input type="checkbox" id="dataWiped" checked={form.dataWiped} onChange={(e) => setForm((f) => ({ ...f, dataWiped: e.target.checked }))} />
              <label htmlFor="dataWiped" style={{ margin: 0 }}>Datos corporativos borrados / formateado</label>
            </div>
          </div>
          <div className={styles.field}>
            <label>Observaciones de la condición (opcional)</label>
            <textarea className={styles.input} value={form.conditionNotes} onChange={set('conditionNotes')} />
          </div>

          <div className={styles.field}>
            <label>Motivo de baja</label>
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

          {isVenta && (
            <>
              <div className={styles.field} style={{ marginTop: '0.5rem' }}>
                <label>Datos del comprador</label>
              </div>
              <div className={styles.field}>
                <label>Tipo de comprador</label>
                <select className={styles.input} value={form.buyerType} onChange={(e) => setForm((f) => ({ ...f, buyerType: e.target.value, buyerEmployee: '', buyerName: '' }))}>
                  <option value="">— Selecciona —</option>
                  <option value="empleado">Empleado de SelectShop</option>
                  <option value="externo">Externo / tercero</option>
                </select>
              </div>

              {form.buyerType === 'empleado' && (
                <div className={styles.field} style={{ position: 'relative' }}>
                  <label>Empleado comprador</label>
                  <input className={styles.input} value={empSearch || form.buyerName}
                    onChange={(e) => { setEmpSearch(e.target.value); setForm((f) => ({ ...f, buyerName: e.target.value, buyerEmployee: '' })); setShowEmpDropdown(true); }}
                    onFocus={() => setShowEmpDropdown(true)}
                    onBlur={() => setTimeout(() => setShowEmpDropdown(false), 150)}
                    placeholder="Nombre del empleado..." />
                  {showEmpDropdown && empMatches.length > 0 && (
                    <div className={styles.empDropdown}>
                      {empMatches.map((emp) => (
                        <button type="button" key={emp._id} className={styles.empOption} onMouseDown={(e) => e.preventDefault()} onClick={() => pickBuyerEmployee(emp)}>{emp.name}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {form.buyerType === 'externo' && (
                <>
                  <div className={styles.field}>
                    <label>Nombre completo</label>
                    <input className={styles.input} value={form.buyerName} onChange={set('buyerName')} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                    <div className={styles.field}>
                      <label>Identificación oficial No.</label>
                      <input className={styles.input} value={form.buyerIdNumber} onChange={set('buyerIdNumber')} />
                    </div>
                    <div className={styles.field}>
                      <label>Teléfono</label>
                      <input className={styles.input} value={form.buyerPhone} onChange={set('buyerPhone')} />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Domicilio</label>
                    <input className={styles.input} value={form.buyerAddress} onChange={set('buyerAddress')} />
                  </div>
                </>
              )}

              <div className={styles.field} style={{ marginTop: '0.5rem' }}>
                <label>Datos de la venta</label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div className={styles.field}>
                  <label>Monto de venta</label>
                  <input className={styles.input} type="number" min="0" step="0.01" value={form.saleAmount} onChange={set('saleAmount')} placeholder="$" />
                </div>
                <div className={styles.field}>
                  <label>Fecha de pago</label>
                  <input className={styles.input} type="date" value={form.paymentDate} onChange={set('paymentDate')} />
                </div>
              </div>
              <div className={styles.field}>
                <label>Forma de pago</label>
                <select className={styles.input} value={form.paymentMethod} onChange={set('paymentMethod')}>
                  <option value="">— Selecciona —</option>
                  {PAYMENT_METHOD_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {form.paymentMethod === 'Otro' && (
                <div className={styles.field}>
                  <label>Especifica la forma de pago</label>
                  <input className={styles.input} value={form.paymentMethodOther} onChange={set('paymentMethodOther')} />
                </div>
              )}
              <div className={styles.field}>
                <label>Referencia / comprobante (opcional)</label>
                <input className={styles.input} value={form.saleReference} onChange={set('saleReference')} />
              </div>
            </>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar baja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
