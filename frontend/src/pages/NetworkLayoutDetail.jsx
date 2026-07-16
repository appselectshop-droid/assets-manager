import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

// El color de una conexión (cable) se infiere del par de tipos que conecta,
// no se guarda como campo aparte — así nunca queda desincronizado del par
// real de dispositivos. Clave = los dos deviceType ordenados alfabéticamente.
const CONNECTION_COLORS = {
  'camara_ip|switch':    { color: '#16a34a', label: 'Cámara → Switch' },
  'access_point|switch': { color: '#2563eb', label: 'AP → Switch' },
  'switch|switch':       { color: '#d97706', label: 'Switch → Switch (uplink)' },
  'router|switch':       { color: '#7c3aed', label: 'Switch → Router (uplink)' },
  'nvr|switch':          { color: '#0891b2', label: 'NVR → Switch' },
};
const DEFAULT_CONNECTION_COLOR = { color: '#6b7280', label: 'Otro' };
const connectionColor = (c) => {
  if (!c.fromDevice || !c.toDevice) return DEFAULT_CONNECTION_COLOR;
  const key = [c.fromDevice.deviceType, c.toDevice.deviceType].sort().join('|');
  return CONNECTION_COLORS[key] || DEFAULT_CONNECTION_COLOR;
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

// Sube una imagen nueva para un plano YA existente, conservando sus
// dispositivos y conexiones (viven en colecciones aparte, ligadas por el id
// del plano) — antes la única forma de actualizar la foto era borrar todo el
// plano y volver a colocar cada dispositivo desde cero.
function ReplaceImageModal({ layoutId, onClose, onReplaced }) {
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Selecciona la imagen nueva del plano'); return; }
    setError('');
    setSaving(true);
    try {
      const form = new FormData();
      form.append('image', file);
      await api.put(`/network-layouts/${layoutId}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      onReplaced();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo reemplazar el plano');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>🖼️</span>
          <h2 className={styles.modalTitle}>Reemplazar imagen del plano</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className={styles.modalBody}>
            <p className={styles.hint}>
              Los dispositivos y conexiones que ya colocaste se conservan tal cual. Si la imagen nueva
              tiene un encuadre muy distinto a la anterior, procura que sea lo más parecido posible para
              que los pines no queden desalineados respecto al plano.
            </p>
            {error && <p className={styles.formError}>{error}</p>}
            <div className={styles.field}>
              <label>Imagen nueva (JPG, PNG o WEBP)</label>
              <input
                className={styles.input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Subiendo...' : 'Reemplazar'}</button>
            </div>
          </div>
        </form>
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
  const [connections, setConnections] = useState([]);
  const [assets, setAssets] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [drawing, setDrawing] = useState(null); // { fromDevice, points: [{x,y}] }
  const [pendingPos, setPendingPos] = useState(null);
  const [editingDevice, setEditingDevice] = useState(null);
  const [showReplaceImageModal, setShowReplaceImageModal] = useState(false);
  const canvasRef = useRef(null);
  const imageUrlRef = useRef(null);

  const load = async () => {
    const { data } = await api.get(`/network-layouts/${id}`);
    setLayout(data);
    const { data: devs } = await api.get(`/network-layouts/${id}/devices`);
    setDevices(devs);
    const { data: conns } = await api.get(`/network-layouts/${id}/connections`);
    setConnections(conns);
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

  // Separado de `load()` para poder llamarlo de nuevo después de reemplazar
  // la imagen del plano sin recargar la página entera.
  const reloadImage = async () => {
    const resp = await api.get(`/network-layouts/${id}/image`, { responseType: 'blob' });
    const url = URL.createObjectURL(resp.data);
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = url;
    setImageUrl(url);
  };

  useEffect(() => {
    reloadImage();
    return () => { if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    api.get('/assets').then(({ data }) => setAssets(data)).catch(() => setAssets([]));
  }, []);

  // Clic en el plano en modo "agregar" -> posición en % (independiente del
  // tamaño real en pantalla), abre el formulario para capturar el resto.
  // En modo "conectar", cada clic en el plano (fuera de un pin) agrega un
  // punto intermedio al trazo del cable que se está dibujando.
  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (addMode) {
      setPendingPos({ x, y, layoutId: id });
      setAddMode(false);
      return;
    }
    if (connectMode && drawing) {
      setDrawing((d) => ({ ...d, points: [...d.points, { x, y }] }));
    }
  };

  const toggleAddMode = () => {
    setAddMode((v) => !v);
    setConnectMode(false);
    setDrawing(null);
  };

  const toggleConnectMode = () => {
    setConnectMode((v) => !v);
    setAddMode(false);
    setDrawing(null);
  };

  // Clic en un pin mientras se dibuja una conexión: el primer clic marca el
  // origen, un segundo clic en OTRO pin cierra el cable con el trazo
  // acumulado hasta ahí.
  const handlePinClick = (device) => {
    if (!connectMode) { setEditingDevice(device); return; }
    if (!drawing) { setDrawing({ fromDevice: device, points: [] }); return; }
    if (drawing.fromDevice._id === device._id) return;
    finishConnection(device);
  };

  const finishConnection = async (toDevice) => {
    if (!drawing) return;
    const path = [
      { x: drawing.fromDevice.x, y: drawing.fromDevice.y },
      ...drawing.points,
      { x: toDevice.x, y: toDevice.y },
    ];
    const fromDeviceId = drawing.fromDevice._id;
    setDrawing(null);
    try {
      await api.post(`/network-layouts/${id}/connections`, { fromDevice: fromDeviceId, toDevice: toDevice._id, path });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo guardar la conexión');
    }
  };

  const handleDeleteConnection = async (connectionId) => {
    if (!confirm('¿Eliminar esta conexión? Esta acción no se puede deshacer.')) return;
    await api.delete(`/network-layouts/connections/${connectionId}`);
    load();
  };

  if (!layout) return <p className={styles.empty}>Cargando...</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <button className={styles.backBtn} onClick={() => navigate('/network-layouts')}>← Volver a Planos</button>
          <h1 className={styles.title}>{layout.name}</h1>
          <p className={styles.subtitle}>{layout.office || 'Sin sucursal especificada'} · {devices.length} dispositivo{devices.length !== 1 ? 's' : ''} · {connections.length} conexión{connections.length !== 1 ? 'es' : ''}</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <button className={`${styles.btnPrimary} ${addMode ? styles.btnAddActive : ''}`} onClick={toggleAddMode}>
          {addMode ? '✕ Cancelar' : '➕ Agregar dispositivo'}
        </button>
        <button className={`${styles.btnSecondary} ${connectMode ? styles.btnConnectActive : ''}`} onClick={toggleConnectMode}>
          {connectMode ? '✕ Cancelar' : '🔌 Conectar dispositivos'}
        </button>
        <button className={styles.btnSecondary} onClick={() => setShowReplaceImageModal(true)}>
          🖼️ Reemplazar plano
        </button>
        {addMode && <span className={styles.hint}>Haz clic en el plano donde está el dispositivo.</span>}
        {connectMode && !drawing && <span className={styles.hint}>Haz clic en el dispositivo de origen del cable.</span>}
        {connectMode && drawing && (
          <>
            <span className={styles.hint}>Haz clic en el plano para trazar el cable, o en otro dispositivo para terminar la conexión.</span>
            <button type="button" className={styles.btnCancel} onClick={() => setDrawing(null)}>✕ Cancelar conexión</button>
          </>
        )}
      </div>

      <div className={`${styles.canvasWrap} ${addMode ? styles.addMode : ''} ${connectMode ? styles.connectMode : ''}`} ref={canvasRef} onClick={handleCanvasClick}>
        {imageUrl && <img className={styles.planImage} src={imageUrl} alt={layout.name} draggable={false} />}
        <svg className={styles.connectionsLayer} viewBox="0 0 100 100" preserveAspectRatio="none">
          {connections.map((c) => {
            const pts = c.path.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <g
                key={c._id}
                className={styles.connectionGroup}
                onClick={(e) => { e.stopPropagation(); handleDeleteConnection(c._id); }}
              >
                {/* Línea invisible y ancha: el área de clic real. La línea
                    delgada de abajo era casi imposible de acertar para
                    borrarla — pedido explícito de Felipe. */}
                <polyline points={pts} className={styles.connectionHit} />
                <polyline points={pts} className={styles.connectionLine} stroke={connectionColor(c).color} />
              </g>
            );
          })}
          {drawing && (
            <polyline
              points={[{ x: drawing.fromDevice.x, y: drawing.fromDevice.y }, ...drawing.points].map((p) => `${p.x},${p.y}`).join(' ')}
              className={styles.connectionLinePreview}
            />
          )}
        </svg>
        <div className={styles.pinsLayer}>
          {devices.map((d) => {
            const cfg = DEVICE_TYPE_CONFIG[d.deviceType] || DEVICE_TYPE_CONFIG.otro;
            const statusColor = STATUS_CONFIG[d.status]?.color || '#6b7280';
            const isDrawingFrom = drawing?.fromDevice._id === d._id;
            return (
              <div
                key={d._id}
                className={`${styles.pin} ${isDrawingFrom ? styles.pinActive : ''}`}
                style={{ left: `${d.x}%`, top: `${d.y}%`, background: statusColor }}
                title={d.label || cfg.label}
                onClick={(e) => { e.stopPropagation(); handlePinClick(d); }}
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
      <div className={styles.legend}>
        <span className={styles.legendTitle}>Tipos de conexión:</span>
        {[...Object.values(CONNECTION_COLORS), DEFAULT_CONNECTION_COLOR].map((cfg) => (
          <div key={cfg.label} className={styles.legendItem}>
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
      {showReplaceImageModal && (
        <ReplaceImageModal
          layoutId={id}
          onClose={() => setShowReplaceImageModal(false)}
          onReplaced={() => { setShowReplaceImageModal(false); reloadImage(); }}
        />
      )}
    </div>
  );
}
