import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import SettingsTabs from '../components/SettingsTabs';
import api from '../services/api';
import u from './Users.module.css';
import styles from './McpAccess.module.css';

// ⚙️ Configuración → Conexión con Claude (2026-11-23, pedido explícito del
// usuario: "crea la opción para conectar un MCP a Claude de esta aplicación,
// un panel en el engrane para gestionar los accesos"). Llaves del conector
// MCP — SOLO LECTURA (decisión del usuario), limitadas por módulo. Backend:
// routes/mcpKeys.js (administración) y routes/mcp.js (el conector).

const MODULES = [
  { key: 'activos', icon: '📦', label: 'Activos y asignaciones', desc: 'Inventario, quién tiene qué equipo, historial y bajas' },
  { key: 'empleados', icon: '👥', label: 'Empleados', desc: 'Directorio (sin contraseñas ni firmas)' },
  { key: 'tickets', icon: '🎫', label: 'Tickets y solicitudes', desc: 'Mesa de Ayuda y solicitudes de cuentas, recursos, ingresos y bajas' },
  { key: 'pagos', icon: '💳', label: 'Pagos recurrentes', desc: 'Catálogo, vencimientos, folios de CxP y facturas' },
];
const MOD = Object.fromEntries(MODULES.map((m) => [m.key, m]));

const endpoint = `${window.location.origin}/api/mcp`;
const fmt = (d) => (d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No vence');

function keyState(k) {
  if (k.revokedAt) return { label: 'Revocada', cls: styles.stOff };
  if (k.expiresAt && new Date(k.expiresAt) < new Date()) return { label: 'Vencida', cls: styles.stOff };
  return { label: 'Activa', cls: styles.stOn };
}

function CopyBox({ label, value, secret, disabled }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sin permiso de portapapeles */ }
  };
  return (
    <div className={styles.copyBox}>
      {label && <span className={styles.copyLabel}>{label}</span>}
      <div className={styles.copyRow}>
        <code className={`${styles.code} ${secret ? styles.codeSecret : ''}`}>{value}</code>
        {!disabled && <button type="button" className={styles.copyBtn} onClick={copy}>{copied ? <><Icon e="✓" /> Copiado</> : 'Copiar'}</button>}
      </div>
    </div>
  );
}

function Instructions({ plain }) {
  // Sin llave (ayuda general del panel): no se deja copiar la dirección
  // incompleta — confundía (2026-11-23, el usuario preguntó "¿cuál llave?").
  const k = plain || 'amk_…';
  const sample = !plain;
  const [tab, setTab] = useState('web');
  return (
    <div>
      <div className={styles.howTabs} role="tablist">
        {[['web', 'Claude (web / escritorio)'], ['code', 'Claude Code']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`${styles.howTab} ${tab === id ? styles.howTabOn : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'web' ? (
        <ol className={styles.steps}>
          {sample && <li>Aquí arriba da clic en <strong>+ Nueva llave</strong> y créala. Te aparece esta dirección ya completa para copiarla.</li>}
          <li>En Claude abre <strong>Configuración → Conectores → Agregar conector personalizado</strong>.</li>
          <li>Nombre: <strong>Assets Manager</strong>. En URL pega {sample ? 'la dirección de tu llave, que se ve así:' : 'esta dirección (ya lleva la llave):'}
            <CopyBox value={`${endpoint}/k/${k}`} secret={!!plain} disabled={sample} />
          </li>
          <li>Deja vacíos los campos de OAuth y guarda. En un chat nuevo activa el conector y pregúntale, por ejemplo: <em>"¿qué equipo tiene asignado Juan Pérez?"</em></li>
        </ol>
      ) : (
        <ol className={styles.steps}>
          {sample && <li>Aquí arriba da clic en <strong>+ Nueva llave</strong> y créala. Te aparece este comando ya completo para copiarlo.</li>}
          <li>En una terminal corre{sample ? ' (con tu llave en lugar de amk_…)' : ''}:
            <CopyBox value={`claude mcp add --transport http assets-manager ${endpoint} --header "Authorization: Bearer ${k}"`} secret={!!plain} disabled={sample} />
          </li>
          <li>Verifica con <code>/mcp</code> dentro de Claude Code.</li>
        </ol>
      )}
    </div>
  );
}

function KeyModal({ initial, onClose, onSaved }) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [modules, setModules] = useState(initial?.modules || MODULES.map((m) => m.key));
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ? initial.expiresAt.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null); // { plain }

  const toggle = (m) => setModules((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Ponle un nombre a la llave.'); return; }
    if (!modules.length) { setError('Marca al menos un módulo.'); return; }
    setSaving(true);
    try {
      const body = { name, modules, expiresAt: expiresAt || null };
      if (editing) {
        await api.patch(`/mcp-keys/${initial._id}`, body);
        onSaved();
      } else {
        const { data } = await api.post('/mcp-keys', body);
        setCreated({ plain: data.plain });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la llave');
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <div className={u.overlay}>
        <div className={`${u.modal} ${styles.modalWide}`} role="dialog" aria-modal="true" aria-labelledby="mcp-created-title">
          <div className={u.modalHeader}>
            <h2 id="mcp-created-title" className={u.modalTitle}><Icon e="✓" /> Llave creada</h2>
          </div>
          <div className={u.form}>
            <p className={styles.warn}>
              <Icon e="🔒" /> Copia la llave ahora: <strong>no se vuelve a mostrar</strong>. Si la pierdes, revócala y crea otra.
              Quien la tenga puede consultar los módulos marcados.
            </p>
            <CopyBox label="Llave" value={created.plain} secret />
            <Instructions plain={created.plain} />
            <div className={u.modalActions}>
              <button type="button" className={u.btnPrimary} onClick={onSaved}>Ya la copié</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={u.overlay} onClick={onClose}>
      <div className={u.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mcp-key-title">
        <div className={u.modalHeader}>
          <h2 id="mcp-key-title" className={u.modalTitle}>{editing ? 'Editar llave' : 'Nueva llave para Claude'}</h2>
          <button type="button" aria-label="Cerrar" className={u.closeBtn} onClick={onClose}><Icon e="✕" /></button>
        </div>
        <form className={u.form} onSubmit={save}>
          {error && <p className={u.formError}>{error}</p>}
          <div className={u.field}>
            <label htmlFor="mcp-name">Nombre</label>
            <input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder='Ej. "Claude de Miguel" o "Claude Code de Sistemas"' autoFocus />
          </div>
          <fieldset className={styles.modFieldset}>
            <legend>Qué puede consultar (solo lectura)</legend>
            {MODULES.map((m) => (
              <label key={m.key} className={`${styles.modOption} ${modules.includes(m.key) ? styles.modOptionOn : ''}`}>
                <input type="checkbox" checked={modules.includes(m.key)} onChange={() => toggle(m.key)} />
                <span className={styles.modIcon}><Icon e={m.icon} /></span>
                <span>
                  <span className={styles.modLabel}>{m.label}</span>
                  <span className={styles.modDesc}>{m.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className={u.field}>
            <label htmlFor="mcp-exp">Vence (opcional)</label>
            <input id="mcp-exp" type="date" value={expiresAt} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className={u.modalActions}>
            <button type="button" className={u.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={u.btnPrimary} disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear llave'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function McpAccess() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'new' | key
  const [open, setOpen] = useState(null); // id con el historial abierto
  const [showRevoked, setShowRevoked] = useState(false);

  const load = () => api.get('/mcp-keys')
    .then(({ data }) => { setKeys(data); setError(''); })
    .catch((err) => setError(err.response?.data?.message || 'No se pudieron cargar las llaves'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const revoke = async (k) => {
    if (!window.confirm(`¿Revocar la llave "${k.name}"? Claude dejará de poder consultar con ella de inmediato. No se puede deshacer.`)) return;
    try { await api.delete(`/mcp-keys/${k._id}`); load(); } catch (err) { setError(err.response?.data?.message || 'No se pudo revocar'); }
  };

  const visible = keys.filter((k) => showRevoked || !k.revokedAt);
  const revokedCount = keys.filter((k) => k.revokedAt).length;

  return (
    <div className={u.page}>
      <SettingsTabs />
      <div className={u.header}>
        <div>
          <h1 className={u.title}>Conexión con Claude</h1>
          <p className={u.subtitle}>Llaves para que Claude consulte Assets Manager por MCP. Solo lectura: Claude no puede cambiar nada.</p>
        </div>
        <button className={u.btnPrimary} onClick={() => setModal('new')}>+ Nueva llave</button>
      </div>

      {error && <p className={u.formError}>{error}</p>}

      <div className={u.tableWrap}>
        <table className={u.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Llave</th>
              <th>Módulos</th>
              <th>Último uso</th>
              <th>Vence</th>
              <th>Estado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className={u.empty}>Cargando…</td></tr>}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={7} className={u.empty}>
                Todavía no hay llaves. Crea una con <strong>+ Nueva llave</strong> y sigue los pasos para conectarla en Claude.
              </td></tr>
            )}
            {visible.map((k) => {
              const st = keyState(k);
              const isOpen = open === k._id;
              return [
                <tr key={k._id} className={k.revokedAt ? styles.rowOff : undefined}>
                  <td>
                    <div className={styles.keyName}>{k.name}</div>
                    <div className={styles.muted}>Creada {fmtDay(k.createdAt)} · {k.createdByName || '—'}</div>
                  </td>
                  <td><code className={styles.prefix}>{k.prefix}…</code></td>
                  <td>
                    <div className={styles.chips}>
                      {k.modules.map((m) => <span key={m} className={styles.chip}><Icon e={MOD[m]?.icon} /> {MOD[m]?.label || m}</span>)}
                    </div>
                  </td>
                  <td>
                    {k.lastUsedAt ? (
                      <button type="button" className={styles.linkBtn} onClick={() => setOpen(isOpen ? null : k._id)} aria-expanded={isOpen}>
                        {fmt(k.lastUsedAt)} · {k.useCount} consulta{k.useCount === 1 ? '' : 's'} {isOpen ? '▴' : '▾'}
                      </button>
                    ) : <span className={styles.muted}>Nunca</span>}
                  </td>
                  <td className={u.date}>{fmtDay(k.expiresAt)}</td>
                  <td><span className={`${styles.state} ${st.cls}`}>{st.label}</span></td>
                  <td>
                    {!k.revokedAt && (
                      <div className={u.actions}>
                        <button className={u.btnEdit} onClick={() => setModal(k)}>Editar</button>
                        <button className={u.btnDelete} onClick={() => revoke(k)}>Revocar</button>
                      </div>
                    )}
                    {k.revokedAt && <span className={styles.muted}>por {k.revokedByName || '—'}</span>}
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${k._id}-h`} className={styles.histRow}>
                    <td colSpan={7}>
                      <p className={styles.histTitle}>Últimas consultas{k.lastUsedIp ? ` · última IP ${k.lastUsedIp}` : ''}</p>
                      {k.recentCalls.length === 0 ? <p className={styles.muted}>Se conectó, pero todavía no ha usado ninguna herramienta.</p> : (
                        <ul className={styles.hist}>
                          {k.recentCalls.map((c, i) => (
                            <li key={i}><span className={c.ok ? styles.okDot : styles.errDot} aria-label={c.ok ? 'Correcta' : 'Con error'} /> <code>{c.tool}</code> <span className={styles.muted}>{fmt(c.at)}</span></li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      {revokedCount > 0 && (
        <button type="button" className={styles.linkBtn} style={{ marginTop: '0.6rem' }} onClick={() => setShowRevoked((v) => !v)}>
          {showRevoked ? 'Ocultar' : 'Mostrar'} revocadas ({revokedCount})
        </button>
      )}

      <section className={styles.how}>
        <h2 className={styles.howTitle}>Cómo conectarla</h2>
        <p className={styles.muted}>Necesitas una llave: créala con <strong>+ Nueva llave</strong> y al terminar te mostramos estos pasos con la dirección completa.</p>
        <Instructions />
      </section>

      {modal && (
        <KeyModal
          initial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
