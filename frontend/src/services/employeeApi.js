import axios from 'axios';

// Instancia aparte de `api.js` — sesión de EMPLEADO (portal Mis Tickets),
// con su propio token en localStorage, para que nunca se mezcle con la
// sesión de Sistemas (alguien podría, en teoría, ser ambas cosas a la vez).
const base = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const employeeApi = axios.create({ baseURL: base });

employeeApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('employeeToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

employeeApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('employeeToken');
      localStorage.removeItem('employeeUser');
      window.location.href = '/empleado/login';
    }
    return Promise.reject(err);
  }
);

export default employeeApi;
