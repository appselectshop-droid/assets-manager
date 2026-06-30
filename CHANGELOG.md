# Changelog — Assets Manager (SelectShop)

> **Propósito de este archivo:** este es el documento que debe leerse al inicio de cualquier sesión de trabajo (humana o con IA) sobre este repo. Junto con `README.md` (arquitectura, stack, modelo de datos, endpoints) da el contexto completo: **qué es el proyecto** y **qué cambios se han hecho y por qué**. Cada cambio nuevo (feature, fix, refactor) debe agregarse aquí como una entrada nueva arriba del todo, siguiendo el formato de la sección "Cómo agregar una entrada".

## Resumen rápido del proyecto

Sistema interno de control de activos IT (laptops, equipos de escritorio, celulares, accesorios) de **SelectShop MB SA DE CV**: alta/asignación de equipo a empleados, inventario/stock, generación de responsiva en PDF y auditoría de cambios.

- **Frontend**: React 18 + Vite → desplegado en Vercel.
- **Backend**: Node.js + Express + Mongoose 8 → desplegado en Render (free tier, cold start ~50s).
- **DB**: MongoDB Atlas.
- **Auth**: JWT (`jsonwebtoken` + `bcryptjs`).
- **Deploy**: push a `main` en GitHub (`appselectshop-droid/assets-manager`) dispara auto-deploy en Vercel y Render.

Detalle completo de estructura de carpetas, modelo de datos, variables de entorno y endpoints de la API: ver [`README.md`](./README.md).

## Cómo agregar una entrada

Cada vez que se haga un cambio relevante (feature, fix, refactor, cambio de infraestructura), agregar arriba de todo un bloque así:

```
### YYYY-MM-DD — Título corto del cambio
- **Qué cambió:** descripción concreta (archivos/módulos afectados).
- **Por qué:** el motivo de negocio o técnico (bug reportado, solicitud del equipo, deadline, etc.).
- **Commit(s):** hash(es) corto(s).
```

---

## Historial de cambios

### 2026-06-30 — Módulo de Cuentas Gmail con gestor de contraseñas
- **Qué cambió:** nueva página `Cuentas Gmail` (solo admin) para dar de alta cuentas de Gmail asignadas a empleados registrados. Backend: modelo `GmailAccount` (email único + contraseña cifrada AES-256-GCM), utilidades `backend/src/utils/gmailVault.js` (cifrado/descifrado, generador de contraseñas aleatorias únicas, sugeridor de correo `nombre.apellido@gmail.com` con manejo de colisiones), rutas `backend/src/routes/gmailAccounts.js` (`GET /`, `GET /suggest-email`, `POST /`, `PUT /:id`, `DELETE /:id`, protegidas con `auth`+`adminOnly`), nueva variable de entorno `GMAIL_VAULT_KEY`, y se agregó `cuenta_gmail` al enum de `AuditLog.entity`. Frontend: `GmailAccounts.jsx` con alta (correo autogenerido pero editable, contraseña siempre autogenerada — sin campo para capturarla a mano), mostrar/ocultar y copiar contraseña, regenerar contraseña, editar estado/notas, eliminar, y exportación a Excel de correos+contraseñas. Se sincroniza `Employee.gmailAccounts[]` al crear/eliminar para no romper las vistas existentes (Employees, EmployeeDetail, export de auditoría de correos en Assignments).
- **Por qué:** el equipo venía repitiendo la misma contraseña en todas las cuentas de Gmail creadas para empleados, lo cual causó un problema de seguridad grande. Se necesitaba forzar contraseñas únicas y aleatorias por cuenta, guardarlas de forma recuperable (para poder compartirlas y exportarlas) en vez de solo hash, y dejar rastro de auditoría de quién creó/regeneró/eliminó cada cuenta.
- **Commit(s):** (ver commit que introduce este módulo).

### 2026-06-30 — Respaldo de seguridad + bitácora de proyecto
- **Qué cambió:** se agregó este `CHANGELOG.md`; se creó tag de git `backup-2026-06-30` sobre el estado actual de `main` y se subió a GitHub.
- **Por qué:** el usuario pidió un respaldo antes de continuar trabajando y un documento persistente para que cualquier sesión futura (incluyendo con Claude) pueda entender el proyecto y el historial de cambios con su razón de ser, sin depender de memoria de corto plazo.
- **Commit(s):** (ver commit que introduce este archivo).

### 2026-06-30 — README de handoff del proyecto
- **Qué cambió:** se agregó `README.md` con stack, estructura de carpetas, modelo de datos, variables de entorno y endpoints documentados.
- **Por qué:** preparar el traspaso del proyecto a otro equipo/dueño (documentación de referencia para retomarlo sin conocimiento previo).
- **Commit(s):** `56c095d`.

### 2026-06-29 — Auditoría de correos en Assignments
- **Qué cambió:** se agregó exportación de auditoría de correos en Assignments (`602633b`). Antes se había probado una importación masiva de correos para empleados existentes (`e0131f8`) y se revirtió (`5c9e671`) en favor de este export, por ser más simple y suficiente para el caso de uso.
- **Por qué:** necesidad de auditar/verificar correos corporativos y de Gmail de empleados ya existentes sin arriesgar una importación masiva que pudiera sobrescribir datos.
- **Commit(s):** `e0131f8`, `5c9e671`, `602633b`.

### 2026-06-29 — Restaurar botones de transferencia Accesorios ↔ Activos
- **Qué cambió:** se restauraron los botones "Mover a Accesorios" / "Regresar a Activos" que se habían quitado previamente.
- **Por qué:** se determinó que sí eran necesarios para reclasificar equipo entre catálogos tras la separación de Activos/Accesorios.
- **Commit(s):** `6f30529`.

### 2026-06-25 / 2026-06-26 — Rediseño de Accesorios como catálogo de stock a granel
- **Qué cambió:** Accessories pasó de ser un listado de items individuales a un catálogo por producto con `stockTotal`; se agregó campo `location` a assets y accesorios; filtro por sucursal en Stock; fix de `PUT /assets` que no guardaba `stockTotal`/`location`.
- **Por qué:** el control de accesorios (mouse, teclado, cables, etc.) no tiene sentido por número de serie individual como laptops — se necesitaba trackeo de cantidades por sucursal.
- **Commit(s):** `149ef08`, `b8a4551`, `1a09058`, `ed249a2`, `dd31cb2`, `4447140`, `4ec35e4`, `5de6ab1`, `39fe14e`, `19df29a`, `ca8e149`, `beb0711`, `e0d6b93`.

### 2026-06-25 — Overhaul de Assignments (auditoría) + campo teléfono
- **Qué cambió:** rediseño de filtros y export de Excel en Assignments para calidad de auditoría; se ocultó al empleado "Sistemas" de Assignments mostrando sus activos como disponibles en Stock; se agregó campo `phone` a Employee con búsqueda por número de empleado o teléfono en el modal de asignación de Stock.
- **Por qué:** el equipo asignado a la cuenta genérica "Sistemas" no representa un empleado real — se necesitaba que ese inventario apareciera como disponible en vez de "asignado". El export de Assignments necesitaba ser confiable para auditorías.
- **Commit(s):** `e643e09`, `915fe2c`, `5e4b6ea`, `7d8604f`, `b738337`.

### 2026-06-22 — Healthcheck para monitoreo
- **Qué cambió:** endpoint `HEAD /health` sin auth.
- **Por qué:** Render duerme el backend en free tier tras inactividad; se necesita un monitor externo (UptimeRobot) haciendo ping para reducir cold starts.
- **Commit(s):** `cb7b4e4`.

### 2026-06-16 / 2026-06-17 — Responsiva en PDF con branding por empresa
- **Qué cambió:** generador de PDF de responsiva (pdfkit) con bloques de firma, branding/logo por empresa, corrección de logos y matching de nombres de empresa en DB (incl. typos conocidos); texto legal expandido con artículos completos de la LFT (110, 132, 134, 135); sistema de auditoría (`AuditLog`) y tracking de últim@ que modificó cada registro.
- **Por qué:** requisito legal/operativo de tener responsiva firmable por empleado y empresa, con el texto legal correcto, y trazabilidad de quién hizo qué cambio (auditoría).
- **Commit(s):** `dccde40`, `77663d0`, `77cb7a0`, `ea2ca5c`, `efc8dd8`, `9d8c010`, `28254fd`.

### 2026-06-15 — Fixes de guardado en Mongoose 8 + mejoras de UI en Dashboard/Employees
- **Qué cambió:** fix de ediciones de activos que no guardaban (usar `findById` + `markModified` + `save()` en vez de `findByIdAndUpdate`, necesario por el campo `specs` tipo Mixed); fix de falso positivo en detección de número de serie duplicado; drilldown interactivo de categorías en Dashboard; ComboSelect para sucursal/departamento/razón social; filtro de sucursal en Employees.
- **Por qué:** Mongoose 8 no persiste bien cambios en campos `Mixed` vía `findByIdAndUpdate`; era un bug bloqueante para editar specs de activos.
- **Commit(s):** `48b3c29`, `a2a68e0`, `65a1747`, `4345109`, `90fd748`, `89882a7`, `9e0f787`, `14617f7`, `7043d81`.

### 2026-06-12 — Export de Excel para Assets
- **Qué cambió:** export de Excel con columnas específicas por pestaña/categoría; fix de crash por caracteres inválidos en nombre de hoja; mostrar empleado asignado en la tabla de estatus de Assets.
- **Por qué:** necesidad operativa de exportar inventario a Excel para reportes, sin que el nombre de hoja rompiera el archivo.
- **Commit(s):** `4d86e72`, `831e9b2`, `70c0320`, `baae99e`.

### 2026-06-05 / 2026-06-08 — Detección de duplicados + edición de asignaciones
- **Qué cambió:** detección de números de serie duplicados con visor de duplicados (refinada para excluir periféricos y validar línea telefónica en celulares); filtros interactivos de sucursal/departamento en dashboard; alta de activo desde el modal de asignación de empleado; edición de activos asignados desde el detalle de empleado y desde el modal de edición.
- **Por qué:** evitar altas duplicadas de inventario por error de captura; agilizar el flujo de alta+asignación en un solo paso.
- **Commit(s):** `01202b8`, `8577168`, `c04c341`, `fc894d6`, `ba107d3`, `1c8d062`.

### 2026-06-03 / 2026-06-04 — Setup inicial del proyecto
- **Qué cambió:** primer commit; configuración de deployment (CORS por env var, URL de API dinámica, `.env.example`); rediseño de campos de empleado (`businessName`, `office`, `area`, multi-email); sidebar colapsable; rediseño de dashboard (KPIs, barras por categoría, dona, asignaciones recientes, top empleados); fix de 404 en refresh (regla de rewrite SPA en Vercel); campo de número de serie de cargador/PSU; asignación opcional de empleado al registrar activo; campo `planCost` en celulares.
- **Por qué:** construcción inicial del sistema de control de activos para reemplazar el proceso manual (Excel) de IT.
- **Commit(s):** `21f0019`, `b296f56`, `f1ffd16`, `8d7306d`, `a6f5053`, `a0db094`, `cb25f7c`, `ce248be`, `5490353`.

---

## Notas conocidas pendientes (heredadas de README)

- `users.js` no tiene middleware `auth` aplicado a sus rutas, a diferencia del resto de recursos — revisar antes de exponer sin gateway.
- No hay seed/migration scripts ni tests automatizados; alta de datos manual desde la UI o importación de Excel.
