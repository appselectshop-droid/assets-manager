import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { isOverdue, daysOpen, CSAT_OPTIONS } from './ticketShared';
// Reutiliza Dashboard.module.css a propósito — mismo criterio que ya usa
// Indicadores.jsx: es la mitad "vista gerencial a fondo" de la misma
// familia visual de KPIs/paneles/score-por-persona, no una hoja de estilos
// aparte.
import styles from './Dashboard.module.css';

// Panel Gerencial — pedido explícito del usuario (2026-07-30), corrigiendo
// un primer intento que quedó mal ubicado (una pestaña "Equipo" DENTRO de
// Tickets, ver CHANGELOG). Lo que en realidad pidió: un botón de categoría
// propio en la barra superior (junto a Tickets/Indicadores, ver
// Layout.jsx) con TODO lo que un jefe quiere ver de Sistemas + ERP — no
// solo tickets: envíos (con tiempo real de traslado→recibido), altas,
// bajas, cuentas otorgadas, solicitudes de recursos y responsivas, con
// fechas/horas reales y quién hizo qué. Solo visible con el permiso
// canViewManagerDashboard (ver Users.jsx/ManagerDashboardRoute en
// App.jsx) — el resto de Sistemas no lo ve, aunque sean admins.
//
// Todo se lee DIRECTO de cada colección (no del AuditLog): el AuditLog
// tiene huecos reales (aprobar altas/cuentas y la etapa RH de bajas no se
// registran ahí; responsivas no tiene ni entidad — confirmado leyendo
// utils/audit.js y cada ruta), así que depender de él daría números
// incompletos. Cada modelo ya trae sus propios timestamps reales por
// evento (revisado uno por uno antes de escribir esto), así que no hace
// falta ningún endpoint nuevo de backend.
const NEGATIVE_RATINGS = ['Mayormente insatisfecho', 'Extremadamente insatisfecho'];
const ACCOUNT_TYPE_LABELS = { gmail: 'Gmail', platform: 'Plataformas', platform_erp: 'ERP' };

function csatScore(t) {
  return CSAT_OPTIONS.find((o) => o.value === t.satisfactionRating)?.score || 0;
}

function daysBetween(a, b) {
  return (new Date(b) - new Date(a)) / 86400000;
}

function avg(nums) {
  return nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length) : null;
}

function fmt(n) {
  return n === null || n === undefined ? null : n.toFixed(1);
}

// Desglose "aprobadas/rechazadas/días promedio" por revisor — mismo cálculo
// para Altas, Cuentas y Recursos (los 3 comparten la forma
// pendiente/aprobada/rechazada + reviewedByName/reviewedAt).
function reviewerBreakdown(items) {
  const map = new Map();
  items.filter((r) => r.reviewedByName).forEach((r) => {
    const key = r.reviewedByName;
    if (!map.has(key)) map.set(key, { name: key, aprobadas: 0, rechazadas: 0, days: [] });
    const entry = map.get(key);
    if (r.status === 'aprobada') entry.aprobadas += 1;
    if (r.status === 'rechazada') entry.rechazadas += 1;
    if (r.reviewedAt) entry.days.push(daysBetween(r.createdAt, r.reviewedAt));
  });
  return Array.from(map.values())
    .map((e) => ({ name: e.name, aprobadas: e.aprobadas, rechazadas: e.rechazadas, avgDays: fmt(avg(e.days)) }))
    .sort((a, b) => (b.aprobadas + b.rechazadas) - (a.aprobadas + a.rechazadas));
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)    return 'Hace un momento';
  if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function Gerencia() {
  const [ticketsRaw, setTicketsRaw]         = useState(null);
  const [shipmentsRaw, setShipmentsRaw]     = useState(null);
  const [onboardingRaw, setOnboardingRaw]   = useState(null);
  const [offboardingRaw, setOffboardingRaw] = useState(null);
  const [accountReqRaw, setAccountReqRaw]   = useState(null);
  const [resourceReqRaw, setResourceReqRaw] = useState(null);
  const [responsivasRaw, setResponsivasRaw] = useState(null);

  useEffect(() => {
    const pick = (r) => (r.status === 'fulfilled' ? r.value.data : []);
    Promise.allSettled([
      api.get('/tickets'),
      api.get('/shipments'),
      api.get('/onboarding-requests'),
      api.get('/offboarding-requests'),
      api.get('/account-requests'),
      api.get('/resource-requests'),
      api.get('/responsiva-archive'),
    ]).then(([tk, sh, ob, of, ar, rr, rs]) => {
      setTicketsRaw(pick(tk));
      setShipmentsRaw(pick(sh));
      setOnboardingRaw(pick(ob));
      setOffboardingRaw(pick(of));
      setAccountReqRaw(pick(ar));
      setResourceReqRaw(pick(rr));
      setResponsivasRaw(pick(rs));
    });
  }, []);

  const loading = [ticketsRaw, shipmentsRaw, onboardingRaw, offboardingRaw, accountReqRaw, resourceReqRaw, responsivasRaw]
    .some((x) => x === null);

  /* ── 1. Tickets ─────────────────────────────────────────────────────
     Migrado tal cual de la vieja TicketsEquipo.jsx (ver CHANGELOG) — solo
     cambia la fuente de datos (fetch propio en vez del context de
     TicketsLayout, porque esta página vive fuera de Tickets). */
  const ticketsData = useMemo(() => {
    const tickets = ticketsRaw || [];
    const byAgent = new Map();
    tickets.forEach((t) => {
      const id = t.assignedTo?._id || 'sin_asignar';
      const name = t.assignedTo?.name || 'Sin asignar';
      if (!byAgent.has(id)) byAgent.set(id, { id, name, tickets: [] });
      byAgent.get(id).tickets.push(t);
    });
    const perAgent = Array.from(byAgent.values()).map((agent) => {
      const resolved = agent.tickets.filter((t) => t.resolvedAt);
      const rated = agent.tickets.filter((t) => t.satisfactionRating);
      const negative = rated.filter((t) => NEGATIVE_RATINGS.includes(t.satisfactionRating));
      return {
        id: agent.id,
        name: agent.name,
        total: agent.tickets.length,
        overdueCount: agent.tickets.filter(isOverdue).length,
        resolvedCount: resolved.length,
        avgResDays: fmt(avg(resolved.map(daysOpen))),
        ratedCount: rated.length,
        avgCsat: fmt(avg(rated.map(csatScore))),
        negativeCount: negative.length,
      };
    }).sort((a, b) => b.total - a.total);

    const resolvedAll = tickets.filter((t) => t.resolvedAt);
    const ratedAll = tickets.filter((t) => t.satisfactionRating);
    const negativeAll = ratedAll.filter((t) => NEGATIVE_RATINGS.includes(t.satisfactionRating));
    return {
      perAgent,
      total: tickets.length,
      overdueCount: tickets.filter(isOverdue).length,
      avgResDays: fmt(avg(resolvedAll.map(daysOpen))),
      avgCsat: fmt(avg(ratedAll.map(csatScore))),
      ratedCount: ratedAll.length,
      negativePct: ratedAll.length ? Math.round((negativeAll.length / ratedAll.length) * 100) : null,
    };
  }, [ticketsRaw]);

  /* ── 2. Envíos ──────────────────────────────────────────────────────
     El tiempo de traslado→recibido se muestra global (depende del
     transporte, no de quién confirma) — por persona solo se cuentan
     envíos, no se les atribuye el tiempo. */
  const shipmentsData = useMemo(() => {
    const ships = shipmentsRaw || [];
    const withTransit = ships.filter((s) => s.transitAt && s.receivedAt);
    const avgTransitDays = fmt(avg(withTransit.map((s) => daysBetween(s.transitAt, s.receivedAt))));

    const countBy = (field) => {
      const map = new Map();
      ships.filter((s) => s[field]).forEach((s) => map.set(s[field], (map.get(s[field]) || 0) + 1));
      return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    };

    return {
      total: ships.length,
      enCurso: ships.filter((s) => s.status !== 'recibido').length,
      recibidos: ships.filter((s) => s.status === 'recibido').length,
      avgTransitDays,
      senders: countBy('sentByName'),
      receivers: countBy('receivedByName'),
    };
  }, [shipmentsRaw]);

  /* ── 3. Altas (Ingresos RH) ─────────────────────────────────────────── */
  const onboardingData = useMemo(() => {
    const reqs = onboardingRaw || [];
    const reviewed = reqs.filter((r) => r.reviewedAt);
    return {
      total: reqs.length,
      pendientes: reqs.filter((r) => r.status === 'pendiente').length,
      aprobadas: reqs.filter((r) => r.status === 'aprobada').length,
      rechazadas: reqs.filter((r) => r.status === 'rechazada').length,
      avgDays: fmt(avg(reviewed.map((r) => daysBetween(r.createdAt, r.reviewedAt)))),
      reviewers: reviewerBreakdown(reqs),
    };
  }, [onboardingRaw]);

  /* ── 4. Bajas (Offboarding) ─────────────────────────────────────────
     Dos etapas reales — RH primero, Sistemas después. Sin motivo/razón
     visible aquí tampoco (misma regla que OffboardingRequests.jsx: eso es
     de RH, ni Sistemas ni el gerente lo ven). */
  const offboardingData = useMemo(() => {
    const reqs = offboardingRaw || [];
    const rhDone = reqs.filter((r) => r.rhReviewedAt);
    const sistemasDone = reqs.filter((r) => r.sistemasReviewedAt);

    const countBy = (field) => {
      const map = new Map();
      reqs.filter((r) => r[field]).forEach((r) => map.set(r[field], (map.get(r[field]) || 0) + 1));
      return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    };

    return {
      total: reqs.length,
      pendienteRh: reqs.filter((r) => r.status === 'pendiente_rh').length,
      pendienteSistemas: reqs.filter((r) => r.status === 'pendiente_sistemas').length,
      completadas: reqs.filter((r) => r.status === 'completada').length,
      avgRhDays: fmt(avg(rhDone.map((r) => daysBetween(r.createdAt, r.rhReviewedAt)))),
      avgSistemasDays: fmt(avg(sistemasDone.map((r) => daysBetween(r.rhReviewedAt, r.sistemasReviewedAt)))),
      rhReviewers: countBy('rhReviewedByName'),
      sistemasReviewers: countBy('sistemasReviewedByName'),
    };
  }, [offboardingRaw]);

  /* ── 5. Cuentas (Gmail / Plataformas / ERP) ─────────────────────────── */
  const accountsData = useMemo(() => {
    const reqs = accountReqRaw || [];
    const approved = reqs.filter((r) => r.status === 'aprobada');
    const byType = {};
    approved.forEach((r) => { byType[r.requestType] = (byType[r.requestType] || 0) + 1; });
    return {
      total: reqs.length,
      pendientes: reqs.filter((r) => r.status === 'pendiente').length,
      aprobadas: approved.length,
      byType,
      reviewers: reviewerBreakdown(reqs),
    };
  }, [accountReqRaw]);

  /* ── 6. Recursos ────────────────────────────────────────────────────── */
  const resourcesData = useMemo(() => {
    const reqs = resourceReqRaw || [];
    return {
      total: reqs.length,
      pendientes: reqs.filter((r) => r.status === 'pendiente').length,
      aprobadas: reqs.filter((r) => r.status === 'aprobada').length,
      reviewers: reviewerBreakdown(reqs),
    };
  }, [resourceReqRaw]);

  /* ── 7. Responsivas ─────────────────────────────────────────────────── */
  const responsivasData = useMemo(() => {
    const docs = responsivasRaw || [];
    const signed = docs.filter((d) => d.signedAt);
    const byGenerator = new Map();
    docs.filter((d) => d.generatedByName).forEach((d) => byGenerator.set(d.generatedByName, (byGenerator.get(d.generatedByName) || 0) + 1));
    return {
      total: docs.length,
      firmadas: signed.length,
      pendientesFirma: docs.length - signed.length,
      avgSignDays: fmt(avg(signed.map((d) => daysBetween(d.createdAt, d.signedAt)))),
      generators: Array.from(byGenerator.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  }, [responsivasRaw]);

  /* ── 8. Actividad reciente — feed unificado de las 6 áreas + tickets,
     sintetizado directo de cada colección (mismo criterio que
     TicketsInicio.jsx: no depender del AuditLog, que tiene huecos). ──── */
  const feed = useMemo(() => {
    const events = [];
    (ticketsRaw || []).forEach((t) => {
      if (t.resolvedAt) events.push({ id: `tk-${t._id}`, date: t.resolvedAt, icon: '✅', text: `${t.resolvedByName || 'Alguien'} resolvió un ticket`, sub: `${t.folio} · ${t.subject}` });
    });
    (shipmentsRaw || []).forEach((s) => {
      if (s.receivedAt) events.push({ id: `sh-${s._id}`, date: s.receivedAt, icon: '📦', text: `${s.receivedByName || 'Alguien'} confirmó la recepción de un envío`, sub: `${s.originOffice} → ${s.destinationOffice}` });
    });
    (onboardingRaw || []).forEach((o) => {
      if (o.reviewedAt && o.status === 'aprobada') events.push({ id: `ob-${o._id}`, date: o.reviewedAt, icon: '🧑‍💼', text: `${o.reviewedByName || 'Alguien'} aprobó un ingreso`, sub: o.employeeName });
    });
    (offboardingRaw || []).forEach((o) => {
      if (o.sistemasReviewedAt && o.status === 'completada') events.push({ id: `of-${o._id}`, date: o.sistemasReviewedAt, icon: '📤', text: `${o.sistemasReviewedByName || 'Alguien'} completó una baja`, sub: o.employeeName });
    });
    (accountReqRaw || []).forEach((a) => {
      if (a.reviewedAt && a.status === 'aprobada') {
        events.push({ id: `ar-${a._id}`, date: a.reviewedAt, icon: '🔑', text: `${a.reviewedByName || 'Alguien'} aprobó una cuenta (${ACCOUNT_TYPE_LABELS[a.requestType] || a.requestType})`, sub: a.employeeName });
      }
    });
    (resourceReqRaw || []).forEach((r) => {
      if (r.reviewedAt && r.status === 'aprobada') events.push({ id: `rr-${r._id}`, date: r.reviewedAt, icon: '📦', text: `${r.reviewedByName || 'Alguien'} aprobó una solicitud de recursos`, sub: r.employeeName });
    });
    (responsivasRaw || []).forEach((d) => {
      events.push({ id: `rs-${d._id}-gen`, date: d.createdAt, icon: '📄', text: `${d.generatedByName || 'Alguien'} generó una responsiva`, sub: d.employeeName });
      if (d.signedAt) events.push({ id: `rs-${d._id}-sign`, date: d.signedAt, icon: '✍️', text: 'Se firmó una responsiva', sub: d.employeeName });
    });
    return events.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 25);
  }, [ticketsRaw, shipmentsRaw, onboardingRaw, offboardingRaw, accountReqRaw, resourceReqRaw, responsivasRaw]);

  // Fila "por persona" reutilizable — mismo componente visual para las 6
  // áreas de abajo, cambia solo el detalle que se le pasa.
  const PersonList = ({ items, renderDetail }) => (
    <div className={styles.scoreList}>
      {items.length === 0 && <p className={styles.empty}>Sin datos todavía</p>}
      {items.map((p) => (
        <div key={p.name} className={styles.scoreItem}>
          <div className={styles.scoreItemTop}>
            <span className={styles.scoreName}>{p.name}</span>
            <span className={styles.scoreBadge} style={{ color: '#0d9488', background: '#f0fdfa' }}>{p.count ?? (p.aprobadas + (p.rechazadas || 0))}</span>
          </div>
          <p className={styles.scoreDetail}>{renderDetail(p)}</p>
        </div>
      ))}
    </div>
  );

  if (loading) return (
    <div className={styles.loadingWrap}>
      <div className={styles.spinner} />
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>Gerencia</h1>
          <p className={styles.date}>Supervisión de Sistemas + ERP: tickets, envíos, altas, bajas, cuentas, recursos y responsivas.</p>
        </div>
      </div>

      {/* ── Tickets ── */}
      <h2 className={styles.sectionHeading}>Tickets</h2>
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#2563eb' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🎫</span><span className={styles.kpiValue} style={{ color: '#2563eb' }}>{ticketsData.total}</span></div>
          <p className={styles.kpiLabel}>Total</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#dc2626' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⏰</span><span className={styles.kpiValue} style={{ color: '#dc2626' }}>{ticketsData.overdueCount}</span></div>
          <p className={styles.kpiLabel}>Vencidos ahora</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⌛</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{ticketsData.avgResDays ?? '—'}</span></div>
          <p className={styles.kpiLabel}>Días prom. resolución</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⭐</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{ticketsData.avgCsat ?? '—'}</span></div>
          <p className={styles.kpiLabel}>CSAT promedio</p>
          <p className={styles.kpiSub}>{ticketsData.ratedCount} calificados</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#b91c1c' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🔴</span><span className={styles.kpiValue} style={{ color: '#b91c1c' }}>{ticketsData.negativePct !== null ? `${ticketsData.negativePct}%` : '—'}</span></div>
          <p className={styles.kpiLabel}>Calificaciones negativas</p>
        </div>
      </div>
      <div className={styles.scoreHeader}>
        <h3 className={styles.scoreTitle}>Por persona</h3>
      </div>
      <PersonList
        items={ticketsData.perAgent.map((a) => ({ ...a, count: a.total }))}
        renderDetail={(a) => `${a.resolvedCount} resueltos · ${a.overdueCount} vencidos · ${a.avgResDays ?? '—'}d prom. · CSAT ${a.avgCsat ?? '—'} (${a.ratedCount}) · ${a.negativeCount} negativas`}
      />

      {/* ── Envíos ── */}
      <h2 className={styles.sectionHeading}>Envíos entre Sucursales</h2>
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#E8431A' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🚚</span><span className={styles.kpiValue} style={{ color: '#E8431A' }}>{shipmentsData.enCurso}</span></div>
          <p className={styles.kpiLabel}>En curso</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{shipmentsData.recibidos}</span></div>
          <p className={styles.kpiLabel}>Recibidos</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⌛</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{shipmentsData.avgTransitDays ?? '—'}</span></div>
          <p className={styles.kpiLabel}>Días prom. traslado→recibido</p>
          <p className={styles.kpiSub}>depende del transporte, no de quién confirma</p>
        </div>
      </div>
      <div className={styles.bottomRow}>
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}><h2 className={styles.cardTitle}>Quién envía</h2></div>
          <PersonList items={shipmentsData.senders} renderDetail={(p) => `${p.count} envío${p.count !== 1 ? 's' : ''}`} />
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}><h2 className={styles.cardTitle}>Quién confirma recepción</h2></div>
          <PersonList items={shipmentsData.receivers} renderDetail={(p) => `${p.count} recepción${p.count !== 1 ? 'es' : ''}`} />
        </div>
      </div>

      {/* ── Altas (Ingresos RH) ── */}
      <h2 className={styles.sectionHeading}>Altas (Ingresos RH)</h2>
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#d97706' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🧑‍💼</span><span className={styles.kpiValue} style={{ color: '#d97706' }}>{onboardingData.pendientes}</span></div>
          <p className={styles.kpiLabel}>Pendientes</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{onboardingData.aprobadas}</span></div>
          <p className={styles.kpiLabel}>Aprobadas</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#dc2626' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>❌</span><span className={styles.kpiValue} style={{ color: '#dc2626' }}>{onboardingData.rechazadas}</span></div>
          <p className={styles.kpiLabel}>Rechazadas</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⌛</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{onboardingData.avgDays ?? '—'}</span></div>
          <p className={styles.kpiLabel}>Días prom. de respuesta</p>
        </div>
      </div>
      <div className={styles.scoreHeader}><h3 className={styles.scoreTitle}>Por revisor</h3></div>
      <PersonList items={onboardingData.reviewers} renderDetail={(p) => `${p.aprobadas} aprobadas · ${p.rechazadas} rechazadas · ${p.avgDays ?? '—'}d prom.`} />

      {/* ── Bajas ── */}
      <h2 className={styles.sectionHeading}>Bajas</h2>
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#d97706' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>📤</span><span className={styles.kpiValue} style={{ color: '#d97706' }}>{offboardingData.pendienteRh}</span></div>
          <p className={styles.kpiLabel}>Pendientes en RH</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#2563eb' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>💻</span><span className={styles.kpiValue} style={{ color: '#2563eb' }}>{offboardingData.pendienteSistemas}</span></div>
          <p className={styles.kpiLabel}>Pendientes en Sistemas</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{offboardingData.completadas}</span></div>
          <p className={styles.kpiLabel}>Completadas</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⌛</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{offboardingData.avgRhDays ?? '—'}</span></div>
          <p className={styles.kpiLabel}>Días prom. etapa RH</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⌛</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{offboardingData.avgSistemasDays ?? '—'}</span></div>
          <p className={styles.kpiLabel}>Días prom. etapa Sistemas</p>
        </div>
      </div>
      <div className={styles.bottomRow}>
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}><h2 className={styles.cardTitle}>Etapa RH</h2></div>
          <PersonList items={offboardingData.rhReviewers} renderDetail={(p) => `${p.count} revisada${p.count !== 1 ? 's' : ''}`} />
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}><h2 className={styles.cardTitle}>Etapa Sistemas</h2></div>
          <PersonList items={offboardingData.sistemasReviewers} renderDetail={(p) => `${p.count} completada${p.count !== 1 ? 's' : ''}`} />
        </div>
      </div>

      {/* ── Cuentas ── */}
      <h2 className={styles.sectionHeading}>Cuentas (Gmail / Plataformas / ERP)</h2>
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#d97706' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>📝</span><span className={styles.kpiValue} style={{ color: '#d97706' }}>{accountsData.pendientes}</span></div>
          <p className={styles.kpiLabel}>Pendientes</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{accountsData.aprobadas}</span></div>
          <p className={styles.kpiLabel}>Aprobadas</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#2563eb' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🔐</span><span className={styles.kpiValue} style={{ color: '#2563eb' }}>{accountsData.byType.gmail || 0}</span></div>
          <p className={styles.kpiLabel}>Gmail</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#7c3aed' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🌐</span><span className={styles.kpiValue} style={{ color: '#7c3aed' }}>{accountsData.byType.platform || 0}</span></div>
          <p className={styles.kpiLabel}>Plataformas</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>🏭</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{accountsData.byType.platform_erp || 0}</span></div>
          <p className={styles.kpiLabel}>ERP</p>
        </div>
      </div>
      <div className={styles.scoreHeader}><h3 className={styles.scoreTitle}>Por revisor</h3></div>
      <PersonList items={accountsData.reviewers} renderDetail={(p) => `${p.aprobadas} aprobadas · ${p.rechazadas} rechazadas · ${p.avgDays ?? '—'}d prom.`} />

      {/* ── Recursos ── */}
      <h2 className={styles.sectionHeading}>Solicitudes de Recursos</h2>
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#d97706' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>📦</span><span className={styles.kpiValue} style={{ color: '#d97706' }}>{resourcesData.pendientes}</span></div>
          <p className={styles.kpiLabel}>Pendientes</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{resourcesData.aprobadas}</span></div>
          <p className={styles.kpiLabel}>Aprobadas</p>
        </div>
      </div>
      <div className={styles.scoreHeader}><h3 className={styles.scoreTitle}>Por revisor</h3></div>
      <PersonList items={resourcesData.reviewers} renderDetail={(p) => `${p.aprobadas} aprobadas · ${p.rechazadas} rechazadas · ${p.avgDays ?? '—'}d prom.`} />

      {/* ── Responsivas ── */}
      <h2 className={styles.sectionHeading}>Responsivas</h2>
      <div className={styles.kpiRow}>
        <div className={styles.kpi} style={{ '--accent': '#2563eb' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>📄</span><span className={styles.kpiValue} style={{ color: '#2563eb' }}>{responsivasData.total}</span></div>
          <p className={styles.kpiLabel}>Generadas</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>✍️</span><span className={styles.kpiValue} style={{ color: '#16a34a' }}>{responsivasData.firmadas}</span></div>
          <p className={styles.kpiLabel}>Firmadas</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#d97706' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⏳</span><span className={styles.kpiValue} style={{ color: '#d97706' }}>{responsivasData.pendientesFirma}</span></div>
          <p className={styles.kpiLabel}>Pendientes de firma</p>
        </div>
        <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
          <div className={styles.kpiTop}><span className={styles.kpiIcon}>⌛</span><span className={styles.kpiValue} style={{ color: '#0d9488' }}>{responsivasData.avgSignDays ?? '—'}</span></div>
          <p className={styles.kpiLabel}>Días prom. generada→firmada</p>
        </div>
      </div>
      <div className={styles.scoreHeader}><h3 className={styles.scoreTitle}>Por quién genera</h3></div>
      <PersonList items={responsivasData.generators} renderDetail={(p) => `${p.count} generada${p.count !== 1 ? 's' : ''}`} />

      {/* ── Actividad reciente ── */}
      <h2 className={styles.sectionHeading}>Actividad reciente</h2>
      <div className={styles.card}>
        {feed.length === 0 ? (
          <p className={styles.empty}>Sin actividad registrada</p>
        ) : (
          <div className={styles.assignList}>
            {feed.map((ev) => (
              <div key={ev.id} className={styles.assignItem}>
                <div className={styles.assignAvatar}>{ev.icon}</div>
                <div className={styles.assignInfo}>
                  <p className={styles.assignEmp}>{ev.text}</p>
                  <p className={styles.assignAsset}>{ev.sub || '—'}</p>
                </div>
                <span className={styles.assignTime}>{timeAgo(ev.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
