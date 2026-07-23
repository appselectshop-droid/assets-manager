import axios from 'axios';

// Instancia aparte de `api.js` — sesión de EMPLEADO (portal Mis Tickets),
// con su propio token en localStorage, para que nunca se mezcle con la
// sesión de Sistemas (alguien podría, en teoría, ser ambas cosas a la vez).
const base = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Sin timeout, una conexión "en agujero negro" (típico de roaming/ahorro de
// energía en wifi — no es cuestión de ancho de banda) deja la promesa
// colgada hasta el timeout de TCP del sistema operativo, que puede tardar
// varios minutos. 90s da margen de sobra al cold start de Render (~50s) y
// aun así acota la espera a algo razonable en vez de "se queda pensando".
const employeeApi = axios.create({ baseURL: base, timeout: 90000 });

employeeApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('employeeToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

employeeApi.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('employeeToken');
      localStorage.removeItem('employeeUser');
      window.location.href = '/mesa-de-ayuda/empleado/login';
      return Promise.reject(err);
    }

    // Reintento único para GET (idempotente) cuando no hubo respuesta del
    // servidor (timeout o conexión perdida) — cubre el blip pasajero típico
    // de wifi sin que el usuario tenga que notar nada.
    const config = err.config;
    const isTimeoutOrNetwork = err.code === 'ECONNABORTED' || !err.response;
    if (isTimeoutOrNetwork && config && (config.method || 'get').toLowerCase() === 'get' && !config.__retried) {
      config.__retried = true;
      try {
        return await employeeApi(config);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }

    return Promise.reject(err);
  }
);

export default employeeApi;
