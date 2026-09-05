import { useEffect, useState, useRef, useMemo, lazy, Suspense, Fragment } from 'react';
import api from '../services/api';
import {
  ACCESSORY_TYPE_LABELS, ACCESSORY_GROUPS, SPECS_FIELDS, TYPE_ICONS,
} from '../config/assetFields';
import AssetThumbnail from '../components/AssetThumbnail';
import useEmployeeCatalog from '../hooks/useEmployeeCatalog';
import { matchesSearch, specsValues } from '../utils/search';
import styles from './Assets.module.css';

// Carga perezosa — @zxing/browser y tesseract.js pesan varios cientos de KB,
// no tiene caso meterlos al bundle principal cuando la mayoría de las
// sesiones nunca abre la cámara.
const BarcodeScannerModal = lazy(() => import('../components/BarcodeScannerModal'));
const OcrCaptureModal = lazy(() => import('../components/OcrCaptureModal'));

const TABS = [
  { key: 'todos',        label: 'Todos',          icon: '📋', types: null },
  { key: 'perifericos',  label: 'Periféricos',    icon: '🖥️', types: ['monitor', 'mouse', 'teclado', 'kit_perifericos', 'audifonos', 'webcam', 'hub_usb'] },
  // Pedido explícito del usuario (2026-09-03): los cargadores (de celular y
  // de laptop) son Accesorios, no Activos — aunque el tipo comparte
  // taxonomía con Activos (mismo enum de `type` en el backend), aquí es
  // donde operativamente deben vivir.
  { key: 'cargadores',   label: 'Cargadores',     icon: '🔌', types: ['cargador_celular', 'cargador_laptop'] },
  { key: 'cables',       label: 'Cables',         icon: '🔌', types: ['cable'] },
  { key: 'adaptadores',  label: 'Adaptadores',    icon: '🔄', types: ['adaptador'] },
  { key: 'almacenamiento', label: 'Almacenamiento', icon: '💾', types: ['disco_duro'] },
  { key: 'consumibles',  label: 'Consumibles',    icon: '🧹', types: ['consumible'] },
  { key: 'herramientas', label: 'Herramientas',   icon: '🔧', types: ['herramienta'] },
  // Pedido explícito del usuario (2026-09-04) al revisar "Otros": 7
  // lectores de código de barras/QR metidos ahí sin categoría propia,
  // suficiente volumen para justificar su propia pestaña.
  { key: 'lectores',     label: 'Lectores de código', icon: '🔍', types: ['lector_codigos'] },
  { key: 'otros',        label: 'Otros',          icon: '📦', types: ['accesorio'] },
];

function buildEmptySpecs(type) {
  const fields = SPECS_FIELDS[type] || [];
  const specs = {};
  fields.forEach((f) => { specs[f.key] = f.type === 'boolean' ? false : ''; });
  return specs;
}

function SpecsField({ field, value, onChange }) {
  if (field.type === 'boolean') {
    return (
      <label className={styles.checkLabel}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(field.key, e.target.checked)} className={styles.checkbox} />
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
      <input value={value || ''} onChange={(e) => onChange(field.key, e.target.value)} placeholder={field.placeholder} />
    </div>
  );
}

function ProductModal({ editing, onClose, onSaved }) {
  const OFFICES = useEmployeeCatalog('oficina');
  const initType = editing?.type || 'mouse';
  const [type, setType] = useState(initType);
  const [form, setForm] = useState({
    brand:        editing?.brand        || '',
    model:        editing?.model        || '',
    serialNumber: editing?.serialNumber || '',
    inventoryTag: editing?.inventoryTag || '',
    stockTotal:   editing?.stockTotal ?? 1,
    purchaseDate: editing?.purchaseDate ? String(editing.purchaseDate).slice(0, 10) : '',
    cost:         editing?.cost != null ? String(editing.cost) : '',
    notes:        editing?.notes        || '',
    // "Sucursal de compra" — pedido explícito del usuario (2026-09-04): todo
    // entra por Polanco Piso 13, así que se preselecciona al registrar algo
    // nuevo (se puede cambiar a mano si de verdad aplica otro sitio). Al
    // editar, se respeta lo que ya tenía.
    location:     editing?.location     || (editing ? '' : 'POLANCO PISO 13'),
  });
  const [specs, setSpecs] = useState(
    editing
      ? { ...buildEmptySpecs(editing.type), ...(editing.specs || {}) }
      : buildEmptySpecs(initType)
  );
  // Campos personalizados — pedido explícito del usuario (2026-09-04): los
  // campos fijos de cada tipo no alcanzan para todo (sobre todo en "Otros"),
  // así que además de esos, cualquier producto puede llevar pares
  // etiqueta/valor libres, sin tener que tocar código cada vez que aparece
  // un dato que no encaja en ningún campo existente.
  const [customFields, setCustomFields] = useState(() => (editing?.specs?.customFields || []).map((f) => ({ ...f })));
  const addCustomField = () => setCustomFields((f) => [...f, { label: '', value: '' }]);
  const updateCustomField = (i, key, val) =>
    setCustomFields((f) => f.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  const removeCustomField = (i) => setCustomFields((f) => f.filter((_, idx) => idx !== i));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Modo de seguimiento — pedido explícito del usuario (2026-09-03), mismo
  // patrón ya usado en Assets.jsx. Aquí el default es "lote" (a diferencia de
  // Activos) porque así ya funcionaba siempre Accesorios (stockTotal desde
  // el inicio) — "serial" es la opción nueva, para cuando sí importa
  // trackear cada unidad por separado (ej. monitores).
  const [trackingMode, setTrackingMode] = useState('lote');
  const [quantity, setQuantity] = useState('');
  // Alta por lote de series NUEVAS (isSerialMode) — array de texto plano,
  // se manda a POST /assets/batch como N registros independientes, uno por
  // serie (mismo criterio que Activos). Distinto de lotSerials (abajo).
  const [serials, setSerials] = useState([]);
  const [serialInput, setSerialInput] = useState('');
  const [serialInputFocused, setSerialInputFocused] = useState(false);
  const serialInputRef = useRef(null);
  const isSerialMode = !editing && trackingMode === 'serial';
  // Lote YA EXISTENTE (a diferencia de isSerialMode, que es solo para el
  // alta nueva) — aquí se gestionan las piezas de un registro que ya vive
  // como cantidad/lote, cada una con su propia sucursal (pedido explícito
  // del usuario, 2026-09-04: la compra siempre entra por Polanco y de ahí
  // se reparte pieza por pieza — la sucursal es un dato de cada pieza, no
  // del lote completo).
  const isEditingLote = !!editing && editing.stockTotal != null;
  const [lotSerials, setLotSerials] = useState(() => (editing?.serials || []).map((s) => ({ ...s })));
  const [lotSerialInput, setLotSerialInput] = useState('');
  const [lotSerialInputFocused, setLotSerialInputFocused] = useState(false);
  const lotSerialInputRef = useRef(null);
  // Cámara de la tablet — pedido explícito del usuario (2026-09-04): tomar
  // inventario con la cámara, tanto para escanear códigos de barras como
  // para leer el número de serie/modelo de una etiqueta (OCR).
  // scanningBarcode: null | 'serials' | 'lotSerials' — a cuál lista agregar.
  const [scanningBarcode, setScanningBarcode] = useState(null);
  // Un solo modal de lectura, ofrece los 3 campos a la vez — pedido
  // explícito del usuario (2026-09-05): una sola foto suele traer varios
  // datos (marca, modelo, serie), y el modal ya no se cierra solo al
  // asignar uno.
  const [ocrOpen, setOcrOpen] = useState(false);

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
  const handleSerialKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitSerialInput(); }
  };
  const removeSerial = (sn) => setSerials((prev) => prev.filter((s) => s !== sn));
  // Igual que commitSerialInput, pero para un código ya leído por la cámara
  // (escáner de código de barras) en vez de tecleado/lector físico.
  const addScannedSerial = (val) => {
    const v = val.trim();
    if (!v) return;
    setSerials((prev) => (prev.includes(v) ? prev : [...prev, v]));
  };

  const commitLotSerialInput = () => {
    const val = lotSerialInput.trim();
    if (!val) return;
    setLotSerials((prev) => (
      prev.some((p) => p.serialNumber === val)
        ? prev
        : [...prev, { serialNumber: val, location: form.location || 'POLANCO PISO 13' }]
    ));
    setLotSerialInput('');
    lotSerialInputRef.current?.focus();
  };
  const handleLotSerialKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitLotSerialInput(); }
  };
  const removeLotSerial = (sn) => setLotSerials((prev) => prev.filter((p) => p.serialNumber !== sn));
  const setLotSerialLocation = (sn, loc) =>
    setLotSerials((prev) => prev.map((p) => (p.serialNumber === sn ? { ...p, location: loc } : p)));
  // Igual que commitLotSerialInput, pero para un código ya leído por la
  // cámara (escáner de código de barras).
  const addScannedLotSerial = (val) => {
    const v = val.trim();
    if (!v) return;
    setLotSerials((prev) => (
      prev.some((p) => p.serialNumber === v) ? prev : [...prev, { serialNumber: v, location: form.location || 'POLANCO PISO 13' }]
    ));
  };

  // Foto del producto/lote — pedido explícito del usuario (2026-09-03).
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState(null);

  useEffect(() => {
    if (!editing?._id || !editing?.photoMimeType) return;
    let url;
    api.get(`/assets/${editing._id}/photo`, { responseType: 'blob' })
      .then(({ data }) => { url = URL.createObjectURL(data); setExistingPhotoUrl(url); })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [editing]);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleTypeChange = (newType) => {
    setType(newType);
    setSpecs(buildEmptySpecs(newType));
  };

  const setSpec = (key, val) => setSpecs((s) => ({ ...s, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (isSerialMode && serials.length === 0) {
      setError('Agrega al menos un número de serie (o cambia a "Por cantidad/lote").');
      return;
    }
    setSaving(true);
    try {
      // Si se están gestionando series dentro de un lote ya existente, la
      // cantidad se deriva de cuántas piezas hay capturadas — evita que
      // "Cantidad en stock" y la lista de series se desincronicen.
      const derivedStock = isEditingLote && lotSerials.length > 0
        ? lotSerials.length
        : Math.max(1, parseInt(form.stockTotal) || 1);

      const payload = {
        category: 'accesorio',
        type,
        brand:        form.brand,
        model:        form.model,
        serialNumber: isSerialMode ? '' : form.serialNumber,
        inventoryTag: form.inventoryTag,
        stockTotal:   isSerialMode ? null : derivedStock,
        serials:      isSerialMode ? [] : lotSerials,
        purchaseDate: form.purchaseDate || undefined,
        cost:         form.cost !== '' ? Number(form.cost) : null,
        notes:        form.notes,
        location:     form.location,
        specs: { ...specs, customFields: customFields.filter((f) => f.label.trim() || f.value.trim()) },
      };

      let createdIds = [];
      if (editing) {
        await api.put(`/assets/${editing._id}`, payload);
        createdIds = [editing._id];
      } else if (isSerialMode) {
        // Alta por lote de series — cada serie se crea como un producto real
        // independiente (ver POST /assets/batch, mismo criterio que Activos).
        const { serialNumber, stockTotal, serials: _unusedSerials, ...batchCommon } = payload;
        const { data } = await api.post('/assets/batch', { ...batchCommon, serialNumbers: serials });
        createdIds = data.map((a) => a._id);
      } else {
        const { data } = await api.post('/assets', payload);
        createdIds = [data._id];
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
      setSaving(false);
    }
  };

  const specFields = SPECS_FIELDS[type] || [];
  const boolFields = specFields.filter((f) => f.type === 'boolean');
  const otherFields = specFields.filter((f) => f.type !== 'boolean');

  return (
    <>
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{TYPE_ICONS[type] || '📦'}</span>
          <h2 className={styles.modalTitle}>{editing ? 'Editar producto' : 'Registrar producto'}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.section}>
            <p className={styles.sectionLabel}>Tipo de accesorio</p>
            <div className={styles.typeGrid}>
              {ACCESSORY_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className={styles.groupLabel}>{g.icon} {g.label}</p>
                  <div className={styles.typeBtns}>
                    {g.types.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`${styles.typeBtn} ${type === t ? styles.typeBtnActive : ''}`}
                        onClick={() => handleTypeChange(t)}
                      >
                        {ACCESSORY_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionLabel}>Identificación del producto</p>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label>Marca</label>
                <div className={styles.inputWithCamera}>
                  <input value={form.brand} onChange={set('brand')} placeholder="Logitech / Dell / Genérico..." />
                  <button type="button" className={styles.cameraBtn} title="Leer con cámara" onClick={() => setOcrOpen(true)}>📷</button>
                </div>
              </div>
              <div className={styles.field}>
                <label>Modelo / Descripción</label>
                <div className={styles.inputWithCamera}>
                  <input value={form.model} onChange={set('model')} placeholder="MX Master / HDMI 2.0..." />
                  <button type="button" className={styles.cameraBtn} title="Leer con cámara" onClick={() => setOcrOpen(true)}>📷</button>
                </div>
              </div>
              <div className={styles.field}>
                <label>Etiqueta inventario</label>
                <input value={form.inventoryTag} onChange={set('inventoryTag')} placeholder="ACC-001" />
              </div>

              {!editing && (
                <div className={`${styles.field} ${styles.colSpan2}`}>
                  <label>Modo de seguimiento</label>
                  <div className={styles.typeBtns}>
                    <button
                      type="button"
                      className={`${styles.typeBtn} ${trackingMode === 'lote' ? styles.typeBtnActive : ''}`}
                      onClick={() => handleTrackingModeChange('lote')}
                    >
                      Por cantidad / lote
                    </button>
                    <button
                      type="button"
                      className={`${styles.typeBtn} ${trackingMode === 'serial' ? styles.typeBtnActive : ''}`}
                      onClick={() => handleTrackingModeChange('serial')}
                    >
                      Único por número de serie
                    </button>
                  </div>
                </div>
              )}

              {isSerialMode ? (
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
                      <button type="button" className={styles.btnSecondary} onClick={() => setScanningBarcode('serials')}>
                        📷 Usar cámara
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
                </div>
              ) : (
                <>
                  <div className={styles.field}>
                    <label>No. de serie / Lote</label>
                    <div className={styles.inputWithCamera}>
                      <input value={form.serialNumber} onChange={set('serialNumber')} placeholder="Opcional" />
                      <button type="button" className={styles.cameraBtn} title="Leer con cámara" onClick={() => setOcrOpen(true)}>📷</button>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Cantidad en stock</label>
                    <input
                      type="number"
                      min="1"
                      value={isEditingLote && lotSerials.length > 0 ? lotSerials.length : form.stockTotal}
                      onChange={set('stockTotal')}
                      placeholder="1"
                      disabled={isEditingLote && lotSerials.length > 0}
                      required
                    />
                    {isEditingLote && lotSerials.length > 0 && (
                      <p className={styles.serialProgress}>Se calcula sola de las piezas listadas abajo.</p>
                    )}
                  </div>

                  {/* Piezas dentro de este lote, cada una con su propia
                      sucursal — pedido explícito del usuario (2026-09-04):
                      todo entra por la sucursal de compra de arriba, pero
                      cada pieza se va repartiendo por su lado; no hace falta
                      partir el registro para reflejarlo, solo su ubicación
                      individual aquí abajo. */}
                  {isEditingLote && (
                    <div className={`${styles.field} ${styles.colSpan2}`}>
                      <label>Piezas registradas en este lote (opcional)</label>
                      <div className={styles.serialScanWrap}>
                        <div className={styles.serialScanRow}>
                          <input
                            ref={lotSerialInputRef}
                            className={`${styles.serialScanInput} ${lotSerialInputFocused ? styles.serialScanInputReady : ''}`}
                            value={lotSerialInput}
                            onChange={(e) => setLotSerialInput(e.target.value)}
                            onKeyDown={handleLotSerialKeyDown}
                            onFocus={() => setLotSerialInputFocused(true)}
                            onBlur={() => setLotSerialInputFocused(false)}
                            placeholder="Escanea o escribe un número de serie y presiona Enter..."
                          />
                          <button type="button" className={styles.btnSecondary} onClick={commitLotSerialInput}>
                            + Agregar
                          </button>
                          <button type="button" className={styles.btnSecondary} onClick={() => setScanningBarcode('lotSerials')}>
                            📷 Usar cámara
                          </button>
                        </div>
                        <span className={`${styles.scanReadyBadge} ${lotSerialInputFocused ? styles.scanReadyBadgeOn : ''}`}>
                          {lotSerialInputFocused ? (
                            <><span className={styles.scanReadyDot} /> Listo para escanear</>
                          ) : (
                            'Toca el campo para activar el escáner'
                          )}
                        </span>
                      </div>
                      {lotSerials.length > 0 && (
                        <table className={styles.serialTable}>
                          <thead>
                            <tr><th>#</th><th>No. de serie</th><th>Sucursal</th><th></th></tr>
                          </thead>
                          <tbody>
                            {lotSerials.map((p, i) => (
                              <tr key={p.serialNumber}>
                                <td>{i + 1}</td>
                                <td><code className={styles.mono}>{p.serialNumber}</code></td>
                                <td>
                                  <select
                                    className={styles.serialLocationSelect}
                                    value={p.location || ''}
                                    onChange={(e) => setLotSerialLocation(p.serialNumber, e.target.value)}
                                  >
                                    <option value="">— Sin asignar —</option>
                                    {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                </td>
                                <td>
                                  <button type="button" className={styles.serialRemoveBtn} onClick={() => removeLotSerial(p.serialNumber)}>✕</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className={styles.field}>
                <label>Fecha de compra</label>
                <input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} />
              </div>
              <div className={styles.field}>
                <label>Costo (unitario)</label>
                <input type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} placeholder="0.00" />
              </div>
              <div className={`${styles.field} ${styles.colSpan2}`}>
                <label>Sucursal / Ubicación</label>
                <select value={form.location} onChange={set('location')}>
                  <option value="">— Sin asignar —</option>
                  {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Foto — pedido explícito del usuario (2026-09-03). */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Foto {isSerialMode ? 'del lote' : 'del producto'} (opcional)</p>
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

          {otherFields.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Detalles — {ACCESSORY_TYPE_LABELS[type]}</p>
              <div className={styles.grid}>
                {otherFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          {boolFields.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Características adicionales</p>
              <div className={styles.checkGrid}>
                {boolFields.map((f) => (
                  <SpecsField key={f.key} field={f} value={specs[f.key]} onChange={setSpec} />
                ))}
              </div>
            </div>
          )}

          {/* Campos personalizados — pedido explícito del usuario
              (2026-09-04): los campos fijos de cada tipo no alcanzan para
              todo (sobre todo en "Otros") — aquí se pueden agregar pares
              etiqueta/valor libres, sin límite. */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Campos personalizados (opcional)</p>
            {customFields.length > 0 && (
              <div className={styles.customFieldsList}>
                {customFields.map((f, i) => (
                  <div key={i} className={styles.customFieldRow}>
                    <input
                      className={styles.customFieldLabel}
                      value={f.label}
                      onChange={(e) => updateCustomField(i, 'label', e.target.value)}
                      placeholder="Nombre del campo (ej. Voltaje)"
                    />
                    <input
                      className={styles.customFieldValue}
                      value={f.value}
                      onChange={(e) => updateCustomField(i, 'value', e.target.value)}
                      placeholder="Valor (ej. 5V 1A)"
                    />
                    <button type="button" className={styles.serialRemoveBtn} onClick={() => removeCustomField(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className={styles.btnSecondary} onClick={addCustomField}>
              + Agregar campo
            </button>
          </div>

          <div className={styles.section}>
            <div className={styles.field}>
              <label>Notas adicionales</label>
              <input value={form.notes} onChange={set('notes')} placeholder="Observaciones, condición, etc." />
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
    <Suspense fallback={null}>
      {scanningBarcode && (
        <BarcodeScannerModal
          onDetect={scanningBarcode === 'serials' ? addScannedSerial : addScannedLotSerial}
          onClose={() => setScanningBarcode(null)}
        />
      )}
      {ocrOpen && (
        <OcrCaptureModal
          targets={[
            { key: 'brand', label: 'Marca' },
            { key: 'model', label: 'Modelo' },
            { key: 'serialNumber', label: 'No. de serie' },
          ]}
          onAssign={(key, text) => {
            if (key === 'brand') setForm((f) => ({ ...f, brand: text }));
            if (key === 'model') setForm((f) => ({ ...f, model: text }));
            if (key === 'serialNumber') setForm((f) => ({ ...f, serialNumber: text }));
          }}
          onClose={() => setOcrOpen(false)}
        />
      )}
    </Suspense>
    </>
  );
}

// Transferir entre sucursales sin eliminar y volver a dar de alta — mismo
// componente que Assets.jsx (2026-09-03), duplicado aquí porque este archivo
// ya no comparte componentes de modal con Assets.jsx (mismo criterio que
// SpecsField/buildEmptySpecs, ya duplicados entre ambos).
function TransferModal({ asset, onClose, onDone }) {
  const OFFICES = useEmployeeCatalog('oficina');
  const hasSerials = asset.serials?.length > 0;
  const isLote = asset.stockTotal != null;
  const [location, setLocation] = useState('');
  const [quantity, setQuantity] = useState(isLote ? String(asset.stockTotal) : '');
  // Modo por pieza — pedido explícito del usuario (2026-09-04): cada pieza
  // tiene su propia sucursal, así que se elige cuáles mover, no "cuántas".
  const [selectedSerials, setSelectedSerials] = useState(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleSerial = (sn) => setSelectedSerials((prev) => {
    const next = new Set(prev);
    next.has(sn) ? next.delete(sn) : next.add(sn);
    return next;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!location) { setError('Selecciona la sucursal destino.'); return; }
    if (hasSerials && selectedSerials.size === 0) { setError('Selecciona al menos una pieza a mover.'); return; }
    setLoading(true);
    try {
      await api.put(`/assets/${asset._id}/transfer`, {
        location,
        quantity: !hasSerials && isLote ? Number(quantity) : undefined,
        serialNumbers: hasSerials ? [...selectedSerials] : undefined,
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
      <div className={styles.modal} style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🚚</span>
          <h2 className={styles.modalTitle}>Transferir a sucursal</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>
              {asset.brand} {asset.model}
              {!hasSerials && ` · actualmente en ${asset.location || 'sin sucursal'}`}
            </p>

            {hasSerials && (
              <div className={styles.field}>
                <label>Piezas a mover</label>
                <table className={styles.serialTable}>
                  <thead>
                    <tr><th></th><th>No. de serie</th><th>Sucursal actual</th></tr>
                  </thead>
                  <tbody>
                    {asset.serials.map((p) => (
                      <tr key={p.serialNumber}>
                        <td>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={selectedSerials.has(p.serialNumber)}
                            onChange={() => toggleSerial(p.serialNumber)}
                          />
                        </td>
                        <td><code className={styles.mono}>{p.serialNumber}</code></td>
                        <td>{p.location || 'sin sucursal'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className={styles.field}>
              <label>Sucursal destino</label>
              <select value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">Seleccionar...</option>
                {OFFICES.filter((o) => o !== asset.location).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {!hasSerials && isLote && (
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

function AssignModal({ product, onClose, onAssigned }) {
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [assignTo, setAssignTo] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const maxQty = product._availableQty;

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data));
  }, []);

  const filteredEmps = employees.filter((e) => {
    const q = empSearch.toLowerCase();
    return (
      e.employeeId.toLowerCase().includes(q) ||
      e.phone?.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const handleAssign = async () => {
    if (!assignTo) { setError('Selecciona un empleado'); return; }
    const qty = Math.min(maxQty, Math.max(1, parseInt(quantity) || 1));
    setLoading(true);
    setError('');
    try {
      await api.post('/assignments', {
        employee: assignTo._id,
        asset: product._id,
        quantity: qty,
        notes,
      });
      onAssigned();
    } catch (e) {
      setError(e.response?.data?.message || 'Error al asignar');
      setLoading(false);
    }
  };

  const name = [product.brand, product.model].filter(Boolean).join(' ') ||
    ACCESSORY_TYPE_LABELS[product.type] || product.type;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>{TYPE_ICONS[product.type] || '📦'}</span>
          <h2 className={styles.modalTitle}>Asignar — {name}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.form}>
          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.section}>
            <p className={styles.sectionLabel}>
              {maxQty === 1 ? '1 unidad disponible' : `${maxQty} unidades disponibles`}
            </p>
            <div className={styles.field} style={{ maxWidth: 200 }}>
              <label>Cantidad a asignar</label>
              <input
                type="number"
                min="1"
                max={maxQty}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))
                }
              />
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionLabel}>Empleado</p>
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
                      {assignTo.office && ` · ${assignTo.office}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.assignClear}
                  onClick={() => { setAssignTo(null); setEmpSearch(''); }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className={styles.empSearchWrap}>
                <input
                  className={styles.empSearchInput}
                  placeholder="No. de empleado o teléfono..."
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
                              <strong>{emp.employeeId}</strong>
                              {emp.phone && ` · 📞 ${emp.phone}`}
                              {emp.office && ` · ${emp.office}`}
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

          <div className={styles.section}>
            <div className={styles.field}>
              <label>Notas (opcional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones sobre la entrega..."
              />
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleAssign}
              disabled={loading || !assignTo}
            >
              {loading ? 'Asignando...' : 'Confirmar asignación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Accessories() {
  // Eliminar/Devolver es exclusivo de Administrador — pedido explícito del
  // usuario (2026-08-04).
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const OFFICES = useEmployeeCatalog('oficina');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('todos');
  const [search, setSearch] = useState('');
  // Filtros reales por subcategoría y sucursal — pedido explícito del
  // usuario (2026-09-03), mismo criterio que Assets.jsx.
  const [filterType, setFilterType] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [transferring, setTransferring] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  const load = async () => {
    const [{ data: assetData }, { data: assignData }] = await Promise.all([
      api.get('/assets'),
      api.get('/assignments'),
    ]);
    const accData = assetData.filter((a) => a.category === 'accesorio');
    const enriched = accData.map((acc) => {
      const myAssigns = assignData.filter(
        (a) => String(a.asset?._id || a.asset) === String(acc._id)
      );
      const assignedQty = myAssigns.reduce((sum, a) => sum + (a.quantity || 1), 0);
      const totalStock = acc.stockTotal ?? 1;
      return {
        ...acc,
        _total: totalStock,
        _assignedQty: assignedQty,
        _availableQty: Math.max(0, totalStock - assignedQty),
        _assignments: myAssigns,
      };
    });
    setProducts(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const currentTab = TABS.find((t) => t.key === activeTab);

  // Subcategorías reales dentro de la pestaña activa — igual que Assets.jsx.
  const typeOptions = useMemo(() => {
    const pool = currentTab?.types
      ? currentTab.types
      : [...new Set(products.map((p) => p.type))];
    return pool
      .map((t) => ({ value: t, label: ACCESSORY_TYPE_LABELS[t] || t }))
      .sort((x, y) => x.label.localeCompare(y.label, 'es'));
  }, [currentTab, products]);

  const locationOptions = useMemo(
    () => [...OFFICES].sort((x, y) => x.localeCompare(y, 'es')),
    [OFFICES]
  );

  // Marca y Modelo encadenados — mismo criterio que Assets.jsx: el combo de
  // Modelo se acota a la marca elegida, y ambos se calculan sobre la
  // pestaña activa (no sobre el resto de filtros ya aplicados).
  const tabProducts = useMemo(
    () => (currentTab?.types ? products.filter((p) => currentTab.types.includes(p.type)) : products),
    [products, currentTab]
  );
  const brandOptions = useMemo(
    () => [...new Set(tabProducts.map((p) => p.brand?.trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es')),
    [tabProducts]
  );
  const modelOptions = useMemo(() => {
    const pool = filterBrand ? tabProducts.filter((p) => p.brand?.trim() === filterBrand) : tabProducts;
    return [...new Set(pool.map((p) => p.model?.trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es'));
  }, [tabProducts, filterBrand]);

  const filtered = products.filter((p) => {
    const matchTab = !currentTab?.types || currentTab.types.includes(p.type);
    const matchType = !filterType || p.type === filterType;
    // Si el lote trae piezas con su propia sucursal, el filtro busca ahí
    // también — la ubicación real de cada pieza puede ser distinta a la
    // "sucursal de compra" del registro (ver Asset.serials, 2026-09-04).
    const pieceLocations = p.serials?.length > 0 ? p.serials.map((s) => s.location || '') : [p.location || ''];
    const matchLocation = !filterLocation
      || (filterLocation === '__sin_sucursal__' ? pieceLocations.some((l) => !l) : pieceLocations.includes(filterLocation));
    const matchBrand = !filterBrand || p.brand?.trim() === filterBrand;
    const matchModel = !filterModel || p.model?.trim() === filterModel;
    const matchSearch = matchesSearch(
      search,
      p.brand, p.model, p.inventoryTag, p.serialNumber, p.notes, p.location,
      specsValues(p.specs),
    );
    return matchTab && matchType && matchLocation && matchBrand && matchModel && matchSearch;
  });

  const activeFilterCount =
    (search ? 1 : 0) + (filterType ? 1 : 0) + (filterLocation ? 1 : 0) + (filterBrand ? 1 : 0) + (filterModel ? 1 : 0);
  const clearFilters = () => {
    setSearch(''); setFilterType(''); setFilterLocation(''); setFilterBrand(''); setFilterModel('');
  };

  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleReturn = async (assignId) => {
    if (!confirm('¿Devolver estas unidades al stock?')) return;
    await api.delete(`/assignments/${assignId}`);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este producto del catálogo? Esta acción no se puede deshacer.')) return;
    try {
      await api.delete(`/assets/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo eliminar el producto');
    }
  };

  // Solo cambia el campo `category` (misma lógica segura que "Mover a
  // Accesorios" en Activos): no borra ni recrea nada. Bloqueado si el
  // producto tiene más de una asignación activa o stock >1, porque Activos
  // solo modela un asignatario por registro y se perdería esa información.
  const handleReturnToAssets = async (product) => {
    const name = [product.brand, product.model].filter(Boolean).join(' ') ||
      ACCESSORY_TYPE_LABELS[product.type] || product.type;
    if (product._assignments.length > 1 || (product.stockTotal ?? 1) > 1) {
      alert(
        `"${name}" tiene stock/asignaciones múltiples y no se puede regresar directo a Activos (esa página solo admite un asignatario por registro).\n\nPrimero devuelve las unidades sobrantes desde aquí hasta dejar como máximo 1 en stock y 1 asignación, y luego repite esta acción.`
      );
      return;
    }
    if (!confirm(
      `¿Regresar "${name}" a Activos?\n\nNo se borra ni se modifica ningún dato: solo cambia de categoría y conserva su mismo registro, número de serie e historial de asignaciones.`
    )) return;
    await api.put(`/assets/${product._id}`, { category: 'equipo' });
    load();
  };

  const totalDisp = products.reduce((s, p) => s + p._availableQty, 0);
  const totalAsig = products.reduce((s, p) => s + p._assignedQty, 0);

  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

  if (loading) {
    return (
      <div className={styles.page}>
        <p style={{ marginTop: '2rem', color: '#aaa' }}>Cargando...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Accesorios TI</h1>
          <p className={styles.pageSubtitle}>
            {products.length} productos —{' '}
            <strong style={{ color: '#16a34a' }}>{totalDisp} disponibles</strong>
            {' · '}
            <strong style={{ color: '#d97706' }}>{totalAsig} asignados</strong>
          </p>
        </div>
        <button
          className={styles.btnPrimary}
          onClick={() => { setEditing(null); setModalOpen(true); }}
        >
          + Nuevo producto
        </button>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => {
          const count = products.filter((p) => !t.types || t.types.includes(p.type)).length;
          return (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => { setActiveTab(t.key); setSearch(''); setFilterType(''); setFilterLocation(''); setFilterBrand(''); setFilterModel(''); }}
            >
              {t.icon} {t.label}
              <span className={styles.tabCount}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Buscar por marca, modelo, tipo de cable..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.select} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Toda subcategoría</option>
          {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={styles.select} value={filterBrand} onChange={(e) => { setFilterBrand(e.target.value); setFilterModel(''); }}>
          <option value="">Toda marca</option>
          {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className={styles.select} value={filterModel} onChange={(e) => setFilterModel(e.target.value)}>
          <option value="">Todo modelo</option>
          {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
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
        {activeFilterCount > 0 ? ' con estos filtros' : ''}
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thumbTh}></th>
              <th>Tipo</th>
              <th>Producto</th>
              <th>Costo</th>
              <th style={{ textAlign: 'center' }}>Stock total</th>
              <th style={{ textAlign: 'center' }}>Disponible</th>
              <th style={{ textAlign: 'center' }}>Asignado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  {search ? 'Sin resultados.' : 'Sin productos registrados en esta categoría.'}
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const isExp = expanded.has(p._id);
              const detail =
                p.specs?.cableType ||
                p.specs?.consumibleType ||
                p.specs?.printerType ||
                p.specs?.toolType ||
                p.specs?.accessoryType ||
                '';
              const name =
                [p.brand, p.model].filter(Boolean).join(' ') ||
                ACCESSORY_TYPE_LABELS[p.type] ||
                p.type;

              return (
                <Fragment key={p._id}>
                  <tr>
                    <td>
                      <AssetThumbnail asset={p} />
                    </td>
                    <td>
                      <div className={styles.typeCell}>
                        <span className={styles.typeIcon}>{TYPE_ICONS[p.type] || '📦'}</span>
                        <span className={styles.typeText}>{ACCESSORY_TYPE_LABELS[p.type] || p.type}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.brandModel}>{name}</div>
                      {detail && (
                        <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '0.1rem' }}>
                          {detail}
                        </div>
                      )}
                      {p.serials?.length > 0 && (
                        <div
                          style={{ fontSize: '0.72rem', color: '#16a34a', marginTop: '0.15rem', fontWeight: 600 }}
                          title={p.serials.map((s) => `${s.serialNumber} (${s.location || 'sin sucursal'})`).join(', ')}
                        >
                          🔢 {p.serials.length} pieza{p.serials.length !== 1 ? 's' : ''} registrada{p.serials.length !== 1 ? 's' : ''}
                        </div>
                      )}
                      {p.specs?.customFields?.filter((f) => f.label?.trim() || f.value?.trim()).length > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '0.15rem' }}>
                          {p.specs.customFields.filter((f) => f.label?.trim() || f.value?.trim())
                            .slice(0, 2).map((f) => `${f.label}: ${f.value}`).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td>{p.cost != null ? `$${Number(p.cost).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <strong>{p._total}</strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <strong
                        style={{
                          color: p._availableQty > 0 ? '#16a34a' : '#dc2626',
                          fontSize: '1rem',
                        }}
                      >
                        {p._availableQty}
                      </strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: p._assignedQty > 0 ? '#d97706' : '#ccc' }}>
                        {p._assignedQty}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        {p._availableQty > 0 && (
                          <button
                            className={styles.btnPrimary}
                            style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
                            onClick={() => setAssignTarget(p)}
                          >
                            Asignar
                          </button>
                        )}
                        {p._assignments.length > 0 && (
                          <button
                            className={styles.btnEdit}
                            onClick={() => toggleExpand(p._id)}
                            title={isExp ? 'Ocultar asignaciones' : 'Ver asignaciones'}
                          >
                            {isExp ? '▲' : '▼'} {p._assignments.length}
                          </button>
                        )}
                        <button
                          className={styles.btnEdit}
                          onClick={() => { setEditing(p); setModalOpen(true); }}
                        >
                          Editar
                        </button>
                        <button
                          className={styles.btnEdit}
                          onClick={() => setTransferring(p)}
                        >
                          🚚 Transferir
                        </button>
                        <button
                          className={styles.btnEdit}
                          onClick={() => handleReturnToAssets(p)}
                          title="Regresar este registro a la página de Activos"
                        >
                          ↩️ A Activos
                        </button>
                        <button
                          className={styles.btnDelete}
                          onClick={() => handleDelete(p._id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExp && p._assignments.map((assign) => (
                    <tr key={assign._id} style={{ background: '#f8f8f8' }}>
                      <td />
                      <td style={{ paddingLeft: '2rem', color: '#ccc', fontSize: '0.75rem' }}>└</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#333' }}>
                          {assign.employee?.name || '—'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#aaa' }}>
                          {assign.employee?.office || assign.employee?.department || ''}
                        </div>
                      </td>
                      <td />
                      <td />
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#d97706' }}>
                          {assign.quantity || 1} uds.
                        </span>
                      </td>
                      <td style={{ fontSize: '0.75rem', color: '#bbb', textAlign: 'center' }}>
                        {fmtDate(assign.assignedDate)}
                      </td>
                      <td>
                        {currentUser.role === 'admin' && (
                          <button
                            className={styles.btnDelete}
                            style={{ fontSize: '0.75rem' }}
                            onClick={() => handleReturn(assign._id)}
                          >
                            Devolver
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <ProductModal
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); load(); }}
        />
      )}
      {assignTarget && (
        <AssignModal
          product={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => { setAssignTarget(null); load(); }}
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
