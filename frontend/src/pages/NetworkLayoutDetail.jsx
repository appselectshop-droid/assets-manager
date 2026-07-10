import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../services/api';
import styles from './NetworkLayoutDetail.module.css';

// Compara MACs sin importar el separador/mayúsculas ("00:1A:2B" vs "00-1a-2b").
const normalizeMac = (mac) => (mac || '').toUpperCase().replace(/[^0-9A-F]/g, '');

const DEVICE_TYPE_CONFIG = {
  camara_ip:    { label: 'Cámara IP', icon: '📹' },
  nvr:          { label: 'NVR', icon: '🎥' },
  poe_injector: { label: 'Inyector PoE', icon: '⚡' },
  router:       { label: 'Router', icon: '📶' },
  switch:       { label: 'Switch', icon: '🔀' },
  access_point: { label: 'Access Point (AP)', icon: '📡' },
  otro:         { label: 'Otro', icon: '❓' },
};

const STATUS_CONFIG = {
  activo:        { label: 'Activo', color: '#16a34a' },
  inactivo:      { label: 'Inactivo', color: '#6b7280' },
  mantenimiento: { label: 'Mantenimiento', color: '#d97706' },
};

// Formulario de un dispositivo — se usa tanto para crear uno nuevo (llega
// con `initialPos`, sin `device`) como para editar uno ya colocado (llega
// con `device`, sin `initialPos`). A propósito NO obliga a ligar un Activo
// real: Infra puede ya traer la IP/MAC/serie de memoria/su propio inventario
// sin que ese equipo esté dado de alta todavía.
function DeviceModal({ device, initialPos, assets, unmatchedDiscovered, onClose, onSaved, onDeleted }) {
  const isNew = !device;
  const [deviceType, setDeviceType] = useState(device?.deviceType || 'camara_ip');
  const [label, setLabel] = useState(device?.label || '');
  const [ipAddress, setIpAddress] = useState(device?.ipAddress || '');
  const [macAddress, setMacAddress] = useState(device?.macAddress || '');
  const [serialNumber, setSerialNumber] = useState(device?.serialNumber || '');
  const [status, setStatus] = useState(device?.status || 'activo');
  const [notes, setNotes] = useState(device?.notes || '');
  const [linkedAsset, setLinkedAsset] = useState(device?.assetRef || null);
  const [assetSearch, setAssetSearch] = useState('');
  const [showAssetDropdown, setShowAssetDropdown] = useState(false);
  const [discoveredSearch, setDiscoveredSearch] = useState('');
  const [showDiscoveredDropdown, setShowDiscoveredDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredAssets = assetSearch.trim().length < 2 ? [] : assets.filter((a) => {
    const q = assetSearch.toLowerCase();
    return (a.brand || '').toLowerCase().includes(q) || (a.model || '').toLowerCase().includes(q) || (a.serialNumber || '').toLowerCase().includes(q);
  }).slice(0, 8);

  const pickAsset = (asset) => {
    setLinkedAsset(asset);
    setShowAssetDropdown(false);
    setAssetSearch('');
    if (!serialNumber) setSerialNumber(asset.serialNumber || '');
  };

  const filteredDiscovered = (unmatchedDiscovered || []).filter((d) => {
    const q = discoveredSearch.trim().toLowerCase();
    if (!q) return true;
    return (d.ip || '').toLowerCase().includes(q) || (d.mac || '').toLowerCase().includes(q)
      || (d.model || '').toLowerCase().includes(q) || (d.serialNumber || '').toLowerCase().includes(q);
  }).slice(0, 8);

  // Ya identificaste (por PoE, SADP, etc.) que este dispositivo descubierto por
  // red es este pin — llena IP/MAC de un jalón en vez de escribirlos a mano.
  const pickDiscovered = (d) => {
    setIpAddress(d.ip || ipAddress);
    setMacAddress(d.mac || macAddress);
    if (!serialNumber) setSerialNumber(d.serialNumber || '');
    if (!label && d.model) setLabel(d.model);
    setShowDiscoveredDropdown(false);
    setDiscoveredSearch('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = { deviceType, label, ipAddress, macAddress, serialNumber, status, notes, assetRef: linkedAsset?._id || null };
      if (isNew) {
        await api.post(`/network-layouts/${initialPos.layoutId}/devices`, { ...payload, x: initialPos.x, y: initialPos.y });
      } else {
        await api.put(`/network-layouts/devices/${device._id}`, payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el dispositivo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este dispositivo del plano? Esta acción no se puede deshacer.')) return;
    await api.delete(`/network-layouts/devices/${device._id}`);
    onDeleted();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>{DEVICE_TYPE_CONFIG[deviceType]?.icon}</span>
          <h2 className={styles.modalTitle}>{isNew ? 'Nuevo dispositivo' : (device.label || DEVICE_TYPE_CONFIG[device.deviceType]?.label)}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && <p className={styles.formError}>{error}</p>}

            <div className={styles.row}>
              <div className={styles.field}>
                <label>Tipo *</label>
                <select className={styles.input} value={deviceType} onChange={(e) => setDeviceType(e.target.value)}>
                  {Object.entries(DEVICE_TYPE_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Estado</label>
                <select className={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label>Etiqueta / nombre</label>
              <input className={styles.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. Cámara Entrada Principal" />
            </div>

            <div className={styles.field}>
              <label>Ligar a un Activo existente (opcional)</label>
              {linkedAsset ? (
                <div className={styles.assetLinked}>
                  <span>{linkedAsset.brand} {linkedAsset.model}{linkedAsset.serialNumber ? ` (${linkedAsset.serialNumber})` : ''}</span>
                  <button type="button" className={styles.linkClear} onClick={() => setLinkedAsset(null)}>Quitar</button>
                </div>
              ) : (
                <>
                  <input
                    className={styles.input}
                    value={assetSearch}
                    onChange={(e) => { setAssetSearch(e.target.value); setShowAssetDropdown(true); }}
                    onFocus={() => setShowAssetDropdown(true)}
                    onBlur={() => setTimeout(() => setShowAssetDropdown(false), 150)}
                    placeholder="Buscar por marca, modelo o serie..."
                  />
                  {showAssetDropdown && filteredAssets.length > 0 && (
                    <div className={styles.assetDropdown}>
                      {filteredAssets.map((a) => (
                        <button type="button" key={a._id} className={styles.assetOption} onClick={() => pickAsset(a)}>
                          {a.brand} {a.model}{a.serialNumber ? ` — ${a.serialNumber}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {unmatchedDiscovered && unmatchedDiscovered.length > 0 && (
              <div className={styles.field}>
                <label>📡 Completar con un dispositivo descubierto ({unmatchedDiscovered.length} sin usar)</label>
                <input
                  className={styles.input}
                  value={discoveredSearch}
                  onChange={(e) => { setDiscoveredSearch(e.target.value); setShowDiscoveredDropdown(true); }}
                  onFocus={() => setShowDiscoveredDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDiscoveredDropdown(false), 150)}
                  placeholder="Buscar por IP, MAC, modelo o serie..."
                />
                {showDiscoveredDropdown && filteredDiscovered.length > 0 && (
                  <div className={styles.assetDropdown}>
                    {filteredDiscovered.map((d) => (
                      <button type="button" key={d._id} className={styles.assetOption} onClick={() => pickDiscovered(d)}>
                        {d.mac}{d.ip ? ` — ${d.ip}` : ''}{d.model ? ` — ${d.model}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={styles.row}>
              <div className={styles.field}>
                <label>IP</label>
                <input className={styles.input} value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="192.168.1.50" />
              </div>
              <div className={styles.field}>
                <label>MAC</label>
                <input className={styles.input} value={macAddress} onChange={(e) => setMacAddress(e.target.value)} placeholder="00:1A:2B:3C:4D:5E" />
              </div>
            </div>

            <div className={styles.field}>
              <label>Número de serie</label>
              <input className={styles.input} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </div>

            <div className={styles.field}>
              <label>Notas</label>
              <textarea className={styles.input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className={styles.modalActions}>
              {!isNew && <button type="button" className={styles.btnDanger} onClick={handleDelete}>Eliminar</button>}
              <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Los encabezados del export de la herramienta de descubrimiento varían por
// fabricante (SADP de Hikvision, ConfigTool de Dahua, etc.) — se busca por
// palabra clave en vez de exigir un nombre de columna exacto.
function extractDiscoveredRow(row) {
  const keys = Object.keys(row);
  const ipKey = keys.find((k) => /ip/i.test(k));
  const macKey = keys.find((k) => /mac/i.test(k));
  const modelKey = keys.find((k) => /model|tipo de dispositivo|device type/i.test(k));
  const serialKey = keys.find((k) => /serial|serie|\bsn\b/i.test(k));
  return {
    ip: String((ipKey ? row[ipKey] : '') ?? '').trim(),
    mac: String((macKey ? row[macKey] : '') ?? '').trim(),
    model: String((modelKey ? row[modelKey] : '') ?? '').trim(),
    serialNumber: String((serialKey ? row[serialKey] : '') ?? '').trim(),
  };
}

// Sube el .xlsx/.csv que exporta la herramienta de descubrimiento del
// fabricante (SADP, ConfigTool...) — trae IP/MAC/modelo/serie de TODAS las
// cámaras de la red sin necesitar credenciales del NVR. Resuelve de un jalón
// la parte de "qué hay en la red"; la parte de "cuál pin del plano es cuál"
// se sigue resolviendo aparte (ej. apagando puertos PoE uno a uno) y se captura
// luego con el picker de "completar con un dispositivo descubierto" del modal.
function ImportDiscoveredModal({ layoutId, onClose, onImported }) {
  const [rows, setRows] = useState([]);
  const [fileError, setFileError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError('');
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (raw.length === 0) { setFileError('El archivo no tiene filas de datos.'); return; }
      const seen = new Set();
      const parsed = raw.map((r) => {
        const parsedRow = extractDiscoveredRow(r);
        const macNorm = normalizeMac(parsedRow.mac);
        const isDuplicate = !!macNorm && seen.has(macNorm);
        if (macNorm) seen.add(macNorm);
        return { ...parsedRow, isDuplicate, include: !!macNorm && !isDuplicate };
      }).filter((r) => r.ip || r.mac || r.model || r.serialNumber);
      if (parsed.length === 0) { setFileError('No se detectó ninguna columna de IP/MAC en el archivo.'); return; }
      setRows(parsed);
    } catch (err) {
      setFileError('No se pudo leer el archivo. Verifica que sea el .xlsx/.csv que exporta tu herramienta de descubrimiento (ej. SADP, ConfigTool).');
    }
  };

  const toggleRow = (i) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, include: !r.include } : r)));
  const readyCount = rows.filter((r) => r.include && r.mac).length;

  const submit = async () => {
    const toSend = rows.filter((r) => r.include && r.mac).map((r) => ({ ip: r.ip, mac: r.mac, model: r.model, serialNumber: r.serialNumber }));
    if (toSend.length === 0) { setFileError('No hay filas listas para importar (falta la MAC).'); return; }
    setImporting(true);
    setFileError('');
    try {
      const { data } = await api.post(`/network-layouts/${layoutId}/discovered-devices`, { devices: toSend });
      setResult(data);
      setRows([]);
      onImported();
    } catch (err) {
      setFileError(err.response?.data?.message || 'No se pudo importar');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>📡</span>
          <h2 className={styles.modalTitle}>Importar dispositivos descubiertos por red</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.hint}>
            Sube el .xlsx/.csv que exporta la herramienta de descubrimiento del fabricante (ej. SADP de Hikvision,
            ConfigTool de Dahua) — trae IP/MAC/modelo/serie de todas las cámaras de la red sin necesitar la
            contraseña del NVR. Esto no coloca ningún pin: solo arma el catálogo para poder llenar cada pin desde
            el picker "Completar con un dispositivo descubierto" conforme vayas identificando cuál es cuál.
          </p>

          {result && (
            <p className={styles.formSuccess}>
              Se importaron {result.added} dispositivo(s) nuevo(s){result.skipped ? ` (${result.skipped} omitidos por repetidos o sin MAC)` : ''}.
            </p>
          )}
          {fileError && <p className={styles.formError}>{fileError}</p>}

          <div className={styles.field}>
            <label>Archivo (.xlsx, .xls o .csv)</label>
            <input className={styles.input} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
          </div>

          {rows.length > 0 && (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th></th><th>IP</th><th>MAC</th><th>Modelo</th><th>Serie</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td><input type="checkbox" checked={r.include} disabled={!r.mac} onChange={() => toggleRow(i)} /></td>
                        <td className={styles.mono}>{r.ip || '—'}</td>
                        <td className={styles.mono}>{r.mac || <span className={styles.muted}>Sin MAC</span>}</td>
                        <td>{r.model || '—'}</td>
                        <td className={styles.mono}>{r.serialNumber || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.hint}>{readyCount} de {rows.length} filas listas para importar (sin MAC no se pueden usar para identificar el dispositivo).</p>
            </>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
            {rows.length > 0 && (
              <button type="button" className={styles.btnPrimary} disabled={importing || readyCount === 0} onClick={submit}>
                {importing ? 'Importando...' : `Importar ${readyCount}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NetworkLayoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [devices, setDevices] = useState([]);
  const [assets, setAssets] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [pendingPos, setPendingPos] = useState(null);
  const [editingDevice, setEditingDevice] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const canvasRef = useRef(null);

  const load = async () => {
    const { data } = await api.get(`/network-layouts/${id}`);
    setLayout(data);
    const { data: devs } = await api.get(`/network-layouts/${id}/devices`);
    setDevices(devs);
  };

  // Dispositivos que ya se importaron del escaneo de red (SADP/ConfigTool)
  // pero cuya MAC todavía no coincide con ningún pin ya colocado — el "pool"
  // pendiente de identificar físicamente.
  const matchedMacs = new Set(devices.filter((d) => d.macAddress).map((d) => normalizeMac(d.macAddress)));
  const unmatchedDiscovered = (layout?.discoveredDevices || []).filter((d) => !matchedMacs.has(normalizeMac(d.mac)));

  const removeDiscovered = async (discoveredId) => {
    await api.delete(`/network-layouts/${id}/discovered-devices/${discoveredId}`);
    load();
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let revoke;
    api.get(`/network-layouts/${id}/image`, { responseType: 'blob' }).then((resp) => {
      const url = URL.createObjectURL(resp.data);
      revoke = url;
      setImageUrl(url);
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [id]);

  useEffect(() => {
    api.get('/assets').then(({ data }) => setAssets(data)).catch(() => setAssets([]));
  }, []);

  // Clic en el plano en modo "agregar" -> posición en % (independiente del
  // tamaño real en pantalla), abre el formulario para capturar el resto.
  const handleCanvasClick = (e) => {
    if (!addMode) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPos({ x, y, layoutId: id });
    setAddMode(false);
  };

  if (!layout) return <p className={styles.empty}>Cargando...</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <button className={styles.backBtn} onClick={() => navigate('/network-layouts')}>← Volver a Planos</button>
          <h1 className={styles.title}>{layout.name}</h1>
          <p className={styles.subtitle}>{layout.office || 'Sin sucursal especificada'} · {devices.length} dispositivo{devices.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <button className={`${styles.btnPrimary} ${addMode ? styles.btnAddActive : ''}`} onClick={() => setAddMode((v) => !v)}>
          {addMode ? '✕ Cancelar' : '➕ Agregar dispositivo'}
        </button>
        <button className={styles.btnSecondary} onClick={() => setShowImportModal(true)}>
          📡 Importar dispositivos descubiertos
        </button>
        {addMode && <span className={styles.hint}>Haz clic en el plano donde está el dispositivo.</span>}
      </div>

      <div className={`${styles.canvasWrap} ${addMode ? styles.addMode : ''}`} ref={canvasRef} onClick={handleCanvasClick}>
        {imageUrl && <img className={styles.planImage} src={imageUrl} alt={layout.name} draggable={false} />}
        <div className={styles.pinsLayer}>
          {devices.map((d) => {
            const cfg = DEVICE_TYPE_CONFIG[d.deviceType] || DEVICE_TYPE_CONFIG.otro;
            const statusColor = STATUS_CONFIG[d.status]?.color || '#6b7280';
            return (
              <div
                key={d._id}
                className={styles.pin}
                style={{ left: `${d.x}%`, top: `${d.y}%`, background: statusColor }}
                title={d.label || cfg.label}
                onClick={(e) => { e.stopPropagation(); setEditingDevice(d); }}
              >
                {cfg.icon}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.legend}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: cfg.color }} />
            {cfg.label}
          </div>
        ))}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Dispositivos en este plano</p>
        {devices.length === 0 ? (
          <p className={styles.empty}>Todavía no hay ningún dispositivo colocado — usa "➕ Agregar dispositivo" y haz clic en el plano.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Tipo</th><th>Etiqueta</th><th>IP</th><th>MAC</th><th>Serie</th><th>Estado</th><th>Activo ligado</th></tr>
              </thead>
              <tbody>
                {devices.map((d) => {
                  const cfg = DEVICE_TYPE_CONFIG[d.deviceType] || DEVICE_TYPE_CONFIG.otro;
                  return (
                    <tr key={d._id} onClick={() => setEditingDevice(d)}>
                      <td>{cfg.icon} {cfg.label}</td>
                      <td>{d.label || <span className={styles.muted}>—</span>}</td>
                      <td className={styles.mono}>{d.ipAddress || '—'}</td>
                      <td className={styles.mono}>{d.macAddress || '—'}</td>
                      <td className={styles.mono}>{d.serialNumber || '—'}</td>
                      <td style={{ color: STATUS_CONFIG[d.status]?.color, fontWeight: 700 }}>{STATUS_CONFIG[d.status]?.label}</td>
                      <td>{d.assetRef ? `${d.assetRef.brand} ${d.assetRef.model}` : <span className={styles.muted}>Sin ligar</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {unmatchedDiscovered.length > 0 && (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>📡 Dispositivos descubiertos por red sin identificar ({unmatchedDiscovered.length})</p>
          <p className={styles.hint}>
            Ya se importaron de tu herramienta de descubrimiento (IP+MAC+modelo+serie) pero todavía no se sabe a cuál
            pin del plano le tocan. En cuanto identifiques cuál cámara física es, edita su pin (o crea uno nuevo) y
            usa el buscador "Completar con un dispositivo descubierto" para llenarlo de un jalón.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>IP</th><th>MAC</th><th>Modelo</th><th>Serie</th><th></th></tr>
              </thead>
              <tbody>
                {unmatchedDiscovered.map((d) => (
                  <tr key={d._id}>
                    <td className={styles.mono}>{d.ip || '—'}</td>
                    <td className={styles.mono}>{d.mac}</td>
                    <td>{d.model || '—'}</td>
                    <td className={styles.mono}>{d.serialNumber || '—'}</td>
                    <td><button type="button" className={styles.iconBtn} title="Quitar del catálogo" onClick={() => removeDiscovered(d._id)}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingPos && (
        <DeviceModal
          initialPos={pendingPos}
          assets={assets}
          unmatchedDiscovered={unmatchedDiscovered}
          onClose={() => setPendingPos(null)}
          onSaved={() => { setPendingPos(null); load(); }}
        />
      )}
      {editingDevice && (
        <DeviceModal
          device={editingDevice}
          assets={assets}
          unmatchedDiscovered={unmatchedDiscovered}
          onClose={() => setEditingDevice(null)}
          onSaved={() => { setEditingDevice(null); load(); }}
          onDeleted={() => { setEditingDevice(null); load(); }}
        />
      )}
      {showImportModal && (
        <ImportDiscoveredModal
          layoutId={id}
          onClose={() => setShowImportModal(false)}
          onImported={load}
        />
      )}
    </div>
  );
}
