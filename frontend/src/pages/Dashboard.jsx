import { useEffect, useState } from 'react';
import api from '../services/api';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const load = async () => {
      const [emp, assets] = await Promise.all([
        api.get('/employees'),
        api.get('/assets'),
      ]);
      const all = assets.data;
      setStats({
        employees: emp.data.length,
        total: all.length,
        assigned: all.filter((a) => a.status === 'asignado').length,
        available: all.filter((a) => a.status === 'disponible').length,
        baja: all.filter((a) => a.status === 'baja').length,
      });
    };
    load();
  }, []);

  if (!stats) return <p className={styles.loading}>Cargando...</p>;

  const cards = [
    { label: 'Empleados', value: stats.employees, color: '#E8431A' },
    { label: 'Activos totales', value: stats.total, color: '#111' },
    { label: 'Asignados', value: stats.assigned, color: '#d97706' },
    { label: 'Disponibles', value: stats.available, color: '#16a34a' },
    { label: 'De baja', value: stats.baja, color: '#dc2626' },
  ];

  return (
    <div>
      <h1 className={styles.title}>Bienvenido, {user.name?.split(' ')[0]} 👋</h1>
      <div className={styles.grid}>
        {cards.map((c) => (
          <div key={c.label} className={styles.card}>
            <span className={styles.cardValue} style={{ color: c.color }}>{c.value}</span>
            <span className={styles.cardLabel}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
