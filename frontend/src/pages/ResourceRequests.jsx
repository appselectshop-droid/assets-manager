import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { ACCESSORY_TYPE_LABELS, TYPE_ICONS } from '../config/assetFields';
import CreateShipmentModal from '../components/CreateShipmentModal';
// Mismos estilos que Solicitudes de Cuentas/Ingreso — misma tabla/modal, contenido distinto.
import styles from './AccountRequests.module.css';

// Pedido explícito del usuario (2026-08-06): "en_espera" es un estatus
// nuevo, distinto de "pendiente" — pendiente = todavía no se revisó;
// en_espera = ya se pidió a compras, sigue sin llegar (para que el
// empleado sepa que no se le está ignorando). El estatus de la solicitud
// completa es un AGREGADO calculado por el backend a partir de la decisión
// de cada activo (ver itemDecisions/computeAggregateStatus en
// routes/resourceRequests.js) — aquí solo se muestra.
const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
  en_espera: { label: 'En espera', color: '#2563eb', bg: '#eff6ff' },
  aprobada:  { label: 'Aprobada',  color: '#16a34a', bg: '#f0fdf4' },
  rechazada: { label: 'Rechazada', color: '#dc2626', bg: '#fef2f2' },
};

// Las etiquetas que eligió quien solicita ("Kit Teclado+Mouse", "Monitor"...)
// son las mismas que ya usan Activos/Accesorios — se revierte a la clave
// interna (type) para poder consultar en Disponibilidad qué hay libre de
// cada una. "Línea Telefónica" no tiene tipo de activo (es un servicio, no
// se controla como stock aquí), así que queda fuera de este mapa a propósito.
const LABEL_TO_TYPE = {};
Object.entries(ACCESSORY_TYPE_LABELS).forEach(([key, label]) => { LABEL_TO_TYPE[label] = key; });

// No todo lo que hay en Activos está registrado bajo un tipo exacto — mucho
// quedó como "Accesorio"/"Otro" genérico con la descripción en texto libre
// (ej. una base para laptop guardada como "Accesorio" con notas "Base
// soporte"). Esta búsqueda de respaldo revisa esos genéricos por palabra
// clave (con sinónimos comunes) para no depender de que el tipo coincida
// exacto — "no debería ser problema encontrar similitudes".
const SYNONYMS = {
  base: ['base', 'soporte', 'stand', 'atril'],
  soporte: ['base', 'soporte', 'stand', 'atril'],
  audifonos: ['audifono', 'diadema', 'headset', 'casco'],
  bocina: ['bocina', 'altavoz', 'parlante', 'speaker'],
  camara: ['camara', 'webcam'],
  cargador: ['cargador', 'fuente', 'eliminador'],
  funda: ['funda', 'case', 'estuche', 'forro'],
  mochila: ['mochila', 'maletin', 'backpack'],
  silla: ['silla', 'asiento'],
};
const STOPWORDS = new Set(['de', 'para', 'la', 'el', 'los', 'las', 'y', 'o', 'del', 'especifica']);

function normalizeText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function expandTerms(label) {
  const words = normalizeText(label).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const expanded = new Set();
  words.forEach((w) => {
    expanded.add(w);
    (SYNONYMS[w] || []).forEach((s) => expanded.add(normalizeText(s)));
  });
  return [...expanded];
}

function findFuzzyMatches(label, pool, excludeIds) {
  const terms = expandTerms(label);
  if (!terms.length) return [];
  return pool.filter((item) => {
    if (excludeIds.has(item._id)) return false;
    const haystack = normalizeText([
      item.brand, item.model, item.notes, item.inventoryTag,
      ...Object.values(item.specs || {}).filter((v) => typeof v === 'string'),
    ].filter(Boolean).join(' '));
    return terms.some((t) => haystack.includes(t));
  });
}

const BATTERY_OPTION = 'Pila recargable';
const SERVICE_LABELS = new Set(['Línea Telefónica', 'Software o Licencia']);

function itemDetailText(request, label) {
  if (label === 'Software o Licencia' && request.licenseDetail) return ` (${request.licenseDetail})`;
  if (label === 'Otro (especifica)' && request.otherDetail) return `: ${request.otherDetail}`;
  if (label === BATTERY_OPTION) return ` (${request.batteryType} x${request.batteryQuantity} — ${request.batteryUse} — ${request.batteryHadBefore ? 'reemplazo, regresa la vieja' : 'primera vez, no regresa nada'})`;
  return '';
}

// Pedido explícito del usuario (2026-08-06): "quiero que cada activo tenga
// su movimiento... tipo ticket de compra con status" — tras probar aprobar
// uno, rechazar otro y dejar un tercero en espera dentro de la MISMA
// solicitud, el resumen de la lista no dejaba ver ese desglose. Cada activo
// se muestra aquí como su propio chip de color, no como texto plano.
const ITEM_CHIP_COLOR = {
  pendiente: { color: '#d97706', bg: '#fffbeb' },
  aprobada:  { color: '#16a34a', bg: '#f0fdf4' },
  rechazada: { color: '#dc2626', bg: '#fef2f2' },
  en_espera: { color: '#2563eb', bg: '#eff6ff' },
};
const ITEM_STATUS_ICON = { pendiente: '🕓', aprobada: '✅', rechazada: '❌', en_espera: '⏳' };

function ItemChips({ request }) {
  const decisions = request.itemDecisions?.length === request.resourceItems?.length
    ? request.itemDecisions
    : (request.resourceItems || []).map((label) => ({ label, status: request.status }));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
      {decisions.map((d, i) => {
        const c = ITEM_CHIP_COLOR[d.status] || ITEM_CHIP_COLOR.pendiente;
        return (
          <span
            key={i}
            className={styles.statusBadge}
            style={{ color: c.color, background: c.bg }}
            title={d.notes || ''}
          >
            {ITEM_STATUS_ICON[d.status]} {d.label}{itemDetailText(request, d.label)}
          </span>
        );
      })}
    </div>
  );
}

// Decide UN activo (aprobar/rechazar/poner en espera) — pedido explícito
// del usuario (2026-08-06): "si piden 2 cosas, apruebo, rechazo o pongo
// pendiente por cada uno" — antes era un solo botón que resolvía TODA la
// solicitud de un jalón.
function ItemDecisionRow({ request, idx, decision, onDone }) {
  const [notes, setNotes] = useState(decision.notes || '');
  const [addToCatalog, setAddToCatalog] = useState(true);
  const [saving, setSaving] = useState(null); // qué estatus se está guardando
  const [error, setError] = useState('');

  const isOther = decision.label === 'Otro (especifica)' && request.otherDetail;

  const decide = async (status) => {
    setSaving(status);
    setError('');
    try {
      await api.put(`/resource-requests/${request._id}/items/${idx}/decide`, {
        status,
        notes,
        ...(isOther ? { addToCatalog } : {}),
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la decisión');
      setSaving(null);
    }
  };

  return (
    <div>
      {error && <p className={styles.formError}>{error}</p>}
      {decision.status !== 'pendiente' && (
        <p className={styles.modalHint} style={{ marginTop: 0 }}>
          Estatus actual: <strong>{STATUS_CONFIG[decision.status]?.label}</strong>
          {decision.decidedByName ? ` — ${decision.decidedByName}` : ''}
          {decision.notes ? ` (${decision.notes})` : ''}
        </p>
      )}
      <div className={styles.field} style={{ marginTop: '0.4rem', marginBottom: '0.4rem' }}>
        <label>Notas (opcional)</label>
        <input className={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Se pidió a compras el 06/08, llega en 2 semanas..." />
      </div>
      {isOther && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: '#333', marginBottom: '0.5rem' }}>
          <input type="checkbox" checked={addToCatalog} onChange={(e) => setAddToCatalog(e.target.checked)} style={{ marginTop: '0.15rem' }} />
          Al aprobar, agregar "{request.otherDetail}" a la lista de recursos, para que la próxima vez ya salga como casilla
        </label>
      )}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button type="button" className={styles.btnApprove} onClick={() => decide('aprobada')} disabled={!!saving}>
          {saving === 'aprobada' ? '...' : '✅ Aprobar'}
        </button>
        <button type="button" className={styles.btnReject} onClick={() => decide('rechazada')} disabled={!!saving}>
          {saving === 'rechazada' ? '...' : '❌ Rechazar'}
        </button>
        <button type="button" className={styles.btnCancel} onClick={() => decide('en_espera')} disabled={!!saving}>
          {saving === 'en_espera' ? '...' : '⏳ En espera'}
        </button>
      </div>
    </div>
  );
}

// Cuando se aprobó la pila recargable sin confirmar la entrega en el
// momento — la "firma" digital se completa después, cuando de verdad se
// entrega.
function ConfirmDeliveryModal({ request, onClose, onDone }) {
  const [receivedByName, setReceivedByName] = useState(request.employeeName || '');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!receivedByName.trim() || !confirmed) {
      alert('Escribe quién recibió la pila y marca el checkbox de confirmación.');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/resource-requests/${request._id}/confirm-delivery`, {
        deliveryReceivedByName: receivedByName.trim(),
        deliveryConfirmed: confirmed,
      });
      onDone();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al confirmar la entrega');
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🔋</span>
          <h2 className={styles.modalTitle}>Confirmar entrega de pila</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>
            {request.employeeName} — {request.batteryType} x{request.batteryQuantity} — uso: {request.batteryUse}
          </p>
          <p className={styles.modalHint} style={{ fontWeight: 600, color: request.batteryHadBefore ? '#d97706' : '#16a34a' }}>
            {request.batteryHadBefore
              ? '🔁 Es reemplazo — pide la pila vieja al entregar la nueva.'
              : '🆕 Primera vez que pide pila para este uso — no hay nada que regresar.'}
          </p>
          <div className={styles.field}>
            <label>Recibido por *</label>
            <input className={styles.input} value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', color: '#333' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: '0.2rem' }} />
            Confirmo que entregué la pila y el colaborador firmó de recibido
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.btnPrimary} onClick={handleConfirm} disabled={saving}>
              {saving ? 'Guardando...' : 'Confirmar entrega'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Consulta Disponibilidad (mismo dato que la página "Disponibilidad") para
// cada recurso pedido y da una recomendación de qué se puede dar — y deja
// asignarlo ahí mismo si el solicitante se encontró en Empleados al enviar
// la solicitud. La decisión (aprobar/rechazar/en espera) es POR ACTIVO —
// ver ItemDecisionRow arriba.
function DetailModal({ request, onClose, onAssigned }) {
  const [groups, setGroups] = useState([]); // [{ type, label, icon, items, fuzzyItems }]
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [assignError, setAssignError] = useState('');
  // Si la solicitud no trae employeeRef (ej. se mandó antes de que
  // guardáramos esto, o el buscador no encontró el nombre en su momento),
  // se intenta encontrar al empleado por nombre ahora mismo en vez de
  // asumir que no existe — así no depende de un dato fijado al enviar.
  const [resolvedEmployee, setResolvedEmployee] = useState(null);
  const [resolvingEmployee, setResolvingEmployee] = useState(!request.employeeRef);
  const [generatingPdf, setGeneratingPdf] = useState(null); // id del activo cuya responsiva se está generando
  const [employeeOffice, setEmployeeOffice] = useState('');
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [showConfirmDelivery, setShowConfirmDelivery] = useState(false);
  // Redirigir a Ticket (2026-08-07) — pedido explícito y urgente del
  // usuario: algunas Solicitudes de Recursos en realidad se trabajan como
  // ticket (ej. instalación de licencia). Crea el ticket equivalente y
  // deja la marca — la solicitud sigue funcionando normal, solo se ve la
  // fila en amarillo con el motivo.
  const [liveRedirect, setLiveRedirect] = useState(
    request.redirectedToTicket
      ? { ticketFolio: '', reason: request.redirectReason, byName: request.redirectedByName }
      : null,
  );
  const [showRedirectForm, setShowRedirectForm] = useState(false);
  const [redirectReason, setRedirectReason] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  const handleRedirectToTicket = async () => {
    setRedirecting(true);
    try {
      const { data } = await api.put(`/resource-requests/${request._id}/redirect-to-ticket`, { reason: redirectReason });
      setLiveRedirect({ ticketFolio: data.ticketFolio, reason: data.request.redirectReason, byName: data.request.redirectedByName });
      setShowRedirectForm(false);
      setRedirectReason('');
      onAssigned?.();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo redirigir la solicitud');
    } finally {
      setRedirecting(false);
    }
  };

  const itemDecisions = request.itemDecisions || [];

  useEffect(() => {
    if (request.employeeRef) { setResolvingEmployee(false); return; }
    setResolvingEmployee(true);
    api.get('/employees').then(({ data }) => {
      const norm = (s) => (s || '').trim().toLowerCase();
      const matches = data.filter((e) => e.active && norm(e.name) === norm(request.employeeName));
      setResolvedEmployee(matches.length === 1 ? matches[0] : null);
    }).catch(() => setResolvedEmployee(null)).finally(() => setResolvingEmployee(false));
  }, [request]);

  const employeeId = request.employeeRef || resolvedEmployee?._id;

  useEffect(() => {
    if (!employeeId) { setEmployeeOffice(''); return; }
    if (resolvedEmployee) { setEmployeeOffice(resolvedEmployee.office || ''); return; }
    api.get(`/employees/${employeeId}`).then(({ data }) => setEmployeeOffice(data.office || '')).catch(() => setEmployeeOffice(''));
  }, [employeeId, resolvedEmployee]);

  useEffect(() => {
    // "Línea Telefónica" y "Software o Licencia" son servicios de verdad —
    // ahí no tiene caso ni buscar por texto. "Pila recargable" tiene su
    // propia tarjeta de entrega. Todo lo demás (tenga tipo exacto o no) sí
    // se busca, por si hay algo guardado como Accesorio genérico.
    const searchable = (request.resourceItems || [])
      .filter((label) => label !== BATTERY_OPTION && !SERVICE_LABELS.has(label))
      .map((label) => ({ label, type: LABEL_TO_TYPE[label] }));

    setLoadingAvail(true);
    Promise.all([
      Promise.all(
        searchable.filter((s) => s.type).map(async ({ label, type }) => {
          const { data } = await api.get('/assets', { params: { status: 'disponible', type } });
          return { type, label, items: data };
        })
      ),
      Promise.all(
        ['accesorio', 'otro'].map((type) => api.get('/assets', { params: { status: 'disponible', type } }))
      ),
    ]).then(([exactResults, genericResps]) => {
      const genericPool = genericResps.flatMap((r) => r.data);
      const results = searchable.map(({ label, type }) => {
        const exact = exactResults.find((r) => r.label === label);
        const exactIds = new Set((exact?.items || []).map((i) => i._id));
        const searchText = label === 'Otro (especifica)' && request.otherDetail ? request.otherDetail : label;
        const fuzzyItems = findFuzzyMatches(searchText, genericPool, exactIds);
        return {
          label,
          icon: TYPE_ICONS[type] || '📦',
          items: exact?.items || [],
          fuzzyItems,
        };
      });
      setGroups(results);
      setLoadingAvail(false);
    });
  }, [request]);

  const groupsByLabel = Object.fromEntries(groups.map((g) => [g.label, g]));

  const handleAssign = async (item) => {
    if (!employeeId) {
      setAssignError('No encontramos a este empleado en Empleados — verifica que el nombre esté escrito igual, o asígnalo manualmente desde Disponibilidad.');
      return;
    }
    setBusyId(item._id);
    setAssignError('');
    try {
      await api.post('/assignments', {
        employee: employeeId,
        asset: item._id,
        quantity: item.stockTotal != null ? 1 : undefined,
        notes: 'Asignado desde Solicitud de Recursos',
      });
      setAssignedIds((prev) => new Set(prev).add(item._id));
      onAssigned?.();
    } catch (err) {
      setAssignError(err.response?.data?.message || 'No se pudo asignar');
    } finally {
      setBusyId(null);
    }
  };

  // Reutiliza el mismo generador de PDF que ya existe en la ficha del
  // empleado (GET /responsiva/:employeeId[/legacy]?assetId=) — misma
  // elección de formato nuevo/anterior, mismo archivo/archivado.
  const generateResponsiva = async (assetId, legacy) => {
    if (!employeeId) return;
    setGeneratingPdf(assetId);
    setAssignError('');
    try {
      const path = legacy ? `/responsiva/${employeeId}/legacy` : `/responsiva/${employeeId}`;
      const resp = await api.get(`${path}?assetId=${assetId}`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Responsiva_${request.employeeName.replace(/\s+/g, '_')}_${assetId.slice(-6)}${legacy ? '_Anterior' : ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setAssignError(err.response?.data?.message || 'No se pudo generar la responsiva');
    } finally {
      setGeneratingPdf(null);
    }
  };

  const renderItemRow = (item, fallbackLabel) => {
    const name = [item.brand, item.model].filter(Boolean).join(' ') || fallbackLabel;
    const tag = item.inventoryTag || item.serialNumber;
    const done = assignedIds.has(item._id);
    return (
      <div key={item._id} className={styles.empSelected} style={{ marginBottom: '0.4rem', flexWrap: 'wrap' }}>
        <div>
          <p className={styles.empSelName}>{name}</p>
          <p className={styles.empSelSub}>{tag}{item.location && ` · ${item.location}`}</p>
        </div>
        {done ? (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button type="button" className={styles.btnCancel} onClick={() => generateResponsiva(item._id, false)} disabled={generatingPdf === item._id}>
              {generatingPdf === item._id ? '...' : '📄 Responsiva nueva'}
            </button>
            <button type="button" className={styles.btnCancel} onClick={() => generateResponsiva(item._id, true)} disabled={generatingPdf === item._id}>
              {generatingPdf === item._id ? '...' : '📄 Anterior'}
            </button>
          </div>
        ) : (
          <button type="button" className={styles.btnPrimary} onClick={() => handleAssign(item)} disabled={busyId === item._id}>
            {busyId === item._id ? '...' : 'Asignar'}
          </button>
        )}
      </div>
    );
  };

  // Arma el formulario de "Envíos entre Sucursales" ya lleno con los datos
  // de esta solicitud, para no volver a escribir nombre/departamento/equipo
  // — Sistemas solo confirma sucursal origen y motivo, y de ahí sale el PDF
  // imprimible + el link de confirmación para el destinatario. Solo incluye
  // los activos YA APROBADOS — pedido implícito del usuario (2026-08-06):
  // ya no hace falta esperar a que TODA la solicitud esté resuelta para
  // entregar lo que sí está listo.
  const approvedTrackableLabels = itemDecisions
    .filter((d) => d.status === 'aprobada' && d.label !== BATTERY_OPTION && !SERVICE_LABELS.has(d.label))
    .map((d) => d.label);
  const anyApproved = itemDecisions.some((d) => d.status === 'aprobada');
  const shipmentInitialData = {
    requesterName: request.employeeName,
    requesterDepartment: request.department || '',
    requesterPosition: request.position || '',
    requesterRef: employeeId || '',
    destinationOffice: employeeOffice,
    recipientName: request.employeeName,
    reason: 'Asignación de equipo o recurso',
    notes: request.justification || '',
    sourceResourceRequest: request._id,
    items: approvedTrackableLabels.map((label) => ({
      assetRef: '',
      type: label === 'Otro (especifica)' && request.otherDetail ? request.otherDetail : label,
      description: '',
      serialOrImei: '', condition: '', itemStatus: '',
    })),
  };
  if (shipmentInitialData.items.length === 0) shipmentInitialData.items = [{ assetRef: '', type: '', description: '', serialOrImei: '', condition: '', itemStatus: '' }];

  return (
    <>
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>📦</span>
          <h2 className={styles.modalTitle}>{request.employeeName}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>{request.position || '—'} · {request.department || '—'}</p>
          <div className={styles.field}>
            <label>Justificación</label>
            <p>{request.justification || '—'}</p>
          </div>

          {request.raw?.redirectedFromTicket && (
            <div className={styles.modalHint} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.6rem 0.75rem', margin: '0.5rem 0' }}>
              🟡 Esta solicitud se creó a partir de un Ticket redirigido{request.raw?.redirectedFromFolio ? ` (${request.raw.redirectedFromFolio})` : ''}{request.raw?.redirectedFromReason ? `: ${request.raw.redirectedFromReason}` : ''}. Búscalo en Tickets con el nombre de {request.employeeName}.
            </div>
          )}

          {liveRedirect ? (
            <div className={styles.modalHint} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.6rem 0.75rem', margin: '0.5rem 0' }}>
              🟡 Redirigida a Ticket{liveRedirect.ticketFolio ? ` (${liveRedirect.ticketFolio})` : ''}
              {liveRedirect.byName && <> por <strong>{liveRedirect.byName}</strong></>}
              {liveRedirect.reason && <> — {liveRedirect.reason}</>}
              . Búscalo en Tickets con el nombre de {request.employeeName}.
            </div>
          ) : !showRedirectForm ? (
            <button type="button" className={styles.btnView} onClick={() => setShowRedirectForm(true)}>🔀 Redirigir a Ticket</button>
          ) : (
            <div className={styles.field}>
              <label>¿Por qué es en realidad un ticket? (opcional)</label>
              <input className={styles.input} value={redirectReason} onChange={(e) => setRedirectReason(e.target.value)} placeholder="Ej. Es instalación de licencia, no entrega de stock" />
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => { setShowRedirectForm(false); setRedirectReason(''); }}>Cancelar</button>
                <button type="button" className={styles.btnPrimary} onClick={handleRedirectToTicket} disabled={redirecting}>
                  {redirecting ? 'Redirigiendo...' : 'Crear ticket y redirigir'}
                </button>
              </div>
            </div>
          )}

          {!request.employeeRef && resolvingEmployee && (
            <p className={styles.modalHint}>Buscando a {request.employeeName} en Empleados...</p>
          )}
          {!request.employeeRef && !resolvingEmployee && resolvedEmployee && (
            <p className={styles.modalHint} style={{ color: '#16a34a' }}>
              ✓ Encontramos a {resolvedEmployee.name} en Empleados ({resolvedEmployee.employeeId}) — se le puede asignar directo.
            </p>
          )}
          {!request.employeeRef && !resolvingEmployee && !resolvedEmployee && (
            <p className={styles.modalHint} style={{ color: '#d97706' }}>
              ⚠️ No encontramos a "{request.employeeName}" en Empleados (activo) — revisa que el nombre esté escrito igual, o asígnalo manualmente desde Disponibilidad.
            </p>
          )}

          <div className={styles.field}>
            <label>Activos solicitados — decide cada uno</label>
          </div>
          {assignError && <p className={styles.formError}>{assignError}</p>}
          {loadingAvail && <p className={styles.modalHint}>Consultando disponibilidad...</p>}

          {itemDecisions.map((decision, idx) => {
            const label = decision.label;
            const isBattery = label === BATTERY_OPTION;
            const isService = SERVICE_LABELS.has(label);
            const group = groupsByLabel[label];
            return (
              <div key={idx} style={{ border: '1px solid #eee', borderRadius: 8, padding: '0.75rem', marginBottom: '0.6rem' }}>
                <p style={{ fontWeight: 700, margin: '0 0 0.4rem', color: '#333' }}>{label}{itemDetailText(request, label)}</p>
                <ItemDecisionRow request={request} idx={idx} decision={decision} onDone={onAssigned} />

                {decision.status === 'aprobada' && group && !loadingAvail && (
                  <div style={{ marginTop: '0.6rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.6rem' }}>
                    <p className={styles.modalHint} style={{ fontWeight: 700, color: '#333' }}>
                      {group.icon} Disponibilidad —{' '}
                      {group.items.length > 0
                        ? <span style={{ color: '#16a34a' }}>✅ {group.items.length} disponible{group.items.length !== 1 ? 's' : ''}, se puede dar</span>
                        : group.fuzzyItems.length > 0
                          ? <span style={{ color: '#d97706' }}>🔎 Sin coincidencia exacta, pero {group.fuzzyItems.length} guardado{group.fuzzyItems.length !== 1 ? 's' : ''} como Accesorio se parece{group.fuzzyItems.length !== 1 ? 'n' : ''} — revisa si aplica</span>
                          : <span style={{ color: '#dc2626' }}>❌ Sin stock disponible ahorita</span>}
                    </p>
                    {group.items.map((item) => renderItemRow(item, label))}
                    {group.fuzzyItems.map((item) => renderItemRow(item, label))}
                  </div>
                )}
                {decision.status === 'aprobada' && isService && (
                  <p className={styles.modalHint} style={{ marginTop: '0.6rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.6rem' }}>
                    📞 No se controla como stock aquí; gestiónalo directo con el operador/proveedor.
                  </p>
                )}
                {decision.status === 'aprobada' && isBattery && (
                  <div style={{ marginTop: '0.6rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.6rem' }}>
                    <p className={styles.modalHint} style={{ margin: 0 }}>
                      {request.deliveryConfirmed
                        ? `🔋 Entregada — firmó de recibido: ${request.deliveryReceivedByName}`
                        : <span style={{ color: '#d97706' }}>🔋 Falta entregar y confirmar</span>}
                    </p>
                    {!request.deliveryConfirmed && (
                      <button type="button" className={styles.btnApprove} style={{ marginTop: '0.4rem' }} onClick={() => setShowConfirmDelivery(true)}>
                        🔋 Confirmar entrega
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cerrar</button>
            {anyApproved && (
              <button type="button" className={styles.btnPrimary} onClick={() => setShowShipmentModal(true)}>
                🚚 Generar formato de salida
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    {showShipmentModal && (
      <CreateShipmentModal
        initialData={shipmentInitialData}
        onClose={() => setShowShipmentModal(false)}
        onDone={() => setShowShipmentModal(false)}
      />
    )}
    {showConfirmDelivery && (
      <ConfirmDeliveryModal
        request={request}
        onClose={() => setShowConfirmDelivery(false)}
        onDone={() => { setShowConfirmDelivery(false); onAssigned?.(); onClose(); }}
      />
    )}
    </>
  );
}

export default function ResourceRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pendiente');
  const [detailTarget, setDetailTarget] = useState(null);
  const [confirmDeliveryTarget, setConfirmDeliveryTarget] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ?request=<id> (viene de la campanita de notificaciones, ver
  // components/NotificationBell.jsx) — si el filtro por default
  // ('pendiente') no fuera a incluir esa solicitud (ej. quedó en otro
  // estatus mientras tanto), se quita el filtro para garantizar que
  // aparezca en la primera carga.
  useEffect(() => {
    if (searchParams.get('request')) setFilterStatus('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const params = filterStatus ? { status: filterStatus } : {};
    const { data } = await api.get('/resource-requests', { params });
    setRequests(data);
    if (!silent) setLoading(false);

    const requestId = searchParams.get('request');
    if (requestId) {
      const found = data.find((r) => r._id === requestId);
      if (found) setDetailTarget(found);
      searchParams.delete('request');
      setSearchParams(searchParams, { replace: true });
    }
    return data;
  };

  // Tras decidir un activo dentro del modal (ver ItemDecisionRow), refresca
  // la tabla Y el propio modal abierto — sin esto, el modal se quedaba con
  // la decisión vieja hasta cerrarlo y volver a abrirlo.
  const reloadAndSyncDetail = async () => {
    const data = await load(true);
    setDetailTarget((prev) => (prev ? data.find((r) => r._id === prev._id) || prev : prev));
  };

  useEffect(() => { load(); }, [filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresco de fondo (2026-08-05, pedido explícito del usuario: "ni
  // las solicitudes... es en tiempo real, siempre tengo que darle Ctrl+R")
  // — mismo patrón ya usado en TicketsLayout.jsx/BiLayout.jsx. Silencioso
  // (no toca `loading`), para que una solicitud nueva o un cambio de
  // estatus aparezca solo, sin recargar la página a mano.
  useEffect(() => {
    const interval = setInterval(() => load(true), 8000);
    return () => clearInterval(interval);
  }, [filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (r) => {
    if (!confirm(`¿Eliminar la solicitud de "${r.employeeName}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/resource-requests/${r._id}`);
    load();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Solicitudes de Recursos</h1>
          <p className={styles.subtitle}>Accesorios y línea telefónica — decide cada activo por separado (aprobar, rechazar o poner en espera).</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {['pendiente', 'en_espera', 'aprobada', 'rechazada', ''].map((st) => (
          <button
            key={st || 'todas'}
            className={`${styles.tab} ${filterStatus === st ? styles.tabActive : ''}`}
            onClick={() => setFilterStatus(st)}
          >
            {st ? STATUS_CONFIG[st].label : 'Todas'}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Solicitante</th>
              <th>Puesto / Depto.</th>
              <th>Recursos solicitados</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className={styles.empty}>Cargando...</td></tr>}
            {!loading && requests.length === 0 && (
              <tr><td colSpan={6} className={styles.empty}>Sin solicitudes</td></tr>
            )}
            {requests.map((r) => {
              const sc = STATUS_CONFIG[r.status];
              const batteryDecision = r.itemDecisions?.find((d) => d.label === BATTERY_OPTION);
              const pendingBatteryDelivery = batteryDecision?.status === 'aprobada' && !r.deliveryConfirmed;
              // Redirigida a Ticket (2026-08-07) — pedido explícito del
              // usuario: "marcalo toda la tarjeta en amarillo".
              const redirected = !!r.redirectedToTicket;
              // Creada a partir de un Ticket redirigido (2026-08-11,
              // dirección contraria) — pedido explícito del usuario: "si lo
              // muevo de solicitudes a tickets debe verse así y viceversa".
              const fromTicket = !!r.raw?.redirectedFromTicket;
              return (
                <tr key={r._id} style={(redirected || fromTicket) ? { background: '#fffbeb' } : undefined}>
                  <td className={styles.nameCell}>{r.employeeName}</td>
                  <td>{r.position || '—'}{r.department ? ` · ${r.department}` : ''}</td>
                  <td>
                    <ItemChips request={r} />
                    {redirected && (
                      <p className={styles.modalHint} style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#92400e', fontWeight: 700 }}>
                        🟡 Redirigida a Ticket{r.redirectReason ? `: ${r.redirectReason}` : ''}
                      </p>
                    )}
                    {fromTicket && (
                      <p className={styles.modalHint} style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#92400e', fontWeight: 700 }}>
                        🟡 Creada a partir de un Ticket redirigido{r.raw?.redirectedFromFolio ? ` (${r.raw.redirectedFromFolio})` : ''}{r.raw?.redirectedFromReason ? `: ${r.raw.redirectedFromReason}` : ''}
                      </p>
                    )}
                  </td>
                  <td className={styles.date}>{new Date(r.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>
                    <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                    {pendingBatteryDelivery && (
                      <span className={styles.statusBadge} style={{ color: '#d97706', background: '#fffbeb', marginLeft: '0.3rem' }}>🔋 Falta entregar</span>
                    )}
                    {r.statusDetail && <p className={styles.modalHint} style={{ margin: '0.2rem 0 0', fontSize: '0.72rem' }}>{r.statusDetail}</p>}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnView} onClick={() => setDetailTarget(r)}>Ver / Decidir</button>
                      {pendingBatteryDelivery && (
                        <button className={styles.btnApprove} onClick={() => setConfirmDeliveryTarget(r)}>🔋 Confirmar entrega</button>
                      )}
                      <button className={styles.btnReject} onClick={() => handleDelete(r)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detailTarget && (
        <DetailModal request={detailTarget} onClose={() => setDetailTarget(null)} onAssigned={reloadAndSyncDetail} />
      )}
      {confirmDeliveryTarget && (
        <ConfirmDeliveryModal
          request={confirmDeliveryTarget}
          onClose={() => setConfirmDeliveryTarget(null)}
          onDone={() => { setConfirmDeliveryTarget(null); load(); }}
        />
      )}
    </div>
  );
}
