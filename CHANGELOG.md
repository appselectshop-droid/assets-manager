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

### 2026-06-30 — Archivo histórico de Responsivas generadas (activos y cuentas)
- **Qué cambió:** cada vez que se genera una Responsiva en PDF (de equipo/activos o de cuenta de plataforma) se guarda una copia completa en Mongo — nuevo modelo `ResponsivaArchive` (`type`, `employee`, `employeeName`, `employeeIdNum`, `relatedLabel`, `fileName`, `pdfData` como `Buffer`, `generatedByName`). Se guarda vía `archiveAndRespond()` (`backend/src/utils/archiveResponsiva.js`), que junta el PDF completo en memoria antes de responder y hace el guardado **best-effort**: si falla, la descarga se completa igual, nunca se rompe por un error de archivado. Nueva página **Responsivas** (`/responsivas`, solo admin) que lista todo lo generado (tipo, empleado, detalle, quién lo generó, fecha) con filtro por tipo, búsqueda y botón de descarga por documento — nuevas rutas `GET /api/responsiva-archive` y `GET /api/responsiva-archive/:id/download`.
- **Por qué:** el usuario pidió un lugar donde queden guardados todos los PDF de responsivas que se generan, tanto de activos como de cuentas — hoy se generaban y se perdían en cuanto se cerraba la descarga.
- **Detalle técnico:** se guarda en MongoDB y no en el disco del servidor porque Render (free tier) no persiste el filesystem entre despliegues — cualquier archivo escrito a disco se perdería en el siguiente deploy. Esto obligó a refactorizar cómo `responsiva.js` y `platformAccounts.js` entregan el PDF: antes usaban `doc.pipe(res)` (streaming directo); ahora recolectan los chunks del stream de `pdfkit`, arman el buffer completo, lo guardan y solo entonces responden — el contenido visual del PDF no cambió.
- **Verificación:** se generaron ambos tipos de responsiva contra los routers reales (JWT firmado, sin atajos) y se confirmó que ambas quedaron archivadas correctamente; se releyó el PDF de activos completo (2 páginas) para confirmar que el refactor de streaming no alteró el resultado visual. Se probaron `GET /` y `GET /:id/download` del archivo, y se confirmó 403 para un usuario sin rol admin. Los registros de prueba se borraron al terminar.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Nombres en las firmas de la Responsiva de Plataformas
- **Qué cambió:** en el bloque de firmas del PDF, "JEFE DIRECTO" ahora muestra el nombre capturado en el campo del mismo nombre (`account.directManager`), igual que "USUARIO RESPONSABLE" ya mostraba el nombre del empleado. "SISTEMAS" ahora **siempre** muestra el nombre de quien tiene registrado el correo corporativo `gerente.sistemas@selectshop.com.mx` (se busca en `Employee.corporateEmails` en cada generación) — nunca se imprime el correo, solo el nombre.
- **Por qué:** el usuario pidió que las firmas mostraran nombres, no dejarlas en blanco ni mostrar correos, y que Sistemas siempre sea la misma persona (identificada por ese correo) sin importar quién genere el documento.
- **Verificación:** contra la base real, `gerente.sistemas@selectshop.com.mx` resolvió a "BRUNO CASTAÑEDA ROVIRA" (único registro con ese correo corporativo). Se probó con el router real (PUT + GET con JWT firmado) que las tres firmas muestran el nombre correcto; se limpió el valor de prueba de `directManager` al terminar (los demás campos de prueba ya eran del usuario, no se tocaron).
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Campos manuales antes de generar la Responsiva + fix de teléfono
- **Qué cambió (campos manuales):** el botón "📄 Responsiva" ya no descarga directo — ahora abre un modal para completar "Tienda / Cuenta / Seller", "Jefe directo", "Rol o tipo de acceso" y "Vigencia del acceso" (los que no se pueden llenar solos con los datos del sistema). Al enviar el modal, esos valores se guardan en la cuenta (`PUT /api/platform-accounts/:id`, nuevos campos `store`, `directManager`, `accessRole`, `accessValidity` en `PlatformAccount`) y luego se genera el PDF — la próxima vez que se regenere la responsiva de esa misma cuenta, el modal ya viene prellenado con lo último capturado.
- **Bug corregido (teléfono):** el campo "Teléfono / Ext." usaba `Employee.phone`, pero ese campo casi nunca está lleno (4 de 256 empleados activos). El número real vive en la línea del celular que la empresa le asignó al empleado (`Asset.specs.lineNumber`, vía su asignación activa) — 186 de 256 empleados activos lo tienen ahí. Ahora el PDF usa ese número primero, y solo cae a `Employee.phone` si no hay celular asignado con línea.
- **Por qué:** el usuario señaló que el teléfono debió salir solo porque casi todos los empleados tienen uno registrado — cierto, pero vive en el activo asignado, no en la ficha del empleado — y pidió poder llenar los demás campos manuales antes de generar el documento en vez de editarlos a mano después.
- **Verificación:** contra la base real, se confirmó que 186/256 empleados activos tienen línea de celular asignada vs. solo 4 con `Employee.phone`. Se probó el flujo completo (guardar campos vía `PUT` real + generar PDF vía `GET` real, ambos con JWT firmado, sin atajos) contra la cuenta de Amazon existente — el PDF resultante mostró el teléfono real (5548605399, de un OPPO A40 asignado) y los cuatro campos manuales ya llenos. Los valores de prueba (Ana Torres, etc.) se limpiaron de esa cuenta real después de verificar.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Responsiva en PDF para Cuentas de Plataformas (solicitud de acceso)
- **Qué cambió:** en `Cuentas de Plataformas`, cada cuenta con empleado asignado tiene un botón "📄 Responsiva" que genera y descarga un PDF con los datos ya llenos, basado en la plantilla que compartió el usuario (`Responsiva_Cuentas_Plataformas.docx`, encontrada en `~/Downloads`): "Solicitud y Carta Responsiva de Cuenta de Acceso a Plataformas Digitales". Se llenan solos: datos del empleado (nombre, puesto, área/departamento, correo corporativo, teléfono), datos de la cuenta (plataforma marcada con checkbox `[X]`/`[ ]`, correo asociado, justificación si hay notas), el texto legal/obligaciones completo de la plantilla, y los tres bloques de firma (Usuario responsable, Jefe directo, Sistemas) con el nombre del empleado prellenado en el primero. **Nunca incluye la contraseña** — la plantilla original tampoco la pide. Nuevo endpoint `GET /api/platform-accounts/:id/responsiva`, protegido por `canManagePlatformAccounts`.
- **Refactor de soporte:** se extrajeron a `backend/src/utils/pdfBranding.js` las funciones de layout/marca (colores y logo por empresa, helpers de `pdfkit` como `sectionBand`, `kvRow`, `clauseBlock`, etc.) que ya usaba la Responsiva de activos físicos (`responsiva.js`), para reutilizarlas en este nuevo documento sin duplicar ~150 líneas. La Responsiva de activos sigue funcionando igual (se verificó generando un PDF real con el router de producción).
- **Por qué:** el usuario quiere que este documento se llene solo (como ya hace la Responsiva de equipo) en vez de capturarlo a mano cada vez que se solicita acceso a una plataforma para un empleado.
- **Verificación:** se generó un PDF real usando el router de producción (con un JWT de prueba, sin atajos de código) contra una cuenta real de la base — layout, checkboxes y texto legal completo se revisaron visualmente. Se corrigió en el camino un bug de compatibilidad: los caracteres ☐/☒ no se veían bien con la fuente estándar del PDF (salían como "&"); se cambiaron por `[ ]`/`[X]`.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Detectar Gmail de celulares/tablets como pendientes en Cuentas Gmail
- **Qué cambió:** `GET /api/gmail-accounts/unregistered` ahora también revisa `Asset.specs.gmailAccount` de celulares y tablets (campo "Gmail" que ya se capturaba al registrar esos equipos), usando el empleado con la asignación activa de cada equipo para saber a quién ligarla. Se combina con la detección que ya existía (`Employee.gmailAccounts[]`) en una sola lista, sin duplicar por correo. No modifica `Asset` ni `Employee` — solo lee. El texto de la sección en `Cuentas Gmail` se actualizó de "Cuentas ya registradas en Empleados" a "Cuentas ya usadas sin contraseña guardada" para reflejar ambas fuentes.
- **Por qué:** el usuario notó que varios celulares Android ya tienen su cuenta Gmail capturada (es para lo que se usan) y quería traerlas al gestor sin duplicar las que ya estuvieran ahí ni inventarles contraseña.
- **Verificación:** solo lectura contra la base real — 23 celulares/tablets con Gmail en specs, 8 ya en el gestor, 15 pendientes (los 15 con empleado actualmente asignado); combinado con la detección existente no generó duplicados (0 correos repetidos entre ambas fuentes).
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Fix: EmployeeDetail solo mostraba 1 cuenta Gmail; elegir reasignar directo o disponible; cuentas de Plataformas en Disponibilidad
- **Bug corregido:** la sección "Cuentas" de `EmployeeDetail.jsx` usaba `.find()` para buscar la cuenta Gmail del empleado, así que si tenía varias (caso real: Karla Conejo) solo mostraba la primera. Se cambió a `.filter()` y ahora se listan todas.
- **Desasignar con opción de reasignar directo:** en `EmployeeDetail.jsx`, el botón "↩️ Desasignar" de una cuenta de Plataforma ahora abre un modal con dos caminos: "Mandar a disponible" (como antes, la deja sin empleado) o "Asignar a otro empleado" (selecciona directamente al nuevo empleado ahí mismo, sin tener que ir a su ficha por separado). Ambos casos usan `PUT /platform-accounts/:id` (con `unassign: true` o `employeeId`).
- **Gmail se queda sin reciclaje (decisión confirmada):** se preguntó explícitamente si extender el reciclaje a Gmail también, y el usuario confirmó que no, por ahora solo Plataformas.
- **Cuentas de Plataformas visibles en Disponibilidad:** se agregó una sección "🔐 Cuentas de Plataformas" en `Stock.jsx`, listando por plataforma cuántas cuentas están disponibles (sin empleado), con su propio botón "Asignar" que abre un modal (`AccountAssignModal`) con selección de cuenta + búsqueda de empleado por número/teléfono/nombre — mismo patrón visual que el modal de asignación de activos físicos que ya existía en esa página. Solo visible si el usuario tiene `canManagePlatformAccounts`.
- **Por qué:** al revisar el caso de Karla Conejo, el usuario notó el bug de una sola cuenta Gmail visible, y aprovechó para pedir un flujo de desasignación más directo y que las cuentas disponibles también se vieran junto al inventario físico en Disponibilidad, ya que es la página donde ya se gestiona qué hay "libre" para asignar.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Migrar Correos Corporativos a Cuentas de Plataformas (como Microsoft)
- **Qué cambió:** en `Cuentas de Plataformas` se agregó una sección "📥 Correos corporativos (Microsoft) sin contraseña guardada" que detecta los correos ya cargados en `Employee.corporateEmails[]` (capturados desde el formulario de Empleados, con distintos dominios) que todavía no tienen registro en el gestor con `platform: 'Microsoft 365'`. Cada uno tiene un botón "+ Agregar contraseña" que abre el mismo modal de "Nueva cuenta", pre-llenado con el empleado, plataforma "Microsoft 365" y el correo, en modo "ya existe" (para capturar su contraseña real). Backend: nuevo `GET /api/platform-accounts/unregistered-corporate`, que solo lee — no modifica ni borra `Employee.corporateEmails[]`.
- **Por qué:** el usuario tiene 184 correos corporativos (con distintos dominios) que en realidad son todas cuentas de Microsoft, y quiere pasarlos al gestor de contraseñas de Plataformas sin perder ni tocar lo que ya está en la ficha de cada empleado.
- **Verificación:** se corrió un script de solo lectura contra la base real que confirmó 166 empleados con 184 correos corporativos, 0 ya migrados, 184 pendientes de migrar — sin escribir nada.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Mover asignar/desasignar cuentas a la ficha del empleado ("Ver activos"); Gmail deja de ser reciclable por ahora
- **Qué cambió:** las acciones de asignar/desasignar cuentas ya no viven en las páginas de Cuentas Gmail/Plataformas. Ahora se hacen desde `EmployeeDetail.jsx` (la misma pantalla de "Ver activos" a la que se entra desde Empleados), en una nueva sección **"Cuentas"** separada de "Activos asignados": muestra la cuenta Gmail del empleado (si tiene, solo lectura + ver/copiar contraseña) y sus cuentas de Plataformas (con botón "↩️ Desasignar", modal de confirmación, ver/copiar contraseña), más un botón **"+ Asignar cuenta de plataforma"** que abre un modal para elegir una cuenta disponible (del pool de reciclaje) y dársela a ese empleado. Se agregó `AssignAccountModal` en `EmployeeDetail.jsx`, reutilizando los estilos de modal ya existentes ahí (`Assets.module.css`).
- **Qué se quitó de las páginas de Cuentas:** en `GmailAccounts.jsx` se revirtió por completo el reciclaje (botón "Desasignar", sección "Disponibles para reciclar" y sus modales) — Gmail vuelve a requerir `employee` siempre. En `PlatformAccounts.jsx` se quitó el botón "↩️ Desasignar" de la tabla y el botón "Asignar a un empleado" de la sección "Disponibles para reciclar" (esa sección se queda, solo como listado + Eliminar, con una nota de que la asignación ahora se hace desde la ficha del empleado). Las páginas de Cuentas siguen siendo las únicas para **crear**, editar notas/estado, regenerar/corregir contraseña, ver/copiar/exportar y eliminar.
- **Backend:** `GmailAccount.employee` volvió a ser obligatorio; `PUT /api/gmail-accounts/:id` perdió el soporte de `unassign`/`employeeId`. `PlatformAccount` y sus rutas (`unassign`/`employeeId` en `PUT /api/platform-accounts/:id`) no cambiaron — solo dejaron de usarse desde `PlatformAccounts.jsx` y ahora los usa `EmployeeDetail.jsx`.
- **Por qué:** el usuario quiere gestionar las cuentas igual que los activos físicos — desde la ficha del empleado ("Ver activos") — y no desde las páginas de administración de cuentas, que deben quedar enfocadas en creación y gestión general. También pidió que, por ahora, solo las cuentas de Plataformas sean reciclables (Gmail no).
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Alta "nueva o existente" también en Cuentas Gmail
- **Qué cambió:** el modal "Nueva cuenta Gmail" ahora tiene el mismo selector "¿Esta cuenta ya existe o es nueva?" que ya se agregó a Plataformas: si es nueva, sigue generando la contraseña sola (`POST /gmail-accounts`); si ya existe, aparece un campo de contraseña (mostrar/ocultar) y usa el endpoint que ya existía `POST /gmail-accounts/import`. La sección aparte "Cuentas ya registradas en Empleados sin contraseña guardada" (que detecta automáticamente correos heredados de `Employee.gmailAccounts[]`) se queda igual, sin tocarse — este cambio solo cubre el caso de dar de alta manualmente una cuenta que ya existe y que ese detector no encontró.
- **Por qué:** el usuario pidió que la misma pregunta "nueva o existente" que se hizo para Plataformas también estuviera disponible en Gmail, por consistencia.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Reciclar cuentas Gmail/Plataformas + corrección manual de contraseña + alta "nueva o existente" en Plataformas
- **Qué cambió (reciclaje):** `employee` dejó de ser obligatorio en `GmailAccount` y `PlatformAccount` (`null` = disponible). Se agregó, en ambas rutas (`PUT /:id`), soporte para `unassign: true` (libera la cuenta, la deja sin empleado; en Gmail también quita el correo de `Employee.gmailAccounts[]`) y `employeeId` (asigna/reasigna la cuenta a un empleado; en Gmail agrega el correo al nuevo `Employee.gmailAccounts[]`). En ambas páginas se agregó el botón "↩️ Desasignar" en cada fila y una sección "🔁 Disponibles para reciclar" que lista las cuentas sin empleado, con botón "Asignar a un empleado". Las acciones quedan auditadas con `asignar`/`devolver` (mismos valores que ya usaban Assignments).
- **Qué cambió (corrección manual de contraseña, una sola vez):** se agregó `passwordManuallySet` (boolean) a ambos modelos. En el modal "Editar cuenta" aparece un botón "✏️ Corregir contraseña manualmente" **solo si la cuenta nunca lo ha usado**; al guardar una contraseña por ahí, el backend la cifra, marca `passwordManuallySet: true` y esa opción desaparece permanentemente para esa cuenta (cambios futuros solo vía "🔄 Contraseña", que sigue siendo aleatoria).
- **Qué cambió (alta "nueva o existente" en Plataformas):** el modal "Nueva cuenta" de `PlatformAccounts` ahora pregunta primero "¿Esta cuenta ya existe o es nueva?"; si es nueva, sigue igual (contraseña autogenerada); si ya existe, aparece un campo de contraseña (con mostrar/ocultar) y el alta se manda a un nuevo endpoint `POST /platform-accounts/import` (mismo patrón que ya existía en Gmail para correos heredados).
- **Por qué:** el usuario quiere poder recuperar (reciclar) las cuentas de un empleado que se da de baja y reasignarlas a otro sin crear cuentas nuevas; y, tras agregar manualmente una cuenta de Amazon con contraseña autogenerada por error, necesitaba una forma de corregirla directamente además de poder declarar desde la creación si una cuenta de plataforma ya existía de antes (con su propia contraseña) o era nueva.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Filtros tipo Asignaciones en Cuentas Gmail
- **Qué cambió:** `GmailAccounts.jsx` pasó de tener solo un buscador libre a filtros por empresa, oficina y estado (activa/inactiva), con la misma estructura que Assignments/PlatformAccounts: cuadrícula de selects, barra de búsqueda completa, y una barra de resultados con contador, botón "Limpiar filtros" y el botón "Exportar Excel" (que ahora respeta los filtros aplicados y los anota en la cabecera del archivo y en el nombre). El botón de exportar se movió del encabezado a esa barra de resultados para quedar junto al conteo, igual que en las otras páginas.
- **Por qué:** el usuario pidió que Cuentas Gmail tuviera los mismos filtros que ya se habían hecho para Cuentas de Plataformas (inspirados en Assignments), para poder acotar por empresa/oficina/estado antes de exportar.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Nueva página "Cuentas de Plataformas" (Microsoft, Amazon, etc.) con filtros y export tipo Asignaciones
- **Qué cambió:** nuevo módulo gemelo al de Gmail pero para cualquier plataforma (Microsoft 365, Amazon, Netflix, Adobe, Canva, Zoom, Dropbox u "Otra" con nombre libre), sin restricción de dominio de correo. Backend: modelo `PlatformAccount` (`employee`, `platform`, `username`, `passwordEncrypted`, `status`, `notes`, índice único `platform+username`), rutas `backend/src/routes/platformAccounts.js` (`GET /`, `POST /` con contraseña siempre autogenerada, `PUT /:id` con `regeneratePassword`, `DELETE /:id`), entidad `cuenta_plataforma` agregada a `AuditLog`. Frontend: página `PlatformAccounts.jsx` con el mismo manejo de contraseñas que Gmail (ver/copiar/ocultar, regenerar y eliminar con modal de confirmación explícita, nunca capturar la contraseña a mano al crear), **más filtros** (plataforma, empresa, oficina, estado, búsqueda libre) y **exportación a Excel que respeta los filtros aplicados**, siguiendo el mismo patrón de `exportToExcel` de `Assignments.jsx` (cabecera con los filtros usados, nombre de archivo con esos filtros).
- **Permisos:** a solicitud del usuario, es un permiso **independiente** del de Gmail: `User.canManagePlatformAccounts`, protegido por el nuevo middleware `platformManagerOnly`, ruta frontend `PlatformManagerRoute`, y controlado exclusivamente por `sistemas.2@selectshop.com.mx` (mismo dueño de permisos que Gmail) desde una segunda columna/checkbox en la página de Usuarios. Esa cuenta también se autocorrige con este permiso en cada login, igual que ya hacía con Gmail.
- **Por qué:** el usuario pidió una página igual a la de Gmail pero para otras plataformas (Microsoft, Amazon, etc.), con filtros y exportación de Excel como la página de Asignaciones — y, siguiendo el mismo criterio de seguridad ya establecido, que el acceso lo siga controlando solo `sistemas.2@selectshop.com.mx`, pero de forma independiente por módulo (puede dar Gmail a alguien y Plataformas a otra persona).
- **Nota operativa:** igual que con el permiso de Gmail, quien ya tenga sesión abierta debe cerrar sesión y volver a entrar para que `canManagePlatformAccounts` se refleje (viaja en el JWT, no se consulta en cada request).
- **Commit(s):** (ver commit que introduce este módulo).

### 2026-06-30 — Importar a Cuentas Gmail las cuentas ya existentes en Empleados
- **Qué cambió:** sin quitar ni mover nada de la página, se agregó una sección "Cuentas ya registradas en Empleados sin contraseña guardada" que lista los correos que ya vivían en `Employee.gmailAccounts[]` (dados de alta desde el formulario de Empleados, antes de que existiera este módulo) y que todavía no tienen registro en el gestor de contraseñas. Backend: `GET /api/gmail-accounts/unregistered` calcula esa diferencia; `POST /api/gmail-accounts/import` da de alta el registro usando una contraseña que **sí captura el usuario** (a diferencia de `POST /`, que siempre la genera), porque estas cuentas ya tienen una contraseña real en Gmail que no se puede regenerar a ciegas. Frontend: cada fila pendiente tiene un botón "+ Agregar contraseña" que abre un modal con el correo fijo (no editable) y un campo de contraseña con mostrar/ocultar.
- **Por qué:** el usuario ya tenía correos de Gmail registrados por empleado desde antes de este módulo (capturados solo como texto al dar de alta al empleado, sin contraseña); pidió poder traerlos al gestor y ponerles su contraseña real, sin tocar lo que ya estaba construido.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Confirmación reforzada antes de eliminar una cuenta Gmail
- **Qué cambió:** el botón "Eliminar" en `Cuentas Gmail` ya no usa `confirm()` nativo; ahora abre el mismo tipo de modal propio de la app usado para regenerar contraseña, con advertencia explícita (no se puede deshacer, no afecta la cuenta real en Gmail) y un botón rojo "Sí, eliminar cuenta".
- **Por qué:** mismo pedido que con el botón de regenerar contraseña — que eliminar no sea una acción de un solo clic con un popup fácil de aceptar por reflejo.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Permiso independiente para Cuentas Gmail, controlado solo por sistemas.2@selectshop.com.mx
- **Qué cambió:** se agregó `canManageGmailAccounts` (boolean) a `User`, desacoplado del rol `admin`/`viewer`. Las rutas de `gmail-accounts` ahora se protegen con el nuevo middleware `gmailManagerOnly` (en vez de `adminOnly`), que exige ese permiso en el JWT. En el login (`auth.js`), si el email coincide con la constante `GMAIL_ROOT_EMAIL` (`sistemas.2@selectshop.com.mx`, en `backend/src/config/permissions.js`), se autocorrige esa cuenta a `role: admin` + `canManageGmailAccounts: true` en cada inicio de sesión, sin importar lo que tuviera guardado. En `PUT /api/users/:id`, el campo `canManageGmailAccounts` solo se acepta si quien hace la petición es `sistemas.2@selectshop.com.mx` (403 en cualquier otro caso). En el frontend, `/gmail-accounts` pasó de estar protegida por `AdminRoute` a una nueva `GmailManagerRoute` basada en el permiso; el enlace del sidebar y la columna/checkbox "Cuentas Gmail" en la página de Usuarios (edición de permiso) solo se muestran a `sistemas.2@selectshop.com.mx`.
- **Por qué:** el usuario pidió que el acceso a crear cuentas/contraseñas de Gmail no dependiera del rol general de administrador, sino que una sola cuenta específica (`sistemas.2@selectshop.com.mx`) decida explícitamente quién más puede hacerlo.
- **Nota operativa:** las sesiones ya iniciadas antes de este cambio no tienen el nuevo campo en su JWT — todos, incluida `sistemas.2@selectshop.com.mx`, deben cerrar sesión y volver a entrar para que el permiso se refleje. Si esa cuenta aún no existe, hay que crearla primero desde Usuarios (o `POST /api/auth/register`) con ese correo exacto; al iniciar sesión con ella se autoconvierte en admin con el permiso activo.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Confirmación reforzada antes de regenerar contraseña de Gmail
- **Qué cambió:** en `Cuentas Gmail`, el botón "🔄 Contraseña" ya no dispara la regeneración con un `confirm()` nativo del navegador; ahora abre un modal propio de la app con advertencia explícita (la contraseña actual deja de servir de inmediato) y un botón rojo "Sí, regenerar contraseña" que hay que pulsar deliberadamente. El botón también se re-estilizó (ámbar, `btnWarn`) para distinguirlo visualmente de las acciones normales (Editar/Eliminar).
- **Por qué:** el usuario pidió que el botón de regenerar contraseña no fuera "de tan fácil acceso" — un `confirm()` nativo es fácil de aceptar por reflejo y no deja claro que invalida la contraseña ya compartida con el empleado.
- **Commit(s):** (ver commit que introduce este cambio).

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
