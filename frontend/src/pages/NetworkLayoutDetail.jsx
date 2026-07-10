import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import styles from './NetworkLayoutDetail.module.css';

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
function DeviceModal({ device, initialPos, assets, onClose, onSaved, onDeleted }) {
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
  const canvasRef = useRef(null);

  const load = async () => {
    const { data } = await api.get(`/network-layouts/${id}`);
    setLayout(data);
    const { data: devs } = await api.get(`/network-layouts/${id}/devices`);
    setDevices(devs);
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

      {pendingPos && (
        <DeviceModal
          initialPos={pendingPos}
          assets={assets}
          onClose={() => setPendingPos(null)}
          onSaved={() => { setPendingPos(null); load(); }}
        />
      )}
      {editingDevice && (
        <DeviceModal
          device={editingDevice}
          assets={assets}
          onClose={() => setEditingDevice(null)}
          onSaved={() => { setEditingDevice(null); load(); }}
          onDeleted={() => { setEditingDevice(null); load(); }}
        />
      )}
    </div>
  );
}
