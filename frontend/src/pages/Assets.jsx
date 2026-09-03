import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../services/api';
import {
  ASSET_TYPE_LABELS, ASSET_GROUPS, SPECS_FIELDS,
  STATUS_CONFIG, TYPE_ICONS,
} from '../config/assetFields';
import { IMPORT_CATEGORIES } from '../config/importCategories';
import ImportModal from '../components/ImportModal';
import useEmployeeCatalog from '../hooks/useEmployeeCatalog';
import { matchesSearch, specsValues } from '../utils/search';
import styles from './Assets.module.css';

const SERIAL_CHECK_TYPES = ['laptop', 'escritorio', 'all_in_one', 'celular', 'tablet'];
// linea_telefonica (2026-08-04) no entra a SERIAL_CHECK_TYPES — no tiene
// número de serie, solo línea — pero sí a PHONE_TYPES para que su
// lineNumber se revise contra duplicados junto con celular/tablet.
const PHONE_TYPES = ['celular', 'linea_telefonica', 'tablet'];

const COMMON_EMPTY = {
  type: 'laptop', brand: '', model: '', serialNumber: '',
  inventoryTag: '', status: 'disponible', purchaseDate: '', cost: '', notes: '', location: '',
  companyOwned: true, isTelemetry: false,
};

const fmtMoney = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function buildEmptySpecs(type) {
  const fields = SPECS_FIELDS[type] || [];
  const specs = {};
  fields.forEach((f) => {
    specs[f.key] = f.type === 'boolean' ? false : '';
  });
  return specs;
}

function SpecsField({ field, value, onChange }) {
  if (field.type === 'boolean') {
    return (
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(field.key, e.target.checked)}
          className={styles.checkbox}
        />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <div className={`${styles.field} ${field.col === 2 ? styles.colSpan2 : ''}`}>
        <label>{field.label}</label>
        <select value={value || ''} onChange={(e) => onChange(field.key, e.target.value)}>
          <option value="">Seleccionar...</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div className={`${styles.field} ${field.col === 2 ? styles.colSpan2 : ''}`}>
      <label>{field.label}</label>
      <input
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
      />
    </div>
  );
}

function AssetModal({ editing, initial, onClose, onSaved, allAssets = [] }) {
  const navigate = useNavigate();
  const OFFICES = useEmployeeCatalog('oficina');
  const initCommon = () => {
    if (!editing || !initial) return COMMON_EMPTY;
    return {
      type:         initial.type         || 'laptop',
      brand:        initial.brand        || '',
      model:        initial.model        || '',
      serialNumber: initial.serialNumber || '',
      inventoryTag: initial.inventoryTag || '',
      status:       initial.status       || 'disponible',
      purchaseDate: initial.purchaseDate ? String(initial.purchaseDate).slice(0, 10) : '',
      cost:         initial.cost != null ? String(initial.cost) : '',
      notes:        initial.notes        || '',
      location:     initial.location     || '',
      companyOwned: initial.companyOwned !== false,
      isTelemetry:  !!initial.isTelemetry,
    };
  };

  const initSpecs = () => {
    if (!editing || !initial) return buildEmptySpecs('laptop');
    const type = initial.type || 'laptop';
    return { ...buildEmptySpecs(type), ...(initial.specs || {}) };
  };

  const [common, setCommon] = useState(initCommon);
  const [specs, setSpecs] = useState(initSpecs);
  const [error, setError] = useState('');

  const [wantAssign, setWantAssign] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [assignTo, setAssignTo] = useState(null);
  const [assignNotes, setAssignNotes] = useState('');
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [assignmentLoaded, setAssignmentLoaded] = useState(!editing);
  // Cuántos tickets tiene este activo específico — por serie, no por quién lo
  // tenga asignado ahora (eso puede cambiar). Silencioso si el usuario no
  // administra Tickets (no todo el que edita Activos es admin).
  const [ticketCount, setTicketCount] = useState(null);

  // Modo de seguimiento — pedido explícito del usuario (2026-09-03). Solo se
  // elige al registrar (!editing); una vez creado, el tipo de registro
  // (único vs. lote) queda fijo — convertir uno en otro sería una migración
  // aparte, no algo que se decida reabriendo el modal de edición.
  const [trackingMode, setTrackingMode] = useState('serial');
  const [quantity, setQuantity] = useState(() => (editing && initial?.stockTotal != null ? String(initial.stockTotal) : ''));
  const [serials, setSerials] = useState([]);
  const [serialInput, setSerialInput] = useState('');
  const serialInputRef = useRef(null);
  // Aviso visual de "listo para escanear" — pedido explícito del usuario
  // (2026-09-03): un lector físico solo manda el código a donde esté el
  // cursor (funciona como teclado), así que conviene que se note a simple
  // vista cuándo el campo tiene el foco antes de disparar el lector.
  const [serialInputFocused, setSerialInputFocused] = useState(false);
  // Si ya es un activo de lote (editar), no hay botones que elegir — se
  // deriva directo del dato real (`stockTotal != null`), igual que ya hace
  // el backend en assignments.js.
  const isLoteAsset = editing ? (initial?.stockTotal != null) : (trackingMode === 'lote');

  const handleTrackingModeChange = (mode) => {
    setTrackingMode(mode);
    if (mode === 'lote') { setSerials([]); setSerialInput(''); }
  };

  const commitSerialInput = () => {
    const val = serialInput.trim();
    if (!val) return;
    setSerials((prev) => (prev.includes(val) ? prev : [...prev, val]));
    setSerialInput('');
    serialInputRef.current?.focus();
  };
  // Un lector de código de barras funciona como teclado y termina cada
  // lectura con Enter — así se va llenando la tabla de series sin tener que
  // dar de alta un activo a la vez cuando son del mismo tipo/modelo.
  const handleSerialKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitSerialInput(); }
  };
  const removeSerial = (sn) => setSerials((prev) => prev.filter((s) => s !== sn));

  // Foto del activo o lote — pedido explícito del usuario (2026-09-03).
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState(null);

  useEffect(() => {
    if (!editing || !initial?.photoMimeType) return;
    let url;
    api.get(`/assets/${editing}/photo`, { responseType: 'blob' })
      .then(({ data }) => { url = URL.createObjectURL(data); setExistingPhotoUrl(url); })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [editing, initial]);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data.filter((e) => e.active)));
    if (editing) {
      api.get('/assignments').then(({ data }) => {
        const curr = data.find((a) => (a.asset?._id || a.asset) === editing);
        if (curr) {
          setCurrentAssignment(curr);
          setAssignTo(curr.employee);
          setAssignNotes(curr.notes || '');
          setWantAssign(true);
        }
        setAssignmentLoaded(true);
      });
      api.get('/tickets', { params: { assetRef: editing } })
        .then(({ data }) => setTicketCount(data.length))
        .catch(() => setTicketCount(null));
    }
  }, [editing]);

  const filteredEmps = employees.filter((e) => {
    const q = empSearch.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.employeeId.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const handleTypeChange = (type) => {
    setCommon((c) => ({ ...c, type }));
    setSpecs(buildEmptySpecs(type));
  };

  const setSpec = (key, val) => setSpecs((s) => ({ ...s, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!editing && trackingMode === 'serial' && serials.length === 0) {
      setError('Agrega al menos un número de serie (o cambia a "Por cantidad/lote").');
      return;
    }
    try {
      const payload = {
        ...common,
        serialNumber: isLoteAsset ? '' : common.serialNumber,
        stockTotal: isLoteAsset ? (quantity !== '' ? Number(quantity) : null) : null,
        cost: common.cost !== '' ? Number(common.cost) : null,
        specs,
        status: wantAssign && assignTo
          ? 'asignado'
          : (editing && currentAssignment && !wantAssign ? 'disponible' : common.status),
      };
      let assetId;
      let createdIds = [];
      if (editing) {
        const { data } = await api.put(`/assets/${editing}`, payload);
        assetId = data._id;
        createdIds = [assetId];
        if (currentAssignment) {
          if (!wantAssign) {
            await api.delete(`/assignments/${currentAssignment._id}`);
          } else if (assignTo) {
            const currentEmpId = currentAssignment.employee?._id || currentAssignment.employee;
            if (assignTo._id !== currentEmpId) {
              await api.delete(`/assignments/${currentAssignment._id}`);
              await api.post('/assignments', { employee: assignTo._id, asset: assetId, notes: assignNotes });
            } else {
              await api.put(`/assignments/${currentAssignment._id}`, { notes: assignNotes });
            }
          }
        } else if (wantAssign && assignTo) {
          await api.post('/assignments', { employee: assignTo._id, asset: assetId, notes: assignNotes });
        }
      } else if (trackingMode === 'serial') {
        // Alta por lote de series (una o varias) — cada serie se crea como
        // un activo real independiente (ver POST /assets/batch).
        const { serialNumber, stockTotal, ...batchCommon } = payload;
        const { data } = await api.post('/assets/batch', { ...batchCommon, serialNumbers: serials });
        createdIds = data.map((a) => a._id);
        assetId = createdIds[0];
        if (wantAssign && assignTo && createdIds.length === 1) {
          await api.post('/assignments', { employee: assignTo._id, asset: assetId, notes: assignNotes });
        }
      } else {
        const { data } = await api.post('/assets', payload);
        assetId = data._id;
        createdIds = [assetId];
        if (wantAssign && assignTo) {
          await api.post('/assignments', { employee: assignTo._id, asset: assetId, notes: assignNotes });
        }
      }

      if (photoFile) {
        const fd = new FormData();
        fd.append('photo', photoFile);
        for (const id of createdIds) {
          await api.post(`/assets/${id}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }

      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  };

  const duplicateAsset = useMemo(() => {
    const sn = common.serialNumber.trim();
    if (!sn || !SERIAL_CHECK_TYPES.includes(common.type)) return null;
    return allAssets.find((a) => SERIAL_CHECK_TYPES.includes(a.type) && a.serialNumber === sn && a._id !== editing) || null;
  }, [common.serialNumber, common.type, allAssets, editing]);

  const duplicateSerials = useMemo(() => {
    if (editing || trackingMode !== 'serial' || !SERIAL_CHECK_TYPES.includes(common.type)) return [];
    const existingSns = new Set(
      allAssets.filter((a) => SERIAL_CHECK_TYPES.includes(a.type)).map((a) => a.serialNumber)
    );
    return serials.filter((sn) => existingSns.has(sn));
  }, [serials, editing, trackingMode, common.type, allAssets]);

  const duplicatePhone = useMemo(() => {
    if (!PHONE_TYPES.includes(common.type)) return null;
    const ln = specs.lineNumber?.trim();
    if (!ln) return null;
    return allAssets.find((a) => PHONE_TYPES.includes(a.type) && a.specs?.lineNumber?.trim() === ln && a._id !== editing) || null;
  }, [specs.lineNumber, common.type, allAssets, editing]);

  const specFields = SPECS_FIELDS[common.type] || [];
  const boolFields = specFields.filter((f) => f.type === 'boolean');
  const otherFields = specFields.filter((f) => f.type !== 'boolean');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{TYPE_ICONS[common.type]}</span>
          <h2 className={styles.modalTitle}>{editing ? 'Editar activo' : 'Registrar activo'}</h2>
          {editing && ticketCount !== null && (
            <button
              type="button"
              className={styles.ticketBadge}
              title="Ver tickets de este activo"
              onClick={() => navigate(`/tickets?assetId=${editing}`)}
            >
              🎫 {ticketCount} ticket{ticketCount !== 1 ? 's' : ''}
            </button>
          )}
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <p className={styles.formError}>{error}</p>}
          {/* Tipo */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Tipo de activo</p>
            <div className={styles.typeGrid}>
              {ASSET_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className={styles.groupLabel}>{g.icon} {g.label}</p>
                  <div className={styles.typeBtns}>
                    {g.types.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`${styles.typeBtn} ${common.type === t ? styles.typeBtnActive : ''}`}
                        onClick={() => handleTypeChange(t)}
                      >
                        {ASSET_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Datos generales */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Datos generales</p>
            <div className={styles.grid}>
              {!editing && (
                <div className={`${styles.field} ${styles.colSpan2}`}>
                  <label>Modo de seguimiento</label>
                  <div className={styles.typeBtns}>
                    <button
                      type="button"
                      className={`${styles.typeBtn} ${trackingMode === 'serial' ? styles.typeBtnActive : ''}`}
                      onClick={() => handleTrackingModeChange('serial')}
                    >
                      Único por número de serie
                    </button>
                    <button
                      type="button"
                      className={`${styles.typeBtn} ${trackingMode === 'lote' ? styles.typeBtnActive : ''}`}
                      onClick={() => handleTrackingModeChange('lote')}
                    >
                      Por cantidad / lote
                    </button>
                  </div>
                </div>
              )}
              <div className={styles.field}>
                <label>Marca</label>
                <input value={common.brand} onChange={(e) => setCommon({ ...common, brand: e.target.value })} placeholder="Dell / Apple / HP..." />
              </div>
              <div className={styles.field}>
                <label>Modelo</label>
                <input value={common.model} onChange={(e) => setCommon({ ...common, model: e.target.value })} placeholder="Latitude 5540 / iPhone 14..." />
              </div>
              {isLoteAsset ? (
                <div className={styles.field}>
                  <label>Cantidad</label>
                  <input
                    type="number" min="1" step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Ej. 25"
                  />
                </div>
              ) : editing ? (
                <div className={styles.field}>
                  <label>No. de serie</label>
                  <input
                    value={common.serialNumber}
                    onChange={(e) => setCommon({ ...common, serialNumber: e.target.value })}
                    placeholder="SN12345678"
                    className={duplicateAsset ? styles.inputWarning : ''}
                  />
                  {duplicateAsset && (
                    <p className={styles.fieldWarning}>
                      ⚠️ Número de serie duplicado — ya existe: <strong>{duplicateAsset.brand} {duplicateAsset.model}</strong> ({ASSET_TYPE_LABELS[duplicateAsset.type]})
                    </p>
                  )}
                </div>
              ) : (
                <div className={`${styles.field} ${styles.colSpan2}`}>
                  <label>Cantidad a registrar (referencia — puedes registrar menos o más series)</label>
                  <input
                    type="number" min="1" step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Ej. 12"
                  />
                  <div className={styles.serialScanWrap}>
                    <div className={styles.serialScanRow}>
                      <input
                        ref={serialInputRef}
                        className={`${styles.serialScanInput} ${serialInputFocused ? styles.serialScanInputReady : ''}`}
                        value={serialInput}
                        onChange={(e) => setSerialInput(e.target.value)}
                        onKeyDown={handleSerialKeyDown}
                        onFocus={() => setSerialInputFocused(true)}
                        onBlur={() => setSerialInputFocused(false)}
                        placeholder="Escanea o escribe un número de serie y presiona Enter..."
                        autoFocus
                      />
                      <button type="button" className={styles.btnSecondary} onClick={commitSerialInput}>
                        + Agregar
                      </button>
                    </div>
                    <span className={`${styles.scanReadyBadge} ${serialInputFocused ? styles.scanReadyBadgeOn : ''}`}>
                      {serialInputFocused ? (
                        <><span className={styles.scanReadyDot} /> Listo para escanear</>
                      ) : (
                        'Toca el campo para activar el escáner'
                      )}
                    </span>
                  </div>
                  {serials.length > 0 && (
                    <table className={styles.serialTable}>
                      <thead>
                        <tr><th>#</th><th>No. de serie</th><th></th></tr>
                      </thead>
                      <tbody>
                        {serials.map((sn, i) => (
                          <tr key={sn}>
                            <td>{i + 1}</td>
                            <td><code className={styles.mono}>{sn}</code></td>
                            <td>
                              <button type="button" className={styles.serialRemoveBtn} onClick={() => removeSerial(sn)}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p className={styles.serialProgress}>
                    {serials.length} serie{serials.length !== 1 ? 's' : ''} capturada{serials.length !== 1 ? 's' : ''}
                    {quantity && Number(quantity) > 0 ? ` de ${quantity} esperadas` : ''}
                  </p>
                  {duplicateSerials.length > 0 && (
                    <p className={styles.fieldWarning}>
                      ⚠️ Ya existen activos con estas series: {duplicateSerials.join(', ')}
                    </p>
                  )}
                </div>
              )}
              <div className={styles.field}>
                <label>Etiqueta inventario</label>
                <input value={common.inventoryTag} onChange={(e) => setCommon({ ...common, inventoryTag: e.target.value })} placeholder="INV-001" />
              </div>
              <div className={styles.field}>
                <label>Estado</label>
                <select value={common.status} onChange={(e) => setCommon({ ...common, status: e.target.value })}>
                  <option value="disponible">Disponible</option>
                  <option value="asignado">Asignado</option>
                  <option value="baja">De baja</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Fecha de compra</label>
                <input type="date" value={common.purchaseDate} onChange={(e) => setCommon({ ...common, purchaseDate: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label>Costo</label>
                <input
                  type="number" min="0" step="0.01"
                  value={common.cost}
                  onChange={(e) => setCommon({ ...common, cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className={`${styles.field} ${styles.colSpan2}`}>
                <label>Sucursal / Ubicación</label>
                <select value={common.location} onChange={(e) => setCommon({ ...common, location: e.target.value })}>
                  <option value="">— Sin asignar —</option>
                  {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Foto — pedido explícito del usuario (2026-09-03) para agilizar
              el registro de inventario. */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Foto {isLoteAsset ? 'del lote' : 'del activo'} (opcional)</p>
            <div className={styles.photoWrap}>
              {(photoPreview || existingPhotoUrl) && (
                <img src={photoPreview || existingPhotoUrl} alt="" className={styles.photoPreview} />
              )}
              <label className={styles.photoInputLabel}>
                📷 {(photoPreview || existingPhotoUrl) ? 'Cambiar foto' : 'Tomar / subir foto'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className={styles.photoInputHidden}
                />
              </label>
            </div>
          </div>

          {/* Especificaciones del tipo */}
          {otherFields.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Especificaciones — {ASSET_TYPE_LABELS[common.type]}</p>
              <div className={styles.grid}>
                {otherFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
              {duplicatePhone && (
                <p className={styles.fieldWarning} style={{ marginTop: '0.5rem' }}>
                  ⚠️ Número de línea duplicado — ya existe: <strong>{duplicatePhone.brand} {duplicatePhone.model}</strong> · Línea: <strong>{duplicatePhone.specs?.lineNumber}</strong>
                </p>
              )}
            </div>
          )}

          {/* Checkboxes */}
          {boolFields.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Accesorios incluidos</p>
              <div className={styles.checkGrid}>
                {boolFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          {/* Notas */}
          <div className={styles.section}>
            <div className={styles.field}>
              <label>Notas adicionales</label>
              <input value={common.notes} onChange={(e) => setCommon({ ...common, notes: e.target.value })} placeholder="Observaciones, condición, etc." />
            </div>
          </div>

          {/* Propiedad / sensibilidad — pedido de la junta de Finanzas: equipo
              que trae el propio empleado no debe contar como activo de la
              empresa, y los equipos de telemetría quedan marcados como
              sensibles (oculta el activo de listados generales para quien no
              tenga el permiso, ver User.canViewTelemetryAssets). */}
          <div className={styles.section}>
            <div className={styles.checkGrid}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={common.companyOwned}
                  onChange={(e) => setCommon({ ...common, companyOwned: e.target.checked })}
                  className={styles.checkbox}
                />
                Es propiedad de la empresa
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={common.isTelemetry}
                  onChange={(e) => setCommon({ ...common, isTelemetry: e.target.checked })}
                  className={styles.checkbox}
                />
                Equipo de telemetría (acceso restringido)
              </label>
            </div>
            {!common.companyOwned && (
              <p className={styles.fieldWarning} style={{ marginTop: '0.5rem' }}>
                No cuenta como activo propio en los totales de inventario — solo queda en el resguardo del área.
              </p>
            )}
          </div>

          {/* Asignación */}
          <div className={styles.section}>
            {editing && !assignmentLoaded ? (
              <p style={{ fontSize: '0.85rem', color: '#aaa' }}>Cargando asignación...</p>
            ) : editing && currentAssignment ? (
              <>
                <p className={styles.sectionLabel}>Asignación actual</p>
                <div className={styles.assignSection}>
                  {!wantAssign ? (
                    <p className={styles.returnWarning}>
                      ⚠️ El activo se marcará como <strong>disponible</strong> al guardar y se cerrará la asignación actual.
                    </p>
                  ) : assignTo ? (
                    <div className={styles.assignSelected}>
                      <div className={styles.assignSelectedInfo}>
                        <span className={styles.assignAvatar}>
                          {assignTo.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <p className={styles.assignName}>{assignTo.name}</p>
                          <p className={styles.assignSub}>
                            {assignTo.employeeId}
                            {assignTo.position && ` · ${assignTo.position}`}
                            {assignTo.department && ` · ${assignTo.department}`}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className={styles.assignClear} onClick={() => { setAssignTo(null); setEmpSearch(''); }}>
                          Cambiar
                        </button>
                        <button type="button" className={styles.assignReturn} onClick={() => { setWantAssign(false); setAssignTo(null); }}>
                          Devolver
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.empSearchWrap}>
                      <input
                        className={styles.empSearchInput}
                        placeholder="Buscar empleado por nombre, número..."
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
                                <span className={styles.empOptionAvatar}>
                                  {emp.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                </span>
                                <div>
                                  <p className={styles.empOptionName}>{emp.name}</p>
                                  <p className={styles.empOptionSub}>
                                    {emp.employeeId}
                                    {emp.position && ` · ${emp.position}`}
                                    {emp.department && ` · ${emp.department}`}
                                  </p>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {wantAssign && assignTo && (
                    <div className={styles.field} style={{ marginTop: '0.75rem' }}>
                      <label>Notas de asignación (opcional)</label>
                      <input
                        value={assignNotes}
                        onChange={(e) => setAssignNotes(e.target.value)}
                        placeholder="Observaciones sobre la entrega..."
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <label className={styles.assignToggle}>
                  <input
                    type="checkbox"
                    checked={wantAssign}
                    onChange={(e) => { setWantAssign(e.target.checked); setAssignTo(null); setEmpSearch(''); }}
                  />
                  <span>Asignar a un empleado ahora</span>
                </label>

                {wantAssign && (
                  <div className={styles.assignSection}>
                    {assignTo ? (
                      <div className={styles.assignSelected}>
                        <div className={styles.assignSelectedInfo}>
                          <span className={styles.assignAvatar}>
                            {assignTo.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <p className={styles.assignName}>{assignTo.name}</p>
                            <p className={styles.assignSub}>
                              {assignTo.employeeId}
                              {assignTo.position && ` · ${assignTo.position}`}
                              {assignTo.department && ` · ${assignTo.department}`}
                            </p>
                          </div>
                        </div>
                        <button type="button" className={styles.assignClear} onClick={() => { setAssignTo(null); setEmpSearch(''); }}>
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <div className={styles.empSearchWrap}>
                        <input
                          className={styles.empSearchInput}
                          placeholder="Buscar empleado por nombre, número..."
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
                                  <span className={styles.empOptionAvatar}>
                                    {emp.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </span>
                                  <div>
                                    <p className={styles.empOptionName}>{emp.name}</p>
                                    <p className={styles.empOptionSub}>
                                      {emp.employeeId}
                                      {emp.position && ` · ${emp.position}`}
                                      {emp.department && ` · ${emp.department}`}
                                    </p>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className={styles.field} style={{ marginTop: '0.75rem' }}>
                      <label>Notas de asignación (opcional)</label>
                      <input
                        value={assignNotes}
                        onChange={(e) => setAssignNotes(e.target.value)}
                        placeholder="Observaciones sobre la entrega..."
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary}>
              {editing
                ? (currentAssignment && !wantAssign
                    ? 'Guardar y devolver'
                    : wantAssign && assignTo && !currentAssignment
                      ? 'Guardar y asignar'
                      : 'Guardar cambios')
                : (wantAssign && assignTo ? 'Registrar y asignar' : 'Registrar activo')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Transferir entre sucursales sin eliminar y volver a dar de alta — pedido
// explícito del usuario (2026-09-03). Si es lote, deja elegir cuánto mover;
// si es único, solo se mueve el registro completo.
function TransferModal({ asset, onClose, onDone }) {
  const OFFICES = useEmployeeCatalog('oficina');
  const isLote = asset.stockTotal != null;
  const [location, setLocation] = useState('');
  const [quantity, setQuantity] = useState(isLote ? String(asset.stockTotal) : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!location) { setError('Selecciona la sucursal destino.'); return; }
    setLoading(true);
    try {
      await api.put(`/assets/${asset._id}/transfer`, {
        location,
        quantity: isLote ? Number(quantity) : undefined,
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo transferir');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🚚</span>
          <h2 className={styles.modalTitle}>Transferir a sucursal</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>
              {asset.brand} {asset.model} · actualmente en {asset.location || 'sin sucursal'}
            </p>
            <div className={styles.field}>
              <label>Sucursal destino</label>
              <select value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">Seleccionar...</option>
                {OFFICES.filter((o) => o !== asset.location).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {isLote && (
              <div className={styles.field}>
                <label>Cantidad a transferir (de {asset.stockTotal} en total)</label>
                <input
                  type="number" min="1" max={asset.stockTotal} step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Transfiriendo...' : 'Transferir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SpecsBadges({ specs, type }) {
  if (!specs) return null;
  const fields = SPECS_FIELDS[type] || [];
  const highlights = fields
    .filter((f) => f.type !== 'boolean' && specs[f.key])
    .slice(0, 3);
  const bools = fields
    .filter((f) => f.type === 'boolean' && specs[f.key] === true)
    .slice(0, 3);

  return (
    <div className={styles.specsBadges}>
      {highlights.map((f) => (
        <span key={f.key} className={styles.specChip}>{specs[f.key]}</span>
      ))}
      {bools.map((f) => (
        <span key={f.key} className={`${styles.specChip} ${styles.specChipGreen}`}>{f.label.replace('Incluye ', '✓ ')}</span>
      ))}
    </div>
  );
}

// Celda "Tipo" compartida entre categorías — agrega banderas de propiedad/
// telemetría (pedido de la junta de Finanzas) en un solo lugar en vez de
// repetirlas en cada grupo de columnas.
function renderTypeCell(a) {
  return (
    <div className={styles.typeCell}>
      <span className={styles.typeIcon}>{TYPE_ICONS[a.type]}</span>
      <span className={styles.typeText}>{ASSET_TYPE_LABELS[a.type]}</span>
      {a.companyOwned === false && <span className={styles.badgeGray} title="No es propiedad de la empresa">👤 empleado</span>}
      {a.isTelemetry && <span className={styles.badgeOrange} title="Equipo de telemetría (acceso restringido)">🔒 telemetría</span>}
    </div>
  );
}

// Columnas específicas por categoría
const CATEGORY_COLS = {
  computo: [
    { label: 'Tipo',          render: renderTypeCell },
    { label: 'Marca / Modelo',render: (a) => <span className={styles.brandModel}>{a.brand} {a.model}</span> },
    { label: 'No. Serie',     render: (a) => <code className={styles.mono}>{a.serialNumber || '—'}</code> },
    { label: 'Etiqueta',      render: (a) => <code className={styles.mono}>{a.inventoryTag || '—'}</code> },
    { label: 'Propiedad',     render: (a) => a.specs?.ownership ? <span className={a.specs.ownership === 'Arrendamiento' ? styles.badgeOrange : styles.badgeGray}>{a.specs.ownership}</span> : '—' },
    { label: 'No. Contrato',  render: (a) => a.specs?.contractNumber || '—' },
    { label: 'Procesador',    render: (a) => a.specs?.processor || '—' },
    { label: 'RAM',           render: (a) => a.specs?.ram || '—' },
    { label: 'Costo',         render: (a) => fmtMoney(a.cost) },
    { label: 'Estado',        key: 'status' },
    { label: 'Acciones',      key: 'actions' },
  ],
  celulares: [
    { label: 'Tipo',          render: renderTypeCell },
    { label: 'Marca / Modelo',render: (a) => <span className={styles.brandModel}>{a.brand} {a.model}</span> },
    { label: 'No. Serie',     render: (a) => <code className={styles.mono}>{a.serialNumber || '—'}</code> },
    { label: 'IMEI',          render: (a) => <code className={styles.mono}>{a.specs?.imei || '—'}</code> },
    { label: 'Línea',         render: (a) => a.specs?.lineNumber || '—' },
    { label: 'Operadora',     render: (a) => a.specs?.carrier || '—' },
    { label: 'No. Contrato',  render: (a) => a.specs?.contractNumber || '—' },
    { label: 'Razón Social',  render: (a) => a.specs?.businessName || '—' },
    { label: 'Costo',         render: (a) => fmtMoney(a.cost) },
    { label: 'Estado',        key: 'status' },
    { label: 'Acciones',      key: 'actions' },
  ],
  tablets: [
    { label: 'Marca / Modelo',render: (a) => <span className={styles.brandModel}>{a.brand} {a.model}</span> },
    { label: 'No. Serie',     render: (a) => <code className={styles.mono}>{a.serialNumber || '—'}</code> },
    { label: 'IMEI',          render: (a) => <code className={styles.mono}>{a.specs?.imei || '—'}</code> },
    { label: 'No. Contrato',  render: (a) => a.specs?.contractNumber || '—' },
    { label: 'Razón Social',  render: (a) => a.specs?.businessName || '—' },
    { label: 'Gmail',         render: (a) => a.specs?.gmailAccount || '—' },
    { label: 'Costo',         render: (a) => fmtMoney(a.cost) },
    { label: 'Estado',        key: 'status' },
    { label: 'Acciones',      key: 'actions' },
  ],
  impresion: [
    { label: 'Tipo',          render: renderTypeCell },
    { label: 'Marca / Modelo',render: (a) => <span className={styles.brandModel}>{a.brand} {a.model}</span> },
    { label: 'No. Serie',     render: (a) => <code className={styles.mono}>{a.serialNumber || '—'}</code> },
    { label: 'Etiqueta',      render: (a) => <code className={styles.mono}>{a.inventoryTag || '—'}</code> },
    { label: 'Tipo Impresora',render: (a) => a.specs?.printerType || '—' },
    { label: 'Conectividad',  render: (a) => a.specs?.connectivity || '—' },
    { label: 'IP',            render: (a) => <code className={styles.mono}>{a.specs?.ipAddress || '—'}</code> },
    { label: 'Costo',         render: (a) => fmtMoney(a.cost) },
    { label: 'Estado',        key: 'status' },
    { label: 'Acciones',      key: 'actions' },
  ],
  todos: [
    { label: 'Tipo',          render: renderTypeCell },
    { label: 'Marca / Modelo',render: (a) => <span className={styles.brandModel}>{a.brand} {a.model}</span> },
    { label: 'No. Serie',     render: (a) => <code className={styles.mono}>{a.serialNumber || '—'}</code> },
    { label: 'Etiqueta',      render: (a) => <code className={styles.mono}>{a.inventoryTag || '—'}</code> },
    { label: 'Especificaciones', render: (a) => <SpecsBadges specs={a.specs} type={a.type} /> },
    { label: 'Costo',         render: (a) => fmtMoney(a.cost) },
    { label: 'Estado',        key: 'status' },
    { label: 'Acciones',      key: 'actions' },
  ],
};

const TABS = [
  { key: 'todos',     label: 'Todos',             icon: '📋', types: null },
  { key: 'computo',   label: 'Equipo de cómputo', icon: '💻', types: ['laptop', 'escritorio', 'all_in_one'] },
  { key: 'celulares', label: 'Celulares',          icon: '📱', types: ['celular', 'cargador_celular'] },
  { key: 'tablets',   label: 'Tablets',            icon: '📱', types: ['tablet'] },
  { key: 'impresion', label: 'Impresión',          icon: '🖨️', types: ['impresora', 'escaner'] },
  { key: 'infra',     label: 'Infraestructura',    icon: '🌐', types: ['router', 'switch', 'access_point', 'camara_ip', 'nvr', 'poe_injector', 'ups', 'insumo_red'] },
  { key: 'especial',  label: 'Equipo especial',    icon: '🔬', types: ['microscopio', 'equipo_fiscal', 'escaner_diagnostico'] },
];

const STATUS_LABELS = { disponible: 'Disponible', asignado: 'Asignado', baja: 'De baja' };

function exportInventory(assets, tabKey) {
  const fmt   = (v) => v || '';
  const fmtB  = (v) => (v ? 'Sí' : 'No');
  const fmtD  = (v) => (v ? String(v).slice(0, 10) : '');
  const base  = (a) => ({
    'Tipo':          ASSET_TYPE_LABELS[a.type] || a.type,
    'Marca':         fmt(a.brand),
    'Modelo':        fmt(a.model),
    'No. Serie':     fmt(a.serialNumber),
    'Etiqueta':      fmt(a.inventoryTag),
    'Estado':        STATUS_LABELS[a.status] || a.status,
    'Fecha Compra':  fmtD(a.purchaseDate),
    'Costo':         a.cost != null ? a.cost : '',
    'Notas':         fmt(a.notes),
  });

  let rows;
  if (tabKey === 'computo') {
    rows = assets.map((a) => ({
      ...base(a),
      'Propiedad':        fmt(a.specs?.ownership),
      'No. Contrato':     fmt(a.specs?.contractNumber),
      'AnyDesk ID':       fmt(a.specs?.anydesk),
      'Procesador':       fmt(a.specs?.processor),
      'RAM':              fmt(a.specs?.ram),
      'Almacenamiento':   fmt(a.specs?.storage),
      'S.O.':             fmt(a.specs?.os),
      'Color':            fmt(a.specs?.color),
      'Cargador':         fmtB(a.specs?.hasCharger),
      'Monitor':          fmtB(a.specs?.hasMonitor),
      'Mouse':            fmtB(a.specs?.hasMouse),
      'Teclado':          fmtB(a.specs?.hasKeyboard),
    }));
  } else if (tabKey === 'celulares') {
    rows = assets.map((a) => ({
      ...base(a),
      'No. Línea':        fmt(a.specs?.lineNumber),
      'IMEI 1':           fmt(a.specs?.imei),
      'IMEI 2':           fmt(a.specs?.imei2),
      'Operadora':        fmt(a.specs?.carrier),
      'Costo Plan':       fmt(a.specs?.planCost),
      'No. Contrato':     fmt(a.specs?.contractNumber),
      'Razón Social':     fmt(a.specs?.businessName),
      'Gmail':            fmt(a.specs?.gmailAccount),
      'Almacenamiento':   fmt(a.specs?.storage),
      'RAM':              fmt(a.specs?.ram),
      'S.O.':             fmt(a.specs?.os),
      'Color':            fmt(a.specs?.color),
      'Incluye Cargador': fmtB(a.specs?.hasCharger),
    }));
  } else if (tabKey === 'tablets') {
    rows = assets.map((a) => ({
      ...base(a),
      'IMEI':             fmt(a.specs?.imei),
      'No. Contrato':     fmt(a.specs?.contractNumber),
      'Razón Social':     fmt(a.specs?.businessName),
      'Gmail':            fmt(a.specs?.gmailAccount),
      'Almacenamiento':   fmt(a.specs?.storage),
      'S.O.':             fmt(a.specs?.os),
      'Color':            fmt(a.specs?.color),
      'Incluye Cargador': fmtB(a.specs?.hasCharger),
    }));
  } else if (tabKey === 'impresion') {
    rows = assets.map((a) => ({
      ...base(a),
      'Tipo Impresora':   fmt(a.specs?.printerType),
      'Color/BN':         fmt(a.specs?.colorSupport),
      'Conectividad':     fmt(a.specs?.connectivity),
      'PPM':              fmt(a.specs?.ppm),
      'IP':               fmt(a.specs?.ipAddress),
    }));
  } else {
    rows = assets.map((a) => base(a));
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Activos');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `inventario_${tabKey}_${date}.xlsx`);
}

export default function Assets() {
  // Eliminar es exclusivo de Administrador — pedido explícito del usuario
  // (2026-08-04).
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const OFFICES = useEmployeeCatalog('oficina');
  const [assets, setAssets] = useState([]);
  const [assigneeMap, setAssigneeMap] = useState({});
  const [activeTab, setActiveTab] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [importCategory, setImportCategory] = useState(null);
  const [importDropdown, setImportDropdown] = useState(false);
  const [editing, setEditing] = useState(null);
  const dropdownRef = useRef();
  const [filterStatus, setFilterStatus] = useState('');
  // Filtros reales por subcategoría y sucursal — pedido explícito del
  // usuario (2026-09-03): las pestañas agrupan varios `type` a la vez (ej.
  // "Equipo de cómputo" = laptop+escritorio+all_in_one) sin forma de acotar
  // a uno solo, y no había ninguna forma de filtrar por sucursal.
  const [filterType, setFilterType] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [transferring, setTransferring] = useState(null);

  const duplicateGroups = useMemo(() => {
    const groups = {};
    assets.forEach((a) => {
      if (!SERIAL_CHECK_TYPES.includes(a.type)) return;
      const sn = a.serialNumber?.trim();
      if (!sn) return;
      if (!groups[sn]) groups[sn] = [];
      groups[sn].push(a);
    });
    return Object.values(groups).filter((g) => g.length > 1);
  }, [assets]);

  const duplicatePhoneGroups = useMemo(() => {
    const groups = {};
    assets.forEach((a) => {
      if (!PHONE_TYPES.includes(a.type)) return;
      const ln = a.specs?.lineNumber?.trim();
      if (!ln) return;
      if (!groups[ln]) groups[ln] = [];
      groups[ln].push(a);
    });
    return Object.values(groups).filter((g) => g.length > 1);
  }, [assets]);

  const load = async () => {
    const [{ data: assetsData }, { data: assignmentsData }] = await Promise.all([
      api.get('/assets'),
      api.get('/assignments'),
    ]);
    setAssets(assetsData.filter((a) => a.category !== 'accesorio'));
    const map = {};
    assignmentsData.forEach((asgn) => {
      const assetId = asgn.asset?._id || asgn.asset;
      if (assetId && asgn.employee?.name) {
        map[assetId] = { name: asgn.employee.name, employeeId: asgn.employee.employeeId || '' };
      }
    });
    setAssigneeMap(map);
    setSelected(new Set());
  };

  useEffect(() => { load(); }, []);

  const currentTab = TABS.find((t) => t.key === activeTab);

  // Subcategorías reales dentro de la pestaña activa — si la pestaña agrupa
  // varios tipos (ej. "Equipo de cómputo"), se listan esos; en "Todos" se
  // listan los tipos que de verdad existen en el inventario (no los 37
  // posibles del catálogo, para no llenar el filtro de opciones vacías).
  const typeOptions = useMemo(() => {
    const pool = currentTab.types
      ? currentTab.types
      : [...new Set(assets.map((a) => a.type))];
    return pool
      .map((t) => ({ value: t, label: ASSET_TYPE_LABELS[t] || t }))
      .sort((x, y) => x.label.localeCompare(y.label, 'es'));
  }, [currentTab, assets]);

  const locationOptions = useMemo(
    () => [...OFFICES].sort((x, y) => x.localeCompare(y, 'es')),
    [OFFICES]
  );

  const filtered = assets.filter((a) => {
    const assignee = assigneeMap[a._id];
    const matchSearch = matchesSearch(
      search,
      a.brand, a.model, a.serialNumber, a.inventoryTag, a.notes, a.location,
      specsValues(a.specs),
      assignee?.name, assignee?.employeeId,
      a.freedFromEmployee?.name, a.freedFromEmployee?.position, a.freedFromEmployee?.office,
    );
    const matchTab = !currentTab.types || currentTab.types.includes(a.type);
    const matchType = !filterType || a.type === filterType;
    const matchStatus = !filterStatus || a.status === filterStatus;
    const matchLocation = !filterLocation
      || (filterLocation === '__sin_sucursal__' ? !a.location : a.location === filterLocation);
    return matchSearch && matchTab && matchType && matchStatus && matchLocation;
  });

  const activeFilterCount =
    (search ? 1 : 0) + (filterType ? 1 : 0) + (filterStatus ? 1 : 0) + (filterLocation ? 1 : 0);
  const clearFilters = () => {
    setSearch(''); setFilterType(''); setFilterStatus(''); setFilterLocation('');
  };

  const cols = CATEGORY_COLS[activeTab] || CATEGORY_COLS.todos;

  /* ── Selección ──────────────────────────────────── */
  const allFilteredIds = filtered.map((a) => a._id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const someSelected = allFilteredIds.some((id) => selected.has(id));

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allFilteredIds.forEach((id) => next.delete(id));
      } else {
        allFilteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  /* ── Acciones en lote ───────────────────────────── */
  const bulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selected.size} activo(s)? Esta acción no se puede deshacer.`)) return;
    setBulkLoading(true);
    const failures = [];
    for (const id of selected) {
      try {
        await api.delete(`/assets/${id}`);
      } catch (err) {
        failures.push(err.response?.data?.message || 'No se pudo eliminar un activo');
      }
    }
    setBulkLoading(false);
    load();
    if (failures.length > 0) {
      alert(`${failures.length} activo(s) no se pudieron eliminar:\n\n${failures.join('\n')}`);
    }
  };

  const bulkStatus = async (status) => {
    setBulkLoading(true);
    for (const id of selected) {
      await api.put(`/assets/${id}`, { status }).catch(() => {});
    }
    setBulkLoading(false);
    load();
  };

  // Solo cambia el campo `category`; no borra ni recrea nada, conserva _id,
  // serialNumber y todo el historial de asignaciones tal cual.
  const bulkMoveToAccessories = async () => {
    if (!confirm(
      `¿Mover ${selected.size} activo(s) a Accesorios TI?\n\nNo se borra ni se modifica ningún dato: solo cambian de categoría y conservan su mismo registro, número de serie e historial de asignaciones.`
    )) return;
    setBulkLoading(true);
    for (const id of selected) {
      await api.put(`/assets/${id}`, { category: 'accesorio' }).catch(() => {});
    }
    setBulkLoading(false);
    load();
  };


  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Activos</h1>
          <p className={styles.pageSubtitle}>{assets.length} registrados en total</p>
        </div>
        <div className={styles.headerBtns}>
          <button
            className={styles.btnSecondary}
            onClick={() => exportInventory(filtered, activeTab)}
            disabled={filtered.length === 0}
          >
            📤 Exportar Excel
          </button>
          <div className={styles.dropdownWrap} ref={dropdownRef}>
            <button className={styles.btnSecondary} onClick={() => setImportDropdown((v) => !v)}>
              📥 Importar Excel ▾
            </button>
            {importDropdown && (
              <div className={styles.dropdown}>
                {Object.entries(IMPORT_CATEGORIES).map(([key, cat]) => (
                  <button key={key} className={styles.dropdownItem}
                    onClick={() => { setImportCategory(key); setImportDropdown(false); }}>
                    <span className={styles.dropdownIcon}>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={styles.btnPrimary} onClick={() => { setEditing(null); setShowModal(true); }}>
            + Registrar activo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map((t) => {
          const count = t.types
            ? assets.filter((a) => t.types.includes(a.type)).length
            : assets.length;
          return (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => { setActiveTab(t.key); setSearch(''); setFilterType(''); setFilterStatus(''); setFilterLocation(''); setSelected(new Set()); }}
            >
              <span className={styles.tabIcon}>{t.icon}</span>
              <span className={styles.tabLabel}>{t.label}</span>
              <span className={styles.tabCount}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder={`Buscar en ${currentTab.label.toLowerCase()} (marca, serie, o empleado asignado)...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.select} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Toda subcategoría</option>
          {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={styles.select} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="disponible">Disponible</option>
          <option value="asignado">Asignado</option>
          <option value="baja">De baja</option>
        </select>
        <select className={styles.select} value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}>
          <option value="">Toda sucursal</option>
          <option value="__sin_sucursal__">— Sin sucursal —</option>
          {locationOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {activeFilterCount > 0 && (
          <button type="button" className={styles.clearFiltersBtn} onClick={clearFilters}>
            ✕ Limpiar filtros ({activeFilterCount})
          </button>
        )}
      </div>
      <p className={styles.resultCount}>
        {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
        {activeFilterCount > 0 ? ' con estos filtros' : ` en ${currentTab.label.toLowerCase()}`}
      </p>

      {/* Alerta de duplicados */}
      {(duplicateGroups.length > 0 || duplicatePhoneGroups.length > 0) && (
        <div className={styles.duplicateAlert}>
          <div className={styles.duplicateAlertHeader}>
            <span className={styles.duplicateAlertTitle}>
              ⚠️ {duplicateGroups.length + duplicatePhoneGroups.length} duplicado{duplicateGroups.length + duplicatePhoneGroups.length > 1 ? 's' : ''} detectado{duplicateGroups.length + duplicatePhoneGroups.length > 1 ? 's' : ''}
              {duplicateGroups.length > 0 && <span className={styles.duplicateTag}>· {duplicateGroups.length} No. serie</span>}
              {duplicatePhoneGroups.length > 0 && <span className={styles.duplicateTag}>· {duplicatePhoneGroups.length} No. línea</span>}
            </span>
            <button className={styles.duplicateToggle} onClick={() => setShowDuplicates((v) => !v)}>
              {showDuplicates ? 'Ocultar ▲' : 'Ver detalles ▼'}
            </button>
          </div>
          {showDuplicates && (
            <div className={styles.duplicateList}>
              {duplicateGroups.map((group) => (
                <div key={group[0].serialNumber} className={styles.duplicateGroup}>
                  <p className={styles.duplicateSerial}>
                    No. serie: <strong>{group[0].serialNumber}</strong>
                    <span className={styles.duplicateCount}>{group.length} activos</span>
                  </p>
                  <div className={styles.duplicateItems}>
                    {group.map((a) => {
                      const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.disponible;
                      return (
                        <div key={a._id} className={styles.duplicateItem}>
                          <span className={styles.duplicateItemIcon}>{TYPE_ICONS[a.type]}</span>
                          <span className={styles.duplicateItemName}>{a.brand} {a.model}</span>
                          <span className={styles.duplicateItemType}>{ASSET_TYPE_LABELS[a.type]}</span>
                          <span className={styles.duplicateItemStatus} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                          <button className={styles.duplicateItemEdit} onClick={() => { setEditing(a); setShowModal(true); }}>Editar</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {duplicatePhoneGroups.map((group) => (
                <div key={group[0].specs?.lineNumber} className={styles.duplicateGroup}>
                  <p className={styles.duplicateSerial}>
                    No. línea: <strong>{group[0].specs?.lineNumber}</strong>
                    <span className={styles.duplicateCount}>{group.length} activos</span>
                  </p>
                  <div className={styles.duplicateItems}>
                    {group.map((a) => {
                      const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.disponible;
                      return (
                        <div key={a._id} className={styles.duplicateItem}>
                          <span className={styles.duplicateItemIcon}>{TYPE_ICONS[a.type]}</span>
                          <span className={styles.duplicateItemName}>{a.brand} {a.model}</span>
                          <span className={styles.duplicateItemType}>{ASSET_TYPE_LABELS[a.type]}</span>
                          <span className={styles.duplicateItemStatus} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                          <button className={styles.duplicateItemEdit} onClick={() => { setEditing(a); setShowModal(true); }}>Editar</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barra de acciones en lote */}
      {someSelected && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkInfo}>
            <span className={styles.bulkCount}>{selected.size}</span>
            <span className={styles.bulkLabel}>activo{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}</span>
          </div>
          <div className={styles.bulkActions}>
            <button className={styles.bulkBtn} onClick={() => bulkStatus('disponible')} disabled={bulkLoading}>
              ✅ Marcar disponible
            </button>
            <button className={styles.bulkBtn} onClick={() => bulkStatus('baja')} disabled={bulkLoading}>
              🚫 Dar de baja
            </button>
            <button className={styles.bulkBtn} onClick={bulkMoveToAccessories} disabled={bulkLoading}>
              📦 Mover a Accesorios
            </button>

            {currentUser.role === 'admin' && (
              <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} onClick={bulkDelete} disabled={bulkLoading}>
                🗑️ Eliminar
              </button>
            )}
            <button className={styles.bulkBtnClear} onClick={() => setSelected(new Set())} disabled={bulkLoading}>
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkTh}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleAll}
                />
              </th>
              {cols.map((c) => c.key !== 'actions' && <th key={c.label}>{c.label}</th>)}
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={cols.length + 1} className={styles.empty}>
                Sin {currentTab.label.toLowerCase()} registrados
              </td></tr>
            )}
            {filtered.map((a) => {
              const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.disponible;
              const isSelected = selected.has(a._id);
              return (
                <tr
                  key={a._id}
                  className={isSelected ? styles.rowSelected : ''}
                  onClick={(e) => {
                    if (e.target.closest('button') || e.target.type === 'checkbox') return;
                    toggleOne(a._id);
                  }}
                >
                  <td className={styles.checkTd} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={isSelected}
                      onChange={() => toggleOne(a._id)}
                    />
                  </td>
                  {cols.map((c) => {
                    if (c.key === 'actions') return null;
                    if (c.key === 'status') return (
                      <td key="status">
                        <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>
                          {sc.label}
                        </span>
                        {a.status === 'asignado' && assigneeMap[a._id] && (
                          <p className={styles.assigneeName}>{assigneeMap[a._id].name}</p>
                        )}
                        {a.lastModifiedBy && (
                          <p className={styles.modifiedBy}>✏️ {a.lastModifiedBy}</p>
                        )}
                      </td>
                    );
                    return <td key={c.label}>{c.render(a)}</td>;
                  })}
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnEdit} onClick={() => { setEditing(a); setShowModal(true); }}>
                        Editar
                      </button>
                      <button className={styles.btnEdit} onClick={() => setTransferring(a)}>
                        🚚 Transferir
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {importCategory && (
        <ImportModal
          entityType="assets"
          categoryKey={importCategory}
          onClose={() => setImportCategory(null)}
          onDone={load}
        />
      )}

      {showModal && (
        <AssetModal
          key={editing?._id || 'new'}
          editing={editing?._id || null}
          initial={editing}
          allAssets={assets}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}

      {transferring && (
        <TransferModal
          asset={transferring}
          onClose={() => setTransferring(null)}
          onDone={() => { setTransferring(null); load(); }}
        />
      )}
    </div>
  );
}
