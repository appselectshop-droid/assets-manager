import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTicketsContext } from './TicketsLayout';
import { isOverdue, timeAgo } from './ticketShared';
import styles from './Tickets.module.css';

const EVENT_ICONS = { created: '🆕', assigned: '🔗', escalated: '🚀', resolved: '✅' };

// Feed de actividad — pedido explícito del usuario (2026-07-30): "es lo
// mismo que indicadores, deja el dashboard bien hecho para indicadores, a
// ese inicio hazlo tipo Facebook, Instagram o LinkedIn" (mismo criterio ya
// usado en el Inicio general de la app, ver Dashboard.jsx). En vez de
// depender de Auditoría (que solo registra acciones de Sistemas —
// asignar/editar/eliminar), se arman los eventos directo de los tickets ya
// cargados por TicketsLayout: cada ticket aporta sus hitos reales
// (creado/asignado/escalado/resuelto), con quien reportó incluido — así
// también se ve la actividad del lado del empleado, no solo la de admin.
function buildFeed(tickets) {
  const events = [];
  tickets.forEach((t) => {
    events.push({
      id: `${t._id}-created`, type: 'created', date: t.createdAt,
      text: `${t.employeeName || 'Alguien'} reportó un ticket`,
      sub: `${t.folio} · ${t.subject}`, ticket: t,
    });
    if (t.assignedAt) {
      events.push({
        id: `${t._id}-assigned`, type: 'assigned', date: t.assignedAt,
        text: `${t.assignedByName || 'Alguien'} asignó el ticket a ${t.assignedTo?.name || '—'}`,
        sub: `${t.folio} · ${t.subject}`, ticket: t,
      });
    }
    if (t.escalatedAt) {
      events.push({
        id: `${t._id}-escalated`, type: 'escalated', date: t.escalatedAt,
        text: `${t.escalatedByName || 'Alguien'} escaló el ticket`,
        sub: `${t.folio} · ${t.subject}`, ticket: t,
      });
    }
    if (t.resolvedAt) {
      events.push({
        id: `${t._id}-resolved`, type: 'resolved', date: t.resolvedAt,
        text: `${t.resolvedByName || 'Alguien'} resolvió el ticket`,
        sub: `${t.folio} · ${t.subject}`, ticket: t,
      });
    }
  });
  return events.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export default function TicketsInicio() {
  const { tickets, loading, currentUser, setDetailTarget } = useTicketsContext();
  const navigate = useNavigate();

  const hour = new Date().getHours();
  const greetingWord = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const stats = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    return {
      open: tickets.filter((t) => t.status === 'abierto').length,
      inProgress: tickets.filter((t) => t.status === 'en_proceso').length,
      overdue: tickets.filter(isOverdue).length,
      resolvedThisWeek: tickets.filter((t) => t.resolvedAt && new Date(t.resolvedAt).getTime() >= sevenDaysAgo).length,
    };
  }, [tickets]);

  const feed = useMemo(() => buildFeed(tickets).slice(0, 20), [tickets]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>{greetingWord}, <span>{currentUser.name?.split(' ')[0]}</span> 👋</h1>
          <p className={styles.greetingDate}>{today.charAt(0).toUpperCase() + today.slice(1)}</p>
        </div>
      </div>

      <div className={styles.quickRow}>
        <div className={styles.quickCard} style={{ '--accent': '#0d9488' }} onClick={() => navigate('/tickets/general')}>
          <span className={styles.quickIcon}>🎫</span>
          <div><p className={styles.quickTitle}>Tickets</p><p className={styles.quickSub}>Ver y atender</p></div>
        </div>
        <div className={styles.quickCard} style={{ '--accent': '#2563eb' }} onClick={() => navigate('/tickets/chats')}>
          <span className={styles.quickIcon}>💬</span>
          <div><p className={styles.quickTitle}>Chats</p><p className={styles.quickSub}>Conversaciones</p></div>
        </div>
        <div className={styles.quickCard} style={{ '--accent': '#d97706' }} onClick={() => navigate('/tickets/sla')}>
          <span className={styles.quickIcon}>📐</span>
          <div><p className={styles.quickTitle}>SLA</p><p className={styles.quickSub}>Cumplimiento</p></div>
        </div>
        <div className={styles.quickCard} style={{ '--accent': '#16a34a' }} onClick={() => navigate('/tickets/calificaciones')}>
          <span className={styles.quickIcon}>⭐</span>
          <div><p className={styles.quickTitle}>Calificaciones</p><p className={styles.quickSub}>Satisfacción (CSAT)</p></div>
        </div>
        <div className={styles.quickCard} style={{ '--accent': '#7c3aed' }} onClick={() => navigate('/tickets/escalamiento')}>
          <span className={styles.quickIcon}>🚀</span>
          <div><p className={styles.quickTitle}>Escalamiento</p><p className={styles.quickSub}>Fuera de nuestro control</p></div>
        </div>
        {currentUser.canViewManagerDashboard && (
          <div className={styles.quickCard} style={{ '--accent': '#b91c1c' }} onClick={() => navigate('/tickets/equipo')}>
            <span className={styles.quickIcon}>🧭</span>
            <div><p className={styles.quickTitle}>Equipo</p><p className={styles.quickSub}>Supervisión</p></div>
          </div>
        )}
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpi} style={{ '--accent': '#d97706' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>📬</span><span className={styles.kpiValue}>{stats.open}</span></div>
              <p className={styles.kpiLabel}>Abiertos</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#2563eb' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>🔧</span><span className={styles.kpiValue}>{stats.inProgress}</span></div>
              <p className={styles.kpiLabel}>En proceso</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#dc2626' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>⏰</span><span className={styles.kpiValue}>{stats.overdue}</span></div>
              <p className={styles.kpiLabel}>Vencidos</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue}>{stats.resolvedThisWeek}</span></div>
              <p className={styles.kpiLabel}>Resueltos</p>
              <p className={styles.kpiSub}>últimos 7 días</p>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeaderRow}>
              <p className={styles.panelTitle}>Actividad reciente</p>
              <button type="button" className={styles.panelLink} onClick={() => navigate('/tickets/indicadores')}>
                Ver Indicadores completos →
              </button>
            </div>
            {feed.length === 0 ? (
              <p className={styles.empty}>Sin actividad todavía</p>
            ) : (
              <div className={styles.feedList}>
                {feed.map((ev) => (
                  <button key={ev.id} type="button" className={styles.feedItem} onClick={() => setDetailTarget(ev.ticket)}>
                    <div className={styles.feedAvatar}>{EVENT_ICONS[ev.type]}</div>
                    <div className={styles.feedInfo}>
                      <p className={styles.feedText}>{ev.text}</p>
                      <p className={styles.feedSub}>{ev.sub}</p>
                    </div>
                    <span className={styles.feedTime}>{timeAgo(ev.date)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
