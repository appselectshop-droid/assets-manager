import { useEffect, useState } from 'react';
import api from '../services/api';

// Lee un catálogo editable de metadatos de Empleados (departamento, área,
// razón_social, puesto, oficina — ver backend/src/routes/employeeCatalogs.js)
// — pedido explícito del usuario (2026-08-07): antes cada formulario tenía
// su propia lista fija (o duplicada) en el código; ahora todos leen del
// mismo lugar, gestionado desde "Catálogos de Empleados". La ruta es
// pública (sin login) — se puede pasar `employeeApi` en vez del `api`
// admin por default para páginas del portal de empleado (ej. Solicitar
// Ingreso), aunque cualquiera de las dos instancias llega al mismo backend.
export default function useEmployeeCatalog(type, apiInstance = api) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    apiInstance.get(`/employee-catalogs/${type}/public`)
      .then(({ data }) => setItems(data))
      .catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return items;
}
