import Icon from '../components/Icon';
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import page from './Page.module.css';
import styles from './Pagos.module.css';
import { readPagosExcel, buildPagosTemplate } from './pagosExcel';
import FacturasModal, { FacturasButton } from './PagosFacturas';

// Pagos Recurrentes (2026-11-11, pedido explícito del usuario). Reemplaza
// el ritual de revisar a mano el Excel de pagos cada semana: el sistema
// sabe qué vence, calcula cuándo hay que meterlo a Cuentas por Pagar (el
// miércoles de la semana anterior a su semana de pago) y en qué carpeta
// "Semana N" de OneDrive va. Ver backend/src/utils/paymentSchedule.js.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const FRECUENCIAS = [
  ['mensual', 'Mensual'], ['bimestral', 'Bimestral'], ['trimestral', 'Trimestral'],
  ['semestral', 'Semestral'], ['anual', 'Anual'],
];
const ESTADOS = {
  pendiente:        { label: 'Falta factura',    cls: 'stPendiente' },
  factura_recibida: { label: 'Factura recibida', cls: 'stFactura' },
  metido:           { label: 'Metido en CxP',    cls: 'stMetido' },
  pagado:           { label: 'Pagado',           cls: 'stPagado' },
  omitido:          { label: 'Omitido',          cls: 'stOmitido' },
};

function fecha(s, { dia = true } = {}) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${dia ? `${DIAS[dow]} ` : ''}${d} ${MESES[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
}
function money(n, moneda = 'MXN') {
  if (n === null || n === undefined || n === '') return '—';
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${moneda !== 'MXN' ? ` ${moneda}` : ''}`;
}
function vencimientoTexto(s) {
  if (s.metodo === 'tarjeta') {
    if (s.frecuencia === 'mensual') return `Cargo el día ${s.diaVencimiento} de cada mes`;
    return `Cargo ${FRECUENCIAS.find(([k]) => k === s.frecuencia)?.[1].toLowerCase() || s.frecuencia} · ${s.diaVencimiento} de ${MESES_LARGOS[(s.mesVencimiento || 1) - 1]}`;
  }
  if (s.frecuencia === 'mensual') return `Día ${s.diaVencimiento} de cada mes`;
  const f = FRECUENCIAS.find(([k]) => k === s.frecuencia)?.[1] || s.frecuencia;
  return `${f} · ${s.diaVencimiento} de ${MESES_LARGOS[(s.mesVencimiento || 1) - 1]}`;
}
const errMsg = (err, fallback) => err.response?.data?.message || err.message || fallback;

export default function Pagos() {
  const [tab, setTab] = useState('semana');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [editingCycle, setEditingCycle] = useState(null);
  const [folioFor, setFolioFor] = useState(null);
  const [facturasFor, setFacturasFor] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  const loadSummary = () => api.get('/payments/summary')
    .then(({ data }) => { setSummary(data); setError(''); })
    .catch((err) => setError(errMsg(err, 'No se pudo cargar el tablero')));
  useEffect(() => { loadSummary(); }, []);

  const updateCycle = async (cycle, changes) => {
    try {
      await api.put(`/payments/cycles/${cycle._id}`, changes);
      await loadSummary();
      return true;
    } catch (err) {
      alert(errMsg(err, 'No se pudo actualizar'));
      return false;
    }
  };

  const tabs = [
    ['semana', '📅', 'Esta semana', summary ? summary.estaSemana.length + summary.atrasados.length : null],
    ['tarjeta', '💳', 'Cargos a tarjeta', summary?.tarjeta?.porAdjuntar.length || null],
    ['catalogo', '📚', 'Catálogo', null],
    ['historial', '🧾', 'Historial', null],
    ['correo', '✉️', 'Recordatorio', null],
  ];

  return (
    <div>
      <div className={page.header}>
        <div>
          <h1 className={page.title}>Pagos Recurrentes</h1>
          <p className={page.subtitle}>
            {summary
              ? <>Hoy {fecha(summary.hoy)} · corte <strong>{fecha(summary.corte)}</strong> · se pagan el {fecha(summary.fechaPagoCorte)} · carpeta <strong>Semana {summary.semana}</strong></>
              : 'Qué meter a Cuentas por Pagar cada miércoles, una semana antes de su fecha límite.'}
          </p>
        </div>
      </div>

      <div className={page.tabs}>
        {tabs.map(([key, icon, label, count]) => (
          <button key={key} className={`${page.tab} ${tab === key ? page.tabActive : ''}`} onClick={() => setTab(key)}>
            <span className={page.tabIcon}><Icon e={icon} /></span>{label}
            {count ? <span className={page.tabCount}>{count}</span> : null}
          </button>
        ))}
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {tab === 'semana' && summary && (
        <SemanaView summary={summary} onEdit={setEditingCycle} onUpdate={updateCycle} onMetido={setFolioFor} onFacturas={setFacturasFor} />
      )}
      {tab === 'tarjeta' && summary && <TarjetaView summary={summary} onEdit={setEditingCycle} onFacturas={setFacturasFor} />}
      {tab === 'catalogo' && <CatalogoView onChanged={loadSummary} />}
      {tab === 'historial' && <HistorialView onEdit={setEditingCycle} onFacturas={setFacturasFor} reloadKey={historyKey} />}
      {tab === 'correo' && <CorreoView />}

      {editingCycle && (
        <CycleModal
          cycle={editingCycle}
          onClose={() => setEditingCycle(null)}
          onSave={async (changes) => { if (await updateCycle(editingCycle, changes)) setEditingCycle(null); }}
        />
      )}
      {facturasFor && (
        <FacturasModal
          cycle={facturasFor}
          onClose={() => setFacturasFor(null)}
          onChanged={(updated) => { setFacturasFor(updated); loadSummary(); setHistoryKey((k) => k + 1); }}
        />
      )}
      {folioFor && (
        <FolioModal
          cycle={folioFor}
          onClose={() => setFolioFor(null)}
          onSave={async (folioCxp) => { if (await updateCycle(folioFor, { estado: 'metido', folioCxp })) setFolioFor(null); }}
        />
      )}
    </div>
  );
}

// ── Esta semana ───────────────────────────────────────────────────────────
function SemanaView({ summary, onEdit, onUpdate, onMetido, onFacturas }) {
  const proximosPorSemana = useMemo(() => {
    const groups = new Map();
    for (const c of summary.proximos) {
      const k = c.fechaMeter;
      if (!groups.has(k)) groups.set(k, { fechaMeter: k, semana: c.semana, items: [] });
      groups.get(k).items.push(c);
    }
    return [...groups.values()];
  }, [summary]);

  const total = (items) => items.reduce((acc, c) => acc + (c.service.moneda === 'MXN' ? (c.montoReal ?? c.service.montoEstimado ?? 0) : 0), 0);

  return (
    <div className={styles.stack}>
      <div className={styles.kpis}>
        <Kpi tone="danger" value={summary.atrasados.length} label="Atrasados" hint="Ya pasó su corte y no se han metido" />
        <Kpi tone="brand" value={summary.estaSemana.length} label={`Meter el ${fecha(summary.corte)}`} hint={`Carpeta Semana ${summary.semana}`} />
        <Kpi tone="muted" value={summary.proximos.length} label="Próximas 6 semanas" hint="Ya calculados" />
        <Kpi tone="ok" value={summary.metidos.length} label="Metidos, sin pagar" hint="Esperando que CxP los pague" />
      </div>

      {summary.atrasados.length > 0 && (
        <Section tone="danger" title="Atrasados" subtitle="Su corte ya pasó — mételos lo antes posible o márcalos como omitidos si no aplican.">
          <CycleTable items={summary.atrasados} onEdit={onEdit} onUpdate={onUpdate} onMetido={onMetido} onFacturas={onFacturas} showMeter />
        </Section>
      )}

      <Section
        tone="brand"
        title={`Meter el ${fecha(summary.corte)} — Semana ${summary.semana}`}
        subtitle={`Vencen entre el ${fecha(summary.fechaPagoCorte)} y el ${fecha(addDaysStr(summary.fechaPagoCorte, 6))} · total estimado ${money(total(summary.estaSemana))}`}
      >
        {summary.estaSemana.length
          ? <CycleTable items={summary.estaSemana} onEdit={onEdit} onUpdate={onUpdate} onMetido={onMetido} onFacturas={onFacturas} />
          : <p className={styles.emptyLine}>Nada pendiente para este corte. <Icon e="🎉" /></p>}
      </Section>

      {proximosPorSemana.map((g) => (
        <Section
          key={g.fechaMeter}
          tone="muted"
          title={`Semana ${g.semana} — meter el ${fecha(g.fechaMeter)}`}
          subtitle={`${g.items.length} pago(s) · total estimado ${money(total(g.items))}`}
          collapsible
        >
          <CycleTable items={g.items} onEdit={onEdit} onUpdate={onUpdate} onMetido={onMetido} onFacturas={onFacturas} />
        </Section>
      ))}

      {summary.metidos.length > 0 && (
        <Section tone="ok" title="Metidos en CxP, sin confirmar pago" subtitle="Márcalos como pagados cuando CxP los pague." collapsible>
          <CycleTable items={summary.metidos} onEdit={onEdit} onUpdate={onUpdate} onMetido={onMetido} onFacturas={onFacturas} showFolio />
        </Section>
      )}
    </div>
  );
}

function addDaysStr(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function Kpi({ tone, value, label, hint }) {
  return (
    <div className={`${styles.kpi} ${styles[`tone_${tone}`]}`}>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiHint}>{hint}</div>
    </div>
  );
}

function Section({ tone, title, subtitle, children, collapsible }) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <section className={`${styles.section} ${styles[`tone_${tone}`]}`}>
      <button type="button" className={styles.sectionHead} onClick={() => collapsible && setOpen(!open)} disabled={!collapsible}>
        <div>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {subtitle && <p className={styles.sectionSub}>{subtitle}</p>}
        </div>
        {collapsible && <span className={styles.chevron}>{open ? '▾' : '▸'}</span>}
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </section>
  );
}

// Cargos a tarjeta: mismos estados guardados, otra lectura (no hay CxP).
function cardEstado(c, hoy) {
  if (c.estado === 'pagado') return { label: 'Invoice adjunto', cls: 'stPagado' };
  if (c.estado === 'omitido') return ESTADOS.omitido;
  return c.fechaLimite <= hoy ? { label: 'Cobrado · falta invoice', cls: 'stPendiente' } : { label: 'Próximo cargo', cls: 'stOmitido' };
}
function StatusBadge({ estado, cycle }) {
  const e = cycle?.service?.metodo === 'tarjeta'
    ? cardEstado(cycle, new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10))
    : ESTADOS[estado] || ESTADOS.pendiente;
  return <span className={`${styles.badge} ${styles[e.cls]}`}>{e.label}</span>;
}

function CycleTable({ items, onEdit, onUpdate, onMetido, onFacturas, showMeter, showFolio }) {
  return (
    <div className={page.tableWrap}>
      <table className={page.table}>
        <thead>
          <tr>
            <th>Proveedor / cuenta</th>
            <th>Compañía</th>
            <th>Vence</th>
            {showMeter && <th>Corte</th>}
            <th>Monto</th>
            <th>Estado</th>
            {showFolio && <th>Folio CxP</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c._id}>
              <td>
                <div className={page.nameCell}>{c.service.proveedor}</div>
                <div className={page.textMuted2}>{c.service.cuenta || '—'}{c.service.motivo ? ` · ${c.service.motivo}` : ''}</div>
              </td>
              <td>
                <div>{c.service.compania || '—'}</div>
                <div className={page.textMuted2}>{c.service.sucursal}</div>
              </td>
              <td className={styles.nowrap}>
                {fecha(c.fechaLimite)}
                {c.fechaLimiteManual && <span className={styles.manualTag} title="Fecha corregida a mano según la factura"><Icon e="✎" /></span>}
              </td>
              {showMeter && <td className={`${styles.nowrap} ${styles.late}`}>{fecha(c.fechaMeter)} · S{c.semana}</td>}
              <td className={styles.nowrap}>{money(c.montoReal ?? c.service.montoEstimado, c.service.moneda)}</td>
              <td><StatusBadge estado={c.estado} /></td>
              {showFolio && <td className={styles.nowrap}>{c.folioCxp || '—'}</td>}
              <td>
                <div className={styles.rowActions}>
                  <FacturasButton cycle={c} onClick={() => onFacturas(c)} />
                  {(c.estado === 'pendiente' || c.estado === 'factura_recibida') && (
                    <button className={styles.actMetido} onClick={() => onMetido(c)}>Metido en CxP</button>
                  )}
                  {c.estado === 'metido' && (
                    <button className={styles.actPagado} onClick={() => onUpdate(c, { estado: 'pagado' })}>Pagado <Icon e="✓" /></button>
                  )}
                  <button className={page.btnEdit} onClick={() => onEdit(c)}>Editar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FolioModal({ cycle, onClose, onSave }) {
  const [folio, setFolio] = useState(cycle.folioCxp || '');
  const [saving, setSaving] = useState(false);
  return (
    <div className={page.overlay} onClick={onClose}>
      <div className={page.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={page.modalTitle}>Metido en Cuentas por Pagar</h2>
        <p className={styles.modalLead}>{cycle.service.proveedor} · {cycle.service.cuenta} · vence {fecha(cycle.fechaLimite)}</p>
        <form className={page.form} onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSave(folio); setSaving(false); }}>
          <div className={page.field}>
            <label>Folio de la solicitud (opcional)</label>
            <input autoFocus value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="Ej. SSMB-SS-2026-00731" />
          </div>
          <div className={page.modalActions}>
            <button type="button" className={page.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={page.btnPrimary} disabled={saving}>{saving ? 'Guardando…' : 'Marcar como metido'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CycleModal({ cycle, onClose, onSave }) {
  const [form, setForm] = useState({
    estado: cycle.estado,
    fechaLimite: cycle.fechaLimite,
    folioCxp: cycle.folioCxp || '',
    montoReal: cycle.montoReal ?? '',
    notas: cycle.notas || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className={page.overlay} onClick={onClose}>
      <div className={page.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={page.modalTitle}>{cycle.service.proveedor}</h2>
        <p className={styles.modalLead}>
          {cycle.service.cuenta || '—'} · {cycle.service.compania} · periodo {cycle.periodo}<br />
          {cycle.service.metodo === 'tarjeta'
            ? <>Cargo a tarjeta{cycle.service.tarjeta ? ` ${cycle.service.tarjeta}` : ''} · se cobra solo, sin solicitud en CxP</>
            : <>Corte actual: <strong>{fecha(cycle.fechaMeter)}</strong> (Semana {cycle.semana}) · se paga el {fecha(cycle.fechaPago)}</>}
        </p>
        <form className={page.form} onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSave(form); setSaving(false); }}>
          <div className={page.row}>
            <div className={page.field}>
              <label>{cycle.service.metodo === 'tarjeta' ? 'Fecha del cargo' : 'Fecha límite (según la factura)'}</label>
              <input type="date" value={form.fechaLimite} onChange={set('fechaLimite')} required />
            </div>
            <div className={page.field}>
              <label>Estado</label>
              <select value={form.estado} onChange={set('estado')}>
                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className={page.row}>
            <div className={page.field}>
              <label>Folio CxP</label>
              <input value={form.folioCxp} onChange={set('folioCxp')} placeholder="SSMB-SS-2026-00000" />
            </div>
            <div className={page.field}>
              <label>Monto real ({cycle.service.moneda})</label>
              <input type="number" step="0.01" value={form.montoReal} onChange={set('montoReal')} placeholder={cycle.service.montoEstimado ?? ''} />
            </div>
          </div>
          <div className={page.field}>
            <label>Notas</label>
            <textarea rows={2} value={form.notas} onChange={set('notas')} />
          </div>
          {form.fechaLimite !== cycle.fechaLimite && (
            <p className={styles.hint}>Al cambiar la fecha límite se recalcula el corte y la semana de este pago (solo de este periodo).</p>
          )}
          <div className={page.modalActions}>
            <button type="button" className={page.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={page.btnPrimary} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Cargos a tarjeta ──────────────────────────────────────────────────────
// Pedido explícito del usuario (2026-11-11): Claude, Monday, Adobe, ChatGPT
// y Mega se cobran solos a la tarjeta y solo generan invoice. No hay nada
// que meter a CxP: el día del cargo aparece aquí (y en el correo) y se
// cierra al adjuntar el invoice.
function diasDesde(s, hoy) {
  const n = Math.round((Date.parse(hoy) - Date.parse(s)) / 864e5);
  if (n === 0) return 'hoy';
  if (n === 1) return 'ayer';
  return n > 0 ? `hace ${n} días` : `en ${-n} días`;
}

function TarjetaView({ summary, onEdit, onFacturas }) {
  const { porAdjuntar, proximos } = summary.tarjeta || { porAdjuntar: [], proximos: [] };
  const totalRef = (items) => items.reduce((acc, c) => acc + (c.service.moneda === 'MXN' ? (c.montoReal ?? c.service.montoEstimado ?? 0) : 0), 0);
  const usd = proximos.filter((c) => c.service.moneda !== 'MXN').length;
  return (
    <div className={styles.stack}>
      <div className={styles.kpis}>
        <Kpi tone="danger" value={porAdjuntar.length} label="Cobrados sin invoice" hint="Ya pasó la fecha del cargo" />
        <Kpi tone="muted" value={proximos.length} label="Próximos 30 días" hint={`≈ ${money(totalRef(proximos))}${usd ? ` + ${usd} en USD/EUR` : ''}`} />
      </div>

      <Section tone="danger" title="Ya se cobraron — adjunta su invoice" subtitle="Busca el invoice en la cuenta del proveedor y súbelo; con eso queda cerrado. El total cambia cada mes: el monto mostrado es solo referencia.">
        {porAdjuntar.length
          ? <CardTable items={porAdjuntar} hoy={summary.hoy} onEdit={onEdit} onFacturas={onFacturas} />
          : <p className={styles.emptyLine}>Todos los cargos cobrados tienen su invoice. <Icon e="🎉" /></p>}
      </Section>

      <Section tone="muted" title="Próximos cargos" subtitle="Lo que se va a cobrar a la tarjeta en los próximos 30 días." collapsible>
        {proximos.length
          ? <CardTable items={proximos} hoy={summary.hoy} onEdit={onEdit} onFacturas={onFacturas} />
          : <p className={styles.emptyLine}>Nada en los próximos 30 días.</p>}
      </Section>
    </div>
  );
}

function CardTable({ items, hoy, onEdit, onFacturas }) {
  return (
    <div className={page.tableWrap}>
      <table className={page.table}>
        <thead>
          <tr><th>Proveedor / cuenta</th><th>Cargo</th><th>Tarjeta</th><th>Monto ref.</th><th>Estado</th><th /></tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c._id}>
              <td>
                <div className={page.nameCell}>{c.service.proveedor}</div>
                <div className={page.textMuted2}>{c.service.cuenta || '—'}{c.service.motivo ? ` · ${c.service.motivo}` : ''}</div>
              </td>
              <td className={styles.nowrap}>
                {fecha(c.fechaLimite)} <span className={page.textMuted2}>· {diasDesde(c.fechaLimite, hoy)}</span>
              </td>
              <td className={styles.nowrap}>{c.service.tarjeta || '—'}</td>
              <td className={styles.nowrap}>{money(c.montoReal ?? c.service.montoEstimado, c.service.moneda)}</td>
              <td><StatusBadge estado={c.estado} cycle={c} /></td>
              <td>
                <div className={styles.rowActions}>
                  <FacturasButton cycle={c} onClick={() => onFacturas(c)} />
                  <button className={page.btnEdit} onClick={() => onEdit(c)}>Editar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Catálogo ──────────────────────────────────────────────────────────────
const EMPTY_SERVICE = {
  proveedor: '', cuenta: '', motivo: '', centroCostos: '', compania: '', sucursal: '', direccion: '',
  montoEstimado: '', moneda: 'MXN', frecuencia: 'mensual', diaVencimiento: '', mesVencimiento: '', activo: true, notas: '',
  metodo: 'cxp', tarjeta: '', emisorFactura: '',
};

function CatalogoView({ onChanged }) {
  const [services, setServices] = useState(null);
  const [q, setQ] = useState('');
  const [freq, setFreq] = useState('');
  const [metodo, setMetodo] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = () => api.get('/payments/services').then(({ data }) => setServices(data));
  useEffect(() => { load(); }, []);
  const changed = () => { load(); onChanged(); };

  const filtered = (services || []).filter((s) => {
    if (!showInactive && !s.activo) return false;
    if (freq && s.frecuencia !== freq) return false;
    if (metodo && (s.metodo || 'cxp') !== metodo) return false;
    if (!q) return true;
    const hay = `${s.proveedor} ${s.cuenta} ${s.compania} ${s.sucursal} ${s.motivo}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });

  const remove = async (s) => {
    if (!window.confirm(`¿Quitar "${s.proveedor} ${s.cuenta}" del catálogo? Si ya tiene pagos metidos/pagados solo se desactiva.`)) return;
    try {
      const { data } = await api.delete(`/payments/services/${s._id}`);
      if (data.deactivated) alert('Tenía historial, así que solo se desactivó.');
      changed();
    } catch (err) { alert(errMsg(err, 'No se pudo quitar')); }
  };

  return (
    <div className={styles.stack}>
      <div className={page.toolbar}>
        <input className={page.search} placeholder="Buscar proveedor, cuenta, compañía…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={page.select} value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="">Todas las frecuencias</option>
          {FRECUENCIAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className={page.select} value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Cómo se paga">
          <option value="">CxP y tarjeta</option>
          <option value="cxp">Solo Cuentas por Pagar</option>
          <option value="tarjeta">Solo cargos a tarjeta</option>
        </select>
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Ver inactivos
        </label>
        <div className={styles.toolbarRight}>
          <button className={page.btnSecondary} onClick={() => buildPagosTemplate(services || [])} title="Excel para llenar con pagos nuevos e importarlo">Descargar plantilla</button>
          <button className={page.btnSecondary} onClick={() => setImporting(true)}>Importar Excel</button>
          <button className={page.btnPrimary} onClick={() => setEditing(EMPTY_SERVICE)}>+ Nuevo pago</button>
        </div>
      </div>

      {services === null ? <p className={styles.emptyLine}>Cargando…</p> : (
        <div className={page.tableWrap}>
          <table className={page.table}>
            <thead>
              <tr>
                <th>Proveedor / cuenta</th>
                <th>Compañía / sucursal</th>
                <th>Vencimiento</th>
                <th>Monto est.</th>
                <th>Próximo corte / cargo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className={page.empty}>
                  {services.length ? 'Nada coincide con el filtro.' : 'Catálogo vacío — usa "Importar Excel" para cargar tus hojas Mensual y Anual.'}
                </td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s._id} className={s.activo ? '' : styles.inactive}>
                  <td>
                    <div className={page.nameCell}>{s.proveedor}</div>
                    <div className={page.textMuted2}>{s.cuenta || '—'}{s.motivo ? ` · ${s.motivo}` : ''}</div>
                  </td>
                  <td>
                    <div>{s.compania || '—'}</div>
                    <div className={page.textMuted2}>{[s.sucursal, s.centroCostos].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className={styles.nowrap}>{vencimientoTexto(s)}</td>
                  <td className={styles.nowrap}>{money(s.montoEstimado, s.moneda)}</td>
                  <td className={styles.nowrap}>
                    {!s.proximo ? '—' : s.metodo === 'tarjeta'
                      ? <>{fecha(s.proximo.fechaLimite)} <span className={page.textMuted2}>· cargo a tarjeta</span></>
                      : <>{fecha(s.proximo.fechaMeter)} <span className={page.textMuted2}>· S{s.proximo.semana} · vence {fecha(s.proximo.fechaLimite, { dia: false })}</span></>}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button className={page.btnEdit} onClick={() => setEditing(s)}>Editar</button>
                      <button className={page.btnDelete} onClick={() => remove(s)}>Quitar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {services && <p className={page.textMuted2}>{filtered.length} de {services.length} pagos en catálogo.</p>}

      {editing && <ServiceModal service={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed(); }} />}
      {importing && <ImportExcelModal services={services || []} onClose={() => setImporting(false)} onDone={() => { setImporting(false); changed(); }} />}
    </div>
  );
}

function ServiceModal({ service, onClose, onSaved }) {
  const isNew = !service._id;
  const [form, setForm] = useState({
    ...EMPTY_SERVICE,
    ...service,
    montoEstimado: service.montoEstimado ?? '',
    mesVencimiento: service.mesVencimiento ?? '',
    diaVencimiento: service.diaVencimiento ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isNew) await api.post('/payments/services', form);
      else await api.put(`/payments/services/${service._id}`, form);
      onSaved();
    } catch (err) {
      setError(errMsg(err, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={page.overlay} onClick={onClose}>
      <div className={`${page.modal} ${styles.wideModal}`} onClick={(e) => e.stopPropagation()}>
        <h2 className={page.modalTitle}>{isNew ? 'Nuevo pago recurrente' : 'Editar pago recurrente'}</h2>
        <form className={page.form} onSubmit={submit}>
          <div className={page.row}>
            <div className={page.field}>
              <label>Cómo se paga</label>
              <select value={form.metodo || 'cxp'} onChange={set('metodo')}>
                <option value="cxp">Solicitud en Cuentas por Pagar</option>
                <option value="tarjeta">Cargo directo a tarjeta</option>
              </select>
            </div>
            {form.metodo === 'tarjeta' ? (
              <div className={page.field}><label>Tarjeta</label><input value={form.tarjeta || ''} onChange={set('tarjeta')} placeholder="Ej. Amex" /></div>
            ) : <div className={page.field} />}
          </div>
          <div className={page.row}>
            <div className={page.field}><label>Proveedor *</label><input value={form.proveedor} onChange={set('proveedor')} required /></div>
            <div className={page.field}><label>Cuenta / teléfono / contrato</label><input value={form.cuenta} onChange={set('cuenta')} /></div>
          </div>
          <div className={page.row}>
            <div className={page.field}><label>Motivo de pago</label><input value={form.motivo} onChange={set('motivo')} placeholder="INTERNET, TELEFONO LOCAL…" /></div>
            <div className={page.field}><label>Centro de costos</label><input value={form.centroCostos} onChange={set('centroCostos')} /></div>
          </div>
          <div className={page.row}>
            <div className={page.field}><label>Compañía</label><input value={form.compania} onChange={set('compania')} /></div>
            <div className={page.field}><label>Sucursal</label><input value={form.sucursal} onChange={set('sucursal')} /></div>
          </div>
          <div className={page.row}>
            <div className={page.field}><label>Dirección</label><input value={form.direccion} onChange={set('direccion')} /></div>
            <div className={page.field}>
              <label>{form.metodo === 'tarjeta' ? 'Monto de referencia (varía)' : 'Monto estimado'}</label>
              <div className={styles.inline}>
                <input type="number" step="0.01" value={form.montoEstimado} onChange={set('montoEstimado')} />
                <select value={form.moneda} onChange={set('moneda')} className={styles.currency}>
                  <option>MXN</option><option>USD</option><option>EUR</option>
                </select>
              </div>
            </div>
          </div>
          <div className={styles.row3}>
            <div className={page.field}>
              <label>Frecuencia</label>
              <select value={form.frecuencia} onChange={set('frecuencia')}>
                {FRECUENCIAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className={page.field}>
              <label>{form.metodo === 'tarjeta' ? 'Día del cargo *' : 'Día de vencimiento *'}</label>
              <input type="number" min={1} max={31} value={form.diaVencimiento} onChange={set('diaVencimiento')} required />
            </div>
            <div className={page.field}>
              <label>{form.frecuencia === 'mensual' ? 'Mes (no aplica)' : 'Mes de vencimiento *'}</label>
              <select value={form.mesVencimiento} onChange={set('mesVencimiento')} disabled={form.frecuencia === 'mensual'} required={form.frecuencia !== 'mensual'}>
                <option value="">—</option>
                {MESES_LARGOS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className={page.field}><label>Notas</label><textarea rows={2} value={form.notas} onChange={set('notas')} /></div>
          {!isNew && (
            <label className={styles.checkLabel}><input type="checkbox" checked={form.activo} onChange={set('activo')} /> Activo (genera recordatorios)</label>
          )}
          {error && <div className={styles.errorBox}>{error}</div>}
          <div className={page.modalActions}>
            <button type="button" className={page.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={page.btnPrimary} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportExcelModal({ services, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    try { setRows(await readPagosExcel(file)); } catch (err) { setError(err.message); setRows(null); }
  };

  const valid = (rows || []).filter((r) => !r._error);
  const invalid = (rows || []).filter((r) => r._error);

  const doImport = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/payments/services/import', { rows: valid.map(({ _error, ...r }) => r) });
      setResult(data);
    } catch (err) {
      setError(errMsg(err, 'No se pudo importar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={page.overlay} onClick={onClose}>
      <div className={`${page.modal} ${styles.xwideModal}`} onClick={(e) => e.stopPropagation()}>
        <h2 className={page.modalTitle}>Importar desde Excel</h2>
        {result ? (
          <>
            <p className={styles.modalLead}>
              Se agregaron <strong>{result.created}</strong> pagos al catálogo.
              {result.skipped.length > 0 && <> {result.skipped.length} se saltaron ({[...new Set(result.skipped.map((s) => s.reason))].join(', ')}).</>}
            </p>
            <div className={page.modalActions}><button className={page.btnPrimary} onClick={onDone}>Listo</button></div>
          </>
        ) : (
          <>
            <p className={styles.modalLead}>
              Sube la <strong>plantilla</strong> llena (<button type="button" className={styles.linkBtn} onClick={() => buildPagosTemplate(services)}>descargar plantilla</button>) o tu archivo de pagos de siempre con hojas <strong>Mensual</strong> y <strong>Anual</strong>.
              Los recordatorios empiezan con lo que vence a partir del próximo corte; lo de cortes anteriores se asume ya metido.
              Lo que ya exista en el catálogo no se duplica.
            </p>
            <input type="file" accept=".xlsx,.xlsm,.xls" onChange={onFile} />
            {rows && (
              <div className={styles.importPreview}>
                <p><strong>{valid.length}</strong> renglones listos{invalid.length ? <> · <span className={styles.late}>{invalid.length} con problema (no se importan, agrégalos a mano)</span></> : null}</p>
                <div className={`${page.tableWrap} ${styles.previewScroll}`}>
                  <table className={page.table}>
                    <thead><tr><th>Origen</th><th>Proveedor / cuenta</th><th>Compañía</th><th>Vencimiento</th><th>Monto</th></tr></thead>
                    <tbody>
                      {[...invalid, ...valid].map((r) => (
                        <tr key={r.origen} className={r._error ? styles.rowError : (r.activo ? '' : styles.inactive)}>
                          <td className={styles.nowrap}>{r.origen.replace('Excel: ', '')}</td>
                          <td><div className={page.nameCell}>{r.proveedor}</div><div className={page.textMuted2}>{r.cuenta}</div></td>
                          <td>{r.compania}</td>
                          <td>{r._error ? <span className={styles.late}>{r._error}</span> : <>{vencimientoTexto(r)}{!r.activo && ' · inactivo (cancelado)'}</>}</td>
                          <td className={styles.nowrap}>{money(r.montoEstimado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {error && <div className={styles.errorBox}>{error}</div>}
            <div className={page.modalActions}>
              <button className={page.btnCancel} onClick={onClose}>Cancelar</button>
              <button className={page.btnPrimary} disabled={!valid.length || saving} onClick={doImport}>
                {saving ? 'Importando…' : `Importar ${valid.length} pagos`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Historial ─────────────────────────────────────────────────────────────
function HistorialView({ onEdit, onFacturas, reloadKey }) {
  const [cycles, setCycles] = useState(null);
  const [estado, setEstado] = useState('metido,pagado,omitido');
  const [q, setQ] = useState('');

  useEffect(() => {
    setCycles(null);
    api.get('/payments/cycles', { params: { estado } }).then(({ data }) => setCycles(data));
  }, [estado, reloadKey]);

  const filtered = (cycles || []).filter((c) => {
    if (!q) return true;
    const hay = `${c.service.proveedor} ${c.service.cuenta} ${c.service.compania} ${c.folioCxp}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });

  return (
    <div className={styles.stack}>
      <div className={page.toolbar}>
        <input className={page.search} placeholder="Buscar proveedor, cuenta, folio…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={page.select} value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="metido,pagado,omitido">Metidos, pagados y omitidos</option>
          <option value="pagado">Solo pagados</option>
          <option value="metido">Solo metidos</option>
          <option value="pendiente,factura_recibida">Abiertos (todos)</option>
          <option value="">Todo</option>
        </select>
      </div>
      {cycles === null ? <p className={styles.emptyLine}>Cargando…</p> : (
        <div className={page.tableWrap}>
          <table className={page.table}>
            <thead><tr><th>Proveedor / cuenta</th><th>Compañía</th><th>Periodo</th><th>Vence</th><th>Semana</th><th>Monto</th><th>Estado</th><th>Folio CxP</th><th /></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} className={page.empty}>Sin registros.</td></tr>}
              {filtered.map((c) => (
                <tr key={c._id}>
                  <td><div className={page.nameCell}>{c.service.proveedor}</div><div className={page.textMuted2}>{c.service.cuenta}</div></td>
                  <td>{c.service.compania}</td>
                  <td className={styles.nowrap}>{c.periodo}</td>
                  <td className={styles.nowrap}>{fecha(c.fechaLimite)}</td>
                  <td className={styles.nowrap}>{c.service.metodo === 'tarjeta' ? '—' : `S${c.semana}`}</td>
                  <td className={styles.nowrap}>{money(c.montoReal ?? c.service.montoEstimado, c.service.moneda)}</td>
                  <td><StatusBadge estado={c.estado} cycle={c} /></td>
                  <td className={styles.nowrap}>{c.service.metodo === 'tarjeta' ? <span className={page.textMuted2}>Tarjeta{c.service.tarjeta ? ` ${c.service.tarjeta}` : ''}</span> : c.folioCxp || '—'}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <FacturasButton cycle={c} onClick={() => onFacturas(c)} />
                      <button className={page.btnEdit} onClick={() => onEdit(c)}>Editar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Recordatorio por correo ───────────────────────────────────────────────
function CorreoView() {
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get('/payments/reminder/preview').then(({ data }) => setPreview(data)); }, []);

  const sendTest = async () => {
    setMsg('');
    try {
      const { data } = await api.post('/payments/reminder/test');
      setMsg(`Correo de prueba enviado a ${data.sentTo}.`);
    } catch (err) { setMsg(errMsg(err, 'No se pudo enviar')); }
  };

  if (!preview) return <p className={styles.emptyLine}>Cargando…</p>;
  return (
    <div className={styles.stack}>
      <div className={styles.mailInfo}>
        <div><strong>Cuándo:</strong> lunes, martes y miércoles a las 8:00 (hora de México), un correo por día, solo si hay algo por meter o atrasado.</div>
        <div><strong>A quién:</strong> {preview.recipients.length ? preview.recipients.join(', ') : 'nadie todavía — otorga el permiso "Pagos Recurrentes" en Usuarios'}.</div>
        <div>
          <strong>Estado en este servidor:</strong>{' '}
          {preview.enabled ? <span className={styles.ok}>programador activo</span> : <span className={styles.late}>programador apagado (PAYMENT_REMINDERS_ENABLED)</span>}
          {' · '}
          {preview.emailConfigured ? <span className={styles.ok}>correo configurado</span> : <span className={styles.late}>correo (Azure/Graph) sin configurar</span>}
        </div>
        <div className={styles.mailActions}>
          <button className={page.btnSecondary} onClick={sendTest} disabled={!preview.emailConfigured}>Mandarme una prueba</button>
          {msg && <span>{msg}</span>}
        </div>
      </div>
      <div className={styles.mailSubject}><span className={page.textMuted2}>Asunto:</span> {preview.subject}</div>
      {preview.total > 0
        ? <iframe title="Vista previa del correo" className={styles.mailFrame} srcDoc={preview.html} />
        : <p className={styles.emptyLine}>Hoy no habría correo: no hay nada por meter ni atrasado.</p>}
    </div>
  );
}
