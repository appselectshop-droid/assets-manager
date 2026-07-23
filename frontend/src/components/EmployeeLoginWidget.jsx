import { useState } from 'react';
import employeeApi from '../services/employeeApi';
import PasswordInput from './PasswordInput';
import styles from './EmployeeLoginWidget.module.css';

// Pedido explícito del usuario: escribir el correo completo en el teclado de
// un celular es tedioso — como todos comparten el mismo dominio corporativo,
// no hace falta pedírselo. Si ya escribió "@" (correo completo) o son puros
// dígitos (no. de empleado), se manda tal cual; si no, se asume que es la
// parte de antes del "@" de su correo y se completa el dominio solo.
const EMAIL_DOMAIN = '@selectshop.com.mx';
function resolveUsername(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed.includes('@') || /^\d+$/.test(trimmed)) return trimmed;
  return `${trimmed}${EMAIL_DOMAIN}`;
}

// Qué campos de permiso viajan del backend (login/activate) hacia
// localStorage.employeeUser y el estado de MesaDeAyuda.jsx — un solo lugar
// para agregar uno nuevo (ej. canRequestOffboarding/canManageOffboarding,
// sesión 2026-07-20) sin tener que tocar los 4 lugares que antes repetían
// este mismo objeto literal a mano.
function employeeUserFromAuthResponse(data) {
  return {
    name: data.name,
    canManageOnboarding: data.canManageOnboarding,
    canRequestOffboarding: data.canRequestOffboarding,
    canManageOffboarding: data.canManageOffboarding,
  };
}

// Login + activación combinados en un solo flujo, sin que la persona tenga
// que saber de antemano si ya tiene cuenta: escribe su correo corporativo o
// no. de empleado, y según lo que responda el servidor se le pide su
// contraseña (ya tiene cuenta) o que cree una (primera vez — nadie de
// Sistemas la da de alta a mano, cualquier empleado activo puede activarse
// solo). Ver backend/src/routes/employeeAuth.js.
//
// Componente embebible (sin su propia navegación) — lo usa tanto
// EmployeeLogin.jsx (página completa, para links directos a
// /mesa-de-ayuda/reportar-ticket o /mesa-de-ayuda/mis-tickets sin sesión)
// como MesaDeAyuda.jsx (inline, como parte de la
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
    const resolved = resolveUsername(username);
    setError('');
    setLoading(true);
    try {
      const { data } = await employeeApi.post('/employee-auth/lookup', { username: resolved });
      setUsername(resolved); // ya resuelto (con dominio, si aplicaba) — login/activate lo reusan tal cual
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
      localStorage.setItem('employeeUser', JSON.stringify(employeeUserFromAuthResponse(data)));
      onSuccess(employeeUserFromAuthResponse(data));
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
      localStorage.setItem('employeeUser', JSON.stringify(employeeUserFromAuthResponse(data)));
      onSuccess(employeeUserFromAuthResponse(data));
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
              placeholder="ej. felipe.gomez o tu número de empleado"
              autoComplete="username"
              autoCapitalize="none"
            />
            <p className={styles.hint}>No hace falta escribir "@selectshop.com.mx" — se agrega solo.</p>
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
            <PasswordInput
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
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label>Confirma tu contraseña</label>
            <PasswordInput
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
