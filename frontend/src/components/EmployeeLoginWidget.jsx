import { useState } from 'react';
import employeeApi from '../services/employeeApi';
import styles from './EmployeeLoginWidget.module.css';

// Login + activación combinados en un solo flujo, sin que la persona tenga
// que saber de antemano si ya tiene cuenta: escribe su correo corporativo o
// no. de empleado, y según lo que responda el servidor se le pide su
// contraseña (ya tiene cuenta) o que cree una (primera vez — nadie de
// Sistemas la da de alta a mano, cualquier empleado activo puede activarse
// solo). Ver backend/src/routes/employeeAuth.js.
//
// Componente embebible (sin su propia navegación) — lo usa tanto
// EmployeeLogin.jsx (página completa, para links directos a /reportar-ticket
// o /mis-tickets sin sesión) como MesaDeAyuda.jsx (inline, como parte de la
// pantalla principal). Guarda el token/usuario en localStorage igual en
// ambos casos; quien lo use decide qué hacer después vía `onSuccess`.
export default function EmployeeLoginWidget({ onSuccess }) {
  const [step, setStep] = useState('username'); // username | login | activate
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const goToStart = () => {
    setStep('username');
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!username.trim()) { setError('Escribe tu correo corporativo o no. de empleado.'); return; }
    setError('');
    setLoading(true);
    try {
      const { data } = await employeeApi.post('/employee-auth/lookup', { username: username.trim() });
      setName(data.name);
      setStep(data.hasPassword ? 'login' : 'activate');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo verificar tu usuario.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await employeeApi.post('/employee-auth/login', { username: username.trim(), password });
      localStorage.setItem('employeeToken', data.token);
      localStorage.setItem('employeeUser', JSON.stringify({ name: data.name, canManageOnboarding: data.canManageOnboarding }));
      onSuccess({ name: data.name, canManageOnboarding: data.canManageOnboarding });
    } catch (err) {
      setError(err.response?.data?.message || 'Credenciales incorrectas.');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    try {
      const { data } = await employeeApi.post('/employee-auth/activate', { username: username.trim(), password });
      localStorage.setItem('employeeToken', data.token);
      localStorage.setItem('employeeUser', JSON.stringify({ name: data.name, canManageOnboarding: data.canManageOnboarding }));
      onSuccess({ name: data.name, canManageOnboarding: data.canManageOnboarding });
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo activar tu cuenta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && <p className={styles.error}>{error}</p>}

      {step === 'username' && (
        <form onSubmit={handleLookup}>
          <div className={styles.field}>
            <label>Correo corporativo o no. de empleado</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="tu.correo@selectshop.com.mx o tu número"
              autoComplete="username"
            />
          </div>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Buscando...' : 'Continuar'}
          </button>
        </form>
      )}

      {step === 'login' && (
        <form onSubmit={handleLogin}>
          <p className={styles.hint}>Hola, {name} — escribe tu contraseña.</p>
          <div className={styles.field}>
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              autoFocus
            />
          </div>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Entrando...' : 'Iniciar sesión'}
          </button>
          <button type="button" className={styles.backLink} onClick={goToStart}>
            ← Usar otro correo o número
          </button>
        </form>
      )}

      {step === 'activate' && (
        <form onSubmit={handleActivate}>
          <p className={styles.hint}>Hola, {name} — es tu primera vez aquí, crea una contraseña.</p>
          <div className={styles.field}>
            <label>Nueva contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label>Confirma tu contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Crear contraseña y entrar'}
          </button>
          <button type="button" className={styles.backLink} onClick={goToStart}>
            ← Usar otro correo o número
          </button>
        </form>
      )}
    </>
  );
}
