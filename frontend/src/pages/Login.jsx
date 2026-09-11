import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import PasswordInput from '../components/PasswordInput';
import styles from './Login.module.css';

// `?next=` — mismo patrón ya usado en EmployeeLogin.jsx para el portal de
// empleado: un link compartido por correo (ej. el aviso de ticket nuevo,
// ver tickets.js) manda aquí en vez de directo a la ruta privada, para que
// quien no tenga sesión vea el login real (no el 404 genérico de
// PrivateRoute) y, al entrar, siga derecho a donde iba en vez de quedarse
// en el Dashboard. Si ya hay sesión vigente (token guardado), ni se
// muestra el formulario — salta directo, para que el link se sienta
// instantáneo cuando ya se está logueado.
export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';

  if (localStorage.getItem('token')) {
    return <Navigate to={next} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      // Guardar TODA la respuesta del login menos el token (que ya vive en
      // su propia llave) — reescrito 2026-09-11 tras encontrar la MISMA
      // clase de bug 3 veces seguidas en este archivo (canManageTickets
      // 2026-08-04, canViewBecariosPanel 2026-09-07, y ahora
      // canManageAssignments/canManageOnboardingRequests/
      // canManageOffboardingRequests/canManageResourceRequests — además de
      // canViewTelemetryAssets, que llevaba roto desde siempre sin que
      // nadie lo reportara): esta lista se armaba A MANO campo por campo,
      // y cada permiso nuevo que el backend agregaba a `POST /auth/login`
      // había que acordarse de sumarlo TAMBIÉN aquí — si se olvidaba (como
      // pasó 3 veces), el permiso quedaba guardado bien en Mongo y el
      // backend lo mandaba bien, pero nunca llegaba a `localStorage`, así
      // que cerrar sesión/volver a entrar (o hasta reinstalar la PWA, como
      // probó el usuario) no arreglaba nada — el objeto seguía sin ese
      // campo para siempre. Guardar `data` completo elimina esta clase de
      // bug de raíz: cualquier permiso que el backend regrese de aquí en
      // adelante queda guardado automáticamente, sin otro archivo que
      // mantener sincronizado a mano.
      const { token, ...user } = data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      navigate(next);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.icon}>📦</span>
          <h1 className={styles.title}>Assets Manager</h1>
          <p className={styles.subtitle}>Inicia sesión para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.field}>
            <label>Correo electrónico</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="correo@empresa.com"
              required
            />
          </div>
          <div className={styles.field}>
            <label>Contraseña</label>
            <PasswordInput
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}
