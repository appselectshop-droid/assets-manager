# Changelog — Assets Manager (SelectShop)

> **Propósito de este archivo:** este es el documento que debe leerse al inicio de cualquier sesión de trabajo (humana o con IA) sobre este repo. Junto con `README.md` (arquitectura, stack, modelo de datos, endpoints) da el contexto completo: **qué es el proyecto** y **qué cambios se han hecho y por qué**. Cada cambio nuevo (feature, fix, refactor) debe agregarse aquí como una entrada nueva arriba del todo, siguiendo el formato de la sección "Cómo agregar una entrada".

## Resumen rápido del proyecto

Sistema interno de control de activos IT (laptops, equipos de escritorio, celulares, accesorios) de **SelectShop MB SA DE CV**: alta/asignación de equipo a empleados, inventario/stock, generación de responsiva en PDF y auditoría de cambios.

- **Frontend**: React 18 + Vite → nginx, contenedor Docker.
- **Backend**: Node.js + Express + Mongoose 8 → contenedor Docker.
- **DB**: MongoDB 7 self-hosted (contenedor Docker, sin exponer al host).
- **Auth**: JWT (`jsonwebtoken` + `bcryptjs`).
- **Infra**: todo en un solo EC2 (AWS, `i-0a9ebde3eaf58b188`) vía Docker Compose — migrado el 2026-08-02 desde Vercel + Render + MongoDB Atlas (ver `ops/MIGRACION-AWS.md` para el detalle completo). Dominio `activos.eup.com.mx`.
- **Deploy**: push a `main` en GitHub (`appselectshop-droid/assets-manager`), luego a mano en el EC2: `git pull` + `docker compose build`/`up -d` de lo que cambió (no hay CI/CD automático todavía). **No olvidar** actualizar `frontend/public/deploy-tags.json` (área `sistema`/`mesa`) en cada deploy relevante — si no, el aviso de "Actualizar" de la PWA no se muestra aunque el deploy sí haya funcionado (ver entrada 2026-08-03).

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

### 2026-08-10 — FEATURE: distinguir reemplazo vs. primera vez al pedir pila recargable
- **Qué pasó:** el usuario pidió que, al solicitar una pila recargable, se preguntara si ya tenía una para ese uso — si sí, es reemplazo y sigue el proceso de siempre (regresa la vieja); si nunca tuvo, no hay nada que regresar y Sistemas no debe esperarlo.
- **Qué cambié:**
  - `backend/src/models/ResourceRequest.js` — nuevo campo `batteryHadBefore` (Boolean).
  - `backend/src/routes/resourceRequests.js` — `POST /public` exige la respuesta cuando se pide "Pila recargable"; se refleja en el resumen que llega a Telegram.
  - `frontend/src/pages/SolicitarRecurso.jsx` — pregunta obligatoria "¿Ya tenías una pila para ese uso?" (Sí, reemplazo / No, primera vez).
  - `frontend/src/pages/ResourceRequests.jsx` — se muestra en el detalle del ítem y, sobre todo, como aviso destacado al confirmar la entrega ("🔁 pide la pila vieja" / "🆕 no hay nada que regresar").
- **Verificación:** `node -c`/`npm run build` sin errores; deploy verificado en vivo (backend conectado, sitio responde 200).
- **Commit(s):** `2decc41`

### 2026-08-10 — FEATURE: campo de costo en activos y accesorios
- **Qué pasó:** el usuario pidió que todo activo y accesorio tuviera registrado su costo de adquisición.
- **Qué cambié:**
  - `backend/src/models/Asset.js` — nuevo campo `cost` (Number, default null). Como Accesorios usa el mismo modelo Asset (`category: 'accesorio'`), un solo campo cubre ambos.
  - `backend/src/routes/assets.js` — `PUT /:id` ahora acepta y guarda `cost` (mismo criterio que `stockTotal`/`purchaseDate`).
  - `frontend/src/pages/Assets.jsx` — campo "Costo" en el formulario de alta/edición, columna "Costo" en las 5 vistas de tabla, y en el Excel exportado.
  - `frontend/src/pages/Accessories.jsx` — mismo campo en el formulario y columna nueva en la tabla (con su fila de detalle de asignaciones ajustada).
  - `frontend/src/pages/EmployeeDetail.jsx` — campo "Costo" en los modales de alta rápida y edición de un activo desde la ficha de un empleado.
  - `frontend/src/config/importCategories.js` — columnas "Costo"/"Precio"/"Valor" del Excel se reconocen automáticamente al importar, en cualquier categoría.
- **Verificación:** `node -c`/`npm run build` sin errores; deploy verificado en vivo (backend conectado, sitio responde 200).
- **Commit(s):** `b13de64`

### 2026-08-10 — FEATURE: separar línea telefónica del aparato en Disponibilidad
- **Qué pasó:** el usuario necesitaba asignar el celular físico (Honor) de Mario Villegas y la línea telefónica de Manuel Correa, dos personas ya dadas de baja, a personas distintas. El Honor de Mario ya se había separado a mano en la base de datos el 2026-08-04, pero el Samsung Galaxy A04E de Manuel seguía con el número de línea e IMEI en el mismo registro — al preguntarle al usuario si el botón "Asignar" que ya existe le bastaba, señaló con una captura que no: "el celular de Manuel está con todo y teléfono físico", y preguntó si esto se podía resolver sin depender de un ajuste manual mío cada vez.
- **Causa raíz:** los celulares dados de alta antes de que existiera el tipo `linea_telefonica` (agregado 2026-08-04) guardan el número/operadora/plan como specs del mismo registro del aparato — no hay dos activos que desvincular, es un solo registro con ambos datos mezclados.
- **Qué cambié:**
  - `backend/src/routes/assets.js` — `PUT /assets/:id/split-line`: solo para celulares `disponible` con `specs.lineNumber`; crea un Asset nuevo tipo `linea_telefonica` (copia lineNumber/carrier/planCost + contractNumber/businessName/gmailAccount, mismo `location`/`freedFromEmployee`) y limpia lineNumber/carrier/planCost del celular original (conserva IMEI, storage, RAM, etc. — son del aparato, no de la línea).
  - `frontend/src/pages/Stock.jsx` — botón "🔀 Separar línea" en "Liberado por salida de personal", visible solo en celulares con línea embebida; confirma con texto explícito antes de ejecutar. Tras separarlos, ambos quedan como filas independientes, cada una con su propio botón "Asignar" ya existente.
  - `frontend/src/pages/Stock.module.css` — nueva clase `.btnLink` para el botón secundario.
- **Verificación:** `node -c`/`npm run build` sin errores; deploy verificado en vivo (backend conectado, sitio responde 200). Pendiente probarlo en el navegador con el Samsung A04E de Manuel Correa (línea 5579178680).
- **Commit(s):** `2a959d0`

### 2026-08-07 — FIX: el punto verde de "esperando respuesta" no revisaba el estatus
- **Qué pasó:** el usuario reportó chats de hace semanas, marcados con el punto verde de "esperando respuesta de Sistemas", aunque ya estaban resueltos/cerrados.
- **Causa raíz:** en `TicketsChats.jsx`, `unread` solo revisaba quién mandó el último mensaje (`lastMessage.from === 'employee'`) — un ticket ya resuelto/cerrado donde el empleado mandó un último "gracias" se quedaba marcado para siempre, sin importar que ya no hubiera nada que responder.
- **Qué cambié:** `unread` ahora también exige que el ticket NO esté resuelto ni cerrado.
- **Verificación:** `npm run build` sin errores.
- **Commit(s):** `3d65052`

### 2026-08-07 — FEATURE: miniatura de la imagen antes de enviarla en los chats
- **Qué pasó:** el usuario pidió que, antes de mandar una imagen (elegida con el botón o pegada con Ctrl+V), se pudiera confirmar visualmente cuál es — antes solo se veía el nombre del archivo.
- **Qué cambié:** `frontend/src/pages/TicketDetailModal.jsx`, `TicketsChats.jsx`, `MisTickets.jsx` y `components/InternalNotesPanel.jsx` — miniatura de 32x32 junto al nombre, generada en el navegador (`URL.createObjectURL`, sin ida y vuelta al servidor). En Notas Internas (que también acepta video) se muestra 🎥 en vez de miniatura cuando el adjunto no es imagen.
- **Verificación:** `npm run build` sin errores.
- **Commit(s):** `30394bb`

### 2026-08-07 — FIX: Ctrl+V para pegar imágenes en Chats (Tickets) y Mis Tickets (Mesa)
- **Qué pasó:** el usuario reportó que en los chats no se puede pegar una imagen (Ctrl+V) — siempre había que subirla con el botón.
- **Causa raíz:** `TicketDetailModal.jsx`/`InternalNotesPanel.jsx` ya soportaban pegar desde antes; `TicketsChats.jsx` (Sistema de Tickets → Chats) y `MisTickets.jsx` (Mesa de Ayuda) se quedaron sin ese soporte al construirse.
- **Qué cambié:** mismo criterio ya usado en los otros 2 (`imageFileFromClipboard`, `utils/clipboardImage.js`) — revisa el portapapeles al pegar en el textarea y lo trata igual que si se hubiera elegido con el botón. Los demás chats (Solicitud de Cuenta, Soporte BI) no soportan imágenes en absoluto, no aplica ahí.
- **Verificación:** `npm run build` sin errores.
- **Commit(s):** `1602cf0`

### 2026-08-07 — FIX: el chat de Tickets se quedaba mostrando mensajes viejos con imágenes
- **Qué pasó:** el usuario reportó que en Chats (Sistema de Tickets) el scroll seguía "subiéndose" y no dejaba ver los últimos mensajes, estilo WhatsApp.
- **Causa raíz:** el scroll al fondo se movía ANTES de que las imágenes adjuntas terminaran de descargarse (`MessageAttachmentImage.jsx` pide el blob aparte, con su propio estado de carga) — al terminar de cargar, la burbuja crece y empuja el fondo real más abajo, dejando la vista mostrando algo por encima de los últimos mensajes.
- **Qué cambié:** `frontend/src/pages/TicketsChats.jsx` y `TicketDetailModal.jsx` — un `ResizeObserver` en el contenedor de mensajes vuelve a bajar el scroll cada vez que el contenido crece, pero solo si ya se estaba cerca del fondo — no pelea con quien hizo scroll manual hacia arriba para leer mensajes viejos.
- **Verificación:** `npm run build` sin errores.
- **Commit(s):** `c3cf7de`

### 2026-08-07 — FEATURE: redirigir entre Ticket y Solicitud de Recursos
- **Qué pasó:** el usuario reportó (urgente) que los empleados confunden qué es un ticket y qué es una Solicitud de Recursos — el ejemplo real: un ticket de "instalación de licencia" que en realidad debía tratarse como Solicitud de Recursos.
- **Qué cambié:**
  - `backend/src/models/Ticket.js`/`ResourceRequest.js` — nuevos campos `redirectedToResourceRequest`/`redirectedToTicket` + `redirectReason`/`redirectedByName`/`redirectedAt` en cada dirección.
  - `backend/src/routes/tickets.js` — `PUT /:id/redirect-to-resource-request`: crea una Solicitud de Recursos ("Otro (especifica)" con el asunto del ticket) y marca el ticket.
  - `backend/src/routes/resourceRequests.js` — `PUT /:id/redirect-to-ticket`: crea un Ticket (tipo "Otro") y marca la solicitud.
  - `frontend/src/pages/TicketDetailModal.jsx`/`ResourceRequests.jsx` — botón + motivo opcional + aviso amarillo en vivo (sin cerrar el modal).
  - `frontend/src/pages/TicketCard.jsx`/`Tickets.module.css` — la tarjeta del ticket se pinta amarilla con el motivo cuando está redirigida; la fila de la tabla en Solicitudes de Recursos hace lo mismo.
  - **Ninguno de los 2 originales se bloquea** — es solo un aviso visual, ambos siguen funcionando normal (a diferencia del escalamiento).
- **Verificación:** `node -c`/`npm run build` sin errores.
- **Commit(s):** `de7c5e4`

### 2026-08-07 — FIX: la auto-asignación al contestar no se veía sin cerrar el ticket
- **Qué pasó:** el usuario reportó que al contestar un ticket sin asignar (que se auto-asigna a quien contesta, ver `POST /:id/reply`), el modal seguía mostrando "sin asignar" hasta cerrarlo y volver a abrirlo.
- **Causa raíz:** el modal nunca vuelve a pedir el ticket completo tras responder (solo refresca la lista de fondo, sin tocar el modal ya abierto), y el `assignedTo` que sí viajaba en la respuesta del backend era solo el ObjectId crudo, no `{_id, name}` — no había forma de mostrar el nombre sin re-consultar.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — `POST /:id/reply` popula `assignedTo` (nombre) antes de responder.
  - `frontend/src/pages/TicketDetailModal.jsx` — nuevo estado `liveAssignedTo` (reemplaza el parche anterior `autoAssignedName`), se actualiza en `handleReply` y se usa en todos los avisos de asignación + el selector de "Asignar a", en vez del prop `ticket` (que nunca cambia mientras el modal sigue abierto).
- **Verificación:** `node -c`/`npm run build` sin errores.
- **Commit(s):** `a1ea96a`

### 2026-08-07 — FEATURE: límite de tickets sin cerrar al reportar
- **Qué pasó:** el usuario pidió frenar a quien va acumulando tickets sin cerrar en vez de calificarlos: los primeros 2 sin cerrar, sin restricción; al 3ro, se deja reportar pero con una advertencia; del 4to en adelante, bloqueado hasta que cierre TODOS los que tiene sin cerrar.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — `POST /mine` cuenta los tickets del empleado con `status != 'cerrado'` antes de crear uno nuevo (un "Resuelto" sin calificar sigue contando como sin cerrar, a propósito); bloquea con 400 si ya tiene 3+, y manda un aviso no bloqueante en la respuesta si este sería el 3ro. Aplica a los 3 caminos que usan esta misma ruta (ticket normal, Soporte BI con formulario, "duda rápida" de BI).
  - `frontend/src/pages/ReportarTicket.jsx` — muestra el aviso junto al folio cuando aplica; el bloqueo ya se ve solo, reutilizando el mensaje de error genérico existente.
- **Verificación:** `node -c`/`npm run build` sin errores; confirmado contra producción (solo lectura) el impacto real: hoy 3 empleados tienen exactamente 2 tickets sin cerrar y 1 ya tiene 3, nadie queda bloqueado de golpe por sorpresa.
- **Commit(s):** `84b265c`

### 2026-08-07 — FIX: el botón "Actualizar" de la PWA a veces se quedaba atorado
- **Qué pasó:** el usuario reportó que el aviso de "Hay una versión nueva" a veces no hacía nada al darle clic a "Actualizar" — se quedaba viendo el mismo aviso para siempre.
- **Causa probable:** el reload depende de que el mensaje de skip-waiting llegue al service worker en espera y de que el navegador dispare `controllerchange` — si eso no pasa por algún motivo (referencia obsoleta dentro de workbox-window, otra pestaña que ya forzó la actualización, etc.), nunca se dispara nada.
- **Qué cambié:** `frontend/src/components/UpdateToast.jsx` — el botón pasa a "Actualizando..." (deshabilitado) al instante, para que se note que el clic sí se registró; si no reaccionó en 4 segundos, se reintenta el skip-waiting directo contra el registration crudo del navegador y, pase lo que pase, se recarga de todos modos.
- **Verificación:** `npm run build` sin errores. No se pudo reproducir el ciclo completo de service worker en este entorno (sin navegador real) — es una red de seguridad, no una reproducción exacta confirmada del bug.
- **Commit(s):** `a30cb7a`

### 2026-08-07 — FIX: pestaña de Oficinas también dice "Sucursales"
- **Qué pasó:** el usuario reportó que "no está sucursales" en Catálogos de Empleados. Se confirmó que "Sucursal" es el mismo campo que "Oficina" (`Employee.office`) — ya usado en Stock/Envíos/Planos de Red vía el mismo catálogo `oficina` — solo faltaba que la pestaña lo mencionara por ese nombre, no un catálogo nuevo.
- **Qué cambié:** `frontend/src/pages/EmployeeCatalogs.jsx` — la pestaña pasa de "Oficinas" a "Oficinas / Sucursales" (mismo doble nombre que ya usa el campo en Employees.jsx).
- **Verificación:** `npm run build` sin errores.
- **Commit(s):** `db219cf`

### 2026-08-07 — FEATURE: Catálogos de Empleados (departamentos, áreas, razones sociales, puestos, oficinas)
- **Qué pasó:** el usuario pidió una sola pantalla para gestionar (agregar/editar/eliminar) estos 5 catálogos — antes cada uno era una lista fija en el código (Departamentos/Oficinas/Razón Social) o texto libre sin ninguna lista (Puesto/Área), duplicada además en varios archivos.
- **Qué cambié:**
  - `backend/src/models/EmployeeCatalog.js` (nuevo) — un solo modelo con `type` en vez de 5 modelos idénticos.
  - `backend/src/routes/employeeCatalogs.js` (nuevo) — lectura pública (sin login, cualquier formulario la necesita) + CRUD admin-only.
  - `frontend/src/hooks/useEmployeeCatalog.js` (nuevo) — reemplaza las listas fijas/duplicadas en 9 archivos: `Employees.jsx`, `Assets.jsx`, `Accessories.jsx`, `NetworkLayouts.jsx`, `CuentasCompartidas.jsx`, `Users.jsx`, `CreateShipmentModal.jsx`, `SolicitarIngreso.jsx` — y `config/assetFields.js` ya no exporta su copia duplicada de `OFFICES`.
  - `frontend/src/pages/EmployeeCatalogs.jsx` (nuevo) — pantalla de gestión con 5 pestañas, mismo patrón que Aplicaciones Internas/Avisos.
  - `frontend/src/pages/Employees.jsx` — Puesto/Área pasan de texto libre a un selector con catálogo (con "Otro" para lo que aún no esté dado de alta).
  - Los 5 catálogos se poblaron una sola vez (a petición explícita del usuario) con los valores reales ya en uso por los empleados actuales, tal cual — sin fusionar los duplicados de mayúsculas/acentos que ya existían en los datos (226 registros: 12 razones sociales, 16 oficinas, 15 departamentos, 117 puestos, 66 áreas); esa depuración queda pendiente para hacerse desde la pantalla nueva.
- **Verificación:** `npm run build` (frontend) y `node -c` (backend) sin errores; confirmado en producción que el endpoint público sirve la lista sembrada.
- **Commit(s):** `d1ca41a`

### 2026-08-07 — FEATURE: detalle clickeable de Solicitudes de Recursos en Mis Solicitudes
- **Qué pasó:** el usuario pidió que, igual que con los tickets, se pudiera dar clic a una Solicitud de Recursos en "Mis Solicitudes" y ver el detalle completo — el motivo/nota completa por cada activo, no solo el resumen de una línea.
- **Qué cambié:**
  - `frontend/src/components/ResourceRequestDetailModal.jsx` (nuevo) — modal de solo lectura para el empleado: cada activo pedido con su estatus a color (✅ aprobado / ❌ rechazado / ⏳ en espera / 🕓 pendiente), la nota completa que Sistemas dejó al decidirlo, y quién/cuándo. Reconstruye la decisión por activo en memoria para solicitudes de antes del cambio del 2026-08-06 (mismo criterio que `ensureItemDecisions` en el backend) y usa un fallback defensivo en el lookup de estatus (aprendido del susto del bug de hoy).
  - `frontend/src/pages/MisSolicitudes.jsx` — las filas de Solicitud de Recursos ahora son clickeables, igual que Soporte BI y el chat de Solicitud de Cuenta.
- **Verificación:** `npm run build` sin errores.
- **Commit(s):** `9c3e7c3`

### 2026-08-07 — FIX urgente: Inicio tumbaba toda la app con solicitudes "en espera"
- **Qué pasó:** el usuario reportó que cualquier botón, en cualquier página del panel admin, ponía la pantalla en blanco.
- **Causa raíz:** `Dashboard.jsx` (Inicio) tiene su propio `REQUEST_STATUS_CONFIG` duplicado para el widget "Últimas solicitudes de recursos" — nunca se le agregó el estatus `en_espera` (agregado el día anterior a Solicitudes de Recursos). En cuanto una solicitud real quedó en ese estatus, `cfg` salía `undefined` y `cfg.color` tronaba — sin límite de error (error boundary) en la app, React desmontaba TODO, dejando cualquier clic posterior en blanco hasta refrescar la página.
- **Diagnóstico:** el usuario mandó el error exacto de la consola del navegador ("Cannot read properties of undefined (reading 'color')" dentro de un `Array.map`) — eso permitió ubicar el archivo exacto sin necesitar acceso a un navegador real.
- **Qué cambié:**
  - `frontend/src/pages/Dashboard.jsx` — se agrega `en_espera` a `REQUEST_STATUS_CONFIG`, más un fallback defensivo en los 2 lugares donde se usa (mismo patrón que ya protegía a `TICKET_TYPE_CONFIG` en el resto del archivo).
  - `frontend/src/pages/TicketsEscalamiento.jsx` — mismo fallback defensivo agregado por si acaso, aunque no era la causa activa.
- **Verificación:** `npm run build` sin errores; confirmado en la base de producción que ningún ticket/solicitud tenía datos corruptos (el problema era 100% de código, no de datos).
- **Commit(s):** `fe5f599`

### 2026-08-07 — FIX: desglose completo por activo en Solicitudes de Recursos
- **Qué pasó:** el usuario probó el flujo de decisión por activo con una solicitud de 3 activos — aprobó uno, rechazó otro, dejó el tercero en espera — y el resumen de la solicitud se quedaba diciendo solo "en espera", como si nada más se hubiera decidido.
- **Causa raíz:** `computeAggregateStatus` solo devolvía el detalle de la categoría que definía el estatus general (ej. si algo seguía "en espera", el detalle solo mencionaba eso), sin listar los activos que ya se habían aprobado o rechazado.
- **Qué cambié:**
  - `backend/src/routes/resourceRequests.js` — `statusDetail` ahora siempre arma el desglose completo (✅ Aprobado / ❌ Rechazado / ⏳ En espera / 🕓 Falta decidir), listando cada activo bajo su categoría real.
  - `frontend/src/pages/ResourceRequests.jsx` — la columna "Recursos solicitados" ya no muestra el texto plano de antes; cada activo aparece como su propio chip de color según su estatus — "tipo ticket de compra con status", como lo pidió el usuario.
- **Verificación:** `node -c`/`npm run build` sin errores; probado en local por el usuario antes de confirmar deploy.
- **Commit(s):** `2a3a88a`

### 2026-08-06 — FEATURE: ERP y BI ya pueden escalar directo a Proveedor externo
- **Qué pasó:** siguiendo el fix anterior, el usuario reportó que el escalamiento de un ticket real de ERP (Yocelin Contla) seguía sin verse — al investigar el ticket completo (TICK-CBE68D), el motivo escrito decía "Requiere Soporte del Proveedor": ERP necesitaba mandarlo a un proveedor externo, pero no tenía esa opción — solo persona/área — así que usó "Área: Sistemas" como la más parecida, lo cual (por diseño) sacó el ticket de la vista de ERP sin necesidad real.
- **Qué cambié:** `backend/src/routes/tickets.js` — `getEscalationTargets()` ahora incluye `{ kind: 'proveedor' }` también para ERP-only y BI-only, igual que ya tenía la cadena de Sistemas — sin tocar el resto de la lógica de escalamiento (visibilidad, "último recurso", confirmación), que ya quedó corregida en la entrada anterior.
- **Corrección puntual (una sola vez, a pedido del usuario):** el ticket TICK-CBE68D se regresó manualmente a "abierto" sin escalamiento, para que Yocelin lo vuelva a escalar ahora con la opción correcta — registrado en Auditoría como corrección manual.
- **Verificación:** `node -c` sin errores; probado en local por el usuario antes de confirmar deploy.
- **Commit(s):** `89fc4fa`

### 2026-08-06 — FIX: ERP perdía visibilidad de sus tickets al escalar + salida a escalamientos equivocados
- **Qué pasó:** el usuario reportó que ERP escaló un ticket (a persona o a proveedor) y después ni ellos mismos podían ver ese escalamiento. Además, como ya no se puede desescalar (fix anterior del mismo día), pidió una salida para cuando alguien escala mal por error.
- **Causa raíz:** `PUT /:id/escalate` borraba `escalatedToArea` al escalar a `persona`/`proveedor`. `canViewTicket()` usa ese campo para decidir si ERP-only ve el ticket — al borrarse, caía de vuelta a `ticketType === 'erp'`, que es falso para un ticket que entró a la cola de ERP por escalamiento (no nació como tipo `erp`). El ticket se volvía invisible para TODO ERP, incluida la persona que lo acababa de escalar.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — ya no se borra `escalatedToArea` en las ramas `persona`/`proveedor` de `PUT /:id/escalate` (el frontend ya decide qué mostrar según `escalationType`, no según ese campo solo).
  - Mismo archivo — nueva excepción: un ticket YA escalado puede recibir UN salto más a "Proveedor externo" (y solo ese), como último recurso si ni la cadena interna resolvió el caso.
  - `frontend/src/pages/TicketDetailModal.jsx` — se agrega una confirmación explícita antes de escalar (evita el clic accidental que originó el reporte); nuevo botón "🚚 Ni así se resolvió — escalar a Proveedor externo" en un ticket ya escalado, visible solo para quien tenga ese destino disponible en su cadena.
- **Verificación:** `node -c`/`npm run build` sin errores; probado en local por el usuario antes de confirmar deploy.
- **Commit(s):** `8db6d02`

### 2026-08-06 — FEATURE: Solicitudes de Recursos — decisión por activo + estatus "En espera"
- **Qué pasó:** el usuario pidió 2 cosas: 1) un botón de "pendiente" para cuando ya se pidió el activo a compras pero sigue sin llegar (para que el empleado no piense que se le está ignorando); 2) poder aprobar/rechazar/poner en espera CADA activo de una solicitud por separado — antes, si pedían 2 cosas y solo había 1 disponible, había que rechazar toda la solicitud y pedirle a la persona que la volviera a mandar una por una.
- **Qué cambié:**
  - `backend/src/models/ResourceRequest.js` — nuevo `itemDecisions[]` (una decisión independiente por activo: label, status, notas, quién y cuándo decidió), `status` general ahora incluye `en_espera`, más `statusDetail` explicando por qué (ej. "Falta decidir: Mouse, Teclado").
  - `backend/src/routes/resourceRequests.js` — `PUT /:id/approve`/`PUT /:id/reject` (toda la solicitud) reemplazados por `PUT /:id/items/:idx/decide` (un activo a la vez); el estatus general se calcula solo a partir de las decisiones de cada activo. Solicitudes de antes de este cambio (sin `itemDecisions`) se rellenan en memoria a partir de su estatus viejo la primera vez que se leen o se tocan — sin necesitar una migración de datos aparte.
  - `frontend/src/pages/ResourceRequests.jsx` — el detalle de cada solicitud decide activo por activo (✅ Aprobar / ❌ Rechazar / ⏳ En espera + notas); la disponibilidad/asignación y "Generar formato de salida" ya solo dependen de lo que SÍ está aprobado, no de que toda la solicitud esté resuelta.
  - `frontend/src/pages/MisSolicitudes.jsx` — nuevo estatus "en espera de compras" visible para el empleado, con el detalle de cuál activo está en cada estatus.
- **Verificación:** `npm run build` (frontend) y `node -c` (backend) sin errores; confirmado contra producción (solo lectura) que las solicitudes reales existentes no tienen `itemDecisions` todavía y se rellenan bien al leerlas. Probado en local por el usuario antes de confirmar deploy.
- **Commit(s):** `06f5049`

### 2026-08-06 — FIX: dominio viejo en links de Telegram/correo + launch_handler en los manifests
- **Qué pasó:** el usuario reportó que los links de Telegram y de correo hacia tickets seguían apuntando al dominio viejo de Vercel, no a `activos.eup.com.mx`. Aparte, pidió confirmar que esos links abrieran la PWA ya instalada (enfocando la ventana abierta) igual que ya hacían las notificaciones push.
- **Causa raíz (dominio):** `FRONTEND_URL` en el `.env` real del servidor seguía en `https://assets-manager-phi.vercel.app` — de ahí salen todos los links armados por `portalLinks.js`/`tickets.js` (Telegram y el template de correo).
- **Qué cambié:**
  - `.env` del servidor (EC2) — `FRONTEND_URL` corregido a `https://activos.eup.com.mx`, backend reiniciado. El secreto en AWS Secrets Manager (`assets-manager/backend-env`) también se actualizó (el usuario lo hizo directo, el rol del EC2 solo tiene permiso de lectura ahí).
  - `frontend/vite.config.js` y `frontend/public/manifest-mesa-de-ayuda.webmanifest` — `launch_handler: { client_mode: 'focus-existing' }` en los 2 manifests, para que si Android/Chrome ya decide abrir un link en la PWA instalada, enfoque la ventana existente en vez de abrir una copia nueva (mismo criterio que `push-sw.js` ya usa para push). Aclaración importante: esto no fuerza que el link SIEMPRE abra la PWA en vez del navegador — esa decisión la toma el sistema operativo, y en iOS/Safari nunca abre la app instalada desde un link externo.
- **Verificación:** `npm run build` sin errores; confirmado en producción que ambos manifests sirven `launch_handler` y que el secreto/env quedaron sincronizados.
- **Commit(s):** `cc4ab31`

### 2026-08-06 — FEATURE: "Avisos y Anuncios" se mueve al sidebar de Tickets
- **Qué pasó:** el usuario pidió una categoría de avisos/anuncios dentro de Tickets para gestionar ahí las imágenes del carrusel de Mesa de Ayuda, en vez de tener que ir al menú general de Operación.
- **Qué cambié:**
  - `frontend/src/pages/TicketsLayout.jsx` — nueva pestaña "📢 Avisos y Anuncios" (`/tickets/avisos`), oculta para ERP/BI-only (mismo criterio que Accesos/Aplicaciones/Cuentas Compartidas).
  - `frontend/src/App.jsx` — la ruta se mueve de standalone (`/avisos`) a anidada bajo `tickets` (`/tickets/avisos`), misma página `Announcements.jsx` sin cambios.
  - `frontend/src/components/Layout.jsx` — se quita "Avisos de Mesa de Ayuda" del menú de Operación (pedido explícito: que viva solo en Tickets, no en los dos lados).
- **Verificación:** `npm run build` sin errores.
- **Commit(s):** `259c1b3`

### 2026-08-06 — FIX: ya no se puede quitar el escalamiento de un ticket
- **Qué pasó:** el usuario reportó que Miguel escaló un ticket a proveedor externo, lo desescaló "por andar probando", y eso volvió a dejar escribir a la empleada en el chat — no tiene sentido que un escalamiento se pueda revertir.
- **Causa raíz:** `PUT /:id/escalate` servía tanto para escalar como para desescalar (`escalate: false` en el body limpiaba `ticket.escalated` y las demás banderas), y ese mismo flag es el que bloquea `POST /:id/messages` del lado del empleado — al limpiarlo, el bloqueo desaparecía con él.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — se quita la rama de "quitar escalamiento"; si el ticket ya está escalado, la ruta rechaza cualquier otro intento de tocar el escalamiento.
  - `frontend/src/pages/TicketDetailModal.jsx` — se quita el botón "Quitar escalamiento" y su handler.
- **Verificación:** `node -c`/`npm run build` sin errores; probado en local por el usuario antes de confirmar deploy.
- **Commit(s):** `c5763e2`

### 2026-08-05 — FIX: Enter para enviar mensajes en todos los chats + redacción de reclasificación
- **Qué pasó:** el usuario reportó que en varios chats (Mesa de Ayuda, Tickets, BI, Notas Internas) Enter no enviaba el mensaje — era forzoso usar el botón. Por separado, Felipe Gómez reportó que el texto de "reclasificado" en un ticket se leía al revés: decía "Reclasificado por Felipe Gomez — se reportó como 'Hardware Computadoras'" justo después de que él lo había cambiado A "Software Computadoras", sonando como si Felipe lo hubiera cambiado A Hardware.
- **Investigación:** `TicketsChats.jsx` y `AccountRequestChatModal.jsx` ya tenían el atajo de Enter — faltaba en `TicketDetailModal.jsx`, `MisTickets.jsx`, `BiSolicitudDetailModal.jsx`, `InternalNotesPanel.jsx` y `BiRequestDetailModal.jsx`. Sobre lo de Felipe: no era un bug de datos — `ticket.originalTicketType` sí guardaba el valor correcto (Hardware, lo que reportó el empleado) — era solo la redacción, que no dejaba claro que ese era el valor ORIGINAL y no el resultado de la reclasificación.
- **Qué cambié:**
  - Enter envía (Shift+Enter salto de línea) agregado en los 5 archivos que faltaban, mismo criterio ya usado en los otros 2.
  - `TicketDetailModal.jsx`/`MisTickets.jsx` — el texto ahora dice explícitamente "lo reclasificó de 'Hardware Computadoras' a 'Software Computadoras'" en vez de la frase ambigua de antes.
- **Verificación:** `npm run build` sin errores.
- **Commit(s):** `a7c3652`, `414b1d9`

### 2026-08-05 — FIX: aprobar Solicitud de pila ya no exige confirmar la entrega en el mismo paso
- **Qué pasó:** el usuario preguntó si podía aprobar una solicitud de pila recargable sin marcar de inmediato "recibido por"/checkbox (porque aprobar y entregar la pila físicamente no siempre pasan al mismo tiempo), y que quedara visible que aún falta entregarla.
- **Qué cambié:**
  - `backend/src/routes/resourceRequests.js` — `PUT /:id/approve` ya no bloquea si falta la confirmación de entrega (la guarda solo si viene completa); nuevo `PUT /:id/confirm-delivery` para completarla después, exclusivo de solicitudes ya aprobadas con pila recargable.
  - `frontend/src/pages/ResourceRequests.jsx` — el botón "Aprobar solicitud" ya no se deshabilita por la pila; badge "🔋 Falta entregar" en la tabla y el detalle cuando quedó aprobada sin confirmar, con botón "Confirmar entrega" (`ConfirmDeliveryModal`) para completarla en cualquier momento después.
- **Verificación:** `npm run build` (frontend) y `node -c` (backend) sin errores; probado en local por el usuario antes de confirmar deploy.
- **Commit(s):** `61797e3`

### 2026-08-05 — FEATURE: "Pila recargable" como Solicitud de Recursos, con firma de entrega
- **Qué pasó:** el usuario reportó que le siguen llegando tickets por pilas recargables cuando prefiere manejarlo como Solicitud de Recursos, y mandó el PDF de la hoja de papel "ENTREGA DE PILA RECARGABLE" (columnas: colaborador, AA/AAA, fecha de salida, uso designado, firma) que se llena a mano.
- **Qué cambié:**
  - `backend/src/models/ResourceRequest.js` — nuevos campos `batteryType` (AA/AAA), `batteryQuantity`, `batteryUse` (uso designado), más `deliveryReceivedByName`/`deliveryConfirmed` (la "firma" digital).
  - `backend/src/routes/resourceRequests.js` — `POST /public` valida y guarda los campos de pila si se seleccionó "Pila recargable"; `PUT /:id/approve` exige nombre de quien recibió + checkbox de confirmación antes de dejar aprobar cuando la solicitud incluye pila (reemplaza la firma en papel).
  - `frontend/src/pages/SolicitarRecurso.jsx` — "Pila recargable" como opción más, revela AA/AAA + cantidad + uso designado al marcarla (mismo patrón que "Software o Licencia"/"Otro").
  - `frontend/src/pages/ResourceRequests.jsx` — el modal de aprobar pide "Recibido por" + checkbox cuando aplica; se excluye de la búsqueda de disponibilidad en Activos y del formato de envío (no es un activo de stock); tarjeta con el detalle de la pila y quién firmó de recibido.
- **Decisión de diseño (confirmada con el usuario):** sin seguimiento de "fecha de regreso/recambio" (a diferencia de la hoja de papel) — solo se registra la salida. Firma = confirmación simple (nombre + checkbox), no un pad de firma dibujada.
- **Verificación:** `npm run build` (frontend) y `node -c` (backend) sin errores; probado en local por el usuario antes de confirmar deploy.
- **Commit(s):** `ce7fa6a`

### 2026-08-05 — FEATURE: catálogo de palabras clave de Click ampliado para frases indirectas
- **Qué pasó:** el usuario notó que Click (bot de ayuda de Mesa de Ayuda) solo entiende frases muy literales/directas ("no me llegan correos" funciona) pero falla con frases indirectas de la misma queja ("en mi correo no veo el correo de fulanita" no encuentra nada y manda al manual). Preguntó si valía la pena reforzar el catálogo con frases usadas por otros chatbots.
- **Investigación:** 2 búsquedas web (frases comunes de soporte IT en español; ejemplos de "training phrases" de Rasa/Dialogflow) solo devolvieron guías genéricas de cómo redactar frases de entrenamiento, no bancos de frases reales aprovechables — se descartó esa vía y se expandió el catálogo a mano con conocimiento del español mexicano de oficina, mismo estilo que el resto del archivo (originalmente minado de tickets reales, `BD_Helpdesk.csv`).
- **Decisión de diseño confirmada (no nueva):** Click se queda 100% basado en reglas/palabras clave, sin IA de por medio — pedido explícito del usuario para no generar costo de tokens (ver `helpSearch.js`).
- **Qué cambié (`frontend/src/config/ticketCategories.js`):**
  - Correo no llega — agregadas variantes indirectas ("no veo el correo de", "no encuentro un correo", "se fue a spam", etc.).
  - Contraseña olvidada / cuenta bloqueada — catálogo ampliado y sincronizado en las 3 áreas donde se repite (Sistemas, Solicitud de Pagos, Ventas).
  - WiFi/Internet, impresora y Windows lento — variantes coloquiales adicionales ("no tengo internet", "la impresora no prende", "se queda pegada", etc.).
- **Verificación:** `npm run build` sin errores; confirmado que `ticketCategories.js` solo lo consume Mesa de Ayuda (`HelpBotGate` en `App.jsx` solo monta el bot bajo `/mesa-de-ayuda`) — deploy solo de `mesa`.
- **Commit(s):** `cef6627`

### 2026-08-05 — FIX: Solicitudes (Recursos/Cuentas/Ingresos/Bajas) nunca se actualizaban solas + Tickets más rápido
- **Qué pasó:** el usuario reportó que ni Solicitudes ni Tickets se actualizan en tiempo real — siempre tenía que forzar Ctrl+R para ver tickets/solicitudes nuevas o cambios de estatus.
- **Causa raíz:** Tickets SÍ tenía un auto-refresco de fondo (cada 20s, agregado el 2026-07-24) — mecanismo correcto, solo se sentía lento. Las 4 páginas de Solicitudes (Recursos, Cuentas, Ingresos RH, Bajas RH) nunca tuvieron ningún mecanismo de refresco — solo cargaban una vez al entrar o al cambiar de pestaña de estatus.
- **Qué cambié:**
  - `frontend/src/pages/TicketsLayout.jsx` — intervalo de refresco de 20s a 8s.
  - `frontend/src/pages/ResourceRequests.jsx`, `AccountRequests.jsx`, `OnboardingRequests.jsx`, `OffboardingRequests.jsx` — se agregó el mismo patrón de auto-refresco silencioso cada 8s (mismo criterio ya usado en Tickets/BiLayout.jsx).
- **Verificación:** `npm run build` sin errores; el usuario probó antes de confirmar.
- **Commit(s):** `4e68026`

### 2026-08-05 — FEATURE: botón "Recordar a todos" en Calificaciones (push a quien tenga un ticket sin calificar)
- **Qué pasó:** el usuario pidió una forma de "molestar" (su palabra) a quien tenga un ticket resuelto sin calificar, para que lo cierren.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — nuevo `POST /tickets/remind-pending-ratings` (exclusivo Administrador): manda un push a cada empleado con al menos un ticket `resuelto` sin `satisfactionRating` (mismo criterio que ya usa el badge "pendiente calificar" del portal), uno por empleado aunque tenga varios tickets pendientes. Queda en Auditoría.
  - `frontend/src/pages/TicketsCalificaciones.jsx` — botón "🔔 Recordar a todos (N)" junto a "Exportar Excel", más una tarjeta KPI con el conteo de empleados pendientes.
- **Verificación:** `node -c`/`npm run build` sin errores; confirmado contra producción (solo lectura, sin mandar el push todavía) que el conteo coincide — 3 empleados con ticket resuelto sin calificar en este momento.
- **Commit(s):** `a952073`

### 2026-08-05 — FIX: fuga de notificaciones push por "Entrar como empleado" + ~5 push duplicados por mensaje
- **Qué pasó:** el usuario (sistemas.3) reportó 2 bugs: 1) después de usar "Entrar como empleado" (Accesos de Empleados), empezaba a recibir los push de esa persona en su propio dispositivo; 2) en su propio portal de Tickets, cuando le contestaban un mensaje le llegaban ~5 notificaciones duplicadas.
- **Causa raíz (ambos comparten la misma raíz — Mesa de Ayuda y Tickets comparten el MISMO origen/service worker, así que el navegador solo tiene UNA suscripción de PushManager, no una por identidad):**
  1. **Fuga por impersonar:** al abrir Mesa de Ayuda como otro empleado, la suscripción push del navegador del ADMIN se re-registraba automáticamente bajo el `employeeRef` del empleado impersonado (comportamiento intencional del hook para el caso legítimo de "ya estaba suscrito del otro lado" — pero nunca contempló la sesión de impersonar). Confirmado con datos reales: el dispositivo de sistemas.3 estaba pegado al empleado Maria Magdalena Buendía López; el de Miguel García, a Jonathan Ovadia Heffes.
  2. **Duplicados:** `usePushSubscription` se montaba 2 veces por página (una vez directo en el layout, otra dentro de `PushNotificationBanner`, que también lo llamaba) — dos POSTs casi simultáneos de re-suscripción, con un upsert no atómico (`$pull` + `$push` en 2 llamadas separadas), dejaban duplicados en el arreglo. Confirmado: 6 de 6 admins y 23 de 26 empleados tenían entradas duplicadas.
- **Qué cambié:**
  - `backend/src/routes/employeeAuth.js` — el JWT de "Entrar como" ahora lleva `impersonated: true`.
  - `backend/src/routes/pushSubscriptions.js` — no registra ninguna suscripción si la sesión es de impersonar; además `$push` → `$addToSet` (converge a una sola copia sin importar el orden de peticiones concurrentes).
  - `backend/src/routes/adminPushSubscriptions.js` — mismo cambio de `$push` → `$addToSet`.
  - `frontend/src/hooks/usePushSubscription.js` — nueva opción `skip` que evita tocar el service worker/PushManager por completo.
  - `frontend/src/components/PortalLayout.jsx` — pasa `skip: !!employeeUser?.impersonated`; un solo llamado al hook, compartido con el banner vía props (ya no se monta 2 veces).
  - `frontend/src/pages/TicketsLayout.jsx` — mismo fix del doble montaje del lado admin.
  - `frontend/src/components/PushNotificationBanner.jsx` — recibe `status`/`subscribe` como props en vez de llamar el hook internamente.
  - `frontend/src/pages/TicketsAccesos.jsx` — guarda `impersonated: true` en `employeeUser` (localStorage) para que `PortalLayout.jsx` lo use.
- **⚠️ Limpieza de datos existentes (producción, confirmada con el usuario):** se tomó respaldo fresco antes de tocar nada. Se quitaron duplicados internos en 6 Users y 23 Employees, y se removieron las 2 fugas cruzadas reales encontradas (sistemas.3 → Maria Magdalena Buendía López; Miguel García → Jonathan Ovadia Heffes). Verificado: 0 duplicados y 0 fugas restantes tras la limpieza.
- **Verificación:** `node -c`/`npm run build` sin errores; confirmado contra datos reales de producción (antes/después de la limpieza).
- **Commit(s):** `fc154bd`

### 2026-08-05 — FIX: las imágenes de los chats abrían en pestaña nueva, ahora en ventana emergente
- **Qué pasó:** el usuario pidió que al abrir una imagen adjunta de un chat (tickets, notas internas/públicas, Solicitudes de Cuentas, Soporte BI), en vez de navegar a una pestaña nueva del navegador, se abriera en una ventana emergente dentro de la misma app.
- **Qué cambié:** `frontend/src/components/MessageAttachmentImage.jsx` — es el componente compartido que usan TODOS los chats de la app, así que un solo cambio los cubre a todos. El `<a target="_blank">` se reemplazó por un lightbox (modal con fondo oscuro, clic afuera o ✕ para cerrar).
- **Verificación:** `npm run build` sin errores; el usuario probó antes de confirmar.
- **Commit(s):** `4013bb6`

### 2026-08-05 — Ajuste: velocidad del carrusel de Mesa de Ayuda (7s → 4.5s → 3s)
- **Qué pasó:** el usuario pidió que el carrusel de Avisos rotara más rápido, en 2 ajustes seguidos.
- **Qué cambié:** `frontend/src/pages/MesaDeAyuda.jsx` — intervalo de rotación de 7000ms a 3000ms.
- **Commit(s):** `4013bb6`

### 2026-08-05 — FEATURE: Escalamiento colapsado detrás de un botón + chat bloqueado al escalar
- **Qué pasó:** el usuario reportó que al abrir un ticket, el formulario de Escalamiento (select + textarea + botón) aparecía siempre expandido, arriba de la conversación real con quien reportó — se confundía entre ambos. Pidió que fuera un botón que despliegue el formulario solo al hacer clic, y que al escalar (a una persona, otra área o proveedor — confirmó que aplica a los 3) se bloquee el chat directo con el empleado, dando seguimiento desde Notas Internas/Públicas en su lugar.
- **Qué cambié:**
  - `frontend/src/pages/TicketDetailModal.jsx` — Escalamiento ahora empieza colapsado ("🚀 Escalar" como botón); al escalar (cualquier tipo), el "Responder" (chat) se deshabilita con un aviso apuntando a Notas Públicas/Internas.
  - `backend/src/routes/tickets.js` (`POST /:id/reply`, `POST /:id/messages`) — el bloqueo del chat que antes solo aplicaba a escalamiento tipo "proveedor" (2026-08-03) ahora aplica a cualquier tipo (persona/área/proveedor), en ambos lados (admin y empleado).
  - `frontend/src/pages/TicketsChats.jsx` — mismo aviso de solo lectura extendido a cualquier ticket escalado.
  - `frontend/src/pages/MisTickets.jsx` — el aviso "se escaló..." y la etiqueta "Con proveedor externo" del lado del empleado ahora cubren cualquier tipo de escalamiento, no solo proveedor.
- **Verificación:** `node -c`/`npm run build` sin errores; el usuario probó en local antes de confirmar.
- **Commit(s):** `43eb952`

### 2026-08-05 — FIX: se podía seguir mandando mensajes en un ticket ya resuelto
- **Qué pasó:** el usuario reportó que en un ticket ya "resuelto" (no cerrado), Sistemas podía seguir escribiendo y mandando mensajes en la conversación, cuando ya no debería poder.
- **Causa raíz:** el guard de "ticket ya cerrado, no se pueden mandar más mensajes" (agregado el 2026-08-04) solo revisaba `status === 'cerrado'` — nunca se agregó `'resuelto'`, tanto en el backend como en los 2 lugares del frontend que muestran/deshabilitan la caja de responder.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` (`POST /:id/reply`) — ahora rechaza también cuando `status === 'resuelto'`, no solo `'cerrado'`.
  - `frontend/src/pages/TicketDetailModal.jsx` — el textarea/botón de "Responder" se deshabilita y muestra el aviso también en tickets resueltos.
  - `frontend/src/pages/TicketsChats.jsx` — mismo aviso de solo lectura extendido a "resuelto".
- **Verificación:** `node -c`/`npm run build` sin errores; el usuario probó en local antes de confirmar.
- **Commit(s):** `91f3cf9`

### 2026-08-05 — FIX: Sistemas veía (y podía gestionar) los tickets de Soporte BI
- **Qué pasó:** el usuario reportó que cualquier admin de Sistemas veía tickets de Soporte BI en el Tablero, cuando eso debería ser exclusivo de BI (mismo criterio que ya existe para ERP desde el 2026-07-30/08-03).
- **Causa raíz:** el código tenía un comentario extenso describiendo la partición correcta en 3 sentidos (ERP-only ve solo ERP, BI-only ve solo BI, el resto de Sistemas ve todo MENOS esos 2) — pero la implementación real solo excluía `ticketType === 'erp'`, nunca se agregó `'soporte_bi'`, en 3 lugares distintos: la consulta que llena el Tablero, y las 2 funciones que deciden si se puede ver/gestionar un ticket individual (backend y su copia en el frontend).
- **Qué cambié:**
  - `backend/src/routes/tickets.js` (`GET /` — consulta del Tablero) — la rama de "resto de admins" ahora excluye `['erp', 'soporte_bi']`, no solo `'erp'`.
  - `backend/src/routes/tickets.js` (`canViewTicket`, `canManageTicket`) — mismo criterio exclusivo que ya tenía ERP, ahora también para `soporte_bi` (solo `isBiOnlyUser` puede ver/gestionar, salvo que se les haya escalado de vuelta a Sistemas).
  - `frontend/src/pages/TicketDetailModal.jsx` (`canManage`) — mismo hueco, corregido igual.
- **Verificación:** `node -c`/`npm run build` sin errores; probado contra producción con un admin real — antes de este fix, el Tablero incluía tickets `soporte_bi`; después, 0 tickets de BI se filtran para un admin normal.
- **Commit(s):** `ab133db`

### 2026-08-05 — FIX: los chats de tickets regresaban solos al fondo cada pocos segundos
- **Qué pasó:** el usuario reportó que en Chats (admin) y dentro del chat de un ticket, al hacer scroll hacia arriba para leer mensajes viejos, después de unos segundos regresaba solo — pasaba también en el chat de Solicitudes de Cuentas.
- **Causa raíz:** el auto-scroll al fondo (agregado el 2026-08-04, estilo WhatsApp) dependía del array completo de mensajes (`liveMessages`/`messages`) en vez de su tamaño. El auto-refresco cada 5s de estos 3 chats llama `setLiveMessages(data.messages || [])` con un array NUEVO aunque el contenido sea idéntico — como el efecto dependía del array completo, disparaba el scroll al fondo cada 5s sin que llegara ningún mensaje nuevo, peleándose con quien intentaba leer hacia arriba.
- **Qué cambié:** `frontend/src/pages/TicketsChats.jsx`, `frontend/src/pages/TicketDetailModal.jsx`, `frontend/src/components/AccountRequestChatModal.jsx` — el efecto ahora depende de `.length` (cuántos mensajes hay), no del array completo, así solo dispara cuando de verdad llega un mensaje nuevo. Revisado el resto de chats (`MisTickets.jsx`, `BiSolicitudDetailModal.jsx`, `InternalNotesPanel.jsx`, `BiRequestDetailModal.jsx`) — ya usaban `.length` o no tienen auto-refresco, sin el mismo bug.
- **Verificación:** `npm run build` sin errores; el usuario probó antes de confirmar.
- **Commit(s):** `e234600`

### 2026-08-05 — FIX: los Avisos deben ser la diapositiva principal del carrusel, no el panel de tickets
- **Qué pasó:** el usuario pidió que el aviso apareciera como principal en vez del resumen de tickets.
- **Qué cambié:** `frontend/src/pages/MesaDeAyuda.jsx` — cuando hay avisos activos, ahora van primero en la rotación (posición 0) y el panel de "Sistema de tickets" queda al final; sin avisos, el panel de tickets sigue siendo la única diapositiva, igual que antes.
- **Verificación:** `npm run build` sin errores; el usuario probó antes de confirmar.
- **Commit(s):** `4975d2e`

### 2026-08-05 — FIX: el carrusel de Avisos cargaba lento y con lag
- **Qué pasó:** el usuario reportó que el aviso subido (banner de "No tocar la bandeja de la impresora", 2000x615, 718KB sin comprimir) cargaba muy lento y con lag al rotar.
- **Causa raíz (2 partes):** 1) `MesaDeAyuda.jsx` creaba el `<img>` del aviso recién al llegarle su turno en el carrusel — cada rotación volvía a descargar y decodificar la imagen desde cero, en vez de aprovechar que ya se había visto antes. 2) Ningún aviso se comprimía al subirse — se guardaba tal cual lo entregara Canva/PowerPoint, sin límite de tamaño ni compresión.
- **Qué cambié:**
  - `frontend/src/pages/MesaDeAyuda.jsx` — precarga en segundo plano (con `new Image()`) todas las imágenes de avisos en cuanto llega la lista, para que ya estén en caché del navegador cuando les toque aparecer.
  - `backend/src/routes/announcements.js` (+ `sharp` como dependencia nueva) — toda imagen se redimensiona a un ancho máximo de 1600px y se recomprime al subirse (nunca se guarda el archivo tal cual llegó).
  - Se recomprimió también el aviso ya subido en producción (718KB → 370KB) sin que el usuario tuviera que volver a subirlo.
- **Verificación:** `node -c`/`npm run build` sin errores; confirmado contra producción que la imagen recomprimida se sirve correctamente (200, tamaño reducido a la mitad).
- **Commit(s):** `15d78e2`

### 2026-08-05 — FEATURE: carrusel de Avisos en la página de inicio de Mesa de Ayuda
- **Qué pasó:** el usuario pidió que el panel de "Sistema de tickets" en la página de inicio del portal de empleado ("Solicitudes") rote también con avisos que Sistemas suba — cada aviso es una imagen ya diseñada (Canva/PowerPoint, con el logo/estilo de la empresa), no un formulario con campos sueltos que intente reconstruir ese diseño.
- **Qué cambié:**
  - `backend/src/models/Announcement.js` (nuevo) — título, imagen (GridFS, bucket `announcements`), activo/orden.
  - `backend/src/routes/announcements.js` (nuevo) — `GET /active` (público, lo consume el carrusel sin login) + CRUD admin (`GET/POST/PUT/DELETE`, exclusivo Administrador) + servir la imagen.
  - `backend/src/index.js`, `backend/src/models/AuditLog.js` — se monta la ruta y se agrega `aviso` al enum de entidades de Auditoría.
  - `frontend/src/pages/Announcements.jsx` (nueva página admin, en Operación → Avisos de Mesa de Ayuda) — subir imagen+título, activar/desactivar, reordenar, eliminar.
  - `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx` — ruta y link de sidebar (solo Administrador).
  - `frontend/src/pages/MesaDeAyuda.jsx` (+ `.module.css`) — el panel de tickets ahora es la primera diapositiva de un carrusel que rota cada 7s con los avisos activos, con puntos para navegar a mano.
- **Verificación:** `node -c`/`npm run build` sin errores.
- **Nota de la sesión:** durante este cambio el entorno de Claude Code perdió la salida SSH al EC2 (puerto 22) — se armó un despliegue automático vía GitHub Actions (`.github/workflows/deploy.yml`, commit `748a13e`) como respaldo, pero el problema resultó ser del lado del Security Group del EC2 (bloqueaba SSH desde cualquier origen, incluido GitHub) y se resolvió solo poco después. El GitHub Action queda funcionando de todos modos, como red de seguridad para la próxima vez que esto pase.
- **Commit(s):** `d0a7e36` (feature), `748a13e` (workflow de despliegue automático)

### 2026-08-04 — FIX: responsiva "formato anterior" salía con el número de línea vacío (celular vinculado a una Línea Telefónica)
- **Qué pasó:** el usuario probó el caso real de María Itzel González (OPPO A40 vinculado a su Línea Telefónica) y al generar la responsiva del teléfono, los campos de línea salían vacíos.
- **Causa raíz:** el generador de la responsiva "formato anterior" (`buildCelularLegacyPdf`) lee `asset.specs.lineNumber` directo del celular — no tiene ningún conocimiento del sistema nuevo de pareja (`pairedAssignment`). Como el OPPO ya no trae su propio número (se vació antes, el real vive en la Línea Telefónica aparte), el campo salía en blanco.
- **Qué cambié:**
  - `backend/src/routes/responsiva.js` (ruta `/legacy`) — si el celular no trae línea propia, busca su línea pareja (vía `pairedAssignment`) y usa esos datos para el PDF.
  - `backend/src/utils/responsivaLegacyPdf.js` (`buildCelularLegacyPdf`) — acepta `lineSpecs` (línea propia o la de la pareja) en vez de asumir siempre `asset.specs`.
  - De paso, la responsiva legacy de una Línea Telefónica sola (sin celular pareja) ahora describe el número real en vez del genérico "LÍNEA TELEFÓNICA".
- **Verificación:** `node -c` sin errores; probado en un script aislado (sin pasar por la ruta HTTP, para no repetir el archivado accidental de la vez anterior) contra el caso real de María Itzel — resolvió el número correcto (5564858877, Telcel) y generó el PDF sin errores.
- **Commit(s):** `1c739c8`

### 2026-08-04 — FEATURE: vincular celular + Línea Telefónica ya asignados por separado
- **Qué pasó:** al probar la entrega anterior en un caso real (María Itzel González), el usuario había asignado el celular OPPO A40 y la Línea Telefónica cada uno por su lado (no juntos desde el inicio) — la opción de "asignar pareja" solo aparecía al momento de crear la asignación, sin forma de ligar dos que ya estaban asignadas por separado. Además, el OPPO ya traía su propio número pegado en sus specs (`556485887`, con un dígito de menos, un typo) — dato duplicado y con error frente al número real de la Línea Telefónica (`5564858877`).
- **Qué cambié:**
  - `backend/src/routes/assignments.js` — nuevo `PUT /:id/pair`: liga (o desliga) dos asignaciones activas del mismo empleado, validando que sean exactamente un celular + una línea telefónica.
  - `frontend/src/pages/EmployeeDetail.jsx` — botón **🔗 Vincular** en las filas de Celular/Línea Telefónica de "Activos asignados", con un selector de la pareja disponible.
- **Dato corregido (producción, confirmado con el usuario):** se vació `specs.lineNumber` del OPPO A40 de María Itzel González — el número real ya vive en su Línea Telefónica aparte.
- **Verificación:** `node -c`/`npm run build` sin errores; el usuario probó en local antes de confirmar.
- **Commit(s):** `ff3c341`

### 2026-08-04 — FEATURE: asignar celular + Línea Telefónica juntos, con una sola responsiva
- **Qué pasó:** tras separar línea y aparato como activos independientes (ver entrada anterior), el usuario pidió poder asignarlos juntos cuando aplique (un celular sin línea + una línea, a la misma persona), que la responsiva los muestre como un solo equipo de telefonía, y que al dar de baja se liberen por separado automáticamente.
- **Qué cambié:**
  - `backend/src/models/Assignment.js` — nuevo campo `pairedAssignment` (referencia a otra Assignment), solo para que la responsiva los agrupe — no afecta la devolución/baja, cada uno se libera independiente.
  - `backend/src/routes/assignments.js` (`POST /`) — acepta `pairedAssignment` y liga ambas asignaciones en los dos sentidos; (`DELETE /:id`) al devolver una, desliga a su pareja (limpieza de dato, no cambia el status de ningún activo).
  - `backend/src/utils/releaseAssetsOnBaja.js` — mismo desligue al liberar por baja de personal.
  - `backend/src/routes/responsiva.js` — un celular sin línea propia + su línea pareja ahora salen en un solo renglón "EQUIPO DE TELEFONÍA"; una línea sin pareja sale en su propio renglón (sin campos de aparato). Se agregó `linea_telefonica` a las categorías de telefonía (antes hubiera caído en "Accesorios" con el nombre del tipo crudo).
  - `frontend/src/pages/EmployeeDetail.jsx` (`AssignModal`) — al elegir un celular sin línea o una línea sola, aparece un selector opcional para asignar también su pareja en el mismo paso (dos asignaciones por dentro, un solo formulario).
- **Verificación:** `node -c`/`npm run build` sin errores; se generó (vía curl, de forma no intencional pero verificada) la responsiva real de Mario para confirmar que el renglón de línea sola no rompe el PDF — HTTP 200, PDF válido. Ese generó sin querer un registro real en `ResponsivaArchive` (la ruta archiva cada PDF generado); se avisó al usuario y se borró el registro de prueba de inmediato.
- **Devolver/baja:** ya funcionaba automáticamente por diseño — cada activo es un documento independiente, no requirió cambios además de la limpieza de `pairedAssignment`.
- **Commit(s):** `5b5051d`

### 2026-08-04 — FEATURE: nuevo tipo de activo "Línea Telefónica" (asignable sin el aparato físico)
- **Qué pasó:** el usuario tenía un celular (Honor) en Disponibilidad cuya línea en realidad la usa otra persona (Mario), no quien tiene el aparato físico — antes línea y aparato vivían forzosamente en el mismo registro de "Celular", sin forma de asignar solo el número.
- **Qué cambié:** nuevo tipo de activo **Línea Telefónica** (icono 📞), con specs propios (número de línea, operadora, costo del plan, contrato, razón social, Gmail, SIM bloqueada — sin marca/modelo/IMEI/serie, porque no hay aparato). Coexiste con "Celular" tal cual ya funcionaba (para dar de alta aparato+línea juntos, como siempre) — ahora también se puede dar de alta solo la línea, sin aparato.
  - `backend/src/models/Asset.js` — nuevo tipo `linea_telefonica` en el enum.
  - `backend/src/routes/assets.js`, `frontend/src/pages/Assets.jsx` — se agregó a `PHONE_TYPES` (no a `SERIAL_CHECK_TYPES`, no tiene serie) para que su número de línea se revise contra duplicados junto con Celular/Tablet.
  - `frontend/src/config/assetFields.js` — catálogo de specs, grupo "Móviles", ícono.
  - `frontend/src/pages/Stock.jsx` — aparece en Disponibilidad, sección "Móviles".
  - `frontend/src/pages/Employees.jsx`, `EmployeeDetail.jsx` — el teléfono de un empleado ahora también se detecta si tiene asignada una Línea Telefónica (antes solo miraba `type === 'celular'`).
  - `frontend/src/pages/Assignments.jsx` — nueva pestaña "Líneas telefónicas" con sus propias columnas y exportación a Excel.
- **Verificación:** `node -c`/`npm run build` sin errores; el usuario probó en local antes de confirmar.
- **Fuera de alcance (pendiente, requiere confirmación aparte antes de tocar producción):** separar la línea real del Honor y crear la Línea Telefónica de Mario — el usuario todavía no ha confirmado ese movimiento de datos específico.
- **Commit(s):** `5a2e23e`

### 2026-08-04 — FIX: Solicitud de Ingreso dejaba marcar "Accesorios"/Computadora/Teléfono sin especificar cuáles
- **Qué pasó:** el usuario notó que en Solicitudes de Ingreso, cuando RH marca que el nuevo ingreso necesita accesorios, a veces solo sale el genérico "Accesorios" en la columna "Necesita", sin detallar cuáles. Confirmé contra el registro real (Maria Itzel González Madrigal, solicitada por Nicolás López Bárcenas): `needsAccessories: true` pero `accessoryTypes: []` y `accessoryOther: ""` — RH de verdad marcó la casilla sin elegir ningún accesorio específico ni escribir "otro". No era un bug de que la tabla ocultara el dato — el dato nunca se capturó.
- **Qué cambié:** `frontend/src/pages/SolicitarIngreso.jsx` (`handleSubmit`) — ahora exige elegir al menos un tipo (o llenar "Otro") cuando se marca "Necesita Computadora/Teléfono/Accesorios", antes de dejar enviar la solicitud. Mismo hueco en los 3, se corrigieron los 3 para consistencia (el usuario solo reportó Accesorios).
- **Verificación:** `npm run build` sin errores; confirmado con lectura directa del registro real en producción (vía túnel) que el gap era de captura, no de despliegue. El usuario probó en local antes de confirmar.
- **Fuera de alcance:** no se corrigió el registro histórico de Maria Itzel (ya aprobada y dada de alta) — este fix solo evita que se repita en solicitudes nuevas.
- **Commit(s):** `3a36720`

### 2026-08-04 — FIX: Tab no rellenaba la sugerencia en Destinatario (Envíos) ni en otros 5 campos
- **Qué pasó:** el usuario reportó que en Envíos, al hacerle Tab al campo "Destinatario (quién recibe)" para tomar la sugerencia, en vez de rellenarla saltaba directo al siguiente campo ("Equipos en salida").
- **Causa raíz:** el atajo "Tab para rellenar" (`useTabFillExamples`, hook global, no específico de este formulario) solo reconoce como sugerencia un placeholder que empiece con `"Ej."` — cualquier otro placeholder lo ignora y deja que Tab navegue normal. El campo de Destinatario tenía el placeholder escrito como `"Felipe Gómez"` a secas, sin el prefijo, así que nunca calificaba.
- **Qué cambié:** se agregó el prefijo `"Ej. "` a 6 campos con el mismo defecto (el reportado, más 5 encontrados al revisar el resto de la app con el mismo patrón):
  - `frontend/src/components/CreateShipmentModal.jsx` — Destinatario, Tipo de equipo, Descripción, Sucursal origen, Sucursal destino.
  - `frontend/src/pages/Users.jsx` — Nombre completo al crear un usuario.
- **Verificación:** `npm run build` sin errores; el usuario probó en local (dev server con HMR) antes de confirmar.
- **Commit(s):** `5fb75f8`

### 2026-08-04 — FIX: canManageTickets nunca se guardaba en el navegador al iniciar sesión (becario sin ver Tickets)
- **Qué pasó:** después del fix anterior (becario.sistemas de solo lectura), el usuario mostró que a becario ni siquiera le aparecía el link de Tickets en el menú — ni cerrando e iniciando sesión de nuevo. Verifiqué la base de datos por el túnel: `canManageTickets: true` ya estaba correctamente puesto ahí. El bug real era otro.
- **Causa raíz:** `Login.jsx` arma a mano el objeto que se guarda en `localStorage` tras iniciar sesión, copiando campo por campo (`canManageGmailAccounts`, `canManagePlatformAccounts`, `canViewManagerDashboard`, etc.) — `canManageTickets` (agregado 2026-08-03) nunca se agregó a esa lista. El backend sí lo mandaba en la respuesta de login, pero se perdía ahí antes de guardarse, así que `user.canManageTickets` quedaba `undefined` en el navegador de CUALQUIER usuario con ese permiso, sin importar cuántas veces cerrara/abriera sesión.
- **Qué cambié:** `frontend/src/pages/Login.jsx` — se agregó `canManageTickets: data.canManageTickets` a la lista.
- **Verificación:** `npm run build` sin errores; confirmado por lectura directa de la base de datos de producción (vía túnel) que el permiso de becario.sistemas ya estaba en `true` — el bug era 100% del lado del frontend.
- **Commit(s):** `58bf38f`

### 2026-08-04 — FIX: becario.sistemas seguía de solo lectura en tickets de sus compañeros
- **Qué pasó:** el usuario reportó que becario.sistemas (permiso `canManageTickets`, agregado el 2026-08-03 para entrar a Tickets sin ser Administrador completo) seguía sin poder responder, asignar, escalar, cambiar prioridad/SLA ni agregar notas en ningún ticket que no fuera suyo — de solo lectura, aunque sí podía ver el tablero completo.
- **Causa raíz:** `canManageTicket()` (backend) y su copia `canManage` (frontend) solo revisaban `role === 'admin'` como la vía de "cualquiera del equipo de Sistemas puede tocar cualquier ticket" — nunca consideraban `canManageTickets`. Como becario tiene `role: 'viewer'`, solo calificaba para el criterio de respaldo (ticket sin asignar, o asignado a él mismo), quedando bloqueado en todo lo demás. Además, el selector "Asignar a" filtraba por `role: 'admin'` a secas, así que becario ni siquiera aparecía ahí para que alguien se lo devolviera.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` (`canManageTicket`) — ahora también acepta `req.user.canManageTickets`.
  - `backend/src/routes/tickets.js` (`GET /assignable-users`) — el filtro no-ERP ahora es `{ role: 'admin' } OR { canManageTickets: true }`.
  - `frontend/src/pages/TicketDetailModal.jsx` (`canManage`) — mismo criterio, agregado `currentUser.canManageTickets`.
  - `frontend/src/pages/TicketsChats.jsx` (`canManageSelected`) — de paso se encontró que a este ni siquiera le faltaba `canManageTickets`: le faltaba también `role === 'admin'` (cualquier admin, no solo becario, se quedaba en modo lectura en Chats para un ticket ya asignado a un compañero) — se agregaron ambos.
- **Verificación:** `node -c`/`npm run build` sin errores; el usuario probó en local (dev server con HMR) contra producción antes de confirmar.
- **Commit(s):** `1e67424`

### 2026-08-04 — FIX: los chats no bajaban solos a los últimos mensajes al abrirlos (estilo WhatsApp)
- **Qué pasó:** el usuario reportó que al abrir una conversación de un ticket (tanto en Mesa de Ayuda como en el sistema de Tickets) se veían los mensajes más viejos arriba, en vez de bajar directo a los últimos enviados, como WhatsApp. Al preguntarle si pasaba también en Solicitudes, pidió revisar TODO lo que abra un chat.
- **Qué cambié:** ninguno de los chats de la app tenía lógica de auto-scroll — se agregó en los 7 lugares encontrados:
  - `frontend/src/pages/TicketsChats.jsx` — Chats (admin).
  - `frontend/src/pages/TicketDetailModal.jsx` — conversación del modal de ticket (admin); `frontend/src/pages/Tickets.module.css` — `.convThread` ahora con su propio `max-height`/scroll, para no arrastrar el resto del formulario del ticket al hacer scroll.
  - `frontend/src/pages/MisTickets.jsx` — Mis Tickets (empleado).
  - `frontend/src/components/AccountRequestChatModal.jsx` — chat de "esperando activación" en Solicitudes de Cuentas (admin y empleado).
  - `frontend/src/components/BiSolicitudDetailModal.jsx` — detalle de Soporte BI (empleado).
  - `frontend/src/components/InternalNotesPanel.jsx` — notas internas/públicas (bitácora), usado en el modal de ticket y en Notas Internas.
  - `frontend/src/components/BiRequestDetailModal.jsx` — comentarios estilo Trello de proyectos BI (admin).
  - Revisado y confirmado SIN el bug: Solicitudes de Recursos/Ingreso/Egreso (no tienen chat) y el bot de ayuda flotante (ya scrolleaba bien).
- **Verificación:** `npm run build` sin errores; el usuario probó en local (dev server con HMR) antes de confirmar.
- **Commit(s):** `04382a9`

### 2026-08-04 — FIX: "Enviar otra solicitud" borraba el nombre y no dejaba volver a escribirlo (Recursos/Cuentas/Ingreso)
- **Qué pasó:** el usuario reportó que en Solicitud de Recursos, al enviar una solicitud y luego darle "Enviar otra solicitud", el campo de nombre se quedaba en blanco ("Solicitando como .") y no dejaba escribirlo ni seleccionarlo de la lista — bloqueando por completo la segunda solicitud.
- **Causa raíz:** cuando hay sesión de portal activa (`employeeToken`), un `useEffect` de montaje (dependencias `[]`, corre una sola vez) llama `GET /employees/me` y pone `viaSession = true` para mostrar "Solicitando como {nombre}" en vez del buscador manual. El botón "Enviar otra solicitud" resetea `form`/`nameQuery`/`matchedEmployee` pero nunca resetea (ni vuelve a llenar) `viaSession` — como ese `useEffect` ya no puede volver a correr, la vista se queda mostrando la línea de solo lectura, ahora con el nombre vacío, y el buscador manual (la única forma de volver a elegir el nombre) nunca se muestra porque sigue oculto detrás de `viaSession`.
- **Qué cambié:** en los 3 formularios públicos con el mismo patrón — `SolicitarRecurso.jsx`, `SolicitarCuenta.jsx`, `SolicitarIngreso.jsx` — se separó la búsqueda de `/employees/me` del `useEffect` de montaje a una función reutilizable, y "Enviar otra solicitud" ahora también la vuelve a llamar (además de limpiar los campos de búsqueda manual), repoblando el nombre correctamente para la siguiente solicitud.
- **Verificación:** `npm run build` sin errores; el usuario probó en local (dev server con HMR) antes de confirmar.
- **Commit(s):** `59bf263`

### 2026-08-04 — FIX: se podía seguir mandando mensajes (y notificando) en tickets ya cerrados desde Chats
- **Qué pasó:** el usuario reportó que en Chats, aunque un ticket ya estuviera cerrado, Sistemas podía seguir mandando mensajes y el empleado recibía la notificación. Al revisar, `POST /:id/reply` (la ruta que usa Chats para contestar) nunca validaba `ticket.status === 'cerrado'` — a diferencia de las notas internas/públicas (que sí lo bloquean) y del lado del empleado (`POST /:id/messages`, que también ya lo bloqueaba).
- **Qué cambié:**
  - `backend/src/routes/tickets.js` (`POST /:id/reply`) — rechaza con 400 si el ticket ya está cerrado, mismo criterio que ya usan notas internas/públicas.
  - `frontend/src/pages/TicketsChats.jsx` — si el ticket seleccionado está cerrado, muestra "🔒 Este ticket ya está cerrado — no se pueden mandar más mensajes" en vez del cuadro de texto (para no ni intentarlo).
- **Verificación:** `node -c`/`npm run build` sin errores; el usuario probó en local (dev server con HMR) contra producción antes de confirmar.
- **Commit(s):** `de83df0`

### 2026-08-04 — FIX: correos y PDFs del backend mostraban la hora en UTC, no en hora de México
- **Qué pasó:** el usuario reportó que el correo de "Nuevo ticket de soporte" mostraba una "Fecha de reporte" con una hora que no coincidía con la hora real en la que se reportó. Causa raíz: el EC2 corre en UTC, y `formatDateTime()` en `emailTemplates.js` llamaba `toLocaleString('es-MX', ...)` sin especificar `timeZone`, así que tomaba la zona horaria del servidor (UTC) en vez de la de México. Al revisar, el mismo patrón (sin `timeZone`) se repetía en varios PDFs generados por el backend — mismo bug, mismo servidor, distintos lugares.
- **Qué cambié:**
  - `backend/src/utils/dateFormat.js` (nuevo) — helper compartido `formatMx(date, opts)` que siempre fija `timeZone: 'America/Mexico_City'`.
  - `backend/src/utils/emailTemplates.js` — `formatDateTime()` (fecha de reporte y resolución límite del correo de ticket) ahora usa `formatMx`.
  - `backend/src/utils/shipmentPdf.js` — fecha/hora de creación, retorno esperado, "en tránsito por" y "recibido por" de la guía de envío.
  - `backend/src/utils/accountRequestPdf.js` — fecha de la solicitud y de aceptación electrónica.
  - `backend/src/routes/platformAccounts.js`, `platformAccountsErp.js`, `gmailAccounts.js`, `responsiva.js` — fecha de emisión ("Ciudad de México a...") de cada responsiva/carta.
- **Verificación:** `node -c` sin errores en los 8 archivos; probado con `TZ=UTC` (simulando el servidor real) contra una fecha conocida — confirmé que antes mostraba la hora UTC y ahora muestra la hora real de México (ej. 5:04 p.m. en vez de 11:04 p.m.). El usuario probó en local contra producción antes de confirmar.
- **Commit(s):** `7ea3bbc`

### 2026-08-04 — FIX: fecha de "Resuelto hace Nd" cambiaba de día 24h después, no a medianoche
- **Qué pasó:** el usuario reportó que un ticket resuelto hoy a las 4pm seguía mostrando "Resuelto hoy" hasta las 4pm del día siguiente, en vez de cambiar a "ayer" a la medianoche.
- **Qué cambié:** `frontend/src/pages/ticketShared.js` (`daysAgo`) — antes calculaba `(Date.now() - fecha) / 86400000` (un rolling de 24 horas exactas); ahora trunca ambas fechas a medianoche antes de restar, comparando día de calendario contra día de calendario. Usado en `TicketCard.jsx` para la etiqueta "Resuelto hoy" / "Resuelto hace Nd".
- **Verificación:** `npm run build` sin errores; el usuario probó en el navegador (dev server con HMR) antes de confirmar.
- **Commit(s):** `e5f323d`

### 2026-08-04 — FIX: notas públicas de un ticket nunca mandaban push al empleado
- **Qué pasó:** el usuario reportó que al mandar una nota pública en un ticket escalado a proveedor, no le llegaba el push al empleado. Al revisar, el bug no era específico de proveedor: `POST /:id/public-notes` se había construido copiando el molde de `POST /:id/internal-notes` (mismo comentario en el código: "mismo molde/validaciones") y con eso se llevó por error el "sin push" — correcto para notas internas (nunca deben llegar al empleado) pero no para las públicas, que están hechas justo para que el empleado se entere.
- **Qué cambié:** `backend/src/routes/tickets.js` (`POST /:id/public-notes`) — agrega `sendPushToEmployee(ticket.employeeRef, ...)` al guardar la nota, mismo patrón que ya usa `POST /:id/reply` ("Sistemas respondió tu ticket").
- **Verificación:** `node -c` sin errores; probado en local (`:4000`) contra Mongo de producción — el usuario confirmó antes de deployar.
- **Commit(s):** `8af9d7b`

### 2026-08-04 — FIX: escalar a Proveedor no asignaba, no clasificaba SLA, ni cambiaba status + Matriz de SLA con Proveedor
- **Qué pasó:** el usuario reportó 3 bugs en "Escalar a Proveedor" (feature construida más temprano el mismo día): 1) no asignaba el ticket a nadie (debía asignarlo a quien escala), 2) no aplicaba ningún nivel de servicio — el usuario adjuntó `Matriz_SLA_Con_Proveedor.pdf`, una tabla de SLA específica para proveedores externos (distinta a la interna ya existente) que debía aplicarse por default al escalar, y 3) el status se quedaba en "abierto" cuando debía pasar a "en proceso" (igual que cuando se agregan notas públicas) hasta cerrarse con "Servicio con el proveedor terminado". También pidió documentar la nueva matriz en el manual de usuario.
- **Qué cambié:**
  - `backend/src/models/Ticket.js` — nuevo catálogo `PROVIDER_SLA_CATALOG` (11 categorías, mismos nombres que el `SLA_CATALOG` interno) con el tiempo de resolución del proveedor por categoría; nuevos campos `providerSlaLabel`/`providerSlaDueAt` en el schema.
  - `backend/src/routes/tickets.js` (`PUT /:id/escalate`, rama `proveedor`) — ahora asigna el ticket a quien escala (`assignedTo`/`assignedByName`/`assignedAt`), pasa el status de "abierto" a "en proceso", y calcula `providerSlaLabel`/`providerSlaDueAt` a partir de la `slaCategory` que ya tenga clasificada el ticket (si nunca se clasificó, queda vacío en vez de inventar un SLA). El SLA interno NO se toca — según la matriz, se "congela" y el proveedor corre en paralelo desde el momento de escalar, no desde la creación del ticket. Al des-escalar, se limpian ambos campos nuevos.
  - `frontend/src/pages/ticketShared.js` — `PROVIDER_SLA_CATALOG` (copia frontend) y `isOverdue()` ajustado: un ticket escalado a proveedor ya no se marca "vencido" según el SLA interno congelado, sino según `providerSlaDueAt`.
  - `frontend/src/pages/TicketDetailModal.jsx` — muestra el SLA de Proveedor y su fecha límite en el ticket ya escalado, o un aviso si falta clasificar la Categoría de Falla.
  - `frontend/src/pages/TicketsSLA.jsx` — tabla de referencia completa de la matriz del PDF (niveles, prioridades, tiempos internos y SLA de proveedor); no existe ningún manual dirigido a Sistemas (solo hay para empleados), así que se documentó aquí, en la página de SLA ya existente, en vez de crear un sistema de manuales nuevo.
- **Verificación:** `node -c`/`npm run build` sin errores en los 5 archivos; probado en local (`:4000`/`:3000`) contra Mongo de producción vía túnel — el usuario revisó el flujo completo en el navegador antes de confirmar.
- **Aparte (bug preexistente, sin arreglar, fuera de alcance de este cambio):** el `SLA_CATALOG` del frontend (`ticketShared.js`) le falta la categoría "Soporte BI" que sí existe en el backend (11 vs 12) — reportado al usuario, pendiente de que confirme si quiere que se arregle.
- **Commit(s):** `a16507a`

### 2026-08-04 — "Entrar como empleado" (Accesos de Empleados) + FIX: adjuntos rotos en Chats/Mis Tickets
- **Qué pasó:** 2 cosas que se habían quedado apartadas, sin confirmar, desde antes en el día:
  1. El usuario había pedido ver/guardar las contraseñas reales del portal de empleado — se le explicó que es técnicamente imposible (bcrypt, de un solo sentido) y, tras un aviso ⚠️ de riesgo sobre guardar copias reversibles, se decidió construir en su lugar "Entrar como empleado": una sesión corta (1h) para verificar algo desde la perspectiva de un empleado real, sin ver ni tocar su contraseña.
  2. Se había encontrado (pero no confirmado) que `MessageAttachmentImage` en `TicketsChats.jsx`/`MisTickets.jsx` recibía las props equivocadas (`ticketId`/`messageId` en vez de `url`), rompiendo la vista de imágenes adjuntas en esos 2 chats.
- **Qué cambié:**
  - `backend/src/routes/employeeAuth.js` — nueva ruta `POST /:id/impersonate` (admin-only), firma un token de empleado de 1h (en vez de los 30 días normales del portal) y siempre lo deja en Auditoría.
  - `backend/src/models/AuditLog.js` — nueva acción `'impersonar'` en el enum.
  - `frontend/src/pages/TicketsAccesos.jsx` (nueva página, en Tickets → 🔑 Accesos de Empleados) — buscador de empleados con botón "Entrar como", abre Mesa de Ayuda en una pestaña nueva sin cerrar la sesión de Sistemas (usa las llaves `employeeToken`/`employeeUser`, separadas de `token`/`user`).
  - `frontend/src/pages/MisTickets.jsx`, `TicketsChats.jsx` — `MessageAttachmentImage` corregido a `url={...}`, coincidiendo con la firma real del componente.
- **Verificación:** `node -c`/`npm run build` sin errores; probado contra producción con un admin real y un empleado real (Maria Itzel González) — el token generado autenticó correctamente (200 en `GET /tickets/mine`), duró exactamente 3600s, y quedó el registro en Auditoría con todos los campos esperados.
- **Commit(s):** `d06ad01`

### 2026-08-04 — FIX: notas de aprobación invisibles en Solicitudes de Recursos
- **Qué pasó:** el usuario preguntó si al aprobar una Solicitud de Recursos el empleado también ve las notas — al revisar, resultó que NO: mismo hueco exacto que el motivo de rechazo (arreglado unas horas antes ese mismo día), solo que del lado de `resolutionNotes` (ej. "Se entrega Mouse y Teclado Lenovo"). Se me pasó cubrir ese campo cuando arreglé el de rechazo.
- **Qué cambié:** `frontend/src/pages/MisSolicitudes.jsx` (+ `.module.css`) — `resolutionNotes` ahora se muestra en verde bajo la solicitud, junto al motivo de rechazo (rojo) que ya se mostraba.
- **Verificación:** `npm run build` sin errores; probado contra producción con la cuenta real de un empleado con una solicitud aprobada con notas (Christian Ernesto Pizano Juarez, "Se asigna mouse y se queda en espera de que venga el mensajero.") — confirmé que `GET /resource-requests/mine` ya la trae y el frontend la muestra. El usuario confirmó antes de aprobar.
- **Commit(s):** `3cc24b8`

### 2026-08-04 — FIX: asignar sin aprobar en Solicitudes de Recursos + Eliminar restringido a Administrador en todo el sistema
- **Qué pasó:** el usuario reportó 2 cosas en Solicitudes de Recursos: 1) al rechazar una solicitud, seguía dejando asignar activos, y 2) antes de aprobar/rechazar (pendiente), también dejaba asignar — debería exigir aprobar primero. Aparte, pidió que "eliminar" sea exclusivo de Administrador en TODO el sistema ("de tickets, de solicitudes, de cuentas, de lo que sea"). Al auditar, se encontró que varios endpoints de eliminar no exigían rol admin en absoluto (bastaba cualquier sesión válida), y otros bastaba un permiso especializado (Gmail/Plataformas/ERP) sin ser Administrador de verdad — el usuario confirmó explícitamente que también quería cerrar ese segundo caso.
- **Qué cambié:**
  - `frontend/src/pages/ResourceRequests.jsx` — el modal de detalle solo deja asignar activos (y generar el formato de salida) cuando `status === 'aprobada'`; para pendiente/rechazada muestra un aviso en su lugar.
  - Backend (`adminOnly` agregado a cada ruta) — `assets.js`, `assignments.js` (Devolver/reasignar), `employees.js`, `tickets.js` (el ticket mismo, el catálogo de resoluciones, y las etiquetas de Proyectos BI), `accountRequests.js`, `gmailAccounts.js`, `platformAccounts.js`, `platformAccountsErp.js`, `responsivaArchive.js` (quitar firmada) — antes bastaba `auth` a secas, o el permiso especializado de esa página, sin exigir rol Administrador.
  - Frontend (botón "Eliminar"/"Devolver"/"Regresar" oculto para no-administradores) — `AccountRequests.jsx`, `Assets.jsx`, `Employees.jsx`, `EmployeeDetail.jsx`, `Accessories.jsx`, `GmailAccounts.jsx`, `PlatformAccounts.jsx`, `PlatformAccountsErp.jsx`, `TicketsLayout.jsx`.
- **Fuera de alcance / confirmado sin riesgo:** `DELETE /assignments/:id` también lo usa por dentro el flujo de "reasignar a otra persona" (Activos/Disponibilidad borran la asignación vieja antes de crear la nueva) — el usuario confirmó explícitamente que reasignar/devolver equipo siempre lo hacen administradores, así que no hay flujo diario que se rompa.
- **Verificación:** `node -c` en todos los archivos backend tocados, `npm run build` sin errores; probado contra producción (solo lectura/rechazado, sin borrar nada real) con tokens sintéticos NO-admin (ERP-only, BI-only, permiso Gmail) — los 4 endpoints probados dieron 403 correctamente. El usuario confirmó en `localhost:3000` antes de aprobar.
- **Commit(s):** `ea42f4e`

### 2026-08-04 — FIX: motivo de rechazo invisible en Solicitudes de Recursos/Cuenta/Ingreso
- **Qué pasó:** el usuario reportó que al rechazar una Solicitud de Recursos, el empleado no veía el motivo del rechazo — importante para evitar quejas después. El backend ya guardaba `rejectionReason` desde siempre, pero `frontend/src/pages/MisSolicitudes.jsx` nunca lo mostraba en ningún lado. Se encontró el mismo hueco en Solicitud de Cuenta e Ingresos RH (mismo campo, mismo problema) — se corrigieron las 3 de un jalón.
- **Qué cambié:** `frontend/src/pages/MisSolicitudes.jsx` (+ `.module.css`) — el motivo de rechazo ahora se muestra directo bajo la solicitud en la tabla (sin necesitar abrir nada), para Recursos/Cuenta/Ingresos; Baja de Personal usa el motivo de la etapa en la que se rechazó (RH o Sistemas, cada una con su propio campo).
- **Verificación:** `npm run build` sin errores; probado contra producción con la cuenta real de un empleado con una solicitud rechazada (Luis Enrique Cervantes Lopez) — confirmé que `GET /resource-requests/mine` ya trae el motivo real y que el frontend lo renderiza. El usuario confirmó antes de aprobar.
- **Commit(s):** `8bd1924`

### 2026-08-04 — FIX: tarjetas de resumen de Auditoría se ponían en 0 (y la activa en 500)
- **Qué pasó:** el usuario reportó que al hacer clic en cualquier ícono de resumen (Creación, Edición, etc.) los demás se ponían en 0, y Creación/Edición se veían en 500. Causa: `frontend/src/pages/Audit.jsx` calculaba el conteo de cada tarjeta a partir de los `logs` YA filtrados por acción (`GET /audit?action=...&limit=500`) — al filtrar por "crear", la respuesta solo traía logs de ese tipo (los demás en 0), y como el conteo real de "crear" (969) y "editar" (1374) supera el límite de la consulta (500), la tarjeta activa se quedaba pegada en ese tope en vez de mostrar el total real.
- **Qué cambié:**
  - `backend/src/routes/audit.js` — nuevo `GET /audit/counts-by-action`, agrupa por acción respetando entity/userId/from/to pero SIN filtrar nunca por `action` — es justo el desglose que necesitan las tarjetas, sin importar cuál esté seleccionada.
  - `frontend/src/pages/Audit.jsx` — las tarjetas ahora piden este conteo aparte (no se recalculan de `logs`), y se refrescan con los demás filtros pero a propósito NO con `filterAction`.
- **Verificación:** `node -c`/`npm run build` sin errores; probado contra producción (solo lectura) — confirmé que el conteo real de "crear" es 969 y el de "editar" 1374, ambos por arriba del límite de 500 que causaba el bug. El usuario confirmó en `localhost:3000` antes de aprobar.
- **Commit(s):** `09f6125`

### 2026-08-04 — Kanban de Proyectos BI: diseño tipo Word + etiquetas y comentarios estilo Trello
- **Qué pasó:** el usuario pidió 2 cosas para la tarjeta de "Solicitud de Proyecto" (NO para Bases de Datos, que se queda igual): 1) que la sección de datos del formulario se viera con el mismo diseño del Word que se manda por correo al crear el proyecto ("no el tipo de documento, el diseño, la estructura y la forma"), y 2) que el seguimiento/observaciones del proyecto ya no vivan en el chat con quien reportó — quiere etiquetas y comentarios estilo Trello dentro de la tarjeta, separados por completo de esa conversación (que sigue existiendo aparte, en Tickets). Confirmó explícitamente que el Kanban en sí (columnas, arrastrar tarjetas) no debía tocarse — todo esto son adiciones, no un reemplazo.
- **Qué cambié:**
  - `frontend/src/components/BiProjectFields.module.css` (nuevo) — banda naranja de título por sección (`#E8651A`, mismo color del Word) + tabla de 2 columnas etiqueta/valor, replicando la estructura real de `backend/src/utils/biProjectDocx.js`.
  - `frontend/src/components/BiRequestDetailModal.jsx` — `ProjectFields` reescrito con ese estilo; nuevo componente `ProjectLabelsAndComments` (catálogo de etiquetas con color + comentarios de solo texto, ambos exclusivos de `biRequestKind === 'proyecto'`).
  - `backend/src/models/ProjectLabel.js` (nuevo) — catálogo reutilizable de etiquetas (nombre + color de una paleta fija de 8 colores), compartido entre todas las tarjetas de Proyecto, igual que las etiquetas reales de Trello.
  - `backend/src/models/Ticket.js` — nuevos campos `projectLabelIds` (referencia al catálogo) y `projectComments` (texto + autor + fecha, sin adjuntos).
  - `backend/src/routes/tickets.js` — nuevas rutas `GET/POST /project-labels`, `DELETE /project-labels/:id`, `PUT /:id/project-labels`, `POST /:id/project-comments` (todas exclusivas de `biRequestKind === 'proyecto'` salvo el catálogo, que es global); `populate('projectLabelIds')` en `GET /` y `GET /:id`. Las rutas de catálogo (`/project-labels`) se declararon ANTES de `GET /:id` — si no, Express interpreta "project-labels" como el `:id` y nunca llegan ahí.
  - `frontend/src/pages/BiProjects.jsx` — la tarjeta del Kanban ahora muestra los chips de etiqueta y un contador de comentarios (💬), sin tocar nada de las columnas/drag-and-drop existentes.
- **Verificación:** `node -c`/`npm run build` sin errores; las 3 rutas de catálogo probadas contra producción (creación + lectura + borrado de una etiqueta de prueba, limpiada al terminar); `GET /:id` reverificado sin errores en un ticket real tras agregar el `populate`. El usuario confirmó en `localhost:3000` que el Kanban seguía intacto antes de aprobar.
- **Commit(s):** `165cef7`

### 2026-08-03 — Catálogo de problemas comunes en Soporte BI (Excel/Power BI)
- **Qué pasó:** el usuario reportó que "Soporte BI → Tengo una duda o problema" en Mesa de Ayuda solo mostraba un cuadro de texto libre, sin ninguna selección de problemas comunes — a diferencia de cualquier otra categoría (hardware/software/etc.), que sí ofrece un catálogo curado antes del texto libre. Casi siempre BI resuelve dudas de Excel o Power BI.
- **Qué cambié:**
  - `frontend/src/config/ticketCategories.js` — nuevo catálogo `BI_SUPPORT_PROBLEMS` (fórmulas/tablas dinámicas de Excel, macros/plantillas, reportes/dashboards de Power BI, "no entiendo un reporte que me compartieron", y "Otro"), cada uno con `sla: 'Soporte BI'` (la Categoría de Falla que ya existía para este tipo de ticket, antes sin usar en este camino).
  - `frontend/src/pages/ReportarTicket.jsx` — nuevo paso `bi-support-catalog` entre "Tengo una duda o problema" y el texto libre; elegir un problema precarga el texto (editable) y manda `slaHint` al crear el ticket.
- **Verificación:** `npm run build` sin errores. El usuario probó el flujo completo en `localhost:3000` antes de confirmar.
- **Commit(s):** `ad293d1`

### 2026-08-03 — Escalar a Proveedor: cierra de nuestro lado, seguimiento con Notas internas/públicas
- **Qué pasó:** el usuario pidió que al escalar un ticket a Proveedor, quede resuelto de nuestro lado (el empleado ya no puede responder/quejarse, "como ya no nos compete") pero sin cerrarse del todo — el seguimiento real con el proveedor se lleva aparte, y solo cuando el servicio externo termina se dispara la calificación normal del empleado. Además pidió una segunda bitácora, aparte de Notas internas (privada), que el empleado SÍ pueda ver de solo lectura para contarle "vamos así" sin exponer facturas/detalles internos del proveedor.
- **Qué cambié:**
  - `backend/src/routes/tickets.js`, `PUT /:id/escalate` (rama `proveedor`) — siembra automáticamente una primera nota interna ("Escalado a Proveedor: ..."); `POST /:id/messages` (empleado) ahora rechaza escribir mientras el ticket esté escalado a Proveedor y no se haya marcado como resuelto.
  - `frontend/src/pages/TicketDetailModal.jsx` — el botón "Marcar como resuelto" cambia a **"✅ Servicio con el proveedor terminado"** cuando el ticket está escalado a Proveedor (mismo flujo de resolución de siempre, pre-llenado con "Resuelto por el proveedor" editable) — es lo que reabre la calificación normal del empleado.
  - `backend/src/models/Ticket.js` — nuevo campo `publicNotes` (mismo molde que `internalNotes`: texto + adjunto opcional en GridFS), y nuevas rutas `POST /:id/public-notes` y `GET /:id/public-notes/:noteId/attachment` (esta última con acceso dual admin/empleado, mismo patrón que los adjuntos de mensajes).
  - `frontend/src/components/InternalNotesPanel.jsx` — generalizado con un prop `kind` ('internal'/'public') en vez de duplicar el componente completo para la segunda bitácora.
  - `frontend/src/pages/MisTickets.jsx` — muestra las notas públicas (solo lectura, sin poder responder) dentro de la conversación del ticket, y un aviso + estatus "Con proveedor externo" mientras se espera el servicio.
- **Verificación:** `node -c`/`npm run build` sin errores. El usuario confirmó el flujo completo en `localhost:3000` antes de aprobar.
- **Commit(s):** `3199224`

### 2026-08-03 — FIX: un ticket ERP asignado a un analista no lo podía tocar el otro (ni gestionar), y Sistemas sí podía entrar a ERP
- **Qué pasó:** el usuario reportó que ERP tenía un ticket que no podían cerrar — la causa: `canManageTicket()` solo dejaba tocar un ticket a quien lo tenía asignado (o un admin de Sistemas, vía `role === 'admin'`); Sistemas SÍ tenía privilegio de "equipo" para gestionar cualquier ticket de Sistemas entre ellos, pero ERP nunca lo tuvo — un ticket asignado a analista.erp quedaba fuera del alcance de lider.erp, y viceversa. Al mismo tiempo, cualquier admin de Sistemas SÍ podía entrar a un ticket ERP, justo lo contrario de lo que el usuario confirmó como regla: "sistemas no debería estar en ERP y viceversa, el único que debe andar en todo es gerente.sistemas".
- **Qué cambié:**
  - `backend/src/routes/tickets.js`, `canManageTicket()` — un ticket `erp` (o escalado a la cola de ERP) ahora es exclusivo del equipo de ERP entre sí (cualquiera de ellos puede gestionar cualquier ticket erp, mismo criterio de "equipo" que ya tenía Sistemas); un admin normal de Sistemas ya no entra ahí salvo que se le haya escalado de vuelta. Solo `gerente.sistemas` (o `canViewManagerDashboard`) sigue con acceso total sin excepción.
  - `frontend/src/pages/TicketDetailModal.jsx` — mismo criterio espejado en el cálculo de `canManage` (si no, los botones seguían deshabilitados en la UI aunque el backend ya lo permitiera).
  - `backend/src/models/TicketResolutionOption.js`, `backend/src/routes/tickets.js`, `frontend/src/pages/TicketsLayout.jsx` — nuevo scope `erp` para el catálogo de "¿Cómo se resolvió?" (antes ERP compartía el catálogo genérico de Sistemas, mismo tipo de mezcla que se estaba corrigiendo).
- **Verificación:** `node -c`/`npm run build` sin errores; `canManageTicket()` probado de forma aislada (sin DB) para 7 escenarios reales (lider.erp/analista.erp entre sí, admin normal de Sistemas contra un ticket erp, gerente.sistemas, un ticket erp escalado de vuelta a Sistemas, y que el comportamiento de Sistemas con sus propios tickets no cambió) — los 7 dieron el resultado esperado. El usuario probó en `localhost:3000` con la cuenta del analista/líder de ERP que NO tenía el ticket asignado, antes de confirmar.
- **Commit(s):** `f9c5d0a`

### 2026-08-03 — FIX: chat de Solicitudes de Cuenta no se actualizaba en vivo (sin polling ni push)
- **Qué pasó:** el usuario reportó "necesito refrescar para ver los cambios en vivo" en Tickets/Mesa de Ayuda en general — al investigar (logs del servidor, prueba real de push) se confirmó que el polling de Tickets (cada 5-20s) y las notificaciones push SÍ funcionan correctamente de punta a punta. El hueco real: el chat nuevo de Solicitudes de Cuenta (ver entradas del 2026-08-03 más abajo) nunca tuvo auto-refresco ni push — se me pasó agregarlo al construirlo.
- **Qué cambié:**
  - `backend/src/routes/accountRequests.js` — nuevas rutas `GET /:id` (admin) y `GET /:id/mine` (empleado) para releer la solicitud; `POST /:id/reply` ahora manda push al empleado (`submitterRef`); `POST /:id/messages` ahora manda push a todos los que administran ese tipo de cuenta (sin un solo "assignedTo" como en Ticket, se avisa a todos con el permiso correspondiente).
  - `frontend/src/components/AccountRequestChatModal.jsx` — auto-refresco cada 5s mientras el chat está abierto, mismo patrón que `TicketDetailModal.jsx`.
- **Verificación:** `node -c`/`npm run build` sin errores; ambos endpoints nuevos probados solo lectura contra producción (vía túnel SSH) con tokens sintéticos de admin y empleado; push de prueba real enviado y confirmado recibido en pantalla. El usuario probó el chat completo en `localhost:3000` antes de confirmar.
- **Commit(s):** `f131220`

### 2026-08-03 — FIX: faltaba sistemas.4 en la cadena de escalamiento
- **Qué pasó:** el usuario notó, tras probar la cadena de escalamiento recién desplegada (ver entrada de abajo), que se le había olvidado sistemas.4 (Felipe) — becario.sistemas también debe poder escalarle a él, y sistemas.4 a su vez escala a sistemas.3 o lider.infra.soporte (mismo nivel, no arriba de gerente.sistemas).
- **Qué cambié:** `backend/src/routes/tickets.js`, `getEscalationTargets()` — becario.sistemas ahora incluye "Sistemas 4" entre sus destinos; nueva rama explícita para sistemas.4 (destinos: Sistemas 3, Líder de Infraestructura y Soporte).
- **Verificación:** `node -c`; reglas re-verificadas de forma aislada (sin DB) para los 6 niveles de Sistemas — todos correctos.
- **Commit(s):** `a448208`

### 2026-08-03 — Escalamiento de Tickets: cadena fija por rol (Sistemas/ERP/BI)
- **Qué pasó:** el usuario reportó que el escalamiento de tickets (hasta hoy, un simple toggle "sí/no" a su propia bandeja) no reflejaba cómo funciona realmente el equipo — necesitaba una cadena real: quién puede escalarle a quién (o a qué área), con reglas distintas para Sistemas, ERP y BI.
- **Qué cambié:**
  - `backend/src/models/User.js` — nuevo permiso `canManageTickets` (acceso al Tablero de Tickets sin ser Administrador completo del sistema) — necesario porque `becario.sistemas` no tenía NINGÚN acceso a Tickets hoy (hallazgo durante este cambio: `role: 'viewer'`, sin permiso ERP/BI).
  - `backend/src/routes/tickets.js` — `getEscalationTargets(user)` calcula los destinos válidos de escalamiento según el rol (cuentas reales identificadas por correo, mismo patrón que `GERENTE_SISTEMAS_EMAIL`/`FELIPE_EMAIL` — no existe un campo de rol granular): becario → sistemas.3/lider.infra.soporte; sistemas.3 → lider.infra.soporte/gerente.sistemas; lider.infra.soporte → gerente.sistemas; analista.erp → lider.erp; lider.erp → gerente.sistemas; solo lider.bi → gerente.sistemas (nadie más del equipo de BI puede escalar). Cualquiera de las 3 áreas también puede escalar a otra área (ERP/BI/Sistemas) cuando el caso no le compete, o a "Proveedores" (versión ligera con nota libre — el proceso completo de proveedores/garantías queda pendiente para otra sesión). Nuevas rutas `GET /:id/escalation-targets` y `PUT /:id/escalate` (rediseñado: valida el destino elegido contra la regla del rol, reasigna el ticket si es a una persona con push de aviso, o lo deja sin asignar en la cola del área si es cruzado). `canViewTicket()` extendido para que la visibilidad respete a dónde se escaló (`escalatedToArea`).
  - `backend/src/models/Ticket.js` — nuevos campos `escalationType` (`persona`/`area`/`proveedor`) y `escalatedToArea`.
  - `backend/src/routes/auth.js`, `backend/src/routes/users.js` — `canManageTickets` incluido en el JWT firmado al iniciar sesión y otorgable desde Usuarios (solo superadministrador).
  - `frontend/src/pages/TicketDetailModal.jsx` — el bloque de "🚀 Escalamiento" ahora es un selector de destino (poblado por el backend) en vez de un botón simple.
  - `frontend/src/pages/Users.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/App.jsx` — columna/checkbox del nuevo permiso; acceso al link "Tickets" para quien lo tenga sin ser admin.
  - `frontend/src/pages/TicketsLayout.jsx` — la pestaña "Escalamiento" queda oculta para el equipo de BI que no sea lider.bi.
- **Verificación:** `node -c`/`npm run build` sin errores; `getEscalationTargets()` probado de forma aislada (sin DB) para los 9 roles reales — los 9 dieron exactamente la cadena esperada; endpoints probados solo lectura contra producción (vía túnel SSH) confirmando el gate de acceso y los destinos por rol. El usuario probó el flujo completo (incluyendo activar `canManageTickets` para becario.sistemas, un cambio real de producción avisado y confirmado antes de ejecutarlo) en `localhost:3000` antes de aprobar.
- **Fuera de alcance de este cambio:** el proceso completo de Proveedores (catálogo, seguimiento) — hoy solo queda una nota de texto libre al escalar.
- **Commit(s):** `d5a3d94`

### 2026-08-03 — Novedades (Click): entrada para el chat de Solicitudes de Cuenta
- **Qué cambió:** `frontend/src/config/whatsNew.js` — entrada nueva, en lenguaje de usuario, para el chat de "esperando activación" de Solicitudes de Cuenta (ver las 2 entradas de arriba), sin mencionar el botón "Finalizar" (solo le importa al admin, no al empleado).
- **Por qué:** mantenimiento normal de esa lista — cada cambio visible para el empleado necesita su entrada ahí para que Click pueda contestar bien si le preguntan "qué hay de nuevo".
- **Commit(s):** `cfb38fd`

### 2026-08-03 — FIX: faltaba forma de cerrar el chat de "esperando activación" en Solicitudes de Cuenta
- **Qué pasó:** el usuario probó el feature recién desplegado de chat de Solicitudes de Cuenta (ver entrada de arriba) con el caso real de Maria Itzel González — ya le puso la cuenta y coordinó con ella por el chat, pero no había ninguna forma de dar la solicitud por terminada: el diseño original solo contemplaba `pendiente → esperando_activacion` (vía aprobar) y el chat en sí, sin ninguna ruta de vuelta a un estatus final.
- **Qué cambié:**
  - `backend/src/routes/accountRequests.js` — nueva ruta `PUT /:id/finish` (mismo permiso que aprobar/rechazar/responder vía `assertCanManage`), solo válida si el estatus es `esperando_activacion`, la deja en `aprobada`.
  - `frontend/src/components/AccountRequestChatModal.jsx` (+ `.module.css`) — botón "✅ Finalizar" en el header del chat, visible solo para el admin mientras el estatus siga `esperando_activacion`; al usarlo cierra el modal.
- **Verificación:** `node -c`/`npm run build` sin errores; probado en `localhost:3000` por el propio usuario contra el caso real de Maria Itzel antes de confirmar.
- **Commit(s):** `abb9d2c`

### 2026-08-03 — Solicitudes de Cuenta (Gmail/Plataformas/ERP): chat tras aprobar, antes de darla por terminada
- **Qué pasó:** el usuario pidió que al aprobar una Solicitud de Cuenta ya no quede directo como "aprobada" — a veces falta coordinar algo con el empleado para terminar de configurar la cuenta (el caso concreto: pedirle su AnyDesk para instalar Gmail/la plataforma en su equipo remotamente). Aplica a los 3 tipos (Gmail, Plataformas, ERP), no solo Plataformas.
- **Qué cambié:**
  - `backend/src/models/AccountRequest.js` — nuevo estatus `esperando_activacion` (entre `pendiente` y `aprobada`/`rechazada`) y campo `messages` (mismo patrón que `Ticket.messages`, pero solo texto).
  - `backend/src/routes/accountRequests.js` — `PUT /:id/approve` ahora deja el estatus en `esperando_activacion` en vez de `aprobada`; nuevas rutas `POST /:id/messages` (empleado, valida que la solicitud sea suya vía `submitterRef`) y `POST /:id/reply` (admin, valida permiso por `requestType` con `assertCanManage`).
  - `frontend/src/components/AccountRequestChatModal.jsx` (+ `.module.css` propio y autocontenido, sin depender del CSS de la página que lo monte — mismo tipo de bug de clases cruzadas ya visto hoy en otros componentes) — modal de chat compartido entre panel admin (`AccountRequests.jsx`) y portal de empleado (`MisSolicitudes.jsx`), decidido por prop `role`.
  - `frontend/src/pages/AccountRequests.jsx` — botón "💬 Chat" en vez de "Aprobar" cuando el estatus ya es `esperando_activacion`.
  - `frontend/src/pages/MisSolicitudes.jsx` (+ `.module.css`, nueva clase `.pillBlue`) — la fila es clickeable y abre el mismo chat cuando su solicitud está en `esperando_activacion`.
- **Verificación:** `node -c` en los archivos de backend; `npm run build` del frontend sin errores; probado en `localhost:3000` (backend local vía túnel SSH contra Mongo real de producción) por el propio usuario, aprobando/chateando de ambos lados. El usuario confirmó que funciona antes de este commit.
- **Nota:** por separado, se transicionó a mano el `_id: 6a70eebb380488c99b59ca7c` (solicitud de Gmail de Maria Itzel González, ya aprobada con el flujo viejo) de `aprobada` a `esperando_activacion`, para poder usar el chat con ella de inmediato — avisado y confirmado explícitamente con el usuario antes de ejecutarlo (regla de escritura en producción de `CLAUDE.md`).
- **Commit(s):** `c6c6caa`

### 2026-08-03 — FIX: Cuentas Compartidas siempre mostraba "Sin activar", incluso ya activadas
- **Qué pasó:** el usuario reportó que aunque las tablets ya estaban activadas y en uso (TEPOTZOTLAN III/IV, activadas ese mismo día), la columna "Acceso al portal" seguía mostrando "Sin activar" para todas. La causa: `CuentasCompartidas.jsx` comparaba `acc.password` para decidir el estado — pero `GET /employees` nunca manda ese campo (se excluye a propósito por seguridad desde el 2026-07-14, `.select('-password')`), así que esa comparación daba `undefined` (falso) siempre, sin importar la realidad. `Employees.jsx` ya usaba correctamente `passwordSetAt` (una fecha, no sensible, sí viaja) — aquí no.
- **Qué cambié:** `frontend/src/pages/CuentasCompartidas.jsx` — la columna ahora compara `acc.passwordSetAt`.
- **Verificación:** contra producción (solo lectura, vía túnel SSH) — de las 6 cuentas compartidas reales, 5 tienen `passwordSetAt` real (incluidas TEPOTZOTLAN III/IV, activadas hoy) y solo "RECEPCIÓN PISO 16" genuinamente no se ha activado; con el bug viejo las 6 se veían igual de "Sin activar".
- **Commit(s):** `615a316`

### 2026-08-03 — FIX: subir imágenes/videos (Notas internas, capturas) fallaba desde la migración a AWS — nginx cortaba la petición en 1MB
- **Qué pasó:** el usuario reportó que ya no podía adjuntar una imagen a una Nota interna ("antes sí me dejaba") — el error mostrado era el genérico de respaldo ("No se pudo agregar la nota"), y los logs del backend no mostraban absolutamente nada para ese intento, ni siquiera un rechazo. Eso apuntaba a que la petición nunca llegaba al backend. Se confirmó revisando `frontend/nginx.conf` (el proxy que quedó entre el navegador y el backend desde la migración a AWS del 2026-08-02) — nunca se configuró `client_max_body_size`, así que aplicaba el default de nginx: **1MB**. Cualquier captura de pantalla o adjunto de Notas internas (hasta 80MB permitidos por el propio backend, ver `uploadNoteAttachment` en `tickets.js`) se rechazaba ahí mismo, antes de llegar al backend — de ahí que no quedara ningún rastro en sus logs, y por qué "antes sí dejaba": Vercel + Render (de donde veníamos) nunca tuvieron esta capa de nginx en medio, así que este límite jamás había aplicado.
- **Qué cambié:** `frontend/nginx.conf` — `client_max_body_size 100M;` en el bloque `location /api/` (cubre con margen el límite más grande que ya existe en la app, 80MB).
- **Verificación:** antes de recrear el contenedor en producción, se construyó la imagen nueva y se corrió `nginx -t` dentro de ella (sin tocar el contenedor en vivo) para confirmar que la sintaxis es válida antes de cortar sobre el proxy que sirve todo el sitio.
- **Commit(s):** `d019058`

### 2026-08-03 — FIX: Telegram volvía a avisar por CADA mensaje de una conversación (inundaba el grupo "Avisos")
- **Qué pasó:** el usuario reportó (con captura real del grupo "Avisos" de Telegram) 5 avisos de "Nuevo mensaje en TICK-EA7A47" en 8 minutos, todos de la misma conversación con un empleado — sintió que se había vuelto a romper el pedido del 2026-07-28 ("Telegram es para avisos, no para mandar el chat completo"). Se revisó el código real (local y lo que corría en el servidor, coincidían) — el texto del mensaje en sí seguía sin filtrarse ahí (ese fix de 2026-07-28 seguía intacto), pero nunca se había quitado el aviso GENÉRICO por cada mensaje individual — con una conversación activa de varios mensajes, eso se sentía exactamente igual de invasivo para el grupo compartido.
- **Qué cambié:** `backend/src/routes/tickets.js`, `POST /:id/messages` — se quitó por completo el `notifyTelegram` de "Nuevo mensaje en {folio}". El push privado a quien tiene asignado el ticket (ya existía, 2026-07-24) sigue avisando en tiempo real sin llenar el grupo compartido.
- **Trade-off, a propósito:** un ticket que sigue SIN asignar ya no dispara ningún aviso al recibir un mensaje de seguimiento (antes Telegram era el único aviso para ese caso) — el aviso de "ticket nuevo" (`POST /mine`) sigue avisando al crearse; si esto deja huecos reales sin asignar, avisar para agregar de vuelta un aviso puntual solo para ese caso.
- **Verificación:** `node --check`; reload local (nodemon) sin errores.
- **Commit(s):** `f51f285`

### 2026-08-03 — Tickets de BI (Bases de Datos/Proyecto): la conversación se ve y se responde desde Tickets, no en las páginas de BI
- **Qué pasó:** el usuario (Sistemas) reportó que no podía ver el chat de una solicitud de Bases de Datos. Investigando junto con él se aclaró el alcance real: desde el 2026-07-30, un admin normal de Sistemas ni siquiera podía ver tickets `soporte_bi` en absoluto (excluidos de `GET /tickets`, y la página `/bi/*` bloqueada por rol) — y aunque BI sí tenía acceso a sus propias "Bases de Datos"/"Proyectos", el usuario pidió ir más allá: "aunque son solicitudes, su funcionamiento interno como Sistemas es en ticket" — quiere la conversación completa unificada en el Tablero de Tickets (igual que ya pasaba con "Soporte" desde el 2026-07-30), y que las páginas especializadas de BI queden como historial/área de trabajo (aprobar, etapas, entregar archivo), sin duplicar el chat ahí.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — `canViewTicket()`, `GET /tickets` y `GET /tickets/counts-by-asset` ya no excluyen `soporte_bi` para un admin normal (solo `erp` sigue exclusivo de lider.erp/analista.erp). BI-only (`isBiOnlyUser`) sin cambios — sigue viendo sus 3 caminos vía `ticketType === 'soporte_bi'`.
  - `frontend/src/pages/TicketsLayout.jsx` — se quitó el filtro que acotaba a BI-only a solo `biRequestKind: 'soporte'` en el Tablero genérico; ahora ve sus 3 caminos completos ahí (necesario para poder platicar, ya que la conversación se quitó de sus páginas especializadas).
  - `frontend/src/components/BiRequestDetailModal.jsx` (usado por Bases de Datos y Proyectos) — se quitó la sección "Conversación"/"Responder" (duplicaba `POST /:id/reply`); en su lugar, una nota que remite al folio en Tickets.
  - `frontend/src/config/ticketCategories.js` — la categoría "Soporte BI" del wizard de Reportar Ticket no reconocía "excel"/"powerbi" como palabras clave (solo "power bi") — alguien buscando ayuda con Excel (que BI sí atiende en la práctica) no encontraba que esto también aplicaba. Se agregaron y se actualizó la descripción.
- **Verificación:** `npm run build` sin errores; probado contra producción (solo lectura, vía túnel SSH) con un JWT de admin normal y uno de BI-only firmados localmente — ambos ven ahora el único ticket real `soporte_bi` (`TICK-469C8B`, Bases de Datos) con su mensaje, antes invisible para el admin normal. El usuario lo confirmó en `localhost:3000` antes de aprobar.
- **Commit(s):** `b0e9fa4`

### 2026-08-03 — FIX: deploy-tags.json no se actualizó en 2 deploys seguidos (el aviso de "Actualizar" no se mostraba)
- **Qué pasó:** después de deployar los 2 cambios de abajo (Indicadores, luego login/tickets), el usuario reportó que `activos.eup.com.mx` seguía viéndose como antes. Se confirmó contra el servidor real (`curl` directo al bundle JS que sirve nginx, sin pasar por el navegador) que el deploy SÍ había funcionado — el archivo servido ya traía las cadenas nuevas esperadas y el contenedor se había recreado hacía minutos — así que el problema no era el deploy en sí.
- **Causa real:** `frontend/public/deploy-tags.json` se había quedado con el hash de antes de esta sesión (`f716f77`) en los 2 deploys — nunca se actualizó. El filtro por área de `UpdateToast.jsx` (ver entrada 2026-07-30 más abajo) compara ese archivo contra lo que había cuando se cargó la página; si no cambia, el aviso de "Actualizar" no se muestra aunque el Service Worker sí tenga la versión nueva esperando — exactamente el caso documentado ahí mismo como riesgo ("si se me olvida, el aviso puede aparecer de más, nunca de menos").
- **Qué cambié:** se subieron ambos tags (`sistema`/`mesa`, los 2 cambios de hoy tocaron ambas áreas) al hash del commit más reciente.
- **Verificación:** `curl https://activos.eup.com.mx/deploy-tags.json` confirmó el hash nuevo después del deploy.
- **Commit(s):** `311c486`

### 2026-08-03 — Mesa de Ayuda: login acepta cualquier dominio de correo; un ticket ya no cierra hasta que el empleado califica
- **Qué pasó:** el usuario reportó 2 problemas reales. (1) El login del portal solo dejaba escribir la parte antes de la "@" cuando el dominio real era `@selectshop.com.mx` — para cualquier otro dominio del grupo (ej. Medical Store) había que escribir el correo completo, a diferencia de selectshop. (2) Un ticket quedaba "cerrado" en cuanto Sistemas lo resolvía (desde el 2026-07-27), antes de que el empleado calificara la atención — pidió que el cierre real dependa de que el empleado SÍ califique; si no califica, no se cierra.
- **Qué cambié:**
  - `backend/src/routes/employeeAuth.js` — `findByUsername()` ya no depende de que el frontend adivine el dominio: si lo escrito no trae "@", busca la parte de antes de la "@" contra CUALQUIER correo corporativo ya registrado, sin importar el dominio. Si hay más de una coincidencia (dos personas con el mismo usuario en dominios distintos), rechaza con 409 y pide el correo completo.
  - `frontend/src/components/EmployeeLoginWidget.jsx` — se quitó `resolveUsername()` (anteponía `@selectshop.com.mx` a fuerzas); se manda tal cual lo escrito, el backend resuelve el dominio.
  - `backend/src/routes/tickets.js` — "Marcar como resuelto" ya deja el ticket en `resuelto`, no en `cerrado` (revierte esa parte puntual del cambio del 2026-07-27). `POST /:id/satisfaction` ahora exige `status === 'resuelto'` (antes `'cerrado'`) y, al guardar la calificación, es quien pasa el ticket a `cerrado` — calificar es lo que cierra, no al revés. El push y el contador de "pendiente calificar" (`GET /mine/pending-rating-count`) se movieron del gatillo `cerrado` al gatillo `resuelto`. El respaldo de cierre automático a los 5 días sin actividad (`autoCloseStaleResolved`) se deja igual — sigue siendo la única forma de que un ticket cierre sin calificación, si el empleado nunca vuelve a entrar.
  - `frontend/src/pages/TicketDetailModal.jsx` — se quitó el botón manual "Cerrar ticket" (Sistemas ya no puede forzar el cierre); botones renombrados ("Marcar como resuelto"/"Confirmar resolución").
  - `frontend/src/pages/MisTickets.jsx` — la encuesta CSAT y la etiqueta "pendiente calificar" ahora se muestran con `status === 'resuelto'` sin calificar (antes `'cerrado'`).
  - `frontend/src/pages/ManualMesaDeAyuda.jsx` — secciones 8.4/8.5 actualizadas para reflejar que calificar es lo que cierra el ticket.
- **Verificación:** `npm run build` sin errores; probado en local contra un backend conectado por túnel SSH de solo lectura a la base de datos real de producción (nunca se escribió nada), confirmando el flujo completo antes de deployar; el usuario lo revisó en `localhost:3000` antes de aprobar.
- **Commit(s):** `e973e21`

### 2026-08-03 — Indicadores: filtros unificados en un panel + drill-down muestra quién tiene cada tipo de activo
- **Qué pasó:** el usuario reportó que los filtros de Indicadores se veían "esparcidos". Causa real: la barra de chips (Sucursal/Departamento) usaba clases CSS (`filterBar`/`chip`/etc.) que se habían borrado por error el 2026-07-30 al limpiar el filtro que se quitó del Inicio general (`Dashboard.jsx`) — `Indicadores.jsx` seguía usando esas mismas clases, así que los botones se veían sin ningún estilo. Además pidió que, al elegir una sucursal, se pudiera ver información completa — ej. "de Tepotzotlán II, cuántos tienen laptop y quiénes son".
- **Qué cambié:**
  - `frontend/src/pages/Dashboard.module.css` — nuevas clases `.indFilterBar`/`.indFilterField`/`.indClearBtn` (con su modo oscuro), en vez de las clases muertas.
  - `frontend/src/pages/Indicadores.jsx` — la barra de chips se reemplaza por un panel con 2 selectores (Sucursal, Departamento) + "Limpiar filtros". Nuevo cómputo `employeesByType` (derivado de `filteredAssign`, que ya respeta ambos filtros): al entrar a Activos por categoría → tipo con un filtro activo, en vez del desglose "por sucursal" (redundante si ya se filtró una) se muestra la lista real de personas con ese tipo de activo (nombre, marca/modelo/serie), clicleable a su ficha. Sin filtro, se mantiene el comportamiento anterior (desglose por sucursal).
- **Verificación:** `npm run build` sin errores. Probado en local (backend conectado por túnel SSH de solo lectura a la base real, sin escribir nada) contra datos reales: Tepotzotlán II → Laptop → 26 personas, con nombre y equipo. El usuario lo confirmó en `localhost:3000` antes de aprobar.
- **Commit(s):** `b12ca24`

### 2026-08-02 — Migración de infraestructura: de Vercel + Render + MongoDB Atlas a AWS (EC2 self-hosted)
- **Qué cambió:** toda la app se dockerizó y se movió a un solo EC2 en AWS (`i-0a9ebde3eaf58b188`, us-east-1) corriendo por Docker Compose — nginx (frontend) + backend Node/Express + MongoDB 7 self-hosted, dominio `activos.eup.com.mx` con TLS real (Let's Encrypt). Base de datos migrada de Atlas a Mongo self-hosted (`mongodump`/`mongorestore`, verificado documento por documento). Respaldo automático diario a S3 (`ops/backup-to-s3.sh`, 90 días de retención). Secretos en AWS Secrets Manager (`assets-manager/backend-env`), el EC2 los lee vía su rol IAM, sin Access Keys guardadas. Nuevos `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `frontend/nginx.conf`, y `ops/MIGRACION-AWS.md` (documento de referencia completo de la arquitectura nueva — léase ahí el detalle, esta entrada es solo el resumen).
- **Por qué:** decisión del usuario de dejar de depender de Render/Vercel/Atlas (planes gratuitos, cold starts, sin control de la infraestructura) y tener todo en un solo servidor propio.
- **Nota:** esta migración no se registró en su momento con una entrada propia — se agrega ahora (2026-08-03), de forma retroactiva, al notar que el "Resumen rápido del proyecto" de arriba se había quedado desactualizado (seguía diciendo Vercel/Render/Atlas) una vez ya migrado.
- **Commit(s):** `2f5df17`, `70342f5`, `5ea35a4`

---

### 2026-07-31 — FIX: adjuntos que fallan al cargar no mostraban ningún aviso
- **Qué cambió:** `MessageAttachmentImage.jsx` (usado para mostrar/
  descargar cualquier adjunto: mensajes de tickets, notas internas, y la
  base de datos que entrega BI) — si la petición del archivo fallaba, el
  componente devolvía `null` sin ningún aviso ni forma de reintentar; la
  persona veía la sección completamente vacía. Ahora, si falla, se ve
  "⚠️ No se pudo cargar [archivo]" con un botón "Reintentar".
- **Por qué:** reporte real del usuario — un empleado (Lilly) no veía el
  archivo de una Solicitud de Bases de Datos ya entregada por BI.
  Confirmé que el backend, la base de datos y el deploy de Render están
  perfectamente bien (probé la descarga real contra Render: 200 OK, 1.5MB,
  contenido correcto) — el bug real es que, si algo falla del lado del
  navegador de quien reporta (sesión vieja, red, etc.), este componente no
  avisa nada, dejando pensar que "no hay archivo" en vez de "algo falló".
- **Commit(s):** `f716f77`

---

### 2026-07-31 — BI: panel del líder, catálogo de resoluciones propio, aprobar/rechazar Bases de Datos, Trello en Proyectos
- **Qué cambió:**
  1. Panel "Mi Equipo" (`frontend/src/pages/BiEquipo.jsx`, nuevo) — solo
     para el líder de BI (`User.canViewBiTeamDashboard`, nuevo permiso
     root-gated): supervisa qué hace y cómo resuelve su equipo (Bases de
     Datos/Proyectos/Soporte), y por separado — aclarado explícito por el
     usuario — cómo le reporta SU EQUIPO a Sistemas cuando ELLOS
     necesitan soporte como empleados (nueva ruta
     `GET /tickets/bi-team/reports`, usa `originalTicketType`/
     `reassignedByName` ya existentes como métrica de "reportó mal").
  2. Catálogo de resoluciones propio de BI (ej. "Ayuda con Excel") para
     cerrar tickets `biRequestKind: 'soporte'` — `TicketResolutionOption`
     gana un campo `scope` (`general`/`bi`); `GET /resolution-options`
     acepta `?scope=` y `PUT /:id/status` lo asigna solo según el
     `ticketType` del ticket que se resuelve.
  3. Aprobar/Rechazar una solicitud de Bases de Datos (`PUT
     /:id/bi-approve` / `/:id/bi-reject`, mismo shape que
     `resourceRequests.js`) antes de trabajarla; `POST /:id/bi-deliver`
     ahora exige estar aprobada y deja el ticket en `status: 'cerrado'`
     (no `'resuelto'`) al entregar el archivo — así se ve como "cerrado"
     en Mis Solicitudes, no como "resuelto".
  4. Drag-and-drop estilo Trello en Proyectos (`BiProjects.jsx`) — HTML5
     nativo (no hay librería de DnD en el repo), llama la misma
     `PUT /:id/bi-stage` que ya usaba el selector de etapa.
- **Por qué:** pedido explícito del usuario, ya con el líder de BI dado
  de alta y su equipo de 3 personas usando el sistema: "el líder debe
  tener un apartado como el gerente en donde supervise a su gente...
  sobre todo, cómo nos reportan a sistemas, porque andan reportando muy
  mal" + "un catálogo de resoluciones de BI como ayuda con Excel" + "en
  la solicitud de base de datos, me debería dejar aprobar, rechazar...
  y cambiar el status de pendiente a cerrado" + "en proyectos que pueda
  hacer ediciones en las tarjetas estilo Trello".
- **Probado en vivo contra Mongo real**: usuarios/tickets `_TEST_`
  desechables (líder de BI, ticket reportado como empleado y
  reclasificado, ticket `soporte` resuelto con catálogo nuevo, 3
  solicitudes `bases_datos` — una aprobada+entregada, una rechazada, una
  sin aprobar para confirmar que `bi-deliver` la bloquea) — 20/20
  verificaciones en verde, incluida la autorización 403 para BI-only sin
  el permiso nuevo. Limpieza completa al final (Users/Tickets/opción de
  catálogo + el archivo de prueba en GridFS `biDeliverables`).
- **Commit(s):** `dec825a`

---

### 2026-07-31 — ⚠️ FIX urgente: Tickets tardaba hasta 3 minutos en cargar (para todos)
- **Qué pasó:** el usuario reportó que el sistema de tickets no
  respondía y que iniciar sesión tardaba mucho — hasta 3 minutos según
  una captura real (`Inicio` de Tickets atorado en "Cargando...").
- **Diagnóstico en vivo** (no tenía nada que ver con los cambios de
  permisos de hoy/ayer): medí la query real que usa `GET /tickets`
  contra la base de producción — **58 segundos** para traer 26-32
  tickets. Aislé la causa: NINGÚN listado de tickets excluía los campos
  Buffer que se guardan embebidos directo en cada documento (captura del
  reporte, comprobante bancario de "Alta de Proveedores", el .docx
  generado de Solicitud de Proyecto BI) — con solo ~32 tickets en toda
  la colección pero varios con adjuntos, el promedio ya era ~200KB por
  documento, y traer esos bytes en cada carga (incluido el refresco
  automático cada 20s) resultó muchísimo más lento de lo esperado.
  Confirmé la causa exacta probando la MISMA query con `.select()`
  excluyendo esos campos: **1 segundo** (58x más rápido), mismos
  resultados.
- **Qué implementé** (`backend/src/routes/tickets.js`): nueva constante
  `LIST_EXCLUDE_FIELDS` (excluye `attachmentData`/`bankProofData`/
  `biDocData`/`messages.attachmentData`), aplicada a los 4 listados de
  tickets (`GET /`, `GET /mine`, `GET /mine/bi-requests`,
  `GET /mine/external-requests`). Ninguno de estos 4 necesita los bytes
  reales — el frontend solo usa `*MimeType`/`*FileName` (para saber si
  hay algo que mostrar); el contenido se sigue pidiendo aparte, bajo
  demanda, por las rutas dedicadas que ya existían
  (`GET /:id/attachment`, `/:id/bank-proof-attachment`,
  `/:id/bi-document`, `/:id/messages/:messageId/attachment`) cuando
  alguien de verdad abre ese adjunto — nada de esto cambió.
- **Probado en vivo contra Mongo real**, con la query exacta de cada
  ruta: de 58s+ a ~1s, mismo número de resultados, campos de bandera
  (`attachmentMimeType`) intactos.
- **Commit(s):** `433dc5f`

---

### 2026-07-30 — "Soporte" BI ahora es un ticket real, como Sistemas y ERP
- **Qué pasó:** el usuario corrigió la página `BiSoporte.jsx` que se
  había construido: "el soporte debe ser un ticket como el que tiene
  sistemas y erp, habilítale esa pestaña y no la que tienes, eso no me
  sirve" — quería que el camino "Tengo una duda o problema" use el mismo
  Tablero/Chats/SLA/Escalamiento que ya usan Sistemas y ERP (mismo
  patrón que ERP-only ya reutiliza `/tickets` filtrado), no una tabla
  aparte hecha a mano.
- **Qué implementé:**
  - `frontend/src/App.jsx` — `TicketsRoute` ahora también deja entrar a
    BI-only a `/tickets` (antes solo admin/ERP-only). Se quitó la ruta
    `/bi/soporte` y se borró `BiSoporte.jsx`.
  - `frontend/src/pages/TicketsLayout.jsx` — para BI-only, los tickets
    cargados se acotan a `biRequestKind: 'soporte'` (Bases de
    Datos/Proyectos siguen viviendo solo en sus páginas especializadas,
    no se duplican aquí); Monitoreo/Aplicaciones Internas/Cuentas
    Compartidas/Impresoras se ocultan para BI igual que ya se ocultan
    para ERP-only (`biHidden`, mismo patrón que `erpHidden`).
  - `frontend/src/components/Layout.jsx` — el nav plano de BI-only
    cambia "Soporte" por "Tickets" (apunta a `/tickets`, igual que
    "Tickets ERP" en el nav de ERP-only).
  - `frontend/src/pages/BiLayout.jsx`/`BiRequestDetailModal.jsx` — se
    quitó todo el manejo de `biRequestKind: 'soporte'` (ya no llega
    tráfico de ese tipo a estas páginas especializadas).
  - `frontend/src/pages/ticketShared.js` (ya traía la entrada de
    `soporte_bi` agregada en el cambio anterior) sigue dándole ícono y
    etiqueta reales en el tablero genérico.
- Se verificó que `TicketDetailModal.jsx`/`TicketCard.jsx`/
  `TicketsBoard.jsx` no tienen ninguna referencia a los campos de BI
  (`biRequestKind`/`biProjectData`/etc.) — un ticket de "Soporte" pasa
  por ahí exactamente como cualquier ticket normal (asunto, descripción,
  conversación, prioridad, SLA, resolución), sin ningún adaptador
  especial.
- **Commit(s):** `b2c1e8b`

---

### 2026-07-30 — Corrección: Infraestructura y Soporte, ERP y BI son 3 flujos separados de verdad
- **Qué pasó:** el usuario corrigió el alcance de todo lo de BI: "el área
  de Sistemas se consolida en Infraestructura y Soporte, ERP y BI...
  aunque somos parte de la misma área, trabajamos en diferentes cosas" —
  Infraestructura y Soporte NO tiene por qué ver el trabajo de BI ni de
  ERP, y viceversa, igual que ya estaba bien resuelto para ERP. Lo que se
  había construido dejaba dos huecos reales:
  1. Cualquier admin normal (Infraestructura y Soporte) seguía viendo los
     tickets de `soporte_bi` en su propio tablero de Tickets — solo se
     excluía `erp` de esa rama, no `soporte_bi`.
  2. El botón "BI" y las páginas `/bi/*` eran visibles para CUALQUIER
     admin (`role === 'admin'`), no solo para BI o el gerente.
  3. **Bug encontrado de paso**: por el mismo motivo del punto 1,
     `Gerencia.jsx` (que pidió el propio usuario) nunca había mostrado
     tickets de ERP en su sección de Tickets — el gerente caía en la
     misma rama "todos menos erp" que cualquier otro admin.
- **Qué implementé** (`backend/src/routes/tickets.js`):
  - `canViewTicket()` y `GET /` ahora reparten en 3 flujos reales:
    ERP-only ve solo `erp`; BI-only ve solo `soporte_bi`; Infraestructura
    y Soporte (el resto) ve todo MENOS esos 2; y quien tiene
    `canViewManagerDashboard` (gerente.sistemas) ve los 3 sin filtro —
    corrige el punto 1 y el bug del punto 3 de un jalón.
  - `GET /counts-by-asset` con el mismo criterio.
  - `frontend/src/pages/ticketShared.js` — se agregó una entrada real
    para `soporte_bi` en `TICKET_TYPE_CONFIG` (antes cayía en el ❓
    genérico) — ahora que el gerente los ve mezclados con el resto en
    `/tickets`, necesitaban su propio ícono/etiqueta.
  - `frontend/src/components/Layout.jsx`/`App.jsx` — el botón "BI" y la
    ruta `/bi/*` ya NO son visibles para cualquier admin: solo BI-only y
    quien tiene `canViewManagerDashboard`.
- **Sin tocar** (fuera de alcance, no se pidió): los permisos de ERP que
  ya tenían de antes `sistemas.3`/`lider.infra.soporte`
  (`canManagePlatformAccountsErp: true`, configurado antes de esta
  sesión) — si también se quiere revisar esa separación, es un cambio
  aparte sobre cuentas reales, no algo que deba decidir solo.
- **Probado de verdad contra Mongo:** con 3 cuentas de prueba (admin
  normal, BI-only, gerente) y 3 tickets de prueba (uno de cada tipo), se
  confirmó que cada quien ve exactamente lo que debe en `GET /tickets`,
  y que un admin normal recibe 404 al intentar abrir por su `_id`
  directo un ticket de BI o de ERP, mientras el gerente sí puede — todo
  limpiado al terminar.
- **Commit(s):** `fae4994`

---

### 2026-07-30 — BI: 3ra opción "Soporte" + entrega real de bases de datos
- **Qué pidió el usuario:** "ellos también... hacen soporte pero de
  exceles" (confirmando que el caso de Ovadia necesitaba una 3ra opción
  en el wizard, no solo Proyecto/Bases de Datos) y "deberían gestionar
  las bases de datos en la aplicación y brindarlas para que en mesa de
  ayuda... cuando abran el ticket ahí esté la BD... como ERP pero ahora
  BI".
- **Qué implementé:**
  - **3ra opción del wizard "Tengo una duda o problema"**
    (`biRequestKind: 'soporte'`) — sin formulario elaborado, un texto
    libre que se manda como cualquier ticket normal. Nueva página
    "Soporte" en el panel de BI (lista simple, sin etapas — usa el
    status genérico de siempre) y el detalle correspondiente en
    `BiRequestDetailModal.jsx`.
  - **Entrega real del archivo** — nuevo `POST /:id/bi-deliver` (solo
    para `bases_datos`): BI sube el Excel/CSV/PDF real, se guarda en
    GridFS (bucket `biDeliverables` — se generalizó
    `backend/src/utils/gridfs.js` para aceptar bucket, antes solo servía
    a Notas internas) y en un solo paso avanza a "Entregado" +
    `status: 'resuelto'`. Nuevo `GET /:id/bi-deliverable`, mismo patrón
    dual admin/empleado que ya usan los adjuntos de mensajes.
  - **Vista del empleado** — `MisSolicitudes.jsx` ya no muestra Soporte
    BI como fila plana sin clic: ahora abre
    `BiSolicitudDetailModal.jsx` (nuevo), con los datos de la solicitud,
    el archivo entregado (si ya existe) y la conversación con BI —
    "que cuando abran el ticket ahí esté la BD".
  - `BiPreview.jsx` — se exportaron `ProjectPreview`/`DatabasePreview`
    (antes privadas) para reusar esa misma lógica de solo-lectura en la
    vista del empleado.
- **Bug real encontrado de paso (no se tocó, fuera de alcance):**
  `MisTickets.jsx` le pasa `ticketId`/`messageId` a
  `MessageAttachmentImage`, que en realidad espera `url` — los adjuntos
  de mensajes en Mis Tickets están rotos hoy. Se evitó repetir el
  mismo error en el código nuevo.
- **Probado de verdad contra Mongo:** se entregó un CSV de prueba real
  (`POST /:id/bi-deliver`), se descargó con token de BI, con el
  empleado dueño (200) y con un empleado que NO es dueño (403 —
  "Este ticket no es tuyo"), se confirmó que el contenido descargado
  coincide byte a byte, que `biStage`/`status` se actualizan solos, y
  que el ticket de "Soporte" se resuelve con `PUT /:id/status` como
  cualquier ticket normal — todo limpiado al terminar (incluido el
  archivo de GridFS, verificado en 0 después).
- **Commit(s):** `25c666e`

---

### 2026-07-30 — BI entra al sistema: permiso propio + páginas de Bases de Datos y Proyectos
- **Qué pidió el usuario:** a raíz del ticket de Ovadia (`TICK-F40BA6`,
  "no tengo Anydesk, solo requiero apoyo de BI"), meter a BI dentro del
  sistema de tickets de verdad: que gestionen sus propias solicitudes de
  bases de datos y proyectos, sin gestionar cuentas (eso sigue siendo de
  Sistemas).
- **Contexto encontrado:** la categoría "Soporte BI" ya existía con un
  wizard completo (`ReportarTicket.jsx` → `BiProjectForm.jsx`/
  `BiDatabaseForm.jsx`/`BiPreview.jsx`) y el Ticket ya guardaba datos
  estructurados (`biRequestKind`, `biProjectData`/`biDatabaseRequest`) —
  pero BI no tenía ninguna cuenta en el sistema (0 usuarios con "bi" en
  el correo) ni páginas propias; esas solicitudes cayían en el mismo
  tablero genérico de Tickets.
- **Qué implementé:**
  - `backend/src/models/User.js` — nuevo permiso `canManageBiRequests`
    (mismo patrón root-gated que los otros 5 permisos).
  - `backend/src/models/Ticket.js` — `biStage` (etapas
    recibido/en_definición/en_desarrollo/en_revisión/entregado) +
    `biStageUpdatedAt`/`biStageUpdatedByName`.
  - `backend/src/routes/tickets.js` — `isBiOnlyUser()` (mismo criterio
    que `isErpOnlyUser`), extiende `canViewTicket()`/`GET /` con una
    tercera rama para BI (sin tocar la rama de admin — Sistemas sigue
    viendo tickets `soporte_bi` igual que antes), nuevo
    `PUT /:id/bi-stage` (al llegar a "entregado" también marca
    `status: 'resuelto'`, mismo criterio que resolver un ticket normal).
  - `frontend/src/components/Layout.jsx` — `isBiOnlyUser`, nav plano
    propio para BI-only (mismo patrón que ERP-only), botón directo "BI"
    para Sistemas.
  - `frontend/src/pages/BiLayout.jsx` + `BiDatabaseRequests.jsx`
    (tabla con tipo/plataforma/tienda/periodo reales) +
    `BiProjects.jsx` (kanban por etapa) + `BiRequestDetailModal.jsx`
    (datos estructurados + selector de etapa + conversación,
    reutilizando `POST /:id/reply`).
- **Probado de verdad:** usuario BI-only de prueba solo vio los 2
  tickets `soporte_bi` (nunca el de hardware), mover a "entregado" marcó
  `resuelto` automáticamente y bloqueó más cambios de etapa — datos de
  prueba limpiados al terminar.
- **Fuera de alcance de este cambio** (quedan pendientes si se piden):
  enriquecer el formulario de intake con preguntas tipo "qué decisión
  vas a tomar con esto", y enseñarle a Click a sugerir Soporte BI en vez
  de dejarlo caer en Software genérico.
- **Commit(s):** `8617a82`

---

### 2026-07-30 — Panel Gerencial: corrección de alcance — categoría propia "Gerencia", no una pestaña en Tickets
- **Qué pasó:** la primera versión del Panel Gerencial (misma fecha, ver
  entrada "Panel Gerencial: nueva pestaña 'Equipo' en Tickets" más abajo)
  quedó mal ubicada — se entendió como "algo dentro de Tickets" cuando el
  usuario en realidad pidió "un botón de categoría donde monitoree a
  Sistemas y ERP" con TODO lo que un jefe quiere ver de su equipo, no
  solo tickets: "envíos, cuando damos las altas, las bajas, cuando damos
  las cuentas, cuando aprobamos las solicitudes de recursos, a quienes le
  brindamos responsivas... cuánto tardan los envíos desde el traslado y
  en recibido".
- **Qué implementé:**
  - Se quitó la pestaña "Equipo" de dentro de Tickets (nav de
    `TicketsLayout.jsx` + ruta anidada) y se borró
    `frontend/src/pages/TicketsEquipo.jsx` — su contenido (desglose de
    tickets por agente) se movió tal cual a la nueva página.
  - `frontend/src/pages/Gerencia.jsx` (nuevo) — página única con 8
    secciones, todas con KPIs + desglose por persona: **Tickets**
    (migrado), **Envíos** (con días promedio de traslado→recibido, dato
    real que ya guardaba `Shipment.transitAt`/`receivedAt`, solo que
    nadie lo mostraba calculado), **Altas**, **Bajas** (2 etapas: RH y
    Sistemas, sin mostrar motivo — misma regla de siempre), **Cuentas**
    (Gmail/Plataformas/ERP), **Recursos**, **Responsivas** (generada vs.
    firmada), y una **Actividad reciente** que junta eventos reales de
    las 7 áreas en un solo feed ordenado por fecha.
  - Todo se lee directo de cada colección (`GET /tickets`,
    `/shipments`, `/onboarding-requests`, `/offboarding-requests`,
    `/account-requests`, `/resource-requests`, `/responsiva-archive` —
    ya existían, sin endpoints nuevos) en vez de depender del AuditLog:
    se encontró que el AuditLog tiene huecos reales (aprobar altas y
    cuentas, y la etapa RH de bajas, no se registran ahí; responsivas no
    tiene ni entidad) — corregir eso queda fuera de este cambio, no se
    pidió.
  - `frontend/src/components/Layout.jsx` — nuevo botón directo
    "Gerencia" en la barra superior, junto a Tickets/Indicadores (mismo
    patrón: no es un dropdown de categoría), visible solo con el permiso
    `canViewManagerDashboard` que ya existía.
- **Commit(s):** `38323a8`

---

### 2026-07-30 — Aviso de "hay una versión nueva" ahora es por área (Sistema / Mesa de Ayuda)
- **Qué pidió el usuario:** "que el de actualizar no mande a actualizar
  si es del sistema a la mesa y viceversa... no le veo sentido que los
  usuarios actualicen si es en el sistema de tickets, al final cuando
  haya cambios en la mesa tendrán ya la versión nueva del sistema que
  nunca van a ver".
- **Investigación:** Sistema y Mesa de Ayuda comparten el mismo
  bundle/Service Worker (un solo `generateSW`, confirmado leyendo
  `vite.config.js` — no hay dos service workers ni chunks separados por
  área). Esto significa que el navegador NO puede distinguir por sí solo
  "cambió Mesa, no Sistema" — cualquier cambio recompila el mismo
  archivo. Se le presentaron 2 caminos al usuario (etiqueta manual vs.
  separar el código en dos paquetes de verdad) y eligió la etiqueta
  manual.
- **Qué implementé:**
  - `frontend/public/deploy-tags.json` (nuevo) — un tag por área
    (`sistema`/`mesa`) que hay que actualizar A MANO en cada commit que
    toque exclusivamente una de las dos áreas (mismo criterio que el
    hash del CHANGELOG). Si un cambio toca ambas (o no se está seguro),
    se suben los dos tags.
  - `frontend/src/components/UpdateToast.jsx` — antes de mostrar el
    aviso, además de que el Service Worker tenga una versión nueva
    (`needRefresh`), ahora también compara el tag de tu área (según la
    URL: `/mesa-de-ayuda/*` = mesa, todo lo demás = sistema) contra el
    que había cuando cargaste la página. Si no cambió, no se muestra el
    aviso. Si por cualquier motivo no se pudo leer el archivo (red,
    etc.), falla hacia "sí avisar" — nunca hacia dejar a alguien en una
    versión vieja sin decirle.
  - `frontend/vercel.json` — `Cache-Control: no-store` explícito para
    `/deploy-tags.json`, para que siempre se lea la versión más
    reciente del servidor (nunca cacheada).
- **Pendiente de mi parte, hacia adelante:** recordar actualizar
  `deploy-tags.json` en cada commit relevante — no es infalible (si se
  me olvida, el aviso puede aparecer de más, nunca de menos).
- **Commit(s):** `6e31c3e`

---

### 2026-07-30 — Tarjetas de ticket: "Hoy (resuelto)" no significaba lo que parecía
- **Qué pasó:** Felipe reportó que un ticket resuelto hace como una
  semana (`TICK-4C5B1E`) se veía como "Hoy (resuelto)" en el tablero —
  "vi que en casi todos pone hoy jaja".
- **Por qué:** `frontend/src/pages/TicketCard.jsx` usaba `daysOpen()`,
  que calcula cuánto TARDÓ el ticket en resolverse (de creado a
  resuelto), no cuánto tiempo pasó desde entonces. Un ticket resuelto el
  mismo día que se reportó (lo más común) siempre da 0, así que se veía
  "Hoy" sin importar si eso fue ayer o hace un mes. Verificado con el
  ticket real: se creó y resolvió el 24 de julio, a los pocos minutos —
  por eso "Hoy", aunque hoy ya es 30 de julio.
- **Qué implementé:** nueva función `daysAgo(date)` en
  `frontend/src/pages/ticketShared.js` (cuenta desde HOY, no entre dos
  fechas del ticket). `TicketCard.jsx` ahora usa `daysAgo(resolvedAt)`
  para tickets resueltos ("Resuelto hace 5d") y sigue usando
  `daysOpen()` sin cambios para los que siguen abiertos (ahí sí tiene
  sentido, es la misma fecha de inicio que "ahora"). El modal de
  detalle (`TicketDetailModal.jsx`) no se tocó — ahí ya estaba bien
  etiquetado ("X días para resolverse"), no tenía el mismo problema de
  ambigüedad.
- **Commit(s):** `a71db95`

---

### 2026-07-30 — Inicio general: se quita el filtro de sucursal/departamento
- **Qué pidió el usuario:** al ver el Inicio general de la app (no el de
  Tickets), pidió quitar los chips de filtro por Sucursal/Departamento —
  "eso me gusta en indicadores, no ahí".
- **Qué implementé:** `frontend/src/pages/Dashboard.jsx` — se quitó la
  barra de filtro completa y el estado `filterOffice`/`filterDept` que la
  alimentaba; las secciones de Catálogos y Activos, Cuentas y Plataformas,
  Operación y Recursos Humanos ahora siempre muestran el total global (sin
  filtrar), igual que antes de aplicar cualquier chip. `Indicadores.jsx`
  no se tocó — su propio filtro por sucursal/departamento sigue intacto,
  que es donde el usuario sí lo quiere. También se limpiaron las clases
  CSS del filtro (`.filterBar`, `.chip`, etc.) en `Dashboard.module.css`
  al quedar sin uso.
- **Commit(s):** `9ed78b5`

---

### 2026-07-30 — Tickets: "Inicio" ahora es un feed, "Dashboard" pasó a ser "Indicadores"
- **Qué pidió el usuario:** "arregla el inicio del sistema de tickets, en
  teoría es lo mismo que indicadores, deja el dashboard bien hecho para
  indicadores, a ese inicio hazlo tipo Facebook, Instagram o LinkedIn" —
  mismo tratamiento que ya se le dio al Inicio general de la app (ver
  entrada histórica de `Dashboard.jsx`/`Indicadores.jsx`).
- **Qué implementé:**
  - `frontend/src/pages/TicketsDashboard.jsx` — sin cambios de contenido,
    solo se renombró a "Indicadores" (título/ícono) y se movió de la ruta
    índice (`/tickets`) a `/tickets/indicadores`.
  - `frontend/src/pages/TicketsInicio.jsx` (nuevo) — ahora es el índice de
    Tickets (`/tickets`): saludo personalizado con hora del día, accesos
    directos a Tickets/Chats/SLA/Calificaciones/Escalamiento (y Equipo si
    tiene el permiso de Panel Gerencial), 4 KPIs resumidos con link "Ver
    Indicadores completos →", y un feed de actividad reciente (quién
    reportó/asignó/escaló/resolvió cada ticket, más reciente primero,
    clicleable para abrir ese ticket) armado directo de los tickets ya
    cargados por `TicketsLayout.jsx` — no depende de Auditoría porque esa
    solo registra acciones de Sistemas, no las del empleado que reporta.
  - `frontend/src/pages/TicketsLayout.jsx` — el nav ahora tiene "Inicio"
    (🏠) e "Indicadores" (🎯) como dos pestañas separadas.
  - `frontend/src/pages/Tickets.module.css` — estilos nuevos para el feed
    (`.greeting`, `.quickRow`/`.quickCard`, `.feedList`/`.feedItem`, etc.),
    mismo lenguaje visual que el Inicio general pero con el acento teal
    propio de este módulo.
- **Commit(s):** `dfa4a7f`

---

### 2026-07-30 — Panel Gerencial: nueva pestaña "Equipo" en Tickets
- **Qué pidió el usuario:** al dar de alta a `gerente.sistemas@selectshop.com.mx`
  (su gerente), que además de acceso total al sistema (mismos permisos que
  `sistemas.3`/`lider.infra.soporte`) tuviera un apartado propio para
  supervisar cómo está trabajando el equipo — carga de tickets, tiempos de
  atención, calificaciones — "es como auditoría pero a nivel más alto".
  Confirmado con el usuario que **solo el gerente** debe ver este panel, no
  el resto de Sistemas aunque sean admins.
- **Qué implementé:**
  - `backend/src/models/User.js` — nuevo permiso booleano
    `canViewManagerDashboard` (default `false`), mismo patrón que
    `canManageGmailAccounts`/etc.
  - `backend/src/routes/users.js` — se puede otorgar/revocar solo desde una
    cuenta "superadministrador" (`GMAIL_ROOT_EMAILS`), igual que los otros
    permisos sensibles.
  - `backend/src/routes/auth.js` — el login ahora manda este permiso en el
    JWT y en la respuesta.
  - `frontend/src/pages/Users.jsx` — checkbox nuevo "Panel Gerencial
    (Tickets → Equipo)" en el modal de alta/edición y columna en la tabla
    (visibles solo para cuentas root).
  - `frontend/src/pages/Login.jsx` — el permiso ahora sí se guarda en
    `localStorage.user` (junto a los otros 3 que ya se guardaban; noté que
    `canViewTelemetryAssets` tampoco se guardaba ahí, pero ese permiso solo
    se aplica del lado del backend, así que no le hacía falta).
  - `frontend/src/pages/TicketsEquipo.jsx` (nuevo) — pestaña "Equipo" en el
    sidebar de Tickets, gated por el nuevo permiso
    (`ManagerDashboardRoute` en `App.jsx`): KPIs del equipo completo
    (tickets totales, vencidos, días promedio de resolución, CSAT
    promedio, % de calificaciones negativas) + tabla por persona
    (asignados, abiertos, vencidos, resueltos, días y CSAT promedio,
    calificaciones negativas), exportable a Excel. Reutiliza los tickets ya
    cargados por `TicketsLayout.jsx` (mismo patrón que
    Dashboard/Calificaciones/SLA), sin endpoint nuevo.
- **Nota:** no agregué a `gerente.sistemas` a la lista de cuentas
  "superadministrador" (`GMAIL_ROOT_EMAILS`) — esa lista es la que puede
  OTORGAR permisos a otros usuarios, y el usuario solo pidió que el
  gerente TENGA los permisos, no que pueda repartirlos. Si también quiere
  eso, es un cambio aparte.
- **Commit(s):** `c582f8b`

---

### 2026-07-29 — Click: catch-all de Solicitud de Pagos ahora responde a dudas genéricas
- **Qué pasó:** el usuario reportó que si escribía "tengo dudas con el
  motivo de pago" en Click, no lo redirigía a reportar en Centro de
  Costos/Motivo de Pago — Click no encontraba nada.
- **Por qué:** en `frontend/src/config/ticketCategories.js`,
  `PAYMENT_REQUEST_SUBAREAS`, la opción catch-all "Otro tema de centros de
  costos o motivos de pago" tenía `keywords: []` — solo los problemas
  específicos de arriba (alta, modificar, "no aparece") tenían keywords, y
  todos requerían un verbo de acción puntual, así que una duda genérica no
  matcheaba nada. Se revisaron los catch-all hermanos de "usuarios" y
  "proveedores" en la misma lista y tenían el mismo hueco.
- **Qué implementé:** se agregaron keywords genéricas a las 3 opciones
  catch-all (Costos, Usuarios, Proveedores) para que cualquier mención
  suelta del tema caiga ahí en vez de perderse.
- **Verificación:** se corrió `scoreKeywords()`/la lógica de scoring de
  `helpSearch.js` de forma aislada contra la consulta exacta reportada —
  antes puntuaba 0, después puntúa 7, y las opciones específicas
  (alta/modificar/"no aparece") siguen en 0 (no hay colisión).
- **Commit(s):** `7ce6e0c`

---

### 2026-07-28 — Worky: se agrega nominas.2 a los correos
- **Qué pasó:** el usuario pidió agregar `nominas.2@selectshop.com.mx`
  a los destinatarios de los tickets de Worky.
- **Qué implementé:** `backend/src/routes/tickets.js` — `WORKY_EMAILS`
  ahora incluye también `nominas.2@selectshop.com.mx`, junto a
  `jefa.nominas@` y `nominas.5@`.
- **Commit(s):** `63e21b7`

---

### 2026-07-28 — Responsable de soporte: ahora se pueden elegir varios
- **Qué pasó:** el usuario dio de alta cuentas compartidas para las
  tablets de recepción con 3 responsables ("somos 3 los que vamos a ser
  responsables") — el campo de la entrada anterior solo aceptaba uno.
- **Qué implementé:** `backend/src/models/Employee.js` —
  `sharedAccountResponsibleUser` (un solo ID) pasó a ser
  `sharedAccountResponsibleUsers` (arreglo). `backend/src/routes/
  tickets.js` — `getTicketEmailRecipients()` ahora manda el correo a
  TODOS los configurados, no solo a uno. `frontend/src/pages/
  CuentasCompartidas.jsx` — el dropdown se cambió por una lista de
  checkboxes (uno por administrador de Sistemas).
- **⚠️ Dato de producción migrado:** `AUXILIAR DEVOLUCIONES` ya tenía a
  Felipe configurado con el campo viejo — se migró a mano al campo nuevo
  (confirmado con el usuario, respaldo `mongodump` tomado antes) para no
  perder esa configuración con el cambio de nombre del campo.
- **Commit(s):** `b1b2ccf`

---

### 2026-07-28 — Agregar usuarios por sucursal en Cuentas Compartidas
- **Qué pasó:** el usuario dio de alta 2 cuentas compartidas nuevas para
  las tablets de recepción y necesita meter en el roster a TODO el piso
  13 o TODO el piso 16 — agregarlos uno por uno sería tedioso.
- **Qué implementé:** `frontend/src/pages/CuentasCompartidas.jsx` —
  nuevo selector de sucursal + botón "Agregar por sucursal" junto al
  roster de "Usuarios autorizados": trae a todos los empleados ACTIVOS de
  esa oficina (sin duplicar contra lo que ya haya en la lista) y los
  agrega en mayúsculas, igual que el resto del roster. Se SUMA a lo que
  ya había — el alta manual de texto libre sigue exactamente igual que
  antes (pedido explícito: algunas personas del roster no están dadas de
  alta como Employee).
- **Commit(s):** `b6dc185`

---

### 2026-07-28 — Responsable de soporte configurable por Cuenta Compartida
- **Qué pasó:** un ticket de "Auxiliar Devoluciones" le llegó a
  sistemas.3 cuando debía llegarle a Felipe (sistemas.4) — el
  enrutamiento automático por oficina no tiene forma de saberlo sin que
  alguien lo diga. El usuario pidió poder configurarlo a mano por cuenta
  compartida, restringido a elegir solo entre administradores de
  Sistemas.
- **Qué implementé:** `backend/src/models/Employee.js` — nuevo campo
  `sharedAccountResponsibleUser` (ref a `User`). `backend/src/routes/
  tickets.js` — `getTicketEmailRecipients()` ahora recibe el correo de
  ese responsable y, si está configurado, GANA sobre el enrutamiento
  general (Felipe/Tepotzotlán o todo Sistemas) — no aplica a Seguridad/
  BI/apps con dueño fijo, esos ya tienen su propio enrutamiento sin
  importar quién reporta. `GET /assignable-users` ahora también regresa
  `email` (lo reusa este selector). `frontend/src/pages/
  CuentasCompartidas.jsx` — nuevo campo "Responsable de soporte" en
  Editar (dropdown de administradores de Sistemas, "— Automático —" por
  default) y columna nueva en la tabla para verlo de un vistazo.
- **Commit(s):** `afb2ec3`

---

### 2026-07-29 — Campo "Tienda" disponible para cualquier plataforma
- **Qué pasó:** en "Nueva cuenta de plataforma", el campo "Tienda" solo
  se mostraba para Mercado Libre — el usuario pidió que esté disponible
  para todas las plataformas.
- **Qué implementé:** `frontend/src/pages/PlatformAccounts.jsx` — el
  campo ya no está condicionado a `platform === 'Mercado Libre'`; sigue
  obligatorio solo ahí (una cuenta de ese marketplace no tiene sentido
  sin saber de qué tienda/seller es), y queda opcional para el resto
  (ej. un Zoom o Netflix comprado para una sucursal en particular). El
  datalist de sugerencias ahora se arma con las tiendas de CUALQUIER
  cuenta ya guardada, no solo las de Mercado Libre. El backend
  (`createAccount.js`, `PlatformAccount.js`) ya guardaba este campo sin
  importar la plataforma — no hizo falta tocarlo, solo actualicé el
  comentario del modelo para que no diga que es solo para Mercado Libre.
  Probé creando una cuenta de Zoom con tienda contra la base real antes
  de dar esto por hecho.
- **Commit(s):** `8e12f5a`

---

### 2026-07-29 — Click muestra el slide de "Iniciar sesión" cuando lo preguntan
- **Qué pasó:** el usuario pidió que cuando alguien le pregunte a Click
  cómo iniciar sesión, muestre el slide de la capacitación (PASO 1), no
  solo el texto de siempre.
- **Qué implementé:** recreé el slide como imagen (`frontend/public/
  images/paso1-iniciar-sesion.png` — no hay LibreOffice en este entorno
  para exportar el PPTX real, se reconstruyó a mano con el mismo
  texto/colores de marca). `frontend/src/config/faqData.js` — nuevo
  campo opcional `image` en `FAQ_ENTRIES`, agregado a la entrada de
  "¿Cómo inicio sesión?". `frontend/src/utils/helpSearch.js` —
  `searchFaq()` ahora incluye ese campo en el resultado (antes se
  perdía, el resultado se armaba con una lista fija de campos).
  `frontend/src/components/HelpBot.jsx` — el resultado de FAQ muestra la
  imagen cuando existe, antes del link "Ver manual completo". El campo
  es opcional — cualquier otra FAQ sin `image` se ve exactamente igual
  que antes.
- **Commit(s):** `a52cd98`

---

### 2026-07-29 — Saludo de Click, más interactivo (seguimiento del mismo día)
- **Qué pasó:** el usuario dijo que el saludo de la entrada anterior no
  se sentía muy interactivo — siempre la misma línea exacta.
- **Qué implementé:** `frontend/src/components/HelpBot.jsx` — el saludo
  ahora alterna entre 4 variantes (emoji distinto cada vez), usa la hora
  real del día ("Buenos días"/"Buenas tardes"/"Buenas noches") y saluda
  por su nombre a quien reporta cuando se puede saber quién es (nunca el
  nombre de una cuenta compartida — esa no es una persona, se deja
  genérico). Se agregó "¿Qué novedad hay?" como cuarta sugerencia, para
  que se sienta con más para ofrecer.
- **Commit(s):** `8dfb196`

---

### 2026-07-29 — Click contesta un saludo con un saludo
- **Qué pasó:** el usuario pidió que Click sea más amigable — si alguien
  le dice "hola", que conteste "hola, ¿qué necesitas?" en vez del
  fallback de "no encontré algo exacto para...", que quede solo para
  mensajes que de verdad no se reconocen (groserías, texto sin sentido).
- **Qué implementé:** `frontend/src/utils/helpSearch.js` — nueva
  `detectGreetingIntent()`, coincidencia EXACTA del mensaje completo (no
  solo `.includes()`), para que "hola, mi mouse no prende" siga
  buscando el problema real en vez de quedarse solo en el saludo.
  `frontend/src/components/HelpBot.jsx` — al detectar un saludo, Click
  contesta "👋 ¡Hola! ¿Qué necesitas?" con las mismas sugerencias del
  saludo inicial (chips), para que se sienta interactivo en vez de un
  callejón sin salida.
- **Commit(s):** `c5c3fbe`

---

### 2026-07-29 — Reportar Ticket: categorías reducidas para cuentas compartidas
- **Qué pasó:** el usuario pidió que las cuentas compartidas (tablets de
  recepción Piso 13/16, Auxiliar Devoluciones) no vean todo el catálogo
  de categorías del wizard — Accesorios, Soporte BI, Cuenta/Acceso y
  Seguridad no les aplican. De paso reportó un bug real: tocar Hardware o
  Software en esas cuentas no mostraba nada.
- **La causa del bug:** Hardware/Software/Red le preguntan primero
  "¿computadora o celular?", y esa pregunta solo muestra la opción si la
  persona tiene un activo de ese tipo asignado (`CATEGORY_ASSET_
  REQUIREMENT`). Una cuenta compartida no tiene NINGÚN activo asignado a
  su nombre, así que las dos opciones se filtraban y quedaba vacío.
- **Qué implementé:** `frontend/src/config/ticketCategories.js` — 3
  categorías nuevas ocultas (`hardware_tablet`, `software_tablet`,
  `red_tablet`, esta última por el mismo motivo aunque no se pidió
  explícito — mismo bug, mismo arreglo) con problemas propios de la
  tablet (y de Safeguarding en la de software); nuevos
  `SHARED_ACCOUNT_HIDDEN_CATEGORIES` y `SHARED_ACCOUNT_DEVICE_CATEGORY`.
  `frontend/src/pages/ReportarTicket.jsx` — para una cuenta compartida:
  el paso 2 ya no muestra Accesorios/Soporte BI/Cuenta-Acceso/Seguridad;
  Hardware/Software/Red saltan derecho a su categoría "Tablet" (sin
  preguntar Computadoras/Celulares); "Aplicaciones" solo muestra Worky.
- **Adjuntar capturas en Worky:** ya funcionaba — Worky ya estaba
  configurado con `audience: 'externo'`, y ese enrutamiento ya reenvía el
  adjunto genérico del ticket al correo (mismo mecanismo que "Alta de
  Proveedores"). Lo confirmé con una prueba real (ticket con imagen
  adjunta) antes de dar por hecho que ya funcionaba.
- **Commit(s):** `7dd7c6b`

---

### 2026-07-29 — Bajas: se salta a Sistemas sin activos, y ya no ve el motivo
- **Qué pasó:** el usuario pidió 2 cosas de "Baja de Personal": (1)
  Sistemas no tiene por qué ver el motivo de la baja (renuncia/despido/
  etc.) — eso es de RH, a Sistemas solo le toca lo de los activos; (2) si
  la persona no tiene ningún activo asignado, la solicitud ni siquiera
  debería llegarle a Sistemas — se queda resuelta en RH.
- **Qué implementé:** `backend/src/routes/offboardingRequests.js`,
  `PUT /:id/rh-approve` — ahora revisa en vivo (`Assignment.countDocuments`,
  no el `assetsSnapshot` guardado al crear la solicitud, que puede estar
  desactualizado) si la persona tiene activos asignados AHORITA. Si no
  tiene ninguno, la solicitud se marca `completada` de una vez (RH la
  cierra), sin pasar por `pendiente_sistemas`. `GET /` (cola de Sistemas)
  y las respuestas de `complete`/`sistemas-reject` ya no incluyen
  `reasons`/`reasonOther` — ni siquiera viajan a la sesión de Sistemas, no
  es solo ocultarlo en pantalla. `frontend/src/pages/
  OffboardingRequests.jsx` — se quitó la columna y el renglón de "Motivo"
  del panel de Sistemas (RH sigue viéndolo igual en `BajaPersonal.jsx`,
  eso no cambió).
- **⚠️ Bug real encontrado de paso:** al probar el caso "con activos", el
  modelo `OffboardingRequest` tronaba con `ValidationError` — el campo
  `assetsSnapshot.type` choca con la convención `typeKey` de Mongoose
  (por default, literalmente la palabra "type"), así que Mongoose
  compilaba todo el arreglo como `[String]` en silencio en vez del
  subdocumento real. En la práctica, **cualquier baja real de alguien CON
  activos asignados tronaba al crearse** — nadie lo había notado porque
  las únicas 4 solicitudes que existen hoy en producción son de prueba,
  todas con 0 activos. Se renombró a `assetType` en el modelo, la ruta
  (`buildAssetsSnapshot`) y los 2 lugares del frontend que lo leían
  (`OffboardingRequests.jsx`, `BajaPersonal.jsx`).
- **Commit(s):** `8c35301`

---

### 2026-07-29 — Click contesta "¿qué novedad hay?" con las mejoras recientes
- **Qué pasó:** el usuario quería que cuando alguien vea el aviso de
  "Actualiza la página" y le pregunte a Click qué cambió, conteste con
  las mejoras que de verdad le importan a quien reporta (una app nueva,
  una función nueva) — sin mencionar cambios puramente de desarrollo
  (colores, tamaños, ajustes visuales sueltos), esos se resumen genérico
  como "ajustes de diseño".
- **Qué implementé:** `frontend/src/config/whatsNew.js` (nuevo) — lista
  curada en lenguaje de usuario, la más reciente primero, SEPARADA del
  `CHANGELOG.md` técnico (ese es para sesiones de desarrollo, este es
  para contarle al empleado). `frontend/src/utils/helpSearch.js` — nueva
  `detectWhatsNewIntent()`. `frontend/src/components/HelpBot.jsx` — al
  detectar la intención, Click contesta con las 3 entradas más recientes.
  `HelpBot.module.css` — `white-space: pre-line` en las burbujas para que
  la lista se vea en líneas separadas.
- **Mantenimiento futuro:** cada cambio visible para el empleado necesita
  su propia entrada en `whatsNew.js`, igual disciplina que
  `CHANGELOG.md` pero en lenguaje simple — los cambios puramente
  estéticos/internos se juntan en una entrada genérica en vez de
  listarse uno por uno.
- **Commit(s):** `fa43218`

---

### 2026-07-28 — Nueva app "Worky" (Nóminas): enrutamiento + catálogo de ejemplos
- **Qué pasó:** el usuario dio de alta "Worky" (plataforma de RH/Nómina)
  en el catálogo de Aplicaciones Internas y pidió que los tickets sobre
  ella lleguen a `jefa.nominas@selectshop.com.mx` y
  `nominas.5@selectshop.com.mx` — ninguno de los dos es de Sistemas, así
  que se trató igual que "Solicitud de Pagos": ajeno a Sistemas.
- **Qué implementé:** `frontend/src/config/ticketCategories.js` — nuevo
  `WORKY_SUBAREAS` (un solo apartado, como ERP) con 7 ejemplos de qué se
  puede reportar (no entra a Worky, recibo de nómina, vacaciones,
  falta/permiso, checador, datos personales, otro), registrado en
  `SPECIAL_APPS` para que el wizard y el buscador lo reconozcan.
  `backend/src/routes/tickets.js` — enrutamiento de correo a los 2 correos
  de Nóminas con `audience: 'externo'` (plantilla amigable, sin jerga de
  SLA); por el mismo criterio de `requestAudience` ya usado con Solicitud
  de Pagos, estos tickets NO aparecen en Mis Tickets ni en el Tablero de
  Sistemas — se muestran en Mis Solicitudes.
- **Commit(s):** `79a2ee2`

---

### 2026-07-28 — Mensaje de "otro navegador" en Click, tono más amable
- **Qué pasó:** el usuario vio la respuesta tajante de la entrada anterior
  ("En ese navegador no se puede instalar...") y pidió un tono más
  amable, sin perder que sea claro que no está disponible.
- **Qué implementé:** `frontend/src/components/HelpBot.jsx` — mensaje
  actualizado a: "Por ahora ese navegador no está disponible para
  instalarla 🙁 Te recomiendo usar Edge o Chrome — con esos sí te puedo
  ayudar."
- **Commit(s):** `cddb90d`

---

### 2026-07-28 — Click ya no dice que "otro navegador" sí se puede instalar
- **Qué pasó:** cuando alguien le decía a Click que usaba un navegador
  distinto de Edge/Chrome, la respuesta original explicaba que sí se
  podía instalar en otros navegadores (solo que "por ahora no lo
  cubrimos") y mandaba a reportarlo como ticket para que Sistemas
  ayudara. El usuario pidió lo contrario: que no se sepa que es posible
  en otros navegadores, ser tajante en que no se puede, recomendar Edge o
  Chrome, y sin mencionar a Sistemas para nada.
- **Qué implementé:** `frontend/src/components/HelpBot.jsx` — el mensaje
  de "otro navegador" ahora es: "En ese navegador no se puede instalar.
  Te recomiendo usar Edge o Chrome."
- **Commit(s):** `21f383e`

---

### 2026-07-28 — Click enseña a instalar la app con video, según dispositivo/navegador
- **Qué pasó:** el usuario quería que cuando alguien le pregunte a Click
  (Robot de Ayuda) cómo instalar la aplicación, le pregunte primero
  dispositivo/navegador y mande el video correcto — grabó 3 videos
  (computadora con Edge, computadora con Chrome, Android con Chrome) y
  pidió que si alguien pregunta por otro navegador, se le avise que por
  ahora solo esos 3 ("no nos queremos complicar la vida").
- **Qué implementé:** `frontend/public/videos/` — los 3 videos como
  archivos estáticos (`instalar-edge-pc.mp4`, `instalar-chrome-pc.mp4`,
  `instalar-chrome-android.mp4`), servidos directo sin pasar por Mongo/
  GridFS (no entran al precache de la PWA, solo se descargan si se piden).
  `frontend/src/utils/helpSearch.js` — nuevas `detectInstallIntent()` y
  `detectInstallDeviceAnswer()`. `frontend/src/components/HelpBot.jsx` —
  nuevo estado `pendingInstall`: al detectar la intención de instalar,
  Click pregunta dispositivo/navegador con 4 botones (Edge, Chrome,
  Android+Chrome, Otro navegador); al elegir uno de los 3 primeros manda
  el video (nuevo tipo de mensaje `kind: 'video'`, un `<video controls>`
  dentro del chat); "Otro navegador" contesta que por ahora solo se
  cubren esos 3.
- **Commit(s):** `013609d`

---

### 2026-07-28 — Etiqueta "pendiente calificar" en la lista de Mis Tickets
- **Qué pasó:** el usuario ya tenía el punto de notificación en el
  sidebar (ver entrada de "Mis tickets" más abajo) para cuando falta
  calificar un ticket cerrado, pero pidió que también se note directo en
  la fila del ticket dentro de la lista, junto a los pills de
  estatus/nivel de servicio.
- **Qué implementé:** `frontend/src/pages/MisTickets.jsx` — nuevo pill
  "pendiente calificar" (mismo estilo ámbar que ya existe) junto a
  "cerrado"/"nivel X", visible solo cuando `status === 'cerrado'` y
  `satisfactionRating` sigue vacío — mismo criterio que ya usa el punto
  del sidebar.
- **Commit(s):** `87887d4`

---

### 2026-07-28 — Solicitud de Pagos (Costos/Proveedores) tampoco se ve en el Tablero de Sistemas
- **Qué pasó:** el usuario vio en el Tablero de Sistemas (panel admin) un
  ticket real de "Alta de Proveedores" (`TICK-705327`) que ya tratábamos
  como "solicitud" del lado del empleado, pero seguía apareciendo en el
  Tablero de Tickets que ve Sistemas — reconsideró el alcance de la entrada
  anterior ("solo portal del empleado") y pidió que tampoco se vea ahí, ya
  que Sistemas no tiene acceso a esas plataformas.
- **Qué implementé:** `backend/src/routes/tickets.js`, `GET /` (el listado
  que usa el Tablero admin) — mismo filtro `requestAudience: { $ne:
  'externo' }` que ya usaba `GET /mine`. Sigue siendo un Ticket real en la
  base de datos (folio, historial, se puede abrir por su _id directo desde
  un link de correo/Telegram) — solo se excluye de este listado.
- **⚠️ Dato de producción corregido:** `TICK-705327` se había creado el
  2026-07-27, un día antes de que existiera el campo `requestAudience`
  (ver entrada anterior), así que quedó con el valor por default
  (`sistemas`) en vez de `externo`. Se corrigió ese único documento a mano
  (confirmado con el usuario, respaldo `mongodump` tomado antes) — no
  afecta el correo ya enviado en su momento ni nada más del ticket, solo
  dónde se lista.
- **Commit(s):** `51e7cb5`

---

### 2026-07-28 — Solicitud de Pagos (Costos/Proveedores) ya no se ve como "ticket" en el portal
- **Qué pasó:** el usuario notó que los tickets de "Solicitud de Pagos" en
  los apartados de Centro de Costos/Motivo de Pago y Alta de Proveedores
  (que ya se enrutaban por correo a Contabilidad/Pagos, no a Sistemas ni a
  BI — ver `audience: 'externo'` en `getTicketEmailRecipients`) se seguían
  viendo como "un ticket" en el portal del empleado, cuando Sistemas no
  tiene ningún acceso a esas plataformas para resolverlos.
- **Qué implementé:** `backend/src/models/Ticket.js` — nuevo campo
  `requestAudience` ('sistemas'/'externo'), fijado al crear el ticket.
  `backend/src/routes/tickets.js` — se factorizó `classifyTicketAudience()`
  (misma regla que ya usaba el correo, ahora síncrona y reutilizada en
  ambos lados) para fijar el campo en `POST /mine`; `GET /mine` ("Mis
  Tickets") ahora también excluye `requestAudience: 'externo'` (mismo
  criterio que ya excluía Soporte BI); nuevo `GET
  /mine/external-requests` para que estas solicitudes aparezcan del lado
  del empleado. `frontend/src/pages/MisSolicitudes.jsx` — nueva sección
  normalizada para mostrarlas ahí. Alcance confirmado con el usuario: SOLO
  el portal del empleado — el Tablero/Tickets que ve Sistemas en el panel
  admin no cambió, sigue mostrando todo igual que antes.
- **Commit(s):** `4a5d48c`

---

### 2026-07-28 — Contestar un ticket sin asignar lo asigna a quien contesta
- **Qué pasó:** el usuario notó que Sistemas podía responderle a un
  empleado en el chat de un ticket que todavía no estaba asignado a
  nadie — "no tiene sentido". Se decidió (en vez de agregar un paso extra
  de "asignarme antes de poder escribir") que la primera respuesta a un
  ticket sin asignar lo asigne de una vez a quien contesta.
- **Qué implementé:** `backend/src/routes/tickets.js`, `POST
  /:id/reply` — si el ticket no tenía `assignedTo`, antes de guardar el
  mensaje se asigna a `req.user` (mismo campo que usa el botón
  "Asignarme" existente). Si ya estaba asignado, no cambia nada (no se
  reasigna en cada mensaje). `frontend/src/pages/TicketDetailModal.jsx` —
  aviso junto al cuadro de "Responder" cuando el ticket está sin asignar
  ("al enviar tu respuesta quedará asignado a ti"), y un aviso posterior
  con el nombre una vez enviada la respuesta (sin tener que cerrar y
  reabrir el ticket para verlo reflejado).
- **Commit(s):** `aecf401`

---

### 2026-07-28 — Punto de notificación en "Mis tickets" cuando falta calificar
- **Qué pasó:** el usuario pidió un aviso visual en el portal de empleado
  para cuando tenga un ticket cerrado pendiente de calificar (CSAT), ya que
  hoy no hay ninguna señal de que falte calificar salvo entrar al ticket.
- **Qué implementé:** `backend/src/routes/tickets.js` — nuevo `GET
  /tickets/mine/pending-rating-count` (liviano, solo cuenta) que regresa
  cuántos tickets del empleado están `cerrado` sin `satisfactionRating`.
  `frontend/src/components/PortalLayout.jsx` — se consulta al montar (se
  monta en cada navegación) y pinta un punto rojo junto a "Mis tickets" en
  el sidebar cuando el conteo es mayor a cero (`PortalLayout.module.css`,
  clase `.navDot`).
- **Commit(s):** `237be48`

---

### 2026-07-28 — Telegram ya no manda el texto del chat, solo el aviso
- **Qué pasó:** el usuario pidió que Telegram sea solo para AVISOS, no para
  mandar el chat completo — "el chat ya es responsabilidad de Sistemas
  [dentro de la app]". El aviso de "nuevo mensaje" incluía el texto
  completo que escribía el empleado.
- **Qué implementé:** `backend/src/routes/tickets.js`, `POST
  /:id/messages` — se quitó la línea `📝 ${text}` del mensaje de Telegram;
  ahora solo dice quién escribió y en qué ticket, con el link de siempre
  para entrar y ver la conversación completa dentro de la app. Revisé el
  resto de los `notifyTelegram(...)` de todo el backend (Solicitudes de
  Cuenta/Recurso/Ingreso/Baja, Envíos) — ninguno más manda contenido de
  chat/mensajes, todos ya eran avisos de una sola vez.
- **Probé** contra el backend real: un empleado respondiendo un mensaje
  sigue guardándose bien en la conversación (eso no cambió, solo el aviso
  de Telegram); limpié los datos de prueba.
- **Commit(s):** `0ef915b`

---

### 2026-07-28 — Push al empleado cuando Sistemas cierra su ticket
- **Qué pasó:** el usuario pidió avisarle al empleado por push en cuanto
  Sistemas cierra su ticket — hoy solo se le avisaba cuando Sistemas
  respondía un mensaje, no cuando lo cerraba.
- **Qué implementé:** `backend/src/routes/tickets.js`, `PUT /:id/status` —
  cuando el nuevo estatus es `cerrado`, se manda un push al empleado
  (`sendPushToEmployee`, mismo helper y mismo patrón fire-and-forget que ya
  usa `POST /:id/reply` — nunca bloquea la respuesta ni le importa a
  Sistemas si el push falla). El título dice "Tu ticket fue cerrado" y el
  cuerpo incluye la resolución si ya se capturó. No hizo falta tocar nada
  del frontend ni del service worker — reutiliza toda la infraestructura de
  push ya construida (suscripción, `push-sw.js`, el fix de foco de ventana
  de hoy mismo).
- **Probé** contra el backend real: cerré un ticket de prueba con una
  suscripción push falsa (para no mandar nada a un dispositivo real) y
  confirmé que la ruta sigue respondiendo bien y que `sendPushToEmployee`
  se ejecuta sin tronar nada, igual que el patrón ya probado en producción
  para las respuestas. Limpié los datos de prueba.
- **Commit(s):** `2c42baa`

---

### 2026-07-28 — La resolución ya no se confunde con un mensaje más del chat
- **Qué pasó:** el usuario probó cerrar un ticket real y notó que la
  resolución (en Mis Tickets) se veía con el MISMO estilo que un mensaje
  normal de la conversación — mismo color, misma forma de burbuja, solo con
  "— resolución" en el nombre del autor. Se perdía entre mensajes casuales
  y no quedaba claro que era LA resolución oficial. Tampoco había forma de
  verlo sin entrar al ticket.
- **Qué implementé:** `frontend/src/pages/MisTickets.jsx` +
  `MisTickets.module.css`:
  - La resolución ya tiene su propio estilo dentro de la conversación
    (verde, con encabezado "✅ RESOLUCIÓN — {quién}" en mayúsculas,
    recuadro con borde) — ya no reutiliza la burbuja de chat normal.
  - En la tabla de "Mis tickets" (la lista, antes de entrar a un ticket),
    ahora se ve un resumen de la resolución debajo del asunto cuando el
    ticket ya está resuelto/cerrado — sin tener que abrirlo.
- **Probé:** el build compila limpio; no repetí la prueba contra el
  backend real porque el formato de los datos (resolution/resolutionNotes/
  resolvedAt vía `GET /mine`) ya se verificó varias veces hoy mismo en
  otros cambios — esto es puramente cómo se presentan, no de dónde vienen.
- **Commit(s):** `0600eb4`

---

### 2026-07-28 — Se puede borrar del catálogo de "¿Cómo se resolvió?"
- **Qué pasó:** el catálogo de resoluciones (que crece solo cuando alguien
  resuelve con "Otro (especifica)") solo tenía alta, nunca baja — se
  acumularon entradas de prueba tipo "dsgsdg"/"nada" sin forma de quitarlas.
- **Qué implementé:**
  - `backend/src/routes/tickets.js` — nueva ruta `DELETE
    /resolution-options/:label` (mismo permiso que el resto de acciones de
    Tickets). `label` es único en el modelo, así que se borra por label
    directo, sin necesitar exponer el `_id` en `GET /resolution-options`.
  - `frontend/src/pages/TicketDetailModal.jsx` — link "🗑️ Administrar
    catálogo" junto al selector de "¿Cómo se resolvió?", despliega la lista
    con un botón "Eliminar" por entrada.
  - `frontend/src/pages/TicketsLayout.jsx` — recarga el catálogo después de
    borrar, sin tener que cerrar y reabrir el ticket.
- **Probé** contra el backend real: confirmé que sin token se rechaza
  (401), que borrar algo que no existe da 404, y de paso limpié las 2
  entradas de prueba reales que ya estaban en el catálogo ("dsgsdg" y
  "nada") — las demás (legítimas) se quedaron intactas.
- **Commit(s):** `8be9150`

---

### 2026-07-28 — FIX: los avisos de Telegram de Cuentas/Recursos/Ingresos/Bajas no tenían link
- **Qué pasó:** el usuario reportó que las solicitudes de Cuentas y
  Recursos no redirigen a ningún lado desde Telegram. Al revisar encontré
  que era un bug sistémico: los 4 tipos de solicitud (Cuentas, Recursos,
  Ingresos, Bajas — 5 avisos de Telegram en total) terminaban su mensaje
  con texto plano ("Revisa en Solicitudes de Cuentas.") en vez de un link
  clicable — a diferencia de Tickets, que sí ya usa un `<a href>` real
  (`ticketAdminUrl()`). Corregí los 4 de un jalón, no solo los 2 que
  reportó, para no dejar el mismo bug pendiente de que lo reporte por
  separado en Ingresos/Bajas.
- **Qué implementé:**
  - `backend/src/utils/portalLinks.js` (nuevo) — `adminUrl(path)` y
    `employeeUrl(path)` (para el panel de Sistemas y el portal de empleado
    respectivamente), mismo criterio que `ticketAdminUrl()` en tickets.js:
    apuntan a `/login?next=<path>` (o `/mesa-de-ayuda/empleado/login?next=`
    del lado empleado), nunca a la ruta protegida directo — PrivateRoute/
    EmployeeRoute no redirigen solas al login si no hay sesión.
  - `accountRequests.js`, `resourceRequests.js` (2 avisos, incluye el
    ticket de instalación de software/licencia), `onboardingRequests.js`,
    `offboardingRequests.js` (2 avisos) — los 5 ya traen
    `<a href="...">Ver solicitud</a>` (o "Ver ticket"). El de "Nueva
    Solicitud de Baja" apunta al PORTAL de empleado
    (`/mesa-de-ayuda/baja-personal`, donde RH la revisa/aprueba), no al
    panel admin — los otros 4 sí van al panel admin.
- **Probé** contra el backend real (Telegram en blanco para no mandar
  avisos reales): confirmé la construcción exacta de cada URL, y disparé
  las 5 rutas reales (alta de cuenta, recurso, ingreso, baja reportada por
  jefe, baja aprobada por RH) sin ningún error en el servidor. Limpié todos
  los datos de prueba.
- **Commit(s):** `38f8bfa`

---

### 2026-07-28 — FIX (parte 2): el push ya abre la PWA, pero abría una nueva en vez de enfocar la ya abierta
- **Qué pasó:** el usuario probó el fix anterior — ya abre la PWA
  correctamente, pero abre una ventana/instancia NUEVA en vez de enfocar la
  que ya tenía abierta.
- **Causa:** `clients.openWindow()` (la solución de la ronda anterior)
  SIEMPRE abre una ventana nueva — nunca reusa una existente. Había que
  volver a reusar una ventana ya abierta, pero esta vez filtrando
  correctamente CUÁL (ese filtro faltante fue el bug original de la
  primera versión).
- **Qué cambié:** `frontend/public/push-sw.js`, `notificationclick` —
  vuelve a buscar una ventana ya abierta con `clients.matchAll()`, pero
  ahora exige que sea de la MISMA app que la notificación (compara el path
  contra `/mesa-de-ayuda` — Sistema de Tickets y Mesa de Ayuda comparten
  scope `/`). Si encuentra una, la navega y enfoca; si no, ahí sí
  `clients.openWindow(url)`. Subí `push-sw.js?v=3` en `vite.config.js`.
- **Probé** la lógica de selección con 3 casos simulados en Node (sin
  navegador real, que sigue sin estar disponible en este entorno): (1) PWA
  de Mesa de Ayuda ya abierta + push de un ticket → la enfoca; (2) el bug
  original — pestaña de Sistemas abierta + push de Mesa de Ayuda → ya NO la
  toca, abre una nueva (correcto); (3) ambas PWA abiertas + push de
  Sistemas → enfoca la de Sistemas, no toca la de Mesa de Ayuda. Falta la
  prueba real en dispositivo — avisa cómo se ve.
- **Commit(s):** `86a03d5`

---

### 2026-07-28 — FIX: el push abría el navegador en vez de la app instalada (PWA)
- **Qué pasó:** el usuario reportó que tanto el push de nuevos mensajes en
  un ticket (Mesa de Ayuda) como el push del lado de Sistemas abrían el
  navegador normal al darles clic, en vez de abrir/enfocar la app instalada
  (PWA).
- **Causa real:** `frontend/public/push-sw.js`, `notificationclick` —
  reusaba la PRIMERA ventana que encontrara con `clients.matchAll()` antes
  de intentar abrir la PWA. Sistema de Tickets y Mesa de Ayuda comparten el
  mismo scope `/` con `clientsClaim: true`, así que CUALQUIER pestaña
  normal del navegador abierta en el sitio (el dashboard, el login, lo que
  sea) ya contaba como "ventana existente" y se llevaba el foco antes de
  siquiera considerar abrir la app instalada.
- **Qué cambié:** se quitó esa lógica de reutilizar ventanas a mano —
  `event.waitUntil(clients.openWindow(url))` directo, que deja que el
  propio navegador decida (comportamiento nativo de Chrome/Edge: si la PWA
  instalada correspondiente ya está abierta, la enfoca él mismo; si no, la
  abre) — sin robarle el foco a una pestaña cualquiera del navegador.
  También subí el `?v=` de `push-sw.js` en `vite.config.js` (obligatorio
  para que se propague — este archivo no entra al revisioning normal de
  Workbox, ver comentario en el propio archivo).
- **No pude probar en un navegador real** (este entorno no tiene uno) —
  verifiqué que la sintaxis es válida y que el build genera correctamente
  `sw.js` referenciando `push-sw.js?v=2` con el contenido nuevo. Falta
  confirmar en un dispositivo real, con la PWA instalada, que el push abre
  la app — avisa si sigue sin funcionar.
- **Commit(s):** `89d1355`

---

### 2026-07-27 — Revertido: adjuntar evidencia vuelve a ser opcional (por voluntad, no por sistema)
- **Qué pasó:** el usuario corrigió el cambio de hoy mismo que hacía
  obligatorio adjuntar foto/captura al reportar un ticket — nunca pidió que
  el SISTEMA lo obligara; la idea es que el usuario lo haga por su propia
  voluntad, y eso se refuerza en la capacitación, no con un bloqueo técnico.
- **Qué revertí:**
  - `backend/src/routes/tickets.js`, `POST /mine` — se quitó la validación
    que rechazaba el ticket sin adjunto (Alta de Proveedores sigue
    exigiéndolo igual que siempre, eso no cambió).
  - `frontend/src/pages/ReportarTicket.jsx` — se quitó la validación del
    lado del formulario; la etiqueta ya no dice "obligatorio", dice
    "(recomendado)".
  - Manual de Mesa de Ayuda y FAQ del Robot de Ayuda — vuelven a decir que
    es opcional, con una línea extra invitando a hacerlo de todos modos.
  - `Mesa_de_Ayuda_Capacitacion.pptx` (diapositiva 9) — el tip ya no dice
    "ya es obligatoria", ahora dice "aunque no sea obligatorio, ayuda
    mucho" (backup: `.backup-2026-07-27j.pptx`).
- **Probé** contra el backend real: un ticket sin adjunto se aceptó igual
  que antes de la entrada de hoy que lo bloqueaba. Limpié los datos de
  prueba.
- **Commit(s):** `e6dc7df`

---

### 2026-07-27 — Robot de Ayuda: tips de troubleshooting antes de reportar
- **Qué pasó:** de la sesión de revisión, faltaba que el asistente ("Clic")
  diera consejos reales antes de reportar (ej. "revisa el indicador
  luminoso de la impresora"), no solo ayudar a encontrar la categoría. El
  usuario confirmó mantenerlo gratis (sin IA de pago, mismo motor de reglas
  de siempre) e implementarlo en el propio robot.
- **Qué implementé:**
  - `frontend/src/config/ticketCategories.js` — nuevo campo `tip` por
    problema (distinto de `note`, que redirige a Solicitar Recurso; `tip`
    es un consejo real de troubleshooting) + helper `problemTip()`. Se
    agregó a 6 problemas comunes: computadora que no enciende, batería,
    mouse/teclado, WiFi, impresora que no imprime (el ejemplo exacto de la
    sesión) y Teams sin audio/video.
  - `frontend/src/utils/helpSearch.js` — el resultado de un problema
    encontrado ya incluye su `tip`, si tiene uno.
  - `frontend/src/components/HelpBot.jsx` — el chat de Click muestra el tip
    (💡) justo arriba de la sugerencia de a dónde reportar.
  - El triage por categoría/problema en lenguaje simple ("no me prende la
    compu", "no imprime la impresora") ya existía (`searchTopics`/
    `bestTicketMatch`) — no hizo falta reconstruirlo, solo se le agregaron
    los tips encima.
- **Probé**: bundié `helpSearch.js` con esbuild y confirmé en Node que
  "no imprime nada mi impresora" y "mi laptop no prende" regresan el
  problema correcto CON su tip — no requiere backend, es lógica 100%
  estática del frontend.
- **Commit(s):** `a38ab97`

---

### 2026-07-27 — Aprobar una Solicitud de Recurso de Software/Licencia genera un ticket de seguimiento
- **Qué pasó:** de la sesión de revisión: "instalar un programa nuevo" se
  pide como Solicitud de Recursos (no como ticket, porque no es una falla),
  pero al aprobarse sí requiere que alguien de Sistemas ejecute la
  instalación — ese trabajo se estaba perdiendo, sin quedar documentado ni
  medido como el resto del soporte. El usuario confirmó el alcance:
  ÚNICAMENTE para "Software o Licencia" — accesorios/línea telefónica (que
  es solo entrega de stock) no generan ticket.
- **Qué implementé:** `backend/src/routes/resourceRequests.js`,
  `PUT /:id/approve` — si `resourceItems` incluye "Software o Licencia", se
  crea automáticamente un `Ticket` (tipo `software_pc`, con el detalle de la
  licencia y la justificación original) al aprobar, se avisa por Telegram, y
  se regresa el folio en la respuesta. `frontend/src/pages/
  ResourceRequests.jsx` — muestra un aviso con el folio al aprobar, para que
  quien aprueba sepa que ya quedó documentado como ticket.
- **Probé** contra el backend real: aprobar una solicitud de "Software o
  Licencia" generó el ticket correcto (tipo, empleado, descripción con la
  justificación); aprobar una de "Mouse" NO generó ningún ticket. Limpié los
  datos de prueba.
- **Commit(s):** `0fb9cc1`

---

### 2026-07-27 — Adjuntar evidencia al reportar un ticket ya es obligatorio
- **Qué pasó:** de la sesión de revisión de Mesa de Ayuda: adjuntar una
  foto/captura al reportar un ticket era opcional (salvo Alta de
  Proveedores) — se identificó como fuente constante de tiempo perdido
  "adivinando" qué le pasa al usuario. El usuario confirmó que debe ser
  obligatorio.
- **Qué cambié:**
  - `backend/src/routes/tickets.js`, `POST /mine` — nueva validación: si no
    es Alta de Proveedores (que ya lo exigía) ni Soporte BI (formulario
    estructurado propio, no aplica evidencia visual), rechaza el ticket sin
    un adjunto.
  - `frontend/src/pages/ReportarTicket.jsx` — misma validación del lado del
    formulario antes de enviar, y la etiqueta ya no dice "(opcional)".
  - Actualicé el Manual de Mesa de Ayuda y la FAQ del Robot de Ayuda
    (decían "es opcional") para que no contradigan el comportamiento real.
- **Probé** contra el backend real: reportar sin adjunto se rechaza
  ("Adjunta una foto o captura..."), con adjunto se acepta igual que antes,
  y un ticket de Soporte BI sin adjunto sigue sin bloquearse por esto (falla
  por sus propios campos, no por la evidencia). Limpié los datos de prueba.
- **Commit(s):** `052357d`

---

### 2026-07-27 — Reasignar la categoría de un ticket mal clasificado (urgente)
- **Qué pasó:** el usuario pidió, como urgente, poder corregir la categoría
  de un ticket que el empleado clasificó mal, y que el empleado vea en Mis
  Tickets que se reclasificó — "quiero que el usuario aprenda a reportar".
- **Qué implementé:**
  - `backend/src/models/Ticket.js` — nuevos campos `originalTicketType`,
    `reassignedByName`, `reassignedAt`.
  - `backend/src/routes/tickets.js` — nueva ruta `PUT /:id/reassign-type`
    (mismo permiso que el resto de acciones sobre un ticket). Excluye los
    3 tipos genéricos heredados (el wizard ya no los ofrece) y
    `soporte_bi` (vive en su propio flujo con campos incompatibles). Guarda
    el tipo original la primera vez que se reasigna (no lo pisa en
    reasignaciones futuras) y quién/cuándo.
  - `frontend/src/pages/TicketDetailModal.jsx` — botón "🔁 Reasignar
    categoría" con su selector, se refleja al toque sin cerrar el modal.
  - `frontend/src/pages/MisTickets.jsx` — si el ticket fue reclasificado,
    se le avisa al empleado con la categoría original vs. la correcta.
- **Probé** contra el backend real (local, mismo Mongo): reasigné un ticket
  de prueba de "Software Computadoras" a "Aplicaciones", confirmé que
  `GET /mine` ya trae el aviso para el empleado, que reasignar al mismo
  tipo actual se rechaza, y que reasignar a `soporte_bi` (tipo excluido)
  también se rechaza. Limpié los datos de prueba al terminar.
- **Commit(s):** `0145c95`

---

### 2026-07-27 — Solicitar Cuenta/Recurso/Ingreso ya se autocompletan con la sesión activa
- **Qué pasó:** el usuario pidió que, si ya entró al portal con su correo,
  estos 3 formularios públicos dejen de pedirle escribir/elegir su propio
  nombre a mano — "como los tickets", que ya toman la identidad de la
  sesión sin preguntar nada.
- **Qué cambié:**
  - `backend/src/routes/employees.js` — nueva ruta `GET /employees/me`
    (`employeeAuth`), regresa los datos del propio empleado en sesión
    (nombre, no. de empleado, puesto, área/departamento, teléfono, razón
    social, correos).
  - `backend/src/routes/accountRequests.js`, `resourceRequests.js`,
    `onboardingRequests.js` — en sus rutas `POST /public` (todas ya usaban
    `optionalEmployeeAuth`), cuando SÍ hay sesión de portal activa, el
    solicitante (o "quién solicita" en Ingreso) se resuelve DIRECTO por su
    `employeeRef` real, sin depender de lo que mande el body — más
    confiable que el match por nombre de antes, y cierra la puerta a que
    alguien logueado como Fulano mande una solicitud a nombre de Mengano.
    Sin sesión (link público abierto sin login), sigue exactamente la
    validación de siempre.
  - `frontend/src/pages/SolicitarCuenta.jsx`, `SolicitarRecurso.jsx`,
    `SolicitarIngreso.jsx` (esta última solo en la sección 4 "Quién
    solicita" — el nombre del NUEVO ingreso en la sección 1 sigue siendo
    texto libre, esa persona no existe todavía en Empleados) — si hay
    sesión, se llama `GET /employees/me` al cargar y se autocompleta todo
    solo; en vez del buscador manual se muestra "Solicitando como
    **Nombre**." Sin sesión, se ve exactamente igual que antes (buscador
    con sugerencias).
- **Probé** contra el backend real (local, mismo Mongo): con un empleado y
  sesión de prueba, confirmé que `GET /employees/me` regresa sus datos, que
  las 3 rutas `POST /public` guardan la identidad correcta SIN mandar
  `employeeName`/`requestedByName` en el body, y que sin sesión las 3 rutas
  siguen rechazando igual que antes si falta el nombre. Limpié todos los
  datos de prueba al terminar.
- **Commit(s):** `6faafb2`

---

### 2026-07-27 — Lo que tiene "Sistemas" asignado ya aparece en Asignaciones, sin verse como usuario real
- **Qué pasó:** el usuario pidió que el equipo en resguardo de "Sistemas"
  (devuelto, en tránsito o en revisión — no una persona real) apareciera en
  la página/Excel de Asignaciones, pero sin que se viera como si un
  empleado real lo tuviera. Antes era completamente invisible: `assignedOnly`
  excluía a "Sistemas" del listado, y tampoco contaba como "Sin asignar"
  porque sí tiene una asignación activa (a "Sistemas"). Verifiqué contra la
  base de datos real: 12 equipos (laptops/escritorios/celular) están hoy en
  este limbo.
- **Qué implementé:** `frontend/src/pages/Assignments.jsx` — nuevo
  `sistemasRows` (asignaciones activas a "Sistemas", solo `category:
  'equipo'`, mismo criterio que "Sin asignar"), agregado a la lista
  principal junto a `assignedOnly` y `unassignedRows`. Se marcan con
  `sistemas: true` y `employee: null` — la columna "Nombre" (tabla en vivo
  y Excel) muestra "🔒 Resguardo de Sistemas" en vez del nombre, en vez de
  dejarlo en blanco (que se confundiría con "Sin asignar") o mostrar
  "Sistemas" como si fuera un empleado más. El resto de columnas de
  empleado (No. Empleado/Empresa/Oficina/Puesto) quedan en blanco, igual
  que ya pasa con "Sin asignar". El contador del encabezado ahora muestra
  los 3 grupos por separado.
- **Probé:** conté en la base de datos real cuántos equipos están
  asignados a "Sistemas" ahora mismo (12) para confirmar que el cambio
  tiene efecto real, no solo teórico. `npm run build` del frontend sin
  errores.
- **Commit(s):** `fb04940`

---

### 2026-07-27 — Manual de Mesa de Ayuda: tabla explícita de Niveles de Servicio (SLA)
- **Qué pasó:** el usuario pidió agregar al Manual de Mesa de Ayuda la tabla
  de SLA de `Politica_Activos_Herramientas_IT 2.docx` (numeral 5.1.5.3),
  para que la gente vea explícitamente cómo se manejan las horas y las
  prioridades de cada tipo de falla.
- **Qué implementé:**
  - `frontend/src/pages/ManualMesaDeAyuda.jsx` — nueva sección "9. Niveles
    de Servicio (SLA)" (entre "Mis tickets" y "Mis solicitudes", que se
    recorrieron a 10/11/12), con la tabla completa tal cual el documento:
    Nivel, Prioridad (P1-P4), Categoría de Falla, Ejemplos, Tiempo de
    Respuesta y Tiempo de Resolución para las 10 combinaciones definidas.
    La sección 8.2 "Nivel de Servicio" ahora enlaza directo a esta tabla.
  - `frontend/src/config/faqData.js` — nueva pregunta del Robot de Ayuda
    ("¿Cuánto tarda Sistemas en responder o resolver mi ticket?") apuntando
    a la nueva sección.
  - `frontend/src/pages/ManualMesaDeAyuda.module.css` — nueva clase
    `.tableScroll` (scroll horizontal) para que la tabla de 6 columnas no
    rompa el layout en pantallas angostas.
- **De paso corregí contenido del manual que ya estaba desactualizado**
  (encontrado al tocar esta misma sección): 8.3 y 8.4 todavía decían que
  el empleado puede cerrar su propio ticket y que responder uno "resuelto"
  lo reabre solo — ambos comportamientos se quitaron el 2026-07-27 (ver
  las 2 entradas de este mismo día más abajo) y el manual nunca se
  actualizó. También la FAQ "Ya cerré mi ticket..." (pregunta y su copia en
  `faqData.js`) y la 8.5 (la encuesta ahora es solo al cerrar, no al
  resolver).
- **Commit(s):** `0f61b44`

---

### 2026-07-27 — Monitores ahora pueden capturar "Propiedad" (Arrendamiento) y No. de Contrato
- **Qué pasó:** el usuario reportó que el total de equipo en arrendamiento
  (Macs + Laptops + Monitores BenQ) no cuadraba: esperaba 167 según el
  documento oficial de contratos de arrendamiento (DLL), pero el sistema
  solo mostraba 145. Se investigó cruzando, serie por serie, los 167
  equipos de los 5 contratos reales contra la base de datos:
  - **155 con número de serie** (146 Lenovo + 9 Mac): 154 correctos, 1
    (`MZ01PJYB`) resultó ser un typo del documento — el activo real es
    `MZ01PJYB1`, ya estaba bien marcado en el sistema.
  - **10 monitores BenQ MA270U** (stock a granel, un solo renglón con
    `stockTotal: 10`): reales, con contrato confirmado en el histórico
    (export del 21 de julio los mostraba con No. de Contrato capturado),
    pero el 22 de julio se les hicieron 13 ediciones seguidas y perdieron
    ese dato — porque el tipo "monitor" nunca tuvo un campo de contrato en
    su formulario, así que cualquier edición reconstruye sus specs sin él.
  - **2 iMac** listados como "Sin asignar" en el contrato (sin serie
    capturada aún): ya llegaron físicamente, pendientes de alta con su
    serie real.
- **Qué implementé:** `frontend/src/config/assetFields.js` — agregado
  `ownership` ("Propiedad": Propia/Arrendamiento) y `contractNumber` a
  `SPECS_FIELDS.monitor`, mismas opciones que ya usan laptop/escritorio/
  all_in_one. Con esto un monitor arrendado ya se puede marcar y editar
  sin perder el dato, y aparece automáticamente en la columna "No.
  Contrato" de la exportación de Asignaciones (ese campo ya era genérico
  para cualquier categoría, ver `buildExcelRows` en `Assignments.jsx`).
- **Pendiente (requiere confirmación antes de tocar datos):** marcar los
  10 BenQ como Arrendamiento con su contrato una vez capturado el campo, y
  dar de alta los 2 iMac nuevos cuando se tenga su número de serie real.
- **Probé:** `npm run build` del frontend sin errores. La investigación
  completa fue de solo lectura contra la base de datos real (sin escribir
  nada), cruzando los números de serie extraídos de
  `Relación_de_contratos_de_arrendamiento_DLL_-_Select_Shop (1) (1).xlsx`.
- **Commit(s):** `22ab51b`

---

### 2026-07-27 — Nombres del roster de Cuentas Compartidas siempre en mayúsculas
- **Qué pasó:** justo después de agregar el roster de usuarios autorizados
  (ver la entrada de abajo), el usuario pidió que esos nombres siempre
  queden en mayúsculas — mismo criterio que ya se usa para el nombre en
  Solicitud de Ingreso.
- **Qué cambió:**
  - `backend/src/models/Employee.js` — `sharedAccountUsers.name` ahora
    tiene `uppercase: true` (setter de Mongoose): se aplica en cualquier
    ruta que guarde el campo (`POST /employees`, `PUT /employees/:id`),
    sin tener que tocar esas rutas genéricas una por una.
  - `frontend/src/pages/CuentasCompartidas.jsx` — el input de cada persona
    del roster ya convierte a mayúsculas en vivo mientras se escribe.
  - Corregí las 18 personas que ya estaban guardadas de la entrada
    anterior (estaban en mayúsculas/minúsculas normales) a mayúsculas.
- **Aclaración aparte:** el usuario también confirmó una duda — estas 18
  personas del roster NO son Empleados (no aparecen en el módulo de
  Empleados, no tienen asignaciones); viven únicamente dentro del registro
  de la cuenta compartida "AUXILIAR DEVOLUCIONES". Lo verifiqué contra
  Mongo (0 Employees de nivel superior con esos nombres) — no hizo falta
  ningún cambio de código para eso, ya funcionaba así desde el diseño
  original del roster.
- **Probé** contra el backend real: mandé un nombre en minúsculas por
  `PUT /employees/:id` (la ruta real que usa el frontend) y confirmé que
  se guardó en mayúsculas solo. Restauré el roster real de las 18 personas
  después de la prueba.
- **Commit(s):** `72e0cc7`

---

### 2026-07-27 — Roster de usuarios autorizados por Cuenta Compartida
- **Qué pasó:** el usuario pidió que, en cada Cuenta de Uso Múltiple (ej.
  "Auxiliar Devoluciones"), se pueda mantener una lista real de las
  personas que la usan — hoy quien reportaba un ticket desde ahí escribía
  su nombre a mano en el paso "¿Quién eres?", con mayúsculas/minúsculas y
  variantes distintas cada vez, sin control real de quién es quién. Pidió
  que el sistema obligue a elegir un nombre de esa lista (no escribirlo),
  que sin elegir uno no se pueda continuar, y control total (agregar,
  editar, eliminar) desde el panel. Dio de una vez la lista real para
  "Auxiliar Devoluciones" (18 personas).
- **Qué implementé:**
  - `backend/src/models/Employee.js` — nuevo campo
    `sharedAccountUsers: [{name}]`, junto a `isSharedAccount`.
  - `backend/src/routes/tickets.js` — nueva ruta
    `GET /mine/shared-account-users` (el wizard la pide fresca, no viaja en
    el JWT del portal para que Sistemas pueda agregar/quitar gente sin
    forzar cerrar sesión de la tablet). En `POST /mine`, la validación de
    `sharedAccountReporterName` ya no acepta cualquier texto no vacío —
    tiene que coincidir exactamente con un nombre del roster de esa cuenta
    (cierra la puerta a saltarse el selector llamando la API directo).
  - `frontend/src/pages/CuentasCompartidas.jsx` — nueva sección "Usuarios
    autorizados" dentro del modal de alta/edición: lista de nombres con
    agregar/editar/eliminar, se manda junto con el resto del formulario al
    guardar (sin rutas nuevas del lado de creación/edición — `PUT
    /employees/:id` y `POST /employees` ya aceptaban cualquier campo tal
    cual).
  - `frontend/src/pages/ReportarTicket.jsx` — el paso "¿Quién eres?" ya no
    es un `<input>` de texto libre: ahora es una lista de botones, uno por
    persona del roster (mismo estilo `nameOption` que ya usa este wizard
    en otro lado), y un clic ya deja el nombre confirmado. Si el roster
    llega vacío, se avisa que Sistemas todavía no configuró a nadie —
    nunca hay un campo de texto de respaldo.
  - Poblé el roster real de "AUXILIAR DEVOLUCIONES" (única cuenta
    compartida que existe hoy, confirmé en Mongo antes de tocar nada) con
    las 18 personas que dio el usuario.
- **Probé** contra el backend real (local, mismo Mongo, credenciales de
  Telegram/Azure en blanco): confirmé que `GET
  /mine/shared-account-users` regresa las 18 personas, que reportar con un
  nombre del roster se acepta igual que antes, que un nombre fuera del
  roster se rechaza ("Selecciona tu nombre de la lista"), y que no mandar
  nombre sigue rechazándose igual que siempre. Limpié el ticket de prueba
  al terminar.
- **Commit(s):** `136af11`

---

### 2026-07-27 — Resolver un ticket ya lo cierra de una vez (ya no son 2 pasos)
- **Qué pasó:** justo después de quitarle al empleado la posibilidad de
  cerrar su ticket (ver la entrada de abajo), el usuario cuestionó el diseño
  de 2 pasos que quedaba del lado de Sistemas ("Marcar resuelto" y luego,
  aparte, "Cerrar ticket"): "si yo Sistemas digo que ya lo voy a cerrar es
  porque ya me cercioré que funciona, otra cosa es que pase un rato y vuelva
  a pasar" — es decir, para cuando Sistemas resuelve, ya lo verificó; no
  hace falta una ventana de confirmación aparte antes de cerrar.
- **Qué cambió:**
  - `frontend/src/pages/TicketDetailModal.jsx` — `handleResolve()` ahora
    manda `status: 'cerrado'` directo (antes mandaba `'resuelto'`). Botones
    renombrados: "Marcar resuelto" → "Resolver y cerrar ticket",
    "Confirmar resolución" → "Confirmar y cerrar ticket". El botón viejo
    "Cerrar ticket" (para tickets que ya estaban en "resuelto" antes de este
    cambio) se deja intacto, nada más como remanente para esos casos.
  - `backend/src/routes/tickets.js`, `PUT /:id/status` — la captura de
    resolución (`resolution`/`resolutionNotes`/`resolvedAt`/`resolvedByName`)
    ya no depende de que el status sea exactamente `'resuelto'`; aplica
    igual si se manda `'cerrado'` directo desde un ticket que nunca se había
    resuelto, para que "resolver y cerrar" en un solo llamado siga
    guardando los mismos datos que antes.
  - El estatus `'resuelto'` sigue existiendo en el modelo (no se quitó del
    enum) por los tickets que ya estaban ahí de antes de este cambio, pero
    en el flujo normal ya no se vuelve a usar — de aquí en adelante,
    resolver es cerrar.
  - No cambié nada del bloqueo de reapertura (2026-07-24) ni del cierre
    automático a los 5 días — siguen igual.
- **Probé** contra el backend real (local, mismo Mongo): resolví un ticket
  de prueba mandando `status: 'cerrado'` directo desde "abierto" con una
  resolución, confirmé que quedó "cerrado" con `resolvedAt`/`resolvedByName`
  capturados correctamente, que la encuesta de satisfacción se pudo
  contestar de inmediato (sin pasar por "resuelto"), y que seguir sin mandar
  `resolution` sigue rechazándose igual que antes. Limpié los datos de
  prueba al terminar.
- **Commit(s):** `9fa725a`

---

### 2026-07-27 — Cerrar un ticket ya solo lo puede hacer Sistemas
- **Qué pasó:** el usuario pidió que el empleado ya no pueda cerrar su propio
  ticket ("no me parece lo adecuado") — solo Sistemas debe poder cerrarlo, y
  la encuesta de satisfacción debe aparecer hasta ese momento, no antes.
- **Qué cambió:**
  - `backend/src/routes/tickets.js` — se eliminó por completo la ruta
    `POST /:id/close` (el auto-cierre del empleado). Sistemas sigue cerrando
    igual que siempre con `PUT /:id/status` (`{status: 'cerrado'}`), que ya
    existía y no cambió. `POST /:id/satisfaction` ahora exige
    `status === 'cerrado'` (antes aceptaba también `'resuelto'`).
  - `frontend/src/pages/MisTickets.jsx` — se quitó el botón "Cerrar ticket"
    y su `handleClose()`; en su lugar, mientras el ticket está "resuelto" se
    muestra un aviso de solo lectura ("Sistemas cerrará este ticket una vez
    que confirme que quedó resuelto"). La encuesta CSAT ahora solo se
    muestra con `status === 'cerrado'` (antes también con `'resuelto'`).
  - De paso corregí dos textos que ya estaban desactualizados en este mismo
    componente: el comentario y el placeholder del composer todavía decían
    que responder un ticket resuelto lo "reabre solo" — ese comportamiento
    se había quitado el 2026-07-24 y el texto nunca se actualizó.
  - El cierre automático a los 5 días sin actividad
    (`autoCloseStaleResolved()`) no se tocó — sigue moviendo a `'cerrado'`
    igual que antes, y con eso también sigue destrabando la encuesta.
- **Probé** contra el backend real (local, mismo Mongo): con un ticket de
  prueba, confirmé que la ruta vieja de auto-cierre del empleado ya no es
  alcanzable, que pedir la encuesta estando "resuelto" se rechaza, que
  Sistemas cerrándolo con `PUT /:id/status` sí lo mueve a "cerrado", y que
  hasta ese momento la encuesta se puede calificar. Limpié los datos de
  prueba al terminar.
- **Commit(s):** `988c03e`

---

### 2026-07-27 — Nueva hoja "Accesorios Disponibles" en la exportación de Asignaciones
- **Qué pasó:** después del fix de arriba (sacar accesorios de "Sin
  asignar"), el usuario preguntó por qué el total de la exportación bajó
  de ~812 a ~684 filas — se le explicó que eran 128 filas de accesorios
  que ya no se mezclaban, no datos perdidos. El usuario aclaró qué quería
  de verdad: seguir viendo los accesorios disponibles, pero en su propia
  sección, sin mezclarse con equipo.
- **Qué implementé:** `frontend/src/pages/Assignments.jsx` — nueva función
  `buildAccessoryStockRows()` + segunda hoja del mismo Excel ("Accesorios
  Disponibles"), con el desglose real por tipo de accesorio: Stock Total,
  Asignado (suma de `quantity` de cada asignación activa) y Disponible.
  Ojo con un caso real que encontré al verificar: 79 de los 233 accesorios
  no son de stock a granel (`stockTotal` vacío) — son unidades
  individuales importadas una por una antes del rediseño de stock (ej.
  monitores/mouse viejos), y se comportan 1:1 como un equipo. Tratarlos
  con `stockTotal ?? 0` los hacía ver como "0 de stock" aunque estuvieran
  disponibles, y a las que no tenían ninguna asignación activa (7 de
  ellas) las dejaba invisibles en todo el reporte. Se corrigió: si
  `stockTotal` es `null`, se trata como 1 sola unidad (`Math.max(asignado,
  1)`), igual que ya hace el propio backend (`routes/assignments.js`
  distingue exactamente por `stockTotal != null` para decidir si un
  activo es "a granel" o "de una sola asignación a la vez").
- **Probé:** simulé `buildAccessoryStockRows()` contra la base de datos
  real (solo lectura) dos veces — la primera reveló el problema de las 79
  unidades individuales (72 con "Stock Total: 0" contradictorio, 7
  invisibles), la segunda (ya con el fix) confirmó 0 filas con Stock Total
  en 0 y que esas 7 unidades ahora muestran "Disponible: 1" correctamente.
  `npm run build` del frontend sin errores.
- **Commit(s):** `2048753`

---

### 2026-07-27 — Fix: la exportación de Asignaciones mezclaba accesorios con equipo en "Sin asignar"
- **Qué pasó:** el usuario pidió arreglar el Excel de auditoría "con toda
  la información real" y sin confundir accesorios con activos. Revisé
  `frontend/src/pages/Assignments.jsx` (de ahí sale el Excel de
  "AUDITORÍA DE ASIGNACIONES") y encontré 2 problemas reales, ambos en
  cómo se arman las filas "Sin asignar" que se agregan junto a las
  asignaciones reales:
  1. Se calculaban con `GET /assets?status=disponible` — es decir,
     confiaban en el campo `status` del activo. Si ese campo se
     desincroniza otra vez (el bug de la entrada de arriba,
     "un activo podía quedar disponible con dueño real"), la exportación
     vuelve a mostrar contradicciones sin que el bug de fondo siquiera
     tenga que repetirse — bastaba con que `status` quedara mal UNA vez.
  2. Ese mismo query de "disponible" trae TAMBIÉN accesorios a granel
     (`category: 'accesorio'`, ej. monitores, cables, mouse) que casi
     siempre tienen `status: "disponible"` mientras les quede stock — aun
     cuando ya tienen decenas de unidades asignadas. Verifiqué contra la
     base real: **112 accesorios** con `status: "disponible"` pero CON
     asignaciones activas (ej. un cable con 60 unidades, 52 ya asignadas)
     se colaban como fila "Sin asignar" — mezclados en la misma tabla y
     columnas que una laptop realmente idle, como si fuera el mismo tipo
     de hecho.
- **Qué implementé:** `frontend/src/pages/Assignments.jsx` — ahora se trae
  TODO el inventario sin filtrar por `status` (`GET /assets` a secas), y
  "Sin asignar" se calcula cruzando cada activo contra las asignaciones
  activas REALES ya cargadas (`GET /assignments`), no contra el campo
  `status` — así el reporte se autocorrige aunque `status` vuelva a
  desincronizarse. Además, "Sin asignar" ahora solo aplica a
  `category: 'equipo'` (laptops, celulares, tablets, impresoras,
  infraestructura) — cada unidad es de una persona o de nadie, un hecho de
  1 renglón. Los accesorios a granel se excluyen de esa fila sintética
  porque su disponibilidad es de STOCK RESTANTE, no de "nadie lo tiene" —
  siguen apareciendo correctamente vía sus asignaciones reales (una fila
  por empleado + cantidad), sin necesitar una fila aparte.
- **Probé:** simulé la lógica nueva contra la base de datos real
  (solo lectura) antes de dar el fix por bueno — confirmé que los 112
  accesorios ya NO entran a "Sin asignar" (antes sí lo hacían), que quedan
  37 equipos realmente idle correctamente aislados, y que el total de
  filas esperadas en la exportación "Todo el inventario" cuadra
  (646 asignaciones reales sin contar "Sistemas" + 37 equipo sin asignar =
  683). `npm run build` del frontend sin errores.
- **Commit(s):** `8611816`

---

### 2026-07-27 — Nuevo CLAUDE.md: regla fija de nunca escribir en la BD de producción sin avisar
- **Qué pasó:** después del fix e investigación de este mismo día (ver
  entrada de abajo, "un activo podía quedar disponible con dueño real"), al
  usuario le preocupó — con razón — que se hicieran cambios directos contra
  la base de datos de producción real. Se aclaró que la credencial de
  `MONGO_URI` (`assets-admin`) tiene rol `atlasAdmin` (el más alto de
  Atlas): no hay ninguna barrera técnica que impida escribir, así que la
  única salvaguarda real es avisar siempre antes de tocar algo. El usuario
  pidió dejar esto fijo por escrito, sin excepciones.
- **Qué implementé:** `CLAUDE.md` nuevo en la raíz del repo — regla
  explícita de nunca escribir en la BD de producción (updates, deletes,
  scripts de corrección, migraciones) sin antes: (1) decir exactamente qué
  va a cambiar, (2) por qué (causa raíz con evidencia real), (3) qué puede
  salir mal, destacado con **⚠️ RIESGO**, y (4) esperar confirmación
  explícita — sin asumir que un "sí" anterior cubre el siguiente cambio.
  También deja registrado: tomar un `mongodump` fresco antes de cualquier
  escritura (respaldos en `assets-manager-db-backups/` junto al repo en
  OneDrive, no en git), y el pendiente aprobado de crear un usuario de solo
  lectura en Atlas para investigaciones futuras.
- **Por qué:** para que esta regla aplique en CUALQUIER sesión futura sobre
  este repo (humana o de IA), no solo en la conversación donde se acordó.
- **Commit(s):** `a621193`

---

### 2026-07-27 — Fix: un activo podía quedar "disponible" con dueño real (DELETE /assignments duplicado)
- **Qué pasó:** el usuario (auditoría de Asignaciones) exportó el Excel de
  "Todo el inventario", filtró por el No. de Serie `PF47Z7RT` y le
  aparecieron hasta 3 personas para el mismo activo — le pareció
  "gravísimo". Investigué contra la base de datos real (no el Excel, no la
  UI) y separé dos cosas distintas:
  1. Una de las 3 filas (un mouse) tenía un No. de Serie totalmente
     distinto (`8SSM51M37185L2DG4C7D3MZ`) — el filtro de Excel la agarró
     por error, no es un dato real duplicado.
  2. Las otras 2 filas sí eran el mismo activo real (`PF47Z7RT`, laptop
     LENOVO ThinkPad E14 Gen 2) — pero **no había 2 asignaciones activas
     simultáneas** (ninguno de los 459 equipos las tiene). Lo que pasaba es
     que el campo `Asset.status` decía `"disponible"` mientras SÍ existía
     una asignación activa real (a Fernando Monroy Miguel) — de ahí que la
     app mostrara "Disponible" y la auditoría generara 2 filas
     contradictorias para el mismo activo.
  - Reconstruí la causa exacta con el `AuditLog` real de ese activo: al
    reasignarlo (Felipe Gomez, 2026-07-03), el flujo de "reasignar a otra
    persona" en `Assets.jsx` hace `DELETE /assignments/:id` (devolver) +
    `POST /assignments` (asignar) como 2 llamadas separadas. El `DELETE`
    llegó a ejecutarse **dos veces** (un "devolver" duplicado 1.3s después
    del correcto — doble clic o reintento de red) y la segunda vez volvió a
    forzar `status: "disponible"` sin fijarse que el `POST` ya había puesto
    correctamente `"asignado"` para el nuevo dueño. El mismo patrón afectó
    2 activos más: `PF61LNY2` (laptop) y un celular Motorola
    `XT2159-1` (Polanco Piso 13).
- **Qué implementé:** `backend/src/routes/assignments.js`, ruta
  `DELETE /:id` — para activos individuales (no a granel), ya no fuerza
  `status: "disponible"` a ciegas: primero revisa si el activo tiene AHORA
  alguna OTRA asignación activa (ej. la reasignación que acaba de crear el
  `POST` inmediatamente después) y solo lo marca "disponible" si de verdad
  no queda ninguna — mismo patrón que ya usaba correctamente la rama de
  accesorios a granel. También agregué un guard de idempotencia: si la
  asignación ya estaba `active: false` (un DELETE repetido/tardío), la ruta
  ya no reprocesa nada, así un doble clic no puede volver a pisar el status.
- **Datos corregidos:** con la causa ya arreglada en código, corregí en la
  base de datos real los 3 activos ya afectados (`status` → `"asignado"`),
  verificando primero que cada uno tuviera exactamente 1 asignación activa
  real antes de tocar nada, y dejando un registro en `AuditLog` de la
  corrección para que quede trazable. Confirmé con una consulta sobre los
  459 equipos que no quedó ninguna inconsistencia restante (status vs.
  asignación activa) después del fix.
- **Probé:** contra la base de datos de producción (solo lectura hasta
  tener luz verde del usuario, después la corrección puntual ya confirmada
  con él). `node -c` sobre el archivo modificado para descartar errores de
  sintaxis.
- **Commit(s):** `8b5d2bc`

---

### 2026-07-27 — El Robot de Ayuda se llama "Click" y responde aunque le hablen por su nombre
- **Qué pasó:** el usuario pidió, medio en broma, ponerle nombre al Robot de
  Ayuda — "Click" — con una condición explícita: si alguien le escribe
  "Click, ¿cómo reporto?" (dirigiéndose a él por nombre), tiene que
  encontrar lo mismo que si hubiera escrito solo "¿cómo reporto?", sin que
  el nombre estorbe la búsqueda.
- **Qué implementé:**
  1. `frontend/src/components/HelpBot.jsx` — el saludo inicial, el
     encabezado del panel (`<strong>`) y los `aria-label` (del diálogo y del
     botón flotante) ahora presentan al bot como "Click" (manteniendo
     "Robot de Ayuda" como descriptor, no como nombre propio). Los
     comentarios internos y el nombre del componente (`HelpBot.jsx`) se
     dejaron igual — es el nombre de cara al usuario el que cambió, no el
     interno de desarrollo.
  2. `frontend/src/utils/helpSearch.js` — nuevo `stripVocative()`: si la
     consulta empieza con "Click" seguido de coma/puntuación (con o sin un
     saludo antes, ej. "Oye Click,"), se quita antes de buscar. Aplicado en
     `searchTopics`, `searchFaq` y `detectStatusIntent` — los 3 puntos de
     entrada que usan tanto el buscador de `MesaDeAyuda.jsx` como el chat de
     `HelpBot.jsx`. Ojo con el criterio: solo se quita cuando "click" viene
     con una coma/puntuación justo después (un saludo real) — un "click"
     suelto sin coma se deja tal cual, porque puede ser parte de un
     problema real (ej. "click derecho no funciona").
- **Probé:** con el mismo harness Node (ESM) de la sesión anterior, comparé
  resultados con y sin el nombre para varias consultas ("¿cómo reporto?",
  "no me llegan correos", "la impresora no imprime nada") — mismo resultado
  y mismo score en los 3 casos. Confirmé también que "click derecho no
  funciona en mi mouse" (sin coma) NO se le quita el nombre y sigue
  encontrando el problema real de mouse. `npm run build` del frontend sin
  errores; verifiqué el bundle de producción para confirmar que los textos
  nuevos ("Click 🤖", "soy Click, tu Robot de Ayuda") quedaron adentro.
- **Commit(s):** `6ffcbc0`

---

### 2026-07-27 — Robot de Ayuda: tolera frases naturales y explica la ruta de clics, no solo el link
- **Qué pasó:** el usuario pidió que el Robot de Ayuda (chat flotante 🤖) fuera
  "más interactivo", con este ejemplo puntual: la frase "no me llegan los
  correos institucionales a mi correo, ¿dónde reporto?" no encontraba nada
  útil. Investigué el motor de búsqueda (`utils/helpSearch.js`, compartido
  por el buscador de `MesaDeAyuda.jsx` y por `HelpBot.jsx` — 100% basado en
  reglas, sin IA, decisión explícita anterior del usuario para no pagar
  tokens) y confirmé el bug: `scoreKeywords()` solo daba puntos a una frase
  de varias palabras (ej. "no me llegan correos") si aparecía **tal cual**,
  como substring literal, dentro de la consulta completa. La palabra de
  relleno "los" insertada en medio rompía el match exacto, y la consulta
  terminaba cayendo en un falso positivo ("Soporte BI", por un match difuso
  sobre "reporto"/"reporte").
- **Qué implementé:**
  1. `frontend/src/utils/helpSearch.js` (`scoreKeywords`) — para keywords de
     varias palabras que no vinieron completas y en orden, ahora también
     puntúa si TODAS sus palabras significativas (4+ letras) aparecen
     sueltas en la consulta, en cualquier orden (tolera relleno/reordenado
     natural, ej. "los", "a mi"). Los matches de substring exacto siguen
     valiendo más (`fullWeight` vs `wordWeight`), así que una frase completa
     sigue ganándole a un match parcial.
  2. `frontend/src/config/ticketCategories.js` — nuevo helper
     `categoryPath(cat)`: arma la ruta real de clics (sección → tarjeta →,
     si aplica, Computadoras/Celulares) para llegar a cualquier categoría,
     incluidas las `hidden` de device-split (ej. `software_pc` resuelve a
     través de su padre `software` con `deviceOptions`).
  3. `frontend/src/utils/helpSearch.js` (`buildTicketResult`) — cada
     resultado de tipo ticket ahora incluye en su `hint` la ruta completa en
     lenguaje de usuario (ej. "Ruta: Tengo un problema → Programas y
     sistemas → Software → Computadoras → Mi correo no manda o no me llegan
     correos"), no solo la etiqueta de la categoría — así la persona aprende
     dónde reportar la próxima vez, además de que el botón la lleve directo
     ahí. No hizo falta tocar `HelpBot.jsx` ni `MesaDeAyuda.jsx`: ambos ya
     renderizan `r.hint` tal cual, y comparten el mismo motor.
- **Probé:** copié `helpSearch.js`/`ticketCategories.js`/`faqData.js` a un
  harness Node (ESM) aparte y corrí ~8 consultas reales, incluida la frase
  exacta del usuario — ahora resuelve correctamente a "Mi correo no manda o
  no me llegan correos" (antes: 0 resultados relevantes, falso positivo en
  Soporte BI). También corrí `npm run build` completo del frontend, sin
  errores. Quedó pendiente (fuera de alcance, requiere nueva infraestructura
  de pago): un asistente con IA real que sostenga una conversación libre —
  el usuario decidió explícitamente no ir por ahí por ahora.
- **Commit(s):** `f5dcd87`

---

### 2026-07-24 — Tepotzotlán II/III/IV es exclusivo de Felipe, no compartido con el resto de Sistemas
- **Qué pasó:** justo después del cambio anterior (Felipe solo recibe
  Tepotzotlán II/III/IV), el usuario aclaró: "Evidentemente sistemas.3,
  becario.sistemas y lider.infra.soporte no debemos recibir los de
  Tepotz". La primera versión solo quitaba a Felipe de la lista general
  cuando la sucursal NO era Tepotz, pero para Tepotz lo agregaba de
  vuelta a la MISMA lista compartida — el resto de Sistemas seguía
  recibiendo esos tickets también. Eso no era lo que se pedía.
- **Qué implementé:** `backend/src/routes/tickets.js`,
  `getTicketEmailRecipients()` — cambié el enrutamiento general de un
  "quitar a Felipe de la lista compartida" a una rama exclusiva de
  verdad: si la sucursal del empleado es Tepotzotlán II/III/IV, el
  único destinatario es Felipe (`FELIPE_EMAIL`), punto — ni siquiera se
  consulta la lista de admins. Si no, se consulta la lista de admins
  normal y se excluye a Felipe. Mismo criterio de "lista exclusiva" que
  ya usan Seguridad/BI/Ventas/Gestor de Constancias, en vez de un filtro
  sobre una lista compartida.
- **Probé** contra el backend real (local, mismo Mongo, credenciales de
  Telegram/Azure en blanco): un ticket de un empleado de prueba en
  TEPOTZOTLAN III llegó únicamente a Felipe; el mismo ticket desde un
  empleado de POLANCO PISO 13 llegó a los otros 3 admins de Sistemas,
  sin Felipe. Limpié todos los datos de prueba al terminar.
- **Commit(s):** `94cc067`

---

### 2026-07-24 — Felipe (sistemas.4) solo recibe correo de tickets de Tepotzotlán II/III/IV
- **Qué pasó:** el usuario pidió que a Felipe (sistemas.4@selectshop.com.mx)
  solo le llegue el correo de aviso de tickets nuevos cuando el empleado
  que reporta es de sucursal Tepotzotlán II, III o IV — "él atiende los
  de allá y no atiende piso 13 ni nada de eso". Confirmé que hoy Felipe
  es admin normal y recibía el aviso de TODOS los tickets (sin importar
  sucursal), igual que cualquier otro de Sistemas.
- **Qué implementé:** `backend/src/routes/tickets.js`,
  `getTicketEmailRecipients()` — nueva constante `FELIPE_OFFICES`
  (`TEPOTZOTLAN II/III/IV`). En el enrutamiento general (tickets que no
  caen en ninguna regla especial de Seguridad/BI/Ventas/Solicitud de
  Pagos/Gestor de Constancias — esas ya tienen su propia lista fija de
  correos, sin Felipe), se le quita de la lista de destinatarios a
  menos que la sucursal del empleado sea una de esas 3. La sucursal
  (`Employee.office`) no viajaba en el JWT del empleado — se agregó una
  consulta aparte (no bloqueante, mismo criterio "nunca debe demorar ni
  romper la respuesta" que ya tenía el resto de este bloque).
- **No toqué:** los correos de reglas especiales (Seguridad, Soporte BI,
  Solicitud de Pagos, Ventas, Gestor de Constancias) — Felipe nunca
  estuvo en esas listas fijas, así que no aplica ahí. Tampoco toqué el
  enrutamiento de tickets tipo ERP (Felipe no tiene el permiso de
  Plataformas ERP, así que tampoco estaba ahí).
- **Probé** contra el backend real (local, mismo Mongo, con las
  credenciales de Telegram/Azure en blanco a propósito para no mandar
  avisos reales): un ticket de un empleado de prueba en TEPOTZOTLAN II
  incluyó a Felipe en la lista de destinatarios; el mismo ticket desde
  un empleado de POLANCO PISO 13 lo excluyó — el resto de Sistemas
  siguió recibiendo ambos en los dos casos, sin cambio. Limpié todos
  los datos de prueba al terminar.
- **Pendiente (aparte, a petición del usuario):** etiquetar a Leonardo
  y Yoseline en el aviso de Telegram cuando el ticket es tipo ERP — se
  quedó pendiente hasta tener sus IDs de Telegram (@userinfobot).
- **Commit(s):** `0dfaab9`

---

### 2026-07-24 — Los avisos de Telegram de tickets ya traen link directo al ticket
- **Qué pasó:** el usuario pidió que las notificaciones de Telegram
  (ticket nuevo, mensaje nuevo del empleado) trajeran un link para
  llegar directo a ese ticket en el panel, en vez de solo decir
  "Revisa en Tickets".
- **Qué implementé:** `backend/src/routes/tickets.js` — nuevo helper
  `ticketAdminUrl(ticketId)`, usado en los 2 avisos de Telegram
  relacionados a tickets (ticket nuevo y mensaje nuevo del empleado).
  El link va vía `/login?next=...` (mismo patrón ya usado en el correo
  de aviso) y no directo a la ruta protegida: quien abre el link desde
  el celular (típico con Telegram) puede no tener sesión iniciada ahí
  — yendo directo, `PrivateRoute` solo muestra un 404 genérico sin
  forma de continuar. Con `/login?next=`, ve el login real y al entrar
  sigue derecho al ticket (reusa el `?ticket=<id>` que ya abre el
  detalle solo, agregado antes hoy para las notificaciones push).
- **Aparte, encontrado de paso:** las pruebas de tickets que hice hoy
  contra `POST /tickets/mine` (varias, a lo largo de la sesión)
  probablemente sí mandaron avisos reales al Telegram de Sistemas, ya
  que esa ruta manda el aviso sin condición — no hay forma de deshacer
  mensajes ya enviados. Para verificar este cambio en particular corrí
  el backend local con `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` en
  blanco a propósito (el guard de `notifyTelegram` los deja sin mandar
  nada), confirmando que la creación de tickets y de mensajes sigue
  funcionando sin tronar — sin volver a mandar avisos reales de prueba.
- **Commit(s):** `5bd2725`

---

### 2026-07-24 — Revertido: el intento de acotar el alto de las tablas se veía peor
- **Qué pasó:** el fix de la entrada de abajo (acotar `.tableWrap` con
  `max-height` para que la barra de scroll horizontal quedara a la
  mano) el usuario lo probó y se veía mal — la tabla quedaba como una
  cajita chica (solo 3 renglones visibles) con un hueco en blanco
  abajo, porque el alto reservado para encabezado/filtros no coincidía
  con lo que en verdad ocupan en pantalla.
- **Qué hice:** revertí `Page.module.css` y `ResponsivasArchive.module.css`
  a exactamente como estaban antes de ese commit (`git diff` contra el
  commit anterior sale vacío, confirmado) — la tabla vuelve a ocupar
  todo el alto que necesite, sin encabezados fijos ni límite de alto.
  Vuelve el comportamiento original: para llegar a la barra de scroll
  horizontal hay que bajar hasta el final de la tabla, como antes de
  hoy.
- **Pendiente si se quiere resolver de verdad:** se le presentó al
  usuario una segunda opción (una barra de scroll delgada, pegada al
  fondo de la ventana mientras la tabla sigue a la vista, sin acotar su
  alto) — es más trabajo de programar y no se puede probar visualmente
  sin navegador en este entorno; el usuario prefirió regresar a como
  estaba por ahora en vez de arriesgarse a otro intento.
- **Commit(s):** `ce81e27`

---

### 2026-07-24 — Fix: barra de scroll horizontal hasta el fondo de tablas largas (Empleados, Responsivas)
- **Qué pasó:** el usuario reportó que en Empleados (260 renglones) y en
  Responsivas (81 documentos), para ver las columnas que no caben en
  pantalla tenía que bajar hasta el final de TODA la tabla para
  encontrar la barra de scroll horizontal.
- **Causa real:** `.tableWrap` (contenedor de la tabla, compartido por
  Empleados/Activos/Asignaciones/Cuentas Compartidas/Impresoras vía
  `Page.module.css`, y por separado en `ResponsivasArchive.module.css`)
  solo tenía `overflow-x: auto`, sin límite de alto — con muchos
  renglones, el contenedor crecía tanto como la tabla, así que su barra
  horizontal quedaba pegada hasta el final de esa tabla gigante, no a la
  vista.
- **Fix:** se acotó el alto de `.tableWrap` (`max-height` relativo a la
  pantalla) con `overflow: auto` en ambos ejes — ahora la tabla tiene su
  propio scroll (vertical y horizontal) dentro de lo que ya se ve en
  pantalla, sin tener que bajar toda la página. De paso, los
  encabezados de columna (`.table th`) quedan fijos arriba mientras se
  hace scroll vertical, para no perder de vista qué es cada columna.
  Como `Page.module.css` es compartido, el arreglo aplica también a
  Activos, Asignaciones, Accesorios, Cuentas Compartidas e Impresoras.
- **Commit(s):** `03af315`

---

### 2026-07-24 — ERP-only gana acceso de solo lectura a Empleados
- **Qué pasó:** el usuario pidió que lider.erp/analista.erp (ERP-only,
  antes bloqueados de Empleados por completo, ver `NotErpOnlyRoute`)
  pudieran ver Empleados para correlacionar un correo corporativo con la
  persona — pero de SOLO LECTURA, sin activos/equipo asignado ni otras
  cuentas (Gmail/Plataformas), y con un indicador de si ya tiene acceso
  ERP dado de alta.
- **Qué implementé:**
  - `backend/src/routes/employees.js` — nuevo helper local
    `isErpOnlyUser()` (mismo criterio que ya existe en `tickets.js`).
    `GET /` y `GET /:id` devuelven un payload recortado para ERP-only
    (`nombre, no. empleado, puesto, área, departamento, razón social,
    correo corporativo, activo` + `hasErpAccess` calculado contra
    `PlatformAccountErp`) — sin teléfono, oficina, Gmails, ni activos
    asignados. Las rutas de escritura (`POST /`, `PUT /:id`,
    `DELETE /:id`, `split-naucalpan`, `reset-portal-access`) rechazan a
    ERP-only con 403 — no es solo que el botón no se muestre, el
    servidor también lo bloquea si alguien llama la ruta directo.
  - `frontend/src/pages/EmployeesErp.jsx` (nuevo) — tabla de solo
    lectura con esos mismos campos, componente aparte en vez de
    "recortar" `Employees.jsx`/`EmployeeDetail.jsx` (esos son grandes y
    llenos de funciones de escritura que aquí no aplican en absoluto).
  - `frontend/src/App.jsx` — `employees` ahora usa `EmployeesRoute`
    (nuevo): si es ERP-only, renderiza `EmployeesErp`; si no, seguía
    igual que antes. `employees/:id` se deja bloqueado (no hay ningún
    link que lleve ahí desde lo que ERP-only sí puede usar, y la lista
    ya trae todo lo necesario).
  - `frontend/src/components/Layout.jsx` — se agregó "Empleados" al
    menú propio de ERP-only (`erpOnlyPages`), para que tengan un link
    real y no dependan de escribir la URL a mano.
  - Probé contra el backend real (local, mismo Mongo): una sesión
    ERP-only de prueba confirmó que `GET /employees`/`GET /employees/:id`
    devuelven solo los campos permitidos (sin teléfono/oficina/Gmails,
    sin activos) con `hasErpAccess` correcto, y que crear/editar/borrar
    un empleado se rechaza con 403 — una sesión admin normal de prueba
    confirmó que sigue viendo todo sin restricción (sin regresión).
    Limpié todos los datos de prueba al terminar.
- **Commit(s):** `7d2e8b9`

---

### 2026-07-24 — Fix: las responsivas ya caben en una sola hoja (firmas ya no se van a página 2)
- **Qué pasó:** el usuario mandó captura de la Responsiva de Acceso ERP —
  las obligaciones (sección 3, larga) empujaban la tabla de firmas
  (sección 4) a una SEGUNDA página casi vacía, fea de imprimir a doble
  cara.
- **Causa real:** `backend/src/utils/pdfBranding.js` (compartido por las
  4 responsivas del proyecto: ERP, Plataformas, Gmail y la genérica de
  equipo) tenía padding fijo generoso en cada párrafo de obligaciones
  (`clauseBlock`, +7pt por párrafo — con 11 párrafos en la de ERP, ~77pt
  solo de aire) más un margen de página de 36pt — nada crítico por sí
  solo, pero sumado era justo lo que sobraba para no caber en una hoja
  Carta.
- **Qué recorté** (todo en puntos, imperceptible al leer, no se tocó
  ningún tamaño de fuente del cuerpo del texto):
  - `pdfBranding.js` — `MARGIN` 36→28, `sectionBand` (franja de cada
    sección) 18→15pt de alto, `clauseBlock` (cada párrafo de
    obligaciones) de +7pt de padding a +2pt.
  - `backend/src/routes/platformAccountsErp.js` — espaciados del
    encabezado y entre secciones recortados unos puntos cada uno, y la
    tabla de firmas de 72pt a 62pt de alto (con las 3 cajas de firma
    todavía cómodas).
  - Como `pdfBranding.js` es compartido, este recorte beneficia por
    igual a las otras 3 responsivas (nunca las hace más apretadas de lo
    que ya estaban, solo les da más margen de sobra al final).
- **Probé** contra el backend real (local, mismo Mongo): generé la
  Responsiva de ERP con los mismos 10 módulos marcados que la captura
  del usuario — cupo en **1 sola página** con ~126pt de margen de
  sobra al final. Repetí con textos mucho más largos en Justificación,
  Empresas del grupo, Jefe directo y Vigencia (peor caso realista) — 
  siguió cabiendo en 1 página, con ~93pt de sobra. Limpié todos los
  datos y responsivas de prueba al terminar.
- **Commit(s):** `33cb3db`

---

### 2026-07-24 — ERP-only ya no ve Monitoreo/Aplicaciones Internas/Cuentas Compartidas/Impresoras
- **Qué pasó:** el usuario notó que un usuario ERP-only (lider.erp/
  analista.erp — ya solo ve tickets tipo `erp`, ver `canViewTicket` en
  `backend/src/routes/tickets.js`) seguía viendo en el sidebar de
  Tickets categorías que no le corresponden en absoluto: Monitoreo,
  Aplicaciones Internas, Cuentas Compartidas e Impresoras — son
  catálogos/herramientas del área completa de Sistemas, no algo
  específico de ERP.
- **Qué implementé:**
  - `frontend/src/pages/TicketsLayout.jsx` — esas 4 categorías del
    sidebar se marcaron `erpHidden: true` y se filtran del menú cuando
    `isErpOnlyUser(currentUser)`.
  - `frontend/src/App.jsx` — Cuentas Compartidas e Impresoras ya estaban
    bloqueadas por ruta (`NotErpOnlyRoute`) y Aplicaciones Internas por
    `AdminRoute` desde que se crearon, así que ya no eran accesibles
    escribiendo la URL a mano aunque el link estuviera visible. Monitoreo
    **sí** tenía ese hueco real (sin ningún guard más allá del acceso
    general a Tickets) — se le agregó `NotErpOnlyRoute` también, para
    que esconder el link del menú no sea la única protección.
- **Commit(s):** `23685ed`

---

### 2026-07-24 — Tickets: la lista se actualiza sola, sin Ctrl+R
- **Qué pasó:** el usuario reportó que un ticket nuevo (o una respuesta
  del empleado) no aparecía en el panel de Sistemas hasta recargar la
  página a mano — `TicketsLayout.jsx` solo pedía los tickets una vez al
  entrar, sin ningún refresco automático.
- **Qué implementé:** `frontend/src/pages/TicketsLayout.jsx` — `load()`
  ahora acepta un modo `silent` y se llama sola cada 20 segundos de
  fondo (`setInterval`), sin tocar el estado `loading` — así no tapa el
  tablero con "Cargando..." cada vez ni interrumpe si hay un modal
  abierto o un formulario a medio llenar. Como todas las sub-páginas de
  Tickets (Dashboard, Tablero, Notas internas, etc.) ya leen `tickets`
  del mismo contexto compartido, se actualizan todas solas sin tocar
  nada más.
- **Efecto secundario bienvenido:** este ping cada 20s también ayuda a
  que el backend en Render (plan gratuito) se mantenga despierto con
  más regularidad — relevante para la caída que Uptime Robot reportó
  antes hoy.
- **Commit(s):** `97fbb92`

---

### 2026-07-24 — Notificaciones push también para Sistemas (cuando el empleado responde)
- **Qué pasó:** ya existían notificaciones push del lado empleado (Mesa de
  Ayuda) cuando Sistemas responde un ticket. El usuario pidió lo mismo al
  revés: que a él (Sistemas) le llegue un push cuando el empleado
  responde un ticket que tiene asignado.
- **Qué implementé:**
  - `backend/src/models/User.js` — mismo campo `pushSubscriptions[]` que
    ya tenía `Employee`.
  - `backend/src/utils/webPush.js` — se compartió la lógica de envío
    entre las dos identidades (antes solo `sendPushToEmployee`, ahora
    también `sendPushToUser`), sin duplicar el código de envío/limpieza
    de suscripciones caducadas.
  - `backend/src/routes/adminPushSubscriptions.js` (nuevo) — espejo de
    `pushSubscriptions.js` pero protegido con `auth` (sesión de
    Sistemas) en vez de `employeeAuth`, guarda en `User`.
  - `backend/src/routes/tickets.js`, `POST /:id/messages` (cuando el
    empleado manda un mensaje) — si el ticket tiene alguien asignado, le
    manda un push (fire-and-forget, igual que el resto). Sin asignar, no
    se manda nada en particular (el aviso de Telegram ya cubre ese caso).
  - **Detalle importante que hubo que resolver**: Mesa de Ayuda y el
    panel admin comparten el MISMO service worker/origen (un solo
    `PushManager` por navegador, no uno por identidad) — si alguien ya
    estaba suscrito de un lado, el navegador ya "tenía" la suscripción al
    abrir el otro lado, pero el backend correcto (Employee vs User)
    nunca se enteraba. Se corrigió en
    `frontend/src/hooks/usePushSubscription.js`: cada vez que se detecta
    una suscripción ya existente, se vuelve a mandar (POST) al backend
    de la identidad actual — y "desactivar" ya NO mata la suscripción a
    nivel navegador (eso hubiera apagado las notificaciones de la OTRA
    identidad también), solo borra el registro del backend de quien pidió
    desactivar.
  - `frontend/src/pages/TicketsLayout.jsx` — banner de activación (mismo
    componente `PushNotificationBanner`, reusado con la paleta de color
    del panel admin vía la nueva clase `.adminTheme`) y soporte de
    `?ticket=<id>` en la URL para que el clic en la notificación abra
    directo ese ticket (mismo patrón que ya tenía `MisTickets.jsx`).
  - Probé contra el backend real (local, mismo Mongo): un admin de
    prueba se suscribió, un ticket de prueba se le asignó, el empleado
    mandó un mensaje y la respuesta no truena aunque la suscripción sea
    inválida (falla en silencio, como debe ser) — limpié todos los datos
    de prueba al terminar.
- **Commit(s):** `05a708e`

---

### 2026-07-24 — Notas internas: agrupadas por ticket, modal ligero al abrir
- **Qué pasó:** el usuario reportó que la categoría "Notas internas"
  (feed agregado de todos los tickets) listaba **una fila por nota** —
  un ticket con 5 notas producía 5 filas casi idénticas — y que al hacer
  clic se abría el **ticket completo** (estatus, asignación, SLA,
  conversación). Su punto: ahí lo que importa es ver el procedimiento
  seguido en ese ticket (para consultarlo cuando se repite un problema
  parecido), no administrar el ticket — para eso ya está el
  Buscador/Tablero.
- **Qué cambié:**
  - `frontend/src/pages/TicketsNotasInternas.jsx` — ahora agrupa por
    ticket (una fila por ticket, con la nota más reciente como vista
    previa + cuántas notas tiene en total), no por nota individual.
  - `frontend/src/components/InternalNotesPanel.jsx` (nuevo) — el
    bloque de Notas internas (leer + agregar, con imagen/video y pegar
    con Ctrl+V) se extrajo de `TicketDetailModal.jsx` a su propio
    componente reutilizable, sin arrastrar el resto del detalle del
    ticket.
  - `frontend/src/pages/TicketNotesModal.jsx` (nuevo) — modal ligero
    "solo notas" (folio + asunto como encabezado) que usa
    `InternalNotesPanel` — es lo que abre ahora el clic en Notas
    internas, en vez de `TicketDetailModal`.
  - `frontend/src/utils/clipboardImage.js` (nuevo) — la función de
    "pegar imagen con Ctrl+V" se compartió entre el chat con el
    empleado y las Notas internas (antes vivía duplicada/local dentro
    de `TicketDetailModal.jsx`).
  - `TicketDetailModal.jsx` (el modal completo del ticket, usado en
    Tablero/Buscador/Chats) sigue mostrando Notas internas igual que
    antes — ahora vía el mismo componente compartido, sin cambio de
    comportamiento ahí.
- **Commit(s):** `98ddd33`

---

### 2026-07-24 — Un ticket resuelto/cerrado ya no se puede reabrir
- **Qué pasó:** el usuario pidió quitar por completo la posibilidad de
  reabrir un ticket. Encontré 2 mecanismos distintos y, confirmado con el
  usuario, se quitaron los dos.
- **Qué quité:**
  - `backend/src/routes/tickets.js`, `POST /:id/messages` — antes, un
    mensaje nuevo del empleado sobre un ticket "resuelto" lo reabría
    solo (`resuelto` → `abierto`, limpiando la resolución y la
    calificación). Ahora el mensaje se agrega igual a la conversación,
    pero el estatus y la resolución ya capturada se quedan como están.
  - `PUT /:id/status` — se quitó la lógica que limpiaba la resolución al
    "reabrir", y se agregó un rechazo explícito (400) si alguien intenta
    mandar `abierto`/`en_proceso` cuando el ticket ya está
    `resuelto`/`cerrado` — por si se llama la ruta directo, no solo
    desde el botón.
  - `frontend/src/pages/TicketDetailModal.jsx` — se quitó el botón
    "Reabrir" que usaba Sistemas a mano. Sigue existiendo "Cerrar
    ticket" (resuelto → cerrado, dirección normal del flujo).
- **Probé** contra el backend real (local, mismo Mongo): un ticket de
  prueba marcado resuelto, un mensaje nuevo del empleado ya NO lo
  reabre (se queda "resuelto"), un intento manual de mandarlo a
  "abierto" o "en_proceso" se rechaza con 400 tanto desde "resuelto"
  como desde "cerrado", y "resuelto → cerrado" (el flujo normal) sigue
  funcionando bien. Limpié los datos de prueba al terminar.
- **Commit(s):** `ae987b5`

---

### 2026-07-24 — Pegar imágenes con Ctrl+V (Notas internas y Responder)
- **Qué pasó:** el usuario pidió, justo después de poder adjuntar imágenes
  y videos en Notas internas, poder pegar una imagen directo del
  portapapeles (ej. una captura de pantalla) en vez de tener que guardarla
  primero y elegirla del selector de archivos.
- **Qué implementé:** `pages/TicketDetailModal.jsx` — `onPaste` en el
  textarea de Notas internas y en el de Responder (chat con el empleado):
  si el portapapeles trae una imagen, se trata igual que si se hubiera
  elegido con el botón de adjuntar (misma validación de tamaño). El
  `File` que da el navegador casi siempre no trae nombre real — se le
  pone uno (`pegado-<fecha>.png`) para que se vea legible en el chip de
  "archivo adjunto" antes de enviar.
- **Commit(s):** `120e855`

---

### 2026-07-24 — Notas internas: adjuntar imágenes y videos (vía GridFS)
- **Qué pasó:** el usuario pidió, como urgente, poder adjuntar imágenes y
  videos a las Notas internas de un ticket (la bitácora técnica privada,
  solo la ve Sistemas). Antes solo era texto.
- **Por qué no es igual que los demás adjuntos del proyecto:** todo lo
  demás (foto del reporte, imagen del chat) se guarda como `Buffer`
  embebido directo en el propio `Ticket` — MongoDB tiene un límite duro de
  16MB **por documento completo**, compartido entre mensajes, notas y
  adjuntos de ese ticket. Un video de celular de pocos segundos ya lo
  rebasa, y de paso dejaría el ticket entero sin poder guardarse nunca
  más (ni un cambio de estatus). Se le preguntó al usuario el tamaño real
  que necesita (30-100MB+) y se implementó con **GridFS** — la misma
  MongoDB Atlas que ya tiene, sin pagar un storage externo nuevo: parte
  el archivo en pedazos en una colección aparte (`noteAttachments.files`/
  `.chunks`), sin el límite de 16MB.
- **Qué implementé:**
  - `backend/src/utils/gridfs.js` (nuevo) — bucket GridFS con
    `uploadBuffer`/`downloadStream`/`deleteFile`, primera vez que se usa
    esta técnica en el proyecto.
  - `backend/src/models/Ticket.js` — `internalNoteSchema` ahora acepta
    `attachmentId` (apunta a GridFS, no es el archivo en sí),
    `attachmentMimeType`, `attachmentFileName`; `text` ya no es
    obligatorio (una nota puede ser solo una foto/video).
  - `backend/src/routes/tickets.js` — `POST /:id/internal-notes` acepta
    multipart (imagen o video, límite 80MB); nueva
    `GET /:id/internal-notes/:noteId/attachment` (protegida igual que el
    resto de Notas internas — nunca accesible por el empleado); borrar un
    ticket ahora también limpia los archivos de GridFS que tuviera, para
    no dejar huérfanos.
  - `components/MessageAttachmentImage.jsx` — generalizado para recibir
    la URL del adjunto directo (antes solo servía para mensajes del chat)
    y mostrar `<video controls>` cuando el mimetype es de video.
  - `pages/TicketDetailModal.jsx` — input "📷🎥 Adjuntar imagen o video" en
    el formulario de Notas internas, mismo patrón visual que ya existía
    para Responder.
  - Probé contra el backend real (local, mismo Mongo): subí una imagen y
    un video de prueba de 20MB, confirmé que se guardan y se pueden
    volver a descargar byte por byte idénticos (hash SHA-256 igual antes
    y después), que un archivo de más de 80MB se rechaza, que un tipo no
    permitido se rechaza, y que borrar el ticket de prueba limpió los
    archivos de GridFS sin dejar huérfanos — limpié todo al terminar.
- **Commit(s):** `d7327e0`

---

### 2026-07-24 — Fix: el panel de Sistemas no se adaptaba del todo al tema oscuro
- **Qué pasó:** el usuario reportó (en Mac Studio, con el sistema en modo
  oscuro) que la app "se ve fea" — al investigar, el problema real es que
  varias partes centrales del panel admin se quedaban con su fondo claro
  fijo aunque el resto de la página ya estuviera oscura.
- **Causa real:** no hay un sistema de variables de tema — cada CSS module
  del panel admin "parcha" su propio `@media (prefers-color-scheme: dark)`
  por separado (18 de 37 archivos ya lo tenían). Dos huecos grandes sin
  ningún parche:
  - `components/Layout.module.css` — el overlay de **"Menú"** (la pantalla
    principal de navegación, la que más se usa de todo el panel: tarjetas
    de categorías, "Menú"/cerrar) se quedaba 100% blanco fijo.
  - `pages/TicketsLayout.module.css` — el sidebar de **todo el módulo de
    Tickets** (Dashboard, General, Monitoreo, Chats, Notas, Buscar, SLA,
    Calificaciones, Escalamiento, Aplicaciones, Cuentas Compartidas,
    Impresoras) no tenía ningún ajuste, ni una línea.
  - `pages/Page.module.css` (Empleados/Activos/Cuentas Compartidas/
    Impresoras) — cobertura parcial: pills y botones con fondo pastel
    (`.typeBadge`, `.btnDelete`, `.btnSecondary`, `.btnResponsiva`)
    quedaban fuera del bloque oscuro ya existente.
- **Fix:** se agregaron los `@media (prefers-color-scheme: dark)` que
  faltaban en esos 3 archivos, con la misma paleta que ya usan
  Dashboard/Tickets (`#1c1e22` tarjeta, `#2c2e33` borde/hover, `#f0f0f0`
  texto). Los fondos pastel por categoría (`--accent-bg`, distinto en cada
  tarjeta del Menú) se colapsan a un neutro oscuro fijo en modo oscuro —
  el color que sí distingue cada categoría (borde/ícono, vía `--accent`)
  no se toca.
- **No tocado a propósito:** Mesa de Ayuda (portal de empleado) es
  siempre oscura por diseño, no depende del tema del sistema — no aplica
  este bug. `NotFound.module.css` y `UpdateToast.module.css` ya son
  oscuros fijos por diseño propio, tampoco necesitaban nada.
- **Commit(s):** `f1e71a1`

---

### 2026-07-24 — Fix: seleccionar un nombre de la lista "no hacía nada" (Mac)
- **Qué pasó:** el usuario reportó en Mac que al escribir un nombre (probó
  con "Miguel Ugalde") y tocar la sugerencia de la lista, no pasaba nada —
  ni se llenaba el campo ni avanzaba.
- **Causa real:** el input cierra la lista de sugerencias con `onBlur`,
  agendado 150ms después vía `setTimeout` (para darle tiempo al clic de
  la opción de registrar antes de que la lista desaparezca). Pero las
  opciones solo tenían `onClick`, no `onMouseDown` — en la secuencia real
  de eventos del navegador (`mousedown` → `blur` → `mouseup` → `click`),
  cualquier cosa que retrase el `mouseup` más de esos 150ms (un clic con
  ligero arrastre en trackpad, un re-render de por medio) hace que React
  desmonte el botón antes de que el `click` llegue a dispararse —
  "seleccionar no hace nada", justo lo reportado.
- **Fix:** `onMouseDown={(e) => e.preventDefault()}` en cada opción de la
  lista — evita que el input pierda el foco en primer lugar, así ya no
  depende de ganarle una carrera de 150ms al render. Mismo patrón
  corregido en los 7 selectores de nombre/activo que lo tenían:
  `SolicitarCuenta.jsx`, `SolicitarIngreso.jsx`, `SolicitarRecurso.jsx`,
  `BajaPersonal.jsx`, `ConfirmarEnvio.jsx`, `CreateShipmentModal.jsx` y
  `NetworkLayoutDetail.jsx` (2 selectores ahí).
- **Commit(s):** `2666595`

---

### 2026-07-24 — Notificaciones push en Mesa de Ayuda cuando Sistemas responde un ticket
- **Qué pasó:** el usuario reportó como urgente que los empleados "no ven"
  cuando Sistemas les responde un ticket — antes de esto, solo se
  enteraban si tenían la pestaña de "Mis tickets" abierta (había polling
  cada 5s, nada más). Pidió notificaciones push tipo WhatsApp.
- **Qué implementé (construido desde cero, no existía nada de esto):**
  - Backend: `web-push` (npm) + par de llaves VAPID generado una sola vez.
    `backend/src/models/Employee.js` — nuevo campo `pushSubscriptions[]`
    (una persona puede tener el navegador suscrito desde más de un
    dispositivo). `backend/src/utils/webPush.js` — `sendPushToEmployee()`,
    best-effort igual que `utils/telegram.js` (nunca rompe el flujo
    principal si falla), limpia automáticamente cualquier suscripción que
    el navegador ya invalidó (404/410). Nuevo
    `backend/src/routes/pushSubscriptions.js` (`POST /` y
    `POST /unsubscribe`, protegidas por `employeeAuth`) — al suscribir un
    `endpoint`, se quita primero de cualquier OTRO empleado que ya lo
    tuviera (un mismo dispositivo, ej. una tablet compartida, no debe
    quedar avisando a dos personas a la vez). Se engancha en
    `POST /tickets/:id/reply` (tickets.js): cada respuesta de Sistemas
    dispara un push fire-and-forget al empleado dueño del ticket.
  - Frontend: `public/push-sw.js` (nuevo) con los listeners `push` y
    `notificationclick` — se inyecta al `sw.js` autogenerado por Workbox
    vía `workbox.importScripts` (`vite.config.js`), sin migrar a
    `injectManifest` para no arriesgar la configuración PWA ya afinada
    (2 identidades instalables desde el mismo origen). Nuevo hook
    `usePushSubscription.js` + banner descartable
    `PushNotificationBanner.jsx` (visible en todo el portal, con botón
    "Activar") montado en `PortalLayout.jsx`, que también gana un link
    "Desactivar notificaciones" una vez activas. `MisTickets.jsx` ahora
    lee `?ticket=<id>` de la URL para abrir directo la conversación
    correcta cuando se toca la notificación.
  - **Límite real de plataforma**: en iPhone, push solo funciona si la
    app está agregada a la pantalla de inicio (restricción de Apple, no
    de este código) — el banner detecta esto y muestra cómo instalarla en
    vez de fallar en silencio.
  - Probé contra el backend real (local, mismo Mongo): suscribí una
    cuenta de prueba, confirmé que `POST /tickets/:id/reply` no truena
    aunque la suscripción sea inválida (falla en silencio, como debe
    ser), y probé también desactivar — limpié todos los datos de prueba
    al terminar. `npm run build` confirma que `push-sw.js` termina en
    `dist/` y que el `importScripts` quedó bien inyectado en `dist/sw.js`.
- **Pendiente del lado del usuario (no lo puedo hacer yo):** agregar
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` a las
  variables de entorno del backend en Render, y `VITE_VAPID_PUBLIC_KEY`
  a las de Vercel (mismos valores que quedaron en `backend/.env` local),
  y hacer redeploy manual de ambos — sin esto, el botón "Activar" no va
  a funcionar en producción aunque el código ya esté desplegado.
- **Commit(s):** `f3df2c3`

---

### 2026-07-24 — Fix: la tarjeta del sidebar de Tickets se veía cortada en Notas internas/Monitoreo/Buscador
- **Qué pasó:** el usuario notó que la tarjeta blanca del sidebar de
  Tickets llegaba hasta el final de la pantalla en Dashboard y Tickets,
  pero se veía cortada antes en Notas internas, Monitoreo y Buscador.
- **Causa real:** `TicketsLayout.module.css` (`.wrapper`, flex row) ya
  usaba `align-items: stretch` para que el sidebar igualara el alto del
  contenido de la derecha (fix de una sesión anterior) — pero ese
  "emparejar" es solo ENTRE sidebar y `.main`, no contra el alto real de
  la ventana. En páginas con poco contenido (listas cortas), el renglón
  completo terminaba siendo más bajo que la pantalla, y por lo tanto
  también el sidebar. En Dashboard/Tickets no se notaba porque su propio
  contenido ya era más largo que la ventana.
- **Fix:** `min-height: calc(100vh - 60px - 4rem)` en `.wrapper` (60px =
  topbar fijo, 4rem = padding vertical de `components/Layout.module.css`
  `.main`) — así el renglón (y por lo tanto el sidebar) siempre llega
  como mínimo al final de la pantalla, sin importar cuánto contenido
  tenga cada página.
- **Commit(s):** `6e18549`

---

### 2026-07-24 — Catálogo de Impresoras editable (nueva categoría en Tickets)
- **Qué pasó:** el catálogo de impresoras vivía hardcodeado en
  `frontend/src/config/printerCatalog.js` — cualquier cambio (una
  impresora nueva, una que se dio de baja) requería tocar código o entrar
  a Mongo Atlas directamente. El usuario pidió una categoría dentro de
  Tickets para editarlo él mismo a futuro, y de paso dar de alta las
  impresoras de TEPOTZOTLAN II y TEPOTZOTLAN IV (sin capturar IP, solo
  ubicación y modelo).
- **Qué implementé:**
  - `backend/src/models/Printer.js` (nuevo) — `branch`, `nombre`,
    `modelo` requeridos; `serie` e `ip` opcionales (a diferencia del
    catálogo original, no todas las impresoras nuevas tienen no. de serie
    a la mano al capturarlas). El identificador único ahora es el propio
    `_id` de Mongo, ya no `branch+serie`.
  - `backend/src/routes/printers.js` (nuevo) — `GET /printers/public`
    sin sesión (mismo criterio que `/internal-apps/public`, para que
    Reportar Ticket pueda ofrecer el selector sin sesión de admin) y el
    resto del CRUD (`GET/POST/PUT/DELETE /printers`) detrás de
    `auth, adminOnly`, igual que Aplicaciones Internas.
  - `frontend/src/pages/PrinterCatalog.jsx` (nuevo) — alta/edición/borrado,
    con datalist de sucursales ya usadas para no repetir el nombre a mano.
  - `frontend/src/pages/TicketsLayout.jsx` — nuevo ítem "Impresoras" en el
    sidebar de Tickets, junto a Cuentas Compartidas.
  - `frontend/src/App.jsx` — ruta `/tickets/impresoras`, mismo guard
    `NotErpOnlyRoute` que las demás páginas de catálogo.
  - `frontend/src/pages/ReportarTicket.jsx` — el selector "¿Cuál impresora
    es?" ahora consume `GET /printers/public` vía `employeeApi` en vez de
    importar el archivo estático (que se eliminó).
  - Se migraron las 17 impresoras que ya existían (Naucalpan, Polanco,
    Tepotzotlán Select Shop/Bloom & Blush, Iztapalapa, Cuernavaca) y se
    agregaron las 11 nuevas de TEPOTZOTLAN II/IV pedidas — 28 en total,
    sembradas directo en Mongo real (no hay endpoint de "importar en
    lote", se hizo con un script puntual).
  - Probé contra el backend real (local, mismo Mongo): confirmé que
    `GET /printers/public` devuelve las 28 agrupadas por sucursal
    correctamente y que `GET /printers` (el CRUD) exige sesión de admin
    (401 sin token).
- **Commit(s):** `4556752`

---

### 2026-07-24 — Mesa de Ayuda: sidebar que se puede ocultar/mostrar
- **Qué pasó:** el usuario pidió poder ocultar la barra lateral del portal
  de empleado (Mesa de Ayuda) y volver a mostrarla.
- **Qué implementé:** `frontend/src/components/PortalLayout.jsx` — botón
  circular flotante (pegado al borde del sidebar) que lo desliza fuera de
  la pantalla (`transform: translateX(-100%)`, con transición) y el
  contenido principal ocupa el espacio que deja libre; un segundo clic lo
  regresa. El estado (oculto/visible) se guarda en `localStorage`
  (`mesaDeAyudaSidebarCollapsed`) porque `PortalLayout` se vuelve a montar
  en cada navegación entre páginas del portal — sin esto, el sidebar se
  hubiera vuelto a abrir solo con cambiar de pestaña. El botón se oculta
  en el layout apilado de celular (`max-width: 900px`), donde el sidebar ya
  no es una barra fija que tenga sentido ocultar así.
- **Commit(s):** `541d884`

---

### 2026-07-24 — Cuentas Compartidas: se mueve a Tickets y el login pasa a ser por correo
- **Qué pasó:** el usuario aclaró que Cuentas de Uso Múltiple (ver 2 entradas
  abajo) es específicamente para tablets de Mesa de Ayuda en las CEDIs, y
  que quien reporta ahí puede ser un capturista o técnico de paso en la
  empresa que ni siquiera existe como Employee — por eso el apartado
  pertenece a Tickets (no a Catálogos y Activos) y el dato que se da de
  alta es un correo, no un No. de empleado inventado.
- **Qué cambió:**
  - `frontend/src/pages/CuentasCompartidas.jsx` — "Nueva/Editar cuenta"
    ahora pide **Correo** (se guarda como `employeeId` Y en
    `corporateEmails`, para que el login del portal —que acepta cualquiera
    de los dos, ver `employeeAuth.js`— funcione igual). La tabla muestra
    ese correo en vez del No. de empleado.
  - `frontend/src/components/Layout.jsx` — se quita la tarjeta "Cuentas de
    Uso Múltiple" de Catálogos y Activos.
  - `frontend/src/pages/TicketsLayout.jsx` — nuevo ítem "Cuentas
    Compartidas" en el sidebar de Tickets.
  - `frontend/src/App.jsx` — la ruta pasa de `/cuentas-compartidas` a
    `/tickets/cuentas-compartidas`, anidada dentro de `TicketsLayout`
    (mismo guard `NotErpOnlyRoute` de antes).
  - Probé contra el backend real (local, mismo Mongo): creé una cuenta de
    prueba con `employeeId`/`corporateEmails` = un correo, confirmé que
    `/employee-auth/lookup` la encuentra sin importar mayúsculas/minúsculas
    y que `/employee-auth/activate` genera el token con
    `isSharedAccount: true` — limpié la cuenta de prueba al terminar.
- **Commit(s):** `bc9b40f`

---

### 2026-07-24 — Reportar un problema: pedir quién reporta de verdad en tablets compartidas
- **Qué pasó:** después de dar de alta las Cuentas de Uso Múltiple (ver
  entrada anterior), el usuario aclaró que ese login compartido es
  específicamente para una **tablet en Mesa de Ayuda que usan varias
  personas distintas**. Sin nada más, todos los tickets reportados desde
  esa tablet se iban a ver como reportados por la misma cuenta (ej.
  "AUXILIAR DEVOLUCIONES"), sin forma de saber cuál de las varias
  personas de verdad necesitaba ayuda con cada ticket.
- **Dónde se pide y dónde se ve (decidido con el usuario):** se pide el
  nombre real al ENTRAR a "Reportar un problema" (no al iniciar sesión en
  la tablet, porque la tablet la usan varias personas seguidas) y se
  muestra SOLO en el ticket dentro del panel de Sistemas — no se agrega
  al correo de aviso ni a "Mis tickets" de la tablet.
- **Qué implementé:**
  - `backend/src/models/Ticket.js` — nuevo campo
    `sharedAccountReporterName` (string, default `''`).
  - `backend/src/routes/tickets.js` — `POST /mine` exige y guarda
    `sharedAccountReporterName` cuando `req.employee.isSharedAccount` es
    verdadero (dato que ya viaja en el JWT, sin consulta extra a
    Empleados); se ignora en silencio si lo manda alguien que no es
    cuenta compartida.
  - `frontend/src/pages/ReportarTicket.jsx` — paso obligatorio "¿Quién
    eres?" antes de cualquier otra cosa del wizard, solo cuando
    `employeeUser.isSharedAccount` es verdadero; se vuelve a pedir cada
    vez que se usa "Reportar otro ticket" (la tablet puede pasar a otra
    persona justo después de enviar).
  - `frontend/src/pages/TicketDetailModal.jsx` — el nombre real aparece
    entre paréntesis junto al de la cuenta compartida en "Reportado por".
  - Probé contra el backend real (local, mismo Mongo): creé una cuenta
    compartida de prueba, confirmé el rechazo (400) al mandar el ticket
    sin `sharedAccountReporterName`, el éxito al mandarlo con un nombre,
    y que `GET /tickets/mine` lo devuelve junto al ticket — limpié el
    ticket y la cuenta de prueba al terminar.
- **Commit(s):** `4f23f54`

---

### 2026-07-24 — Nuevo apartado: Cuentas de Uso Múltiple (logins compartidos, ej. "Auxiliar Devoluciones")
- **Qué pasó:** el usuario tenía que dar de alta un login compartido
  ("Auxiliar Devoluciones", que va a usar el equipo de Safeguarding) como
  si fuera un empleado real, sin ninguna forma de distinguirlo ni de
  limitarle el acceso a cosas que no le corresponden (pedir un Gmail
  personal, un recurso, etc.).
- **Qué implementé:**
  - `backend/src/models/Employee.js` — nuevo campo
    `isSharedAccount` (boolean, default `false`). Sigue siendo un
    `Employee` normal a propósito — reutiliza TODO el mismo login/
    activación del portal (ver `employeeAuth.js`), solo que marcado.
  - `backend/src/routes/employees.js` — `GET /public-lookup` (la que usan
    Solicitar Cuenta/Recurso/Ingreso, Baja de Personal y Confirmar Envío
    para sugerir nombres) ahora excluye `isSharedAccount: true` — una
    cuenta compartida ya no aparece como sugerencia en ninguno de esos
    formularios.
  - `backend/src/routes/accountRequests.js` y
    `backend/src/routes/resourceRequests.js` — se revalida del lado del
    servidor (no solo con la exclusión de arriba, por si alguien llama la
    ruta directo con el nombre exacto a mano): si el empleado encontrado
    es una cuenta compartida, se rechaza con un mensaje claro. De paso,
    `resourceRequests.js` no validaba en absoluto que el `employeeId`
    recibido fuera un Employee real (solo el formato) — ahora sí lo
    busca y confirma que exista.
  - `backend/src/routes/employeeAuth.js` — `isSharedAccount` viaja en el
    JWT y en las respuestas de `/login`/`/activate`, igual que los demás
    permisos (`canManageOnboarding`, etc.) — se centralizó ese objeto
    repetido 3 veces en una sola función (`employeeAuthFlags`).
  - `frontend/src/pages/CuentasCompartidas.jsx` (nuevo) — apartado
    dedicado en el panel (Catálogos y Activos → "Cuentas de Uso
    Múltiple"): lista + alta/edición + "Restablecer acceso al portal" +
    eliminar, reutilizando las mismas rutas de `/employees` (nada nuevo
    del lado del backend para el CRUD en sí, solo el campo).
  - `frontend/src/pages/MesaDeAyuda.jsx` — una cuenta de uso múltiple ya
    no ve las tarjetas de "Acceso a un sistema o correo" ni "Equipo,
    accesorio o servicio" (el bloqueo real es el del servidor, esto solo
    evita ofrecerle algo que de todos modos se le va a rechazar) — sigue
    viendo y pudiendo reportar tickets normal.
  - Se migró el registro real de "AUXILIAR DEVOLUCIONES" (ya existía,
    sin contraseña activada) a `isSharedAccount: true` directo en Mongo,
    para no tener que recrearlo.
  - Probé contra el backend real (local, mismo Mongo): creé una cuenta
    de prueba, confirmé que `/public-lookup` no la sugiere, que
    Solicitud de Cuentas y de Recursos la rechazan con el mensaje
    correcto, y que SÍ puede activarse, iniciar sesión y reportar un
    ticket normal (folio real generado) — limpié todos los datos de
    prueba al terminar.
- **Commit(s):** `a536470`

---

### 2026-07-24 — Ticket atorado 13 días: nadie podía reasignarlo ni eliminarlo
- **Qué pasó:** el usuario reportó un ticket de Lilly (`TICK-4E1372`, "No
  tengo internet") de 13 días que nadie podía tomar ni borrar desde el
  panel.
- **Causa real (2 bugs combinados):** el ticket quedó asignado a Leonardo
  Villareal, quien tiene el rol ERP-only (`lider.erp@selectshop.com.mx`)
  — ese rol solo puede VER tickets tipo `erp` (`canViewTicket`), así que,
  siendo este un ticket tipo `red`, ni siquiera Leonardo podía verlo o
  tocarlo. La única salida que tenía el código para estos casos —una
  cuenta `gerente.sistemas@selectshop.com.mx` que siempre puede
  reasignar/eliminar cualquier ticket— **no existe como usuario real**
  en la base de datos, así que tampoco había forma de rescatarlo por ahí.
  Resultado: nadie, en ningún rol, podía hacer nada con este ticket.
- **Qué hice:**
  - Fix inmediato (datos): se le quitó la asignación a `TICK-4E1372`
    directo en Mongo (`assignedTo`/`assignedByName`/`assignedAt` a
    vacío) — ya cualquier admin lo puede tomar o eliminar desde el panel
    normal, sin tocar nada más del ticket.
  - Fix de fondo (código), pedido explícito del usuario:
    `backend/src/routes/tickets.js` — `canManageTicket()` (usada por las
    8 rutas que modifican un ticket: asignar, prioridad, SLA, estatus,
    notas internas, resolver, reabrir, eliminar) ahora también deja pasar
    a cualquier usuario con `role === 'admin'`, no solo a quien lo tiene
    asignado o a la cuenta de gerente.sistemas — ya no depende de que esa
    cuenta específica exista o esté dada de alta.
    `frontend/src/pages/TicketDetailModal.jsx` — mismo criterio espejado
    en `canManage`, para que los botones se habiliten igual sin esperar
    la respuesta del servidor.
  - Bug aparte encontrado de paso: `frontend/src/pages/TicketsLayout.jsx`
    — `handleDelete` no tenía `try/catch`; un rechazo del servidor (403,
    etc.) fallaba en silencio, sin avisar nada ni recargar la lista.
    Ahora muestra el motivo si falla.
- **Commit(s):** `2939581`

---

### 2026-07-24 — Solicitar Recurso y Confirmar Envío ya exigen seleccionar el nombre de la lista, no solo escribirlo
- **Qué pasó:** el usuario reportó que en algunas páginas de Mesa de Ayuda
  se podía escribir cualquier cosa en el campo de nombre y enviar la
  solicitud sin seleccionar de la lista de sugerencias — ejemplo real: si
  alguien se llama "Ashanty" pero solo escribe "Asha" y le da enviar sin
  elegir la sugerencia, la solicitud queda con "Asha", no con el nombre
  real registrado.
- **Causa real:** de las 5 páginas con este buscador de nombre
  (Solicitar Cuenta/Ingreso/Recurso, Baja de Personal, Confirmar Envío),
  3 ya exigían correctamente `matchedEmployee`/`matchedRequester` antes de
  dejar enviar (Solicitar Cuenta, Solicitar Ingreso — el campo del
  solicitante, no el del nuevo ingreso, que es texto libre porque esa
  persona aún no existe en el sistema —, y Baja de Personal). Las otras 2
  solo validaban que el campo no estuviera vacío, sin exigir que de
  verdad se hubiera seleccionado algo de la lista.
- **Qué cambié:**
  - `frontend/src/pages/SolicitarRecurso.jsx` — la validación de envío
    pasa de `!form.employeeName.trim()` a `!matchedEmployee`.
  - `frontend/src/pages/ConfirmarEnvio.jsx` — mismo cambio en los 2
    flujos que piden nombre (`handleTransit` y `handleConfirm`): ahora
    exigen `auto.matched` antes de enviar, y mandan
    `auto.matched.name` (el nombre real registrado) en vez del texto
    que se haya escrito.
  - Probé con Playwright el ejemplo exacto del usuario: escribir "Asha"
    sin seleccionar "Ashanty García López" de la lista y darle enviar —
    confirmé que ahora se bloquea con un mensaje claro, y que
    seleccionando sí se envía correctamente.
- **Commit(s):** `477c3c7`

---

### 2026-07-24 — Botón de mostrar contraseña + el Robot de Ayuda ya no "no hace nada" en Reportar Ticket
- **Qué pasó:** 2 pedidos del usuario. (1) Un botón de "mostrar contraseña"
  para cuando alguien entra por primera vez a su cuenta. (2) Un bug real:
  al usar el Robot de Ayuda y darle a una de las opciones que sugiere, no
  pasaba nada — el usuario confirmó que solo ocurre estando YA dentro de
  "Reportar un problema".
- **Qué cambié (1 — mostrar contraseña):**
  - `frontend/src/components/PasswordInput.jsx` + `.module.css` (nuevo) —
    componente compartido: envuelve cualquier `<input type="password">`
    con un botón de ojito (👁️/🙈) que alterna a texto plano. No depende
    de las clases CSS de quien lo usa (el selector `.field input` de cada
    página ya apunta a cualquier input dentro de `.field`, sin importar
    qué tan anidado esté).
  - Aplicado a los 5 campos de contraseña que existen en la app:
    `EmployeeLoginWidget.jsx` (login normal + los 2 campos de "crear
    contraseña" en la activación de cuenta — el caso que pidió el
    usuario), `Login.jsx` (panel de Sistemas) y `Users.jsx` (alta/reset
    de usuario admin) — mismo componente en los 5, para que la experiencia
    sea consistente en toda la app en vez de solo en un lugar.
- **Qué cambié (2 — Robot de Ayuda en Reportar Ticket):**
  - Causa real: `ReportarTicket.jsx` calcula `step`/`category`/
    `activeNote`/`form` a partir de `?tipo=`/`?problema=` de la URL, pero
    SOLO como valor inicial de `useState` — react-router reusa el mismo
    componente montado al navegar de `?tipo=A` a `?tipo=B` (misma ruta,
    solo cambia el query string), así que ese cálculo nunca se repetía.
    El clic del bot sí cambiaba la URL, pero la pantalla se quedaba
    exactamente igual.
  - `frontend/src/pages/ReportarTicket.jsx` — nuevo `useEffect` que
    re-sincroniza ese mismo estado cada vez que cambian los search params
    después del primer montaje (se salta la primera vez porque los
    `useState` ya lo resolvieron bien). De paso, `autoAppDone` (booleano
    "ya se hizo" que se quedaba en `true` para siempre y bloqueaba
    reprocesar un `?app=` nuevo) se reemplazó por
    `lastProcessedAppIdRef`, que sí distingue un `?app=` distinto de uno
    repetido.
  - Probé con Playwright el escenario exacto: entrar a Reportar Ticket ya
    con "Hardware Computadoras" elegido, abrir el Robot de Ayuda,
    preguntar algo que no matchea nada, y darle clic a la sugerencia
    "Software" — confirmé que la pantalla cambia correctamente a
    "Software — ¿de tu computadora o de tu celular?" sin recargar la
    página.
- **Commit(s):** `577d556`

---

### 2026-07-24 — Wifi/ethernet inestable: la búsqueda de nombre y el envío de solicitudes ya no se ven "colgados"
- **Qué pasó:** seguimiento al fix de wifi de una sesión anterior (commit
  `61a292d`, que agregó timeout a axios). El usuario reportó que en
  Solicitud de Cuentas, escribir el nombre del empleado "ya no deja
  seleccionarlo" — y Felipe reportó que a veces, con el formulario ya
  lleno, darle a "Enviar solicitud" "se queda así".
- **Causa real (2 bugs distintos, mismo origen):**
  1. La búsqueda de nombre (`/employees/public-lookup`) SÍ tenía el
     timeout+reintento de la vez pasada, pero si de todos modos fallaba
     (wifi caído más de un segundo, no solo un blip), el `catch`
     silencioso dejaba la lista de resultados vacía — y la página
     mostraba el mismo mensaje que "no existe esa persona", sin ninguna
     forma de saber que fue un problema de red ni de reintentar. Este
     patrón exacto estaba copiado en 5 archivos distintos (Solicitar
     Cuenta/Ingreso/Recurso, Baja de Personal, Confirmar Envío).
  2. Al enviar cualquiera de estos formularios, el botón se queda en
     "Enviando..." sin ninguna señal de vida hasta por 90 segundos (el
     timeout completo, pensado para el cold start de Render) — sin
     ningún aviso intermedio, eso se ve exactamente como "se quedó
     colgado" aunque técnicamente sigue intentando.
- **Qué cambié:**
  - `frontend/src/hooks/useEmployeeLookup.js` (nuevo) — centraliza el
    patrón de búsqueda de nombre que antes estaba copiado 5 veces, con
    un `status: 'error'` distinto de `'done'` sin resultados, y un
    `retry()` explícito.
  - `frontend/src/hooks/useSlowRequestNotice.js` (nuevo) — después de 6
    segundos de un envío en curso, activa un aviso de "la conexión está
    tardando más de lo normal, seguimos intentando" — sin esto no había
    NINGUNA diferencia visual entre "lleva 1 segundo" y "lleva 60".
  - `frontend/src/pages/SolicitarCuenta.jsx`,
    `SolicitarIngreso.jsx`, `SolicitarRecurso.jsx`, `BajaPersonal.jsx`,
    `ConfirmarEnvio.jsx` — los 5 adoptan ambos hooks; cada uno suma un
    mensaje de error (distinto del de "no encontrado") con botón
    "Reintentar", y el aviso de conexión lenta cerca del botón de envío.
  - Bug real encontrado probando el fix: el botón "Reintentar" vivía
    fuera del `<input>` de nombre, así que al hacer clic el `onBlur` del
    input ocultaba el dropdown de resultados ANTES de que el reintento
    trajera algo que mostrar. Se corrigió con `onMouseDown`
    preventDefault (para que el clic no le quite el foco al input) +
    volver a abrir el dropdown explícitamente en el mismo clic.
  - `frontend/src/pages/SolicitarCuenta.module.css` — nuevas clases
    `.hintError`/`.retryLink` (compartidas por los 5 archivos vía el
    mismo CSS module).
  - Probé con Playwright simulando una falla de red real (2 peticiones
    fallidas seguidas — la original + el reintento automático de axios)
    y confirmé: aparece el mensaje de error correcto (no el de "no
    encontrado"), el botón "Reintentar" sí trae el resultado y deja
    seleccionarlo, y el aviso de "tardando más de lo normal" aparece a
    los ~6 segundos de un envío que no responde.
- **Commit(s):** `7be79d4`

---

### 2026-07-24 — "Solicitar proyecto" BI también a Mis Solicitudes + calendario real para el rango de fechas
- **Qué pasó:** el usuario aclaró que "Solicitar proyecto" (el otro
  camino de Soporte BI, el que llena el .docx) tampoco es un ticket que
  atender — mismo criterio que ya se aplicó a "Solicitar bases de datos"
  el día anterior, así que también debe verse en "Mis Solicitudes", no en
  "Mis Tickets". Además, el campo "Rango de fechas de los datos" del
  formulario de Solicitud de Proyecto era un cuadro de texto libre — pidió
  un calendario real que deje elegir el rango.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — `GET /mine` ahora excluye TODO
    `ticketType === 'soporte_bi'` (antes solo excluía `bases_datos`). La
    ruta `GET /mine/bi-database-requests` se renombró a
    `GET /mine/bi-requests` y regresa AMBOS caminos (ya no filtra por
    `biRequestKind`) — `MisSolicitudes.jsx` decide cómo mostrar cada uno.
  - `frontend/src/pages/MisSolicitudes.jsx` — `normalizeBiDatabaseRequest`
    se generalizó a `normalizeBiRequest`, que arma un label distinto según
    `biRequestKind` ("Proyecto BI · <nombre del reporte>" o "Bases de
    datos BI · Ventas/Inventarios").
  - `frontend/src/pages/MisTickets.jsx` — se quitó la entrada
    `soporte_bi` del catálogo de tipos (agregada el día anterior): ya
    nunca aparece ahí, así que ya no hacía falta.
  - `frontend/src/components/BiProjectForm.jsx` — el campo "Rango de
    fechas de los datos" pasa de `<input>` de texto a 2 `<input
    type="date">` (Desde/Hasta) que se combinan en un solo string
    "dd/mm/aaaa — dd/mm/aaaa" antes de guardarse — el .docx original solo
    tiene UN blanco para esto (ver `biProjectDocx.js`), así que no hizo
    falta tocar nada del lado del backend ni de la plantilla.
  - Probé con Playwright: el formulario muestra los 2 calendarios
    correctamente, la vista previa y el payload que le llega al backend
    traen el rango ya combinado en el formato esperado; "Mis Solicitudes"
    muestra ambos caminos de Soporte BI con su label y estatus correctos.
- **Commit(s):** `c1897c5`

---

### 2026-07-23 — Manuales: centrar la tarjeta del manual (seguimiento al fix de arriba)
- **Qué pasó:** con el fix de arriba (la barra lateral fija), la tarjeta
  del manual quedó pegada a la izquierda en pantallas anchas — el usuario
  pidió centrarla.
- **Qué cambié:** `frontend/src/pages/ManualMesaDeAyuda.module.css` —
  `margin: 0 auto` en `.pageCard` (que ya tenía `max-width: 1100px`).
- **Commit(s):** `f940a87`

---

### 2026-07-23 — Manuales: tabla de contenido pasa a barra lateral fija (antes sobraba muchísimo espacio)
- **Qué pasó:** el usuario marcó con un círculo el manual de Mesa de Ayuda
  en pantallas anchas — el texto quedaba en una franja angosta a la
  izquierda con un espacio negro enorme sin usar a la derecha.
- **Causa:** `.pageCard` (la tarjeta que envuelve todo el manual) no tenía
  ancho propio — se encogía al ancho de su contenido (la tabla de
  contenido de 480px o las secciones de 760px), así que en una pantalla
  grande quedaba flotando angosta con todo el resto vacío.
- **Qué cambié:** `frontend/src/pages/ManualMesaDeAyuda.module.css`
  (compartido por los 4 manuales largos: Mesa de Ayuda, Gestor de
  Constancias, Vendedor Foráneo, Telemarketing) — `.pageCard` pasa a
  grid de 2 columnas (contenido + 260px de barra lateral, hasta 1100px en
  total) y la tabla de contenido (antes una caja arriba del texto, se
  perdía de vista en cuanto avanzabas) pasa a `.tocSidebar`: fija
  (`position: sticky`) mientras haces scroll, para saltar de sección sin
  tener que regresar arriba. En pantallas angostas (menos de 900px, mismo
  punto donde ya se colapsa el sidebar de la app) vuelve a apilarse en 1
  columna, con la tabla de contenido primero y ya no fija.
  - Se actualizó la estructura de los 4 archivos `.jsx` de manuales
    (envolver el contenido en `.mainCol`, mover la tabla de contenido a
    un `<aside>` al final) — mismo patrón en los 4, sin tocar el
    contenido real de ningún manual.
  - Probé con Playwright a 1920px (se ve la barra lateral fija incluso
    haciendo scroll varias pantallas) y a 390px (se apila correctamente,
    tabla de contenido primero).
- **Commit(s):** `7c1a1be`

---

### 2026-07-23 — "Solicitar bases de datos" BI: sin PDF, correo con todo el detalle, y a Mis Solicitudes (no Mis Tickets)
- **Qué pasó:** el usuario revisó el correo real de una Solicitud de
  Bases de Datos BI y pidió 3 ajustes: (1) quitar el PDF adjunto — "es
  muy poquita información para un PDF", mejor detallar todo en el cuerpo
  del correo; (2) quitar el botón "Ver ticket en el panel" — BI no tiene
  acceso al sistema de tickets, el botón no les sirve; (3) que esta
  solicitud aparezca en "Mis Solicitudes" del lado del empleado, no en
  "Mis Tickets" — aunque sí es soporte de BI, no es "un ticket que
  atender", es una solicitud de soporte. "Solicitar proyecto" (el otro
  camino de Soporte BI) no cambió en nada de esto.
- **Qué cambié:**
  - Se eliminó por completo el PDF de "Solicitud de Bases de Datos BI"
    agregado unas horas antes ese mismo día: `backend/src/utils/
    biDatabaseRequestPdf.js` (borrado), los campos
    `biDatabaseDocData`/`biDatabaseDocMimeType`/`biDatabaseDocFileName`
    en `backend/src/models/Ticket.js`, la generación/adjunto/ruta de
    descarga en `backend/src/routes/tickets.js`.
  - `backend/src/utils/emailTemplates.js` — nueva sección "Detalle de la
    solicitud" en el correo (Base de datos, Plataforma, Tienda, Periodo,
    con los mismos catálogos de `BiDatabaseForm.jsx`) para
    `ticketType === 'soporte_bi'`; el botón "Ver ticket en el panel" y la
    frase "da seguimiento desde el panel" del pie ya no aparecen para
    NINGÚN ticket de Soporte BI (ni proyecto ni bases de datos) — mismo
    motivo por el que "Solicitud de Proyecto" manda su .docx adjunto en
    vez de solo un link.
  - `backend/src/routes/tickets.js` — `GET /tickets/mine` ahora excluye
    los tickets `soporte_bi` + `bases_datos` (para que no aparezcan en
    "Mis Tickets"); nueva ruta `GET /tickets/mine/bi-database-requests`
    que regresa justo esos, para que los consuma Mis Solicitudes. Sigue
    siendo un `Ticket` normal por dentro (mismo folio/SLA/panel admin de
    siempre) — el cambio es solo de qué lista del lado del empleado lo
    muestra.
  - `frontend/src/pages/MisSolicitudes.jsx` (+ `.module.css`) — quinta
    fuente en el `Promise.all` junto a Cuentas/Recursos/Ingreso/Baja, con
    su propio mapeo de estatus (el de Ticket —
    abierto/en_proceso/resuelto/cerrado— no tiene nada que ver con el de
    Cuentas —pendiente/aprobada/rechazada—).
  - `frontend/src/pages/MisTickets.jsx` — se agregó la etiqueta
    "📊 Soporte BI" al catálogo de tipos (antes faltaba, así que
    "Solicitar proyecto" se veía con el texto crudo `soporte_bi`).
  - `frontend/src/pages/SolicitarCuenta.module.css` — los `<input
    type="date">` de TODAS las páginas de Mesa de Ayuda (comparten este
    mismo CSS) llevaban el ícono del calendario y el texto "dd/mm/aaaa"
    en negro sobre el fondo oscuro del campo — invisibles. `color-scheme:
    dark` en ese selector hace que el navegador los dibuje en su variante
    clara para fondo oscuro.
  - Probé con Playwright: el correo generado ya no tiene botón y sí tiene
    el detalle completo (verificado visualmente); "Mis Solicitudes"
    muestra correctamente la solicitud de bases de datos con su folio
    real y estatus; el selector de fecha se ve blanco sobre fondo oscuro.
- **Commit(s):** `85779eb`

---

### 2026-07-23 — Solicitud de Cuenta: catálogo de ERP por tienda + multi-selección, se quita "Tienda"
- **Qué pasó:** el usuario corrigió el catálogo de "Sistema / ERP" en
  Solicitud de Cuentas — no son marcas de software genéricas (SAP, Odoo,
  Aspel), son 4 ERPs reales, uno por tienda: ERP SelectShop, ERP
  Nexustore, ERP Medicalstore, ERP Tlab. Pidió que fuera multi-selección
  ("por si necesitan acceso a todo") y quitar el campo de "¿A qué tienda
  deseas ingresar?", porque la tienda ya queda explícita en cada opción
  del catálogo.
- **Qué cambié:**
  - `frontend/src/pages/SolicitarCuenta.jsx` — `BASE_ERP_SYSTEMS`
    (SAP/Odoo/Aspel + catálogo "Otro" que crecía solo) se reemplazó por
    `ERP_SYSTEM_CATALOG`, un catálogo cerrado de 4 opciones fijas,
    renderizado como checkboxes (mismo estilo `permGrid`/`permOption` que
    ya usan los permisos de plataformas) en vez de un `<select>` de una
    sola opción. Se quitó el campo "¿A qué tienda deseas ingresar?" y
    todo el mecanismo de catálogo dinámico (`/custom-erp-systems/public`,
    el valor centinela "Otro / no está en la lista").
  - `backend/src/models/AccountRequest.js` — `erpStore` (texto libre) se
    reemplazó por `erpSystems: [String]` (el multi-select real).
  - `backend/src/routes/accountRequests.js` — nuevo
    `ERP_SYSTEM_CATALOG` (mismo set que el frontend, se revalida contra
    manipulación) para filtrar `body.erp.systems`; `platform` (el campo
    que ya usa la aprobación para crear la cuenta, sin tocarse) se
    prellena con `erpSystems.join(', ')` para que la lista de
    Solicitudes de Cuentas tenga algo que mostrar antes de aprobar.
  - `backend/src/utils/accountRequestPdf.js` — la sección de ERP del PDF
    ahora imprime "Sistema(s) / ERP" (la lista completa, unida por
    comas) en vez de "Sistema / ERP" + "Tienda" por separado.
  - El mecanismo de catálogo dinámico en el backend
    (`CustomErpSystemOption`, la ruta `/custom-erp-systems/public`, el
    checkbox "Agregar al catálogo" del lado admin) se dejó intacto — ya
    no lo usa el formulario público, pero sigue siendo válido para quien
    aprueba la solicitud si necesita anotar algo distinto a mano.
  - Probé con Playwright contra el build real: los 4 checkboxes se ven
    correctos, "Tienda" ya no aparece, y marcar varias opciones a la vez
    (ej. SelectShop + Tlab) funciona sin afectar las demás.
- **Commit(s):** `75f3740`

---

### 2026-07-23 — Causa raíz final: Mesa de Ayuda pasa a vivir bajo /mesa-de-ayuda/... para poder instalarse aparte
- **Qué pasó:** con los 2 fixes anteriores (mismo día, ver abajo) cada
  ruta ya servía el HTML/manifest correcto — pero el usuario seguía sin
  poder instalar las 2 apps por separado: "solo deja instalar o la mesa
  de ayuda o el sistema de tickets, es que es la misma página".
- **Causa real (la de fondo, no un bug de código):** Chrome/Edge no
  ofrecen instalar una app nueva si YA hay una app instalada cuyo `scope`
  cubre la URL actual — y los 2 manifests declaraban `scope: "/"` (el
  origen completo), así que en cuanto una de las 2 quedaba instalada, el
  navegador consideraba que TODO el origen ya "pertenecía" a esa app y
  nunca ofrecía instalar la otra. Esto no se arregla con más JS ni más
  reglas de service worker — el scope tiene que ser real y distinto.
- **Qué cambié:** todas las rutas de Mesa de Ayuda (antes sueltas en la
  raíz: `/reportar-ticket`, `/mis-tickets`, `/mis-solicitudes`,
  `/baja-personal`, `/manuales*`, `/empleado/login`, `/solicitar-cuenta`,
  `/solicitar-ingreso`, `/solicitar-recurso`, `/confirmar-envio/:token`)
  ahora viven bajo `/mesa-de-ayuda/...` — un prefijo real, así que su
  manifest puede declarar `scope: "/mesa-de-ayuda"` (antes `"/"`) y
  Chrome/Edge sí permiten instalarlo aparte del Sistema de Tickets
  (`scope: "/"`, sin cambios). Se agregó `id` explícito a los 2 manifests
  para no depender de `start_url` como identidad.
  - `frontend/src/App.jsx` — se movieron los `<Route>` al nuevo prefijo +
    se agregó `LegacyRedirect`/`LegacyConfirmarEnvioRedirect`: una ruta
    por cada URL vieja que redirige sola a la nueva, conservando query
    string y hash (el wizard de Reportar Ticket depende de `?tipo=...`,
    y el login de empleado de `?next=...`) — cualquier link/QR/favorito
    ya compartido antes de este cambio sigue funcionando.
    `EMPLOYEE_PATH_PREFIXES` y el redirect de `EmployeeRoute` se
    actualizaron al nuevo prefijo único.
  - `frontend/src/hooks/usePwaIdentity.js` — se simplificó a un solo
    prefijo (`/mesa-de-ayuda`) en vez de ~10 sueltos.
  - `frontend/vite.config.js` — el manifest de Sistema de Tickets suma
    `id: '/'`; `navigateFallbackDenylist` se simplificó al mismo prefijo
    único.
  - `frontend/public/manifest-mesa-de-ayuda.webmanifest` — `scope` pasa
    de `"/"` a `"/mesa-de-ayuda"`, suma `id: '/mesa-de-ayuda'`.
  - `frontend/vercel.json` — se simplificaron las ~13 reglas sueltas a
    solo 2 (`/mesa-de-ayuda` y `/mesa-de-ayuda/:path*` → el HTML de Mesa
    de Ayuda; todo lo demás sigue al catch-all).
  - Se actualizaron TODOS los links/navigate internos que apuntaban a las
    rutas viejas (Mesa de Ayuda, HelpBot, faqData, helpSearch,
    PortalLayout, los manuales, EmployeeLogin, employeeApi, y los QR de
    confirmación de envío en `Shipments.jsx`/`CreateShipmentModal.jsx`)
    para que apunten directo a la ruta nueva — la redirección legacy es
    solo para links YA compartidos, no para el uso normal de la app.
  - Probé con Playwright contra el build real (con el servidor local que
    imita `vercel.json`): confirmé que cada ruta nueva sirve su HTML/
    manifest correcto (con y sin service worker activo), y que las URLs
    viejas (`/reportar-ticket?tipo=software`, `/mis-tickets`) redirigen
    solas a la ruta nueva conservando la query string, incluso
    encadenado con el redirect de sesión a
    `/mesa-de-ayuda/empleado/login?next=...`.
- **Commit(s):** `92144f3`

---

### 2026-07-23 — 2do bug del Sistema de Tickets instalable: el service worker se comía las reescrituras de Vercel
- **Qué pasó:** el usuario probó la corrección anterior (ver la entrada
  de abajo, mismo día) y seguía viendo la identidad de Mesa de Ayuda en
  todos lados. La solución de Vercel sirviendo un HTML distinto por ruta
  era correcta, pero faltaba una segunda pieza.
- **Causa real:** con el service worker YA activo y controlando la
  pestaña (`clientsClaim: true`), workbox intercepta CUALQUIER navegación
  que no esté en su `navigateFallbackDenylist` y la sirve desde el
  `index.html` que ya tiene precacheado — sin pasar nunca por la red, y
  por lo tanto sin pasar nunca por las reescrituras de `vercel.json`. El
  denylist de antes solo excluía `/api/**`; todo lo demás (incluidas las
  rutas de Mesa de Ayuda) cae en el fallback cacheado, que es
  precisamente el `index.html` de Sistema de Tickets. Es decir: el HTML
  correcto por ruta que arma Vercel solo se veía en la primerísima carga,
  antes de que el service worker tomara control — después, todo volvía a
  verse como Sistema de Tickets.
- **Qué cambié:** `frontend/vite.config.js` — se agregaron las rutas de
  Mesa de Ayuda al mismo `navigateFallbackDenylist` (mismos prefijos que
  `vercel.json`/`usePwaIdentity.js`), para que esas navegaciones SIEMPRE
  vayan a la red (y por lo tanto a `vercel.json`) en vez de al índice
  cacheado del otro lado.
- **Cómo lo probé:** con el mismo servidor local que imita `vercel.json`,
  esta vez dejando que un service worker real se registre y tome control
  de la pestaña primero (como ya le pasa al usuario, que tiene la app
  usada desde antes) — y CON el service worker activo, confirmé que
  `/mesa-de-ayuda`, `/reportar-ticket` y `/manuales/ventas` siguen
  sirviendo la identidad de Mesa de Ayuda, y `/assets` sigue siendo
  Sistema de Tickets. Antes de este fix, esa misma prueba (con el SW ya
  activo) mostraba Sistema de Tickets en TODAS las rutas — reproduciendo
  exactamente el bug reportado.
- **Importante para probarlo de verdad:** una pestaña nueva NO alcanza —
  reutiliza el service worker YA instalado de antes. Hace falta una
  ventana de InPrivate/Incógnito (sin ningún service worker previo) o
  aceptar el aviso de "Actualizar" primero para que el nuevo service
  worker (con este fix) tome control.
- **Commit(s):** `45749b3`

---

### 2026-07-23 — Corrección real: Sistema de Tickets instalable (el intento anterior no funcionaba)
- **Qué pasó:** el usuario probó instalar el Sistema de Tickets y seguía
  apareciendo la identidad de Mesa de Ayuda — tanto en el ícono/nombre
  como al darle "instalar" (lo mandaba a Mesa de Ayuda). El intento
  anterior (mismo día, ver entrada de abajo "El Sistema de Tickets... se
  puede instalar como app") no funcionaba de verdad.
- **Causa real:** ese intento cambiaba el `<link rel="manifest">` (y los
  demás tags de identidad) **por JavaScript, después de que React ya
  montó**. Pero Chrome/Edge deciden qué app se puede instalar con el HTML
  que reciben de primera mano en la navegación — NO vuelven a evaluar eso
  solo porque un script cambie esa etiqueta más tarde. Como este proyecto
  es una sola SPA con un solo `index.html`, cualquier carga fresca (o el
  intento de instalar) siempre veía la identidad escrita en ESE único
  HTML — que announces era la de Mesa de Ayuda — sin importar en qué ruta
  estuvieras parado.
- **Qué cambié (la solución real):**
  - `frontend/vite.config.js` — el manifest AUTO-GENERADO por
    `vite-plugin-pwa` ahora es el de **Sistema de Tickets** (antes era el
    de Mesa de Ayuda) — tiene sentido como default porque sus rutas son
    las que de verdad están ancladas en `scope: "/"` (dashboard + todo lo
    anidado + `/login`); Mesa de Ayuda vive en rutas sueltas y dispersas.
  - `frontend/public/manifest-mesa-de-ayuda.webmanifest` (nuevo, antes
    era al revés: `manifest-tickets.webmanifest`, eliminado) — el
    manifest de Mesa de Ayuda ahora vive a mano en este archivo estático.
  - `frontend/index.html` — los valores por default (favicon, apple-touch-
    icon, título) ahora son los de Sistema de Tickets, no los de Mesa de
    Ayuda.
  - `frontend/scripts/generate-mesa-de-ayuda-shell.js` (nuevo) — paso de
    post-build que copia `dist/index.html` a `dist/mesa-de-ayuda.html`,
    cambiando SOLO las etiquetas de identidad PWA por las de Mesa de
    Ayuda (mismo bundle de JS/CSS en los dos archivos). Encadenado en
    `package.json` (`"build": "vite build && node
    scripts/generate-mesa-de-ayuda-shell.js"`).
  - `frontend/vercel.json` — en vez de reescribir TODO a `/index.html`,
    ahora las rutas propias de Mesa de Ayuda (`/mesa-de-ayuda`,
    `/reportar-ticket`, `/mis-tickets`, `/mis-solicitudes`,
    `/baja-personal`, `/manuales/*`, `/empleado/*`, `/solicitar-cuenta`,
    `/solicitar-recurso`, `/solicitar-ingreso`, `/confirmar-envio/*`) se
    reescriben a `/mesa-de-ayuda.html`; todo lo demás sigue yendo a
    `/index.html` (ahora Sistema de Tickets). Así cada ruta recibe la
    identidad correcta desde el PRIMER byte de una carga fresca, que es
    justo el momento que le importa al navegador para "instalar".
  - `frontend/src/hooks/usePwaIdentity.js` — se queda (renombrado
    conceptualmente a "solo cosmético"): sigue siendo útil para que el
    ícono de la pestaña/manifest del DOM se mantengan correctos mientras
    se navega DENTRO de la SPA sin recargar, pero ya NO es lo que resuelve
    la instalabilidad — ajusté sus constantes a los nombres de archivo
    nuevos y agregué `/baja-personal` y `/confirmar-envio` a su lista de
    prefijos (antes le faltaban, inconsistente con `EMPLOYEE_PATH_PREFIXES`
    de `App.jsx` y con la lista nueva de `vercel.json`).
  - Probé localmente con un servidor mínimo que imita las reglas de
    `vercel.json` (`vite preview` no las respeta) + Playwright: confirmé
    que TODAS las rutas de Mesa de Ayuda sirven `mesa-de-ayuda.html` (con
    su manifest/ícono/título) y que `/`, `/login`, `/tickets/general`,
    etc. sirven `index.html` con la identidad de Sistema de Tickets —
    desde una carga fresca (fetch directo), no solo tras hidratar React.
- **Pendiente de confirmar tras el deploy:** el usuario debe probar en un
  navegador real, con una carga fresca (no la misma pestaña que ya tenía
  abierta desde antes) — idealmente visitando `/login` directo — que Edge
  ahora ofrezca instalar "Sistema de Tickets" como una app nueva, separada
  de la Mesa de Ayuda ya instalada.
- **Commit(s):** `910c468`

---

### 2026-07-23 — "Solicitar bases de datos" (Soporte BI) ahora manda un PDF adjunto, igual que las Solicitudes de Cuenta
- **Qué pasó:** el usuario pidió que, al pedir una base de datos, el
  correo lleve un documento de solicitud (como los que ya existen para
  altas de cuentas) — porque BI no tiene acceso al sistema de tickets, así
  que un link al panel no les sirve de nada.
- **Qué cambié:**
  - `backend/src/utils/biDatabaseRequestPdf.js` (nuevo) — genera un PDF
    de una sola sección (Solicitante, Base de datos, Plataforma, Tienda,
    Periodo) reusando los mismos helpers y colorimetría de
    `pdfBranding.js` que ya usa `accountRequestPdf.js` (Solicitudes de
    Cuenta) — mismo look & feel, tamaño Carta, logo de Select Shop MB.
  - `backend/src/models/Ticket.js` — 3 campos nuevos
    (`biDatabaseDocData`/`biDatabaseDocMimeType`/`biDatabaseDocFileName`),
    mismo patrón Buffer-en-Mongo que `biDocData` (Solicitud de Proyecto) y
    el resto de adjuntos del modelo.
  - `backend/src/routes/tickets.js` — a diferencia del .docx de Solicitud
    de Proyecto (que se genera ANTES de crear el ticket, porque no
    depende del folio), este PDF necesita el folio y la fecha reales, así
    que se genera y se guarda justo después de `Ticket.create()`, y se
    agrega al arreglo de adjuntos del correo igual que `biDocData`. Nueva
    ruta `GET /:id/bi-database-document` para descargarlo después, mismo
    patrón que `/bi-document`.
  - Probé generando el PDF a mano con los datos exactos del ejemplo del
    usuario (Ventas — ML — Fontastic) y confirmé visualmente que el
    documento sale bien formado, con el folio, la fecha y los 3 datos del
    filtro completos.
- **Commit(s):** `61b3342`

---

### 2026-07-23 — El aviso de "Actualizar" ahora aparece solo, sin necesitar Ctrl+R
- **Qué pasó:** el usuario reportó que el aviso de "hay una versión
  nueva" (ver la entrada del 2026-07-23 sobre este mismo aviso, más
  abajo) solo aparecía si hacía Ctrl+R/Ctrl+Shift+R a mano, o por
  coincidencia al cerrar sesión — no mientras se quedaba usando la app,
  que es justo el caso que se quería resolver ("si no, los usuarios
  nunca van a saber").
- **Causa real:** `frontend/src/components/UpdateToast.jsx` solo
  revisaba si había una versión nueva cada **1 hora** (`setInterval`), y
  ESE chequeo era el único disparador — nada revisaba nada apenas se
  registraba el service worker. Si el deploy pasó minutos antes de que
  alguien abriera la pestaña, o si la pestaña llevaba rato en segundo
  plano (los navegadores frenan/retrasan los `setInterval` de pestañas
  no visibles), en la práctica el aviso casi nunca llegaba a tiempo —
  de ahí que pareciera que "solo aparece si refrescas a mano".
- **Qué cambié:** el mismo archivo ahora dispara la revisión
  (`registration.update()`) en 3 momentos en vez de uno:
  1. Apenas se registra el service worker (cubre el deploy que ya pasó
     antes de abrir la pestaña).
  2. Cada vez que la pestaña vuelve a estar visible
     (`visibilitychange`) — es el momento real en que alguien "está en
     la app" de nuevo después de cambiar de pestaña/app, así que es
     donde más importa que sea inmediato.
  3. De respaldo, cada 15 minutos (antes 1 hora) por si la pestaña se
     queda abierta y visible mucho tiempo seguido.
  - Probado con Playwright simulando un deploy real (reconstruí el
    bundle con un cambio de código mientras la pestaña seguía abierta
    en la versión vieja, sin recargarla) y confirmé que el aviso
    aparece solo con disparar `visibilitychange` — sin ningún
    `page.reload()` de por medio.
- **Commit(s):** `0774ee0`

---

### 2026-07-23 — Corrección: "Solicitar bases de datos" de Soporte BI es un filtro (plataforma + tienda), no un canal fijo
- **Qué pasó:** el usuario corrigió el diseño original de este flujo — no
  es elegir entre "Plataforma / E-commerce / Tienda" como 3 opciones
  mutuamente excluyentes; es un filtro real, ej. "ventas de ML de la
  tienda Fontastic de tal a tal periodo" o "inventarios del ERP de la
  tienda Fontastic de tal a tal periodo". Pasó el catálogo real de
  plataformas (Amazon, ML, Tiktok, Walmart, Coppel, RealTrends) y de
  tiendas/cuentas/sellers (Select Shop, Nexu, Medical Store,
  Armaf/Ocenid, Signa, T-lab, Fontastic, Creativa Integral).
- **Qué cambié:**
  - `frontend/src/components/BiDatabaseForm.jsx` — reemplacé el radio de
    "canal" (Plataforma/E-commerce/Tienda) por 2 selecciones reales:
    **Plataforma** (catálogo de 6 + "Otra" con texto libre — Inventarios
    además suma ERP como una plataforma más, solo ahí, no en Ventas) y
    **Tienda** (las 8 del catálogo, lista cerrada). Una sola plataforma y
    una sola tienda por solicitud (si necesitan otra combinación, mandan
    otro ticket) + el periodo de fechas de siempre.
  - `frontend/src/components/BiPreview.jsx` — la vista previa ahora
    muestra Base de datos / Plataforma / Tienda / Periodo por separado
    en vez de "canal" genérico.
  - `frontend/src/pages/ReportarTicket.jsx` — el asunto del ticket pasa
    de `"Ventas — Plataforma (e-commerce)"` a algo específico como
    `"Ventas — ML (Mercado Libre) — Fontastic"`.
  - `backend/src/routes/tickets.js` — la validación de
    `biDatabaseRequest` cambió de `{channel, subchannel}` a
    `{tipo, plataforma, plataformaOtra, tienda}` (sigue sin generar
    ningún documento, ver la entrada de abajo sobre por qué).
  - Probé con Playwright los 2 ejemplos exactos que dio el usuario
    (Ventas/ML/Fontastic e Inventarios/ERP/Fontastic) contra el build
    real — el asunto, la vista previa y el payload que le llega al
    backend coinciden con lo pedido.
- **Commit(s):** `cd97940`

---

### 2026-07-23 — El Sistema de Tickets (panel de Sistemas) también se puede instalar como app
- **Qué pasó:** el usuario preguntó por qué desde el celular solo se podía
  "instalar" Mesa de Ayuda y no el panel donde se ven tickets, ingresos,
  envíos, etc. — quería esa parte instalable también.
- **Qué cambié:**
  - `frontend/public/manifest-tickets.webmanifest` (nuevo) — un segundo
    manifest.json de pura mano, aparte del que genera `vite-plugin-pwa`
    (ese solo produce UNO por build). `start_url: /login`, nombre
    "Sistema de Tickets".
  - `frontend/public/icons/icon-tickets-*.png`,
    `favicon-tickets-32.png`, `apple-touch-icon-tickets.png` (nuevos) —
    ícono propio (un ticket con un check naranja) generado a mano con
    Pillow, mismo estilo y paleta que el de Mesa de Ayuda (línea negra +
    acento naranja sobre el mismo fondo crema) para que se vea de la
    misma familia visual pero se distinga claramente en la pantalla de
    inicio del celular.
  - `frontend/src/hooks/useFavicon.js` → renombrado a `usePwaIdentity.js`
    — ya existía un hook que cambiaba el favicon de la pestaña según la
    ruta (Mesa de Ayuda vs. el resto); en vez de duplicar esa misma lista
    de rutas en un hook aparte, se amplió el mismo hook para que además
    cambie `<link rel="manifest">`, `<link rel="apple-touch-icon">` y
    `<meta name="apple-mobile-web-app-title">` — mismo mecanismo, ahora
    cubre toda la "identidad instalable", no solo el ícono de la pestaña.
    Todo lo que NO es Mesa de Ayuda (incluye `/login` y todo el panel
    bajo `/`) ahora cuenta como Sistema de Tickets — antes esa mitad
    usaba un favicon genérico sin nombre/ícono propios en el manifest.
  - `frontend/index.html` / `frontend/vite.config.js` — comentarios
    actualizados para dejar explícito que hay 2 apps instalables desde un
    solo `index.html`/service worker, y por qué la segunda no vive dentro
    de la config de `VitePWA()`.
  - Un solo service worker sigue cubriendo todo el origen (scope `/`) —
    no cambia nada del cacheo, solo qué manifest/ícono ve el navegador al
    momento de instalar, según la ruta donde esté parado quien lo intenta.
  - Probado con Playwright contra el build real (`vite preview`):
    confirmé que `/login`, `/` y todo el panel muestran el manifest,
    ícono y nombre del Sistema de Tickets, mientras que `/mesa-de-ayuda`
    y `/reportar-ticket` siguen mostrando los de Mesa de Ayuda sin tocarse.
- **Commit(s):** `5f2bb95`

---

### 2026-07-23 — Módulo "Soporte BI" en Reportar Ticket (Solicitar proyecto / Solicitar bases de datos)
- **Qué pasó:** el usuario pidió un módulo independiente (mismo nivel que
  Hardware/Software) para pedir soporte al equipo de BI, con dos caminos:
  "Solicitar proyecto" (llenar un formulario y mandarlo por correo como el
  documento Word oficial `solicitud_nuevo_reporte.docx` — **sin tocar su
  estructura para nada**, "como si fueras un OCR") y "Solicitar bases de
  datos" (Ventas o Inventarios, cada uno con sus 3 canales fijos, más un
  periodo de fechas — solo una vista previa de lo solicitado, sin documento).
  Los correos de BI son `lider.bi@selectshop.com.mx` y
  `analista.bi2@selectshop.com.mx`, y en ambos casos se exige ver una vista
  previa antes de poder enviar.
- **Qué cambié:**
  - `backend/src/assets/templates/solicitud_nuevo_reporte.docx` (nuevo) —
    copia exacta del documento original que mandó el usuario.
  - `backend/src/utils/biProjectDocx.js` (nuevo) — en vez de recrear el
    documento con una librería de generación (lo que habría significado
    rediseñarlo), abre el `.docx` original como zip (`jszip`, nueva
    dependencia) y reemplaza en `word/document.xml` SOLO los runs que son
    íntegramente un blanco (`__________`) o una casilla vacía (`☐ `),
    dejando cada etiqueta, tabla y línea de firma exactamente como estaban.
    El orden de reemplazo se armó mano a mano contra los 217 runs reales
    del documento (extraídos y verificados con Python) para no desfasar
    ni un solo campo.
  - `backend/src/models/Ticket.js` — nuevo tipo `soporte_bi` + entrada en
    `SLA_CATALOG` + campos `biRequestKind`, `biProjectData`,
    `biDatabaseRequest` y el triplete `biDocData`/`biDocMimeType`/
    `biDocFileName` (mismo patrón que cualquier adjunto de ticket, solo
    que este lo genera el propio servidor en vez de subirlo quien reporta).
  - `backend/src/routes/tickets.js` — `soporte_bi` se enruta igual que
    `seguridad` (por `ticketType` puro, no por nombre de app) directo a
    los 2 correos de BI; valida `biRequestKind` en el servidor (no solo
    en el frontend), genera el `.docx` con datos reales cuando es
    "proyecto", y agrega el documento como adjunto del correo aunque la
    plantilla sea la de "sistemas" (excepción explícita: BI sí necesita
    el archivo, no solo un link al panel). Nueva ruta
    `GET /:id/bi-document` para descargarlo después, igual que
    `/attachment` o `/bank-proof-attachment`.
  - `frontend/src/config/ticketCategories.js` — nueva categoría
    `soporte_bi` con un sentinel `problems: 'bi-wizard'` que ningún otro
    código interpreta, para no chocar con el render genérico de listas de
    problemas.
  - `frontend/src/components/BiProjectForm.jsx` (nuevo) — el formulario
    completo de 8 secciones, con las mismas clases CSS que ya usa
    `SolicitarCuenta.jsx` para no inventar estilos nuevos.
  - `frontend/src/components/BiDatabaseForm.jsx` (nuevo) — Ventas
    (Plataforma/E-commerce/Tienda) e Inventarios (ERP/Plataforma/Tienda),
    cada uno con periodo de fechas.
  - `frontend/src/components/BiPreview.jsx` + `.module.css` (nuevos) —
    vista previa obligatoria antes de enviar en ambos flujos (para
    "bases de datos" ES la única salida, no genera ningún documento).
  - `frontend/src/pages/ReportarTicket.jsx` — rama especial para
    `soporte_bi` (mismo patrón que ya existía para "Aplicación"), 4
    pasos nuevos del wizard: elegir proyecto/BD → formulario → vista
    previa → enviar.
  - Probado de punta a punta con Playwright contra el flujo real del
    wizard (categoría → formulario → vista previa → envío) para los dos
    caminos, y verificado que el payload que arma el frontend
    (`ticketType`, `biRequestKind`, `biProjectData`/`biDatabaseRequest`
    como JSON) coincide exactamente con lo que parsea la ruta del backend.
- **Commit(s):** `92d39b3`

---

### 2026-07-23 — Aviso de "hay una versión nueva" en vez de tener que adivinar Ctrl+Shift+R
- **Qué pasó:** el usuario preguntó si siempre iba a necesitar
  Ctrl+R/Ctrl+Shift+R después de cada deploy, o si se podía poner un aviso
  para actualizar con solo tocarlo.
- **Qué cambié:**
  - `frontend/vite.config.js` — `registerType` pasa de `'autoUpdate'` a
    `'prompt'`: el service worker deja de intentar actualizarse y recargar
    solo (en la práctica tardaba en notarse, o nunca pasaba en una pestaña
    que llevaba rato abierta) y en su lugar se queda esperando a que la
    persona confirme. También se agregó `workbox.clientsClaim: true` —
    sin esto, ninguna pestaña YA ABIERTA se enteraba de que el nuevo
    service worker tomó el control, sin importar cuánto se esperara.
  - `frontend/src/components/UpdateToast.jsx` + `.module.css` (nuevo) —
    aviso fijo arriba, centrado, con un botón "Actualizar": usa el hook
    oficial `virtual:pwa-register/react`, revisa si hay una versión nueva
    cada hora (para quien deja la pestaña abierta todo el día) y al hacer
    clic manda la señal de actualizar y recarga. Montado UNA sola vez en
    `App.jsx`, sin filtrar por ruta — a diferencia del Robot de Ayuda o el
    fondo animado, esto aplica a TODA la app, panel de Sistemas incluido.
  - **2 bugs reales que encontré y corregí probando el ciclo completo**
    (simulé un deploy real con Playwright: pestaña abierta en una versión,
    la de el servidor cambia por detrás, sin recargar la pestaña):
    1. Sin `clientsClaim: true`, el aviso aparecía pero el clic en
       "Actualizar" nunca recargaba nada — la pestaña se quedaba congelada
       en la versión vieja para siempre porque el navegador nunca avisaba
       del cambio de control.
    2. El reload automático que trae el propio `vite-plugin-pwa` por
       dentro no se disparaba de forma confiable en este flujo — se
       reemplazó por un listener propio del evento real del navegador
       (`controllerchange`), armado ÚNICAMENTE dentro del clic en
       "Actualizar" (no desde que carga la página) — confirmé que ese
       evento puede dispararse solo, antes de que nadie toque nada, así
       que armarlo desde el montaje recargaba la página sola sin avisar
       (justo lo que se quería evitar).
- **Cómo se probó:** construí 2 versiones reales de la app (v1/v2, con un
  cambio de contenido real entre ellas), serví v1, dejé la pestaña abierta,
  cambié los archivos servidos por v2 SIN tocar la pestaña (simulando un
  deploy real), y con Playwright confirmé: el aviso aparece solo (sin
  recargar nada todavía), el clic en "Actualizar" recarga UNA sola vez, y
  la pestaña queda en el bundle de la versión nueva — ciclo completo
  verificado de punta a punta, no solo revisado a simple vista.
- **Commit(s):** `a21235f`

---

### 2026-07-23 — Fix: no se podía generar responsiva (a nadie, no solo a un empleado)
- **Qué pasó:** el usuario reportó que no podía generar la responsiva de
  Miguel García Ramos, "y a otros usuarios tampoco". Investigué a fondo
  (revisé el flujo completo de generación de responsiva, validaciones,
  campos de empleado/activo, permisos) y descarté que fuera algo
  específico de un empleado — el bug era de infraestructura, no de datos.
- **La causa raíz:** `backend/src/assets/logos/SELECT SHOP MB.png` — el
  logo por default que se usa para la GRAN MAYORÍA de empleados (cualquiera
  sin `businessName` o con "SELECT SHOP MB") — media **10,689 × 2,572
  píxeles** (251KB), entre 30 y 150 veces más grande que cualquier otro
  logo de la carpeta (los demás rondan 500-600px). Reproduje el problema
  directo con pdfkit: cargar/decodificar esa imagen por sí sola disparaba
  el uso de memoria de ~60MB a ~490MB y tardaba ~2 segundos — en el
  servidor gratuito de Render (memoria muy acotada), eso es más que
  suficiente para tronar o colgar el proceso completo. Cuando eso pasa,
  CUALQUIER request de responsiva en curso en ese momento falla — no solo
  la del empleado que la disparó, de ahí que le fallara con Miguel García
  Ramos y con otros por igual.
- **Qué cambié:**
  - `backend/src/assets/logos/SELECT SHOP MB.png` (y su duplicado exacto
    sin usar, `image1.png`) — redimensionados a 800×192px (mismo aspecto,
    de 251KB a 26KB), tamaño acorde al resto de logos de la carpeta y de
    sobra para el tamaño real al que se dibuja en el PDF (`fit: [100, 40]`
    puntos). Reproduje la misma prueba después del cambio: memoria pasó de
    ~60MB a solo ~66MB y el tiempo de ~2000ms a 50ms.
  - `backend/src/utils/archiveResponsiva.js` — se agregó
    `doc.on('error', ...)` (faltaba solo aquí; los 3 builders del formato
    legado en `responsivaLegacyPdf.js` ya lo tenían). Sin este listener,
    un error del stream de pdfkit (ej. una imagen dañada) se propaga como
    excepción no capturada FUERA del try/catch de la ruta — capaz de
    tumbar el proceso completo otra vez, afectando a todos por igual, no
    solo a quien disparó el error. Ahora responde con un 500 controlado en
    vez de dejarlo sin manejar.
- **Cómo se probó:** `node --check` en los archivos tocados; reproduje el
  embed de la imagen con pdfkit standalone antes y después del resize,
  confirmando la caída real de memoria/tiempo; generé un PDF de prueba con
  el logo nuevo y lo revisé visualmente — se ve nítido a su tamaño real.
- **Commit(s):** `b2d11e9`

---

### 2026-07-23 — Fondo sólido detrás del texto de Manuales (el fondo animado lo dejaba muy leve)
- **Qué pasó:** el usuario reportó que, con el fondo animado detrás de
  toda página de empleado, el texto de los Manuales "se ve pero muy
  leve" — los títulos/párrafos no tenían su propio fondo, así que
  quedaban flotando directo sobre las manchas de color e íconos.
- **Qué cambié:** en `Manuales.jsx` + los 4 `Manual*.jsx`
  (Mesa de Ayuda, Gestor de Constancias, Ventas Vendedor, Ventas
  Telemarketing) — se envolvió TODO el contenido de cada página (título +
  tabla de contenido + secciones, o título + tarjetas) en una sola tarjeta
  con fondo sólido (`.pageCard`, `background: var(--p-panel)`), en vez de
  ponerle un fondo a cada párrafo suelto por separado. Los 4 manuales ya
  comparten un solo CSS (`ManualMesaDeAyuda.module.css`), así que la clase
  nueva se agregó una sola vez ahí; `Manuales.jsx` tiene la misma clase en
  su propio módulo.
- **Nota:** este mismo problema (texto suelto sin fondo propio, ahora que
  hay un fondo animado detrás) puede repetirse en otras páginas que no se
  tocaron en este cambio — se resolvió puntualmente donde el usuario lo
  reportó (Manuales); si aparece en otra pantalla, avisar para aplicar el
  mismo tratamiento ahí.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright,
  capturas revisadas visualmente en el índice de Manuales y en el
  contenido de un manual — el texto ahora se lee con buen contraste sin
  importar qué esté pasando en el fondo animado detrás.
- **Commit(s):** `058ef8d`

---

### 2026-07-23 — El robot mascota ahora es blanco (casi no se veía en negro)
- **Qué pasó:** el usuario reportó que el mascota casi no se veía —
  estaba pintado en tonos `--p-panel-2`/`--p-panel-3` (grises oscuros),
  prácticamente el mismo tono que el fondo oscuro del panel donde vive.
- **Qué cambié:** `frontend/src/components/RobotMascot.module.css` —
  cuerpo, cabeza, cuello y brazos pasan a blanco sólido (`--p-white`) con
  un contorno gris suave (`--p-hairline-soft`) para distinguir cada parte.
  Como consecuencia, los ojos y la boca (que antes eran claros, para
  contrastar contra un cuerpo oscuro) pasan a oscuros (`--p-ink`/
  `--p-faint`) — si no, un ojo blanco sobre una cara blanca desaparece
  igual. El tallo de la antena también pasa de un gris oscuro a
  `--p-muted`, más visible contra el fondo del panel.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright,
  captura revisada visualmente — el robot ahora contrasta con claridad
  contra el fondo oscuro del chat.
- **Commit(s):** `ba0a499`

---

### 2026-07-22 — El robot mascota se mueve al fondo del chat (no una franja aparte)
- **Qué pasó:** el usuario mandó una captura marcando que quería al robot
  de cuerpo completo viviendo DETRÁS de los mensajes, en el espacio vacío
  del chat — no como una franja propia arriba, entre el encabezado y los
  mensajes (como quedó en el cambio anterior).
- **Qué cambié:**
  - `frontend/src/components/RobotMascot.module.css` — el mascota pasa de
    `.wrap` como franja horizontal (con su propio fondo/borde) a
    `position: absolute` dentro del panel del chat, esquina inferior
    derecha, más grande (108px → 190px) y con `pointer-events: none`
    (nunca tapa un clic).
  - `frontend/src/components/HelpBot.module.css` — `.panel` gana
    `isolation: isolate` para crear su propio contexto de apilamiento: así
    el `z-index: -1` del mascota lo deja SIEMPRE por encima del fondo
    opaco del panel (para que se vea) pero SIEMPRE por debajo de los
    mensajes/chips reales (para que nunca tape el texto) — mismo
    mecanismo ya usado para el fondo animado global de toda la app.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright —
  confirmé que los chips siguen siendo clicables con el mascota detrás, y
  que al llenar el chat de mensajes (una respuesta larga de FAQ) el
  contenido se pinta encima del mascota sin ningún parpadeo ni superposición
  rara. Capturas revisadas visualmente, coinciden con la zona marcada en
  la captura del usuario.
- **Commit(s):** `d872494`

---

### 2026-07-22 — Robot de cuerpo completo animado dentro del chat
- **Qué pasó:** al usuario le gustó el emoji animado, pero pidió algo más:
  "un robot de cuerpo completo animado... que salude con la mano".
- **Qué cambié:** `frontend/src/components/RobotMascot.jsx` +
  `.module.css` (nuevo) — un robot dibujado en SVG (cabeza, antena, ojos,
  boca, cuerpo con luz en el pecho, brazos y pies), montado en el panel
  del chat (`HelpBot.jsx`) justo debajo del encabezado. Nada de imagen ni
  GIF — son formas SVG animadas con CSS puro, mismo criterio que el resto
  del bot (sin JS, `@keyframes infinite`, nunca se detiene):
  - Un brazo descansa a un lado la mayor parte del tiempo y cada ~5s se
    levanta y agita un par de veces — un saludo real, no un giro sin
    parar.
  - Respiración/flote sutil de todo el cuerpo.
  - Parpadeo cada tanto.
  - La luz del pecho y la punta de la antena ciclan por los mismos 3
    acentos (naranja/azul/verde) que ya usa la burbuja flotante.
  - Respeta `prefers-reduced-motion`.
- **Bug real que encontré y arreglé en el camino:** en el primer intento
  los hombros de los brazos caían DENTRO de la silueta del cuerpo (que se
  dibuja encima), así que los brazos quedaban tapados por completo —
  invisibles. Se corrigió angostando el cuerpo y moviendo los hombros
  hacia afuera de sus bordes, para que los brazos de verdad se vean
  saliendo de los costados.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright —
  confirmé que el brazo pasa por 5 valores de `transform` distintos en 6s
  (descansa, saluda, descansa), y "cacé" con un sondeo repetido el momento
  exacto del saludo para revisar visualmente que el brazo se ve levantado
  y no tapado por el cuerpo.
- **Commit(s):** `8da73dc`

---

### 2026-07-22 — Robot de Ayuda animado: saluda, brilla de colores y el chat entra con transición
- **Qué pasó:** el usuario pidió animar al Robot de Ayuda — tanto la
  burbuja flotante como el chat al abrirse, con "colores y animaciones", y
  literalmente animar al robot para que "haga gestos de ayuda".
- **Qué cambié:** `frontend/src/components/HelpBot.jsx` + `.module.css`:
  - **Burbuja flotante**: el brillo (box-shadow) ya no es fijo naranja —
    cicla despacio entre naranja/azul/verde (los mismos 3 acentos del
    fondo animado) en un bucle de 6s, `ease-in-out infinite`.
  - **El robot literalmente saluda**: el emoji 🤖 (tanto en la burbuja
    como en el avatar del encabezado del chat) hace un gesto de rotación
    tipo "saludo de mano" cada 4.5s y luego descansa — no gira sin parar
    (se sentiría como un tic), sino que saluda y hace una pausa, como un
    gesto real. Un emoji no se puede animar cuadro por cuadro, así que el
    gesto se logra rotando/escalando el elemento que lo contiene.
  - **Avatar del encabezado**: el fondo circular detrás del emoji también
    cicla entre los 3 colores de acento (6s), a juego con la burbuja.
  - **Entrada del chat**: el panel ya no aparece de golpe — entra con una
    transición de opacidad + escala + deslizamiento (0.32s), que se repite
    cada vez que se abre (el panel se desmonta por completo al cerrarse).
  - Todo respeta `prefers-reduced-motion` (se desactiva la animación,
    queda con el color/posición final fijo).
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright —
  muestreé el `transform` del robot 10 veces cada 500ms y confirmé que
  cambia durante el saludo y descansa después (4 valores distintos, no
  aleatorio); confirmé que el brillo de la burbuja y el color del avatar
  cambian con el tiempo. Capturas revisadas visualmente (botón a media
  animación de saludo, panel recién abierto).
- **Commit(s):** `30da06f`

---

### 2026-07-22 — Las 2 pantallas de login de empleado ahora miden y se centran igual
- **Qué pasó:** el usuario notó que la tarjeta de login se veía chica y
  pegada arriba en `/empleado/login` ("Mis Tickets"), comparada con la del
  WelcomeScreen de Mesa de Ayuda (más grande) — pidió agrandarla y
  centrarla para que ambas se vean iguales.
- **Qué cambié:**
  - `frontend/src/pages/SolicitarCuenta.module.css` (estilos compartidos) —
    2 clases nuevas: `.loginCardWide` (mismo tamaño progresivo que ya tenía
    el WelcomeScreen: 560px → 680px → 780px según el ancho de pantalla,
    antes solo vivía en `MesaDeAyuda.module.css`) y `.loginPage` (centra la
    tarjeta también verticalmente, no solo horizontalmente — antes ninguna
    de las 2 pantallas lo hacía).
  - `frontend/src/pages/EmployeeLogin.jsx` — usa `loginCardWide` +
    `loginPage` en vez de la `loginCardNarrow` (460px, pensada para
    Confirmar Envío, no para login).
  - `frontend/src/pages/MesaDeAyuda.jsx` (WelcomeScreen) — usa las mismas
    2 clases compartidas en vez de su propio `.loginCard` local (que se
    quitó de `MesaDeAyuda.module.css`, ya no hace falta).
  - No se tocó `.loginCardNarrow` en sí (sigue usándose tal cual en
    `ConfirmarEnvio.jsx`, que no fue parte de este pedido).
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright —
  confirmé con `getBoundingClientRect()` que ambas tarjetas miden
  exactamente 780px de ancho y quedan en la misma posición horizontal
  (x=250) en 1280px de viewport; capturas revisadas visualmente en ambas
  pantallas, ambas centradas verticalmente.
- **Commit(s):** `b7987ec`

---

### 2026-07-22 — Fondo animado (manchas de color + íconos) ahora en TODAS las páginas de empleado
- **Qué pasó:** al usuario le encantó el fondo de íconos cayendo y pidió
  dos cosas: (1) recuperar también "los colorcitos" (las manchas de color
  difuminadas de la primera versión, combinadas con los íconos, no en vez
  de ellos), y (2) que apareciera en todas las páginas, no solo en Mesa de
  Ayuda.
- **Qué cambié:**
  - `frontend/src/components/AmbientBackground.jsx` + `.module.css`
    (nuevo, movido de `MesaDeAyuda.jsx`) — un solo componente con las 3
    manchas de color (naranja/azul/verde) Y los 16 íconos cayendo,
    montado una sola vez de forma global en `App.jsx` en vez de vivir
    dentro de una página específica.
  - `frontend/src/App.jsx` — nuevo `AmbientBackgroundGate` (mismo patrón
    que `HelpBotGate`, mismos `EMPLOYEE_PATH_PREFIXES`, ahora incluyendo
    también `/confirmar-envio`). `<Routes>` se envuelve en un
    `<div style={{ position: 'relative', zIndex: 1 }}>` para que TODO lo
    que renderice cualquier página quede por encima del fondo animado de
    un solo golpe, sin tener que tocar cada página una por una.
  - **Bug real que encontré al hacerlo global:** envolver `<Routes>` así
    también promovía el fondo NEGRO PLANO que cada página ya trae
    (`.portalDark`, con `background: var(--p-ink)`) — y esa capa opaca,
    al quedar en el mismo nivel que el contenido, tapaba el fondo animado
    por completo (dos fondos opacos no pueden ganarse el mismo lugar; el
    de arriba siempre gana). La única forma de que aparezca en todas las
    páginas sin tocar cada una es que no compitan: se quitó el
    `background` de `.portalDark` (`styles/portal-theme.css`) y se le puso
    ese mismo `background: var(--p-ink)` directo al propio
    `AmbientBackground`, que ahora sirve de base sólida Y capa animada al
    mismo tiempo.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright — fondo
  visible y confirmado por `getBoundingClientRect`/computed style en
  `/solicitar-cuenta` (página pública) y `/mis-tickets` (dentro del
  portal), ausente en `/login` (panel de Sistemas, fuera de alcance);
  `elementFromPoint` sobre el saludo de Mesa de Ayuda confirma que el
  texto real sigue por encima; clic en una tarjeta de "¿Qué necesitas?"
  sigue navegando con normalidad; el sidebar conserva su fondo sólido de
  siempre (no se transparenta).
- **Commit(s):** `8af9bda`

---

### 2026-07-22 — Fondo animado v2: íconos del tema cayendo, no manchas de color
- **Qué pasó:** el primer fondo animado (manchas de color difuminadas
  moviéndose) no era lo que el usuario tenía en mente — pidió algo "como
  objetos cayendo... pero referente a la página".
- **Qué cambié:** `frontend/src/pages/MesaDeAyuda.jsx` +
  `MesaDeAyuda.module.css` — se reemplazan las 3 manchas de color por 16
  íconos del propio tema de soporte (🎫 ticket, 🔑 llave de acceso, 🎧
  diadema, 💡 foco, 🔔 campana, 📧 correo, 💻 laptop, ✅ resuelto, 🖨️
  impresora, 🔧 herramienta) cayendo despacio de arriba a abajo con un
  ligero balanceo lateral, en bucle infinito — cada uno con su propia
  posición, tamaño, duración y delay (delays NEGATIVOS a propósito, para
  que la pantalla se vea "llena" desde el primer instante en vez de vacía
  los primeros segundos). Mismo mecanismo de antes (puro CSS `@keyframes
  infinite`, sin JS, `pointer-events: none`, respeta
  `prefers-reduced-motion`).
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright — mismas
  verificaciones que la vez anterior (el `transform` de un ícono cambia
  solo entre 2 lecturas separadas por 3s, tarjetas siguen siendo
  clicables) más una nueva: `document.elementFromPoint()` sobre el texto
  del saludo confirma que el propio texto (no el ícono) es el elemento más
  arriba en esa coordenada — en una captura estática un ícono se veía
  "encima" del texto, pero era solo cercanía visual, no un problema real
  de superposición.
- **Commit(s):** `29a3a65`

---

### 2026-07-22 — Fondo animado en Mesa de Ayuda (ya no estático)
- **Qué pasó:** el usuario pidió que el fondo de la Mesa de Ayuda tuviera
  "animaciones bonitas y constantes", sin depender de refrescar la página
  para que funcionaran.
- **Qué cambié:** `frontend/src/pages/MesaDeAyuda.jsx` +
  `MesaDeAyuda.module.css` — nuevo componente `AmbientBackground`: 3
  manchas de color muy difuminadas (naranja/azul/verde, los mismos acentos
  ya usados en toda la app) que se mueven solas en bucle infinito, puro CSS
  `@keyframes ... infinite` (sin JS) — por diseño nunca se detienen ni
  necesitan refrescar la pestaña para "reiniciar". Se agregó tanto a la
  pantalla de bienvenida/login como al dashboard con sesión. `position:
  fixed` + `pointer-events: none` para cubrir toda la pantalla sin taparle
  un clic a nada; respeta `prefers-reduced-motion` (sin animación, mismo
  color fijo). El resto del contenido de la página se marcó con `z-index:
  1` para quedar explícitamente por encima del fondo.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright —
  confirmé que el `transform` de una mancha cambia solo entre dos lecturas
  separadas por 2.5s (la animación corre sin interacción), y que las
  tarjetas de "¿Qué necesitas?" siguen siendo clicables con el fondo detrás.
  Capturas revisadas visualmente en welcome screen y dashboard.
- **Commit(s):** `14f7938`

---

### 2026-07-22 — Robot de Ayuda mucho más grande (el usuario marcó el tamaño con una captura)
- **Qué pasó:** el aumento de tamaño anterior (66px/420×620) le seguía
  pareciendo chico — mandó una captura marcando con un círculo rojo cuánto
  quería que abarcara el panel, bastante más grande que un widget de
  esquina normal.
- **Qué cambié:** `frontend/src/components/HelpBot.module.css` — panel de
  420×620 a `min(800px, 100vw-2.5rem)` × `min(80vh, 100vh-6rem)` (casi toda
  la altura de la pantalla, como se marcó en la captura). Subí también la
  tipografía y el espaciado interno (encabezado, burbujas, chips,
  resultados, input) para que no se vea texto chico flotando en un panel
  grande — sigue acotado con `min(...)` para no desbordar en móvil.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright en
  1905×1013 (mismo tamaño que la ventana de la captura) confirmando que el
  panel cubre esa área, y en 390×844 confirmando que en móvil se sigue
  ajustando sin desbordar.
- **Commit(s):** `cb0e90c`

---

### 2026-07-22 — Robot de Ayuda ahora vive en TODO el lado de empleado (público + login incluidos)
- **Qué pasó:** el usuario pidió que el Robot de Ayuda apareciera en todas
  las páginas de empleado, incluyendo las públicas (Solicitar Cuenta/
  Recurso/Ingreso) y el login de la Mesa de Ayuda — pensando en un usuario
  nuevo que ni siquiera sabe cómo entrar todavía, y que debería poder
  preguntarle al robot en vez de quedarse atorado.
- **Qué cambié:**
  - `frontend/src/components/PortalLayout.jsx` — ya no monta `<HelpBot />`
    (vivía solo aquí, por eso faltaba en las páginas públicas y en el
    login).
  - `frontend/src/App.jsx` — nuevo `<HelpBotGate />`, montado una sola vez
    junto a `<Routes>`, que decide con `useLocation()` si mostrar el bot
    según el path: aparece en todo el lado de empleado (Mesa de Ayuda,
    Solicitar Cuenta/Recurso/Ingreso, `/empleado/login`, Reportar Ticket,
    Mis Tickets/Solicitudes, Baja de Personal, Manuales) y **no** aparece en
    el panel interno de Sistemas ni en su login (`/login`) — es una
    audiencia distinta, no se pidió ahí.
  - `frontend/src/components/HelpBot.jsx` — dos cambios de fondo:
    1. Sin sesión (páginas públicas o antes de iniciar sesión), el saludo y
       las sugerencias iniciales cambian a "¿Cómo inicio sesión?" / "Es mi
       primera vez, no tengo contraseña" / "Necesito una cuenta nueva", en
       vez de sugerir cosas que de todos modos piden sesión primero.
    2. Si alguien sin sesión pregunta por el estatus de un ticket/solicitud,
       ya NO intenta consultar los endpoints privados — antes eso hubiera
       disparado el interceptor 401 de `employeeApi` y mandado a la persona
       de golpe a `/empleado/login`, sacándola de un formulario público a
       medio llenar. Ahora responde con una tarjeta "Iniciar sesión" sin
       tocar la red.
  - **Bug que encontré y arreglé en el camino:** al mover el bot fuera de
    `PortalLayout`, quedó fuera de cualquier contenedor `.portalDark` de
    página — y todas las variables de color (`--p-orange`, `--p-panel`,
    etc., definidas en `portal-theme.css` bajo `.portalDark`) dejaban de
    resolver ahí, así que el panel del chat se veía con fondo transparente
    (se notaba "lavado"/sin contraste). Se arregló poniendo su propia clase
    `portalDark` en la raíz del componente, para que sea autosuficiente sin
    importar dónde se monte.
  - `frontend/src/pages/ManualMesaDeAyuda.jsx` + `frontend/src/config/faqData.js`
    — 5 preguntas nuevas sobre inicio de sesión (cómo entrar, primera vez,
    si hace falta escribir el correo completo, qué pasa si olvidaste tu
    contraseña — hoy no hay recuperación automática, y cuánto dura la
    sesión: 30 días), basadas en la sección "2. Acceso al sistema" del
    manual, ya existente y verificada contra el código real de
    `EmployeeLoginWidget.jsx`.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright visitando
  `/empleado/login` y `/solicitar-cuenta` sin sesión (bot aparece, saludo
  correcto, responde bien a "¿Cómo inicio sesión?", y una pregunta de
  estatus sin sesión NO redirige ni rompe nada) y `/login` (panel de
  Sistemas — se confirmó que el bot NO aparece ahí).
- **Commit(s):** `6531bf5`

---

### 2026-07-22 — Robot de Ayuda más grande + FAQ de Mesa de Ayuda ampliada (11 → 20 preguntas)
- **Qué pasó:** al usuario le gustó el Robot de Ayuda pero lo sintió chico, y
  pidió dejar el manual "más completo" — con la observación correcta de que
  el conocimiento del bot depende del manual (`config/faqData.js` es una
  copia para búsqueda del contenido de los `Manual*.jsx`): si no se
  actualiza el manual, el bot se queda desactualizado.
- **Qué cambié:**
  - `frontend/src/components/HelpBot.module.css` — burbuja flotante de
    56px a 66px, panel de 360×520 a 420×620 (con el mismo tope de
    `calc(100vw/100vh - ...)` para no desbordar en pantallas chicas).
  - `frontend/src/pages/ManualMesaDeAyuda.jsx` — 9 preguntas nuevas en la
    sección de FAQ, basadas en comportamiento real ya existente en el
    código (no inventado): selector de equipo cuando hay más de uno
    asignado, límite de adjuntos (15MB, opcional salvo Alta de
    Proveedores), escape "No sé cuál aplicación", datos de proveedor +
    doble adjunto en Alta de Proveedores, el asunto autocompletado es
    editable, por qué Solicitud de Ingreso obliga a elegir "quién solicita"
    de una lista, el correo sugerido de un nuevo ingreso no es el final, y
    2 sobre Baja de Personal (qué pasa si RH rechaza, y que RH ve el
    snapshot de activos asignados antes de aprobar).
  - `frontend/src/config/faqData.js` — las mismas 9 preguntas agregadas
    aquí también, para que el Robot de Ayuda las conozca (antes solo
    vivían en el manual, el bot no las hubiera encontrado).
- **Por qué solo Mesa de Ayuda:** los otros 3 manuales (Gestor de
  Constancias Aduaneras, Ventas Vendedor, Ventas Telemarketing) documentan
  aplicaciones que viven **fuera** de este repo — no tengo forma de
  verificar su comportamiento real contra código, así que ampliarlos
  requiere que el equipo dé el contenido (o los huecos que ven a diario)
  en vez de que yo lo invente.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright
  confirmando visualmente el nuevo tamaño del widget y que una pregunta
  nueva se encuentra y se muestra en el chat.
- **Commit(s):** `9114a0b`

---

### 2026-07-22 — Robot de Ayuda: chat flotante gratuito (sin IA) en todo el portal de empleado
- **Qué pasó:** el usuario preguntó si se podía poner un chatbot de ayuda
  tipo Amazon, pero gratis (sin pagar tokens de un LLM). Confirmó armarlo
  basado en reglas y de paso pidió que la búsqueda fuera "más completa",
  porque sentía que hasta el buscador de Mesa de Ayuda se quedaba corto.
- **Qué cambié:**
  - `frontend/src/utils/helpSearch.js` (nuevo) — motor de búsqueda
    compartido: se movió aquí toda la lógica que antes vivía duplicada
    dentro de `MesaDeAyuda.jsx` (`normalize`, `SOLICITUD_TOPICS`,
    `scoreKeywords`, `bestTicketMatch`, `buildTicketResult`,
    `searchTopics`), y se le agregó: (1) un diccionario de sinónimos
    cotidianos (compu→computadora, cel→celular, pass/clave→contraseña,
    wifi/internet→red, mail/gmail/outlook→correo, etc.) expandido antes de
    buscar; (2) tolerancia a errores de dedo (distancia de edición ≤1 en
    palabras de 5+ letras); (3) `searchFaq()`, que busca también sobre las
    preguntas frecuentes de los manuales; (4) `detectStatusIntent()`, que
    reconoce frases como "cómo va mi ticket"/"mis solicitudes"; (5)
    `searchHelp()`, que combina todo lo anterior en una sola función.
  - `frontend/src/config/faqData.js` (nuevo) — las 43 preguntas frecuentes
    ya escritas a mano en los 4 manuales (Mesa de Ayuda, Gestor de
    Constancias Aduaneras, Ventas Vendedor, Ventas Telemarketing) copiadas
    tal cual a un array de datos, para que el buscador y el bot las
    encuentren sin tener que abrir el manual completo. **Nota:** es una
    copia para búsqueda, no la fuente de verdad — los manuales (`Manual*.jsx`)
    siguen siendo el contenido autoritativo; si se edita una pregunta ahí,
    hay que actualizarla aquí también a mano (no se unificaron ambas cosas
    en este cambio para no arriesgar alterar contenido ya revisado).
  - `frontend/src/components/HelpBot.jsx` + `.module.css` (nuevo) — el
    chat flotante en sí: burbuja 🤖 fija abajo a la derecha, panel con
    mensajes tipo chat, chips de sugerencias iniciales, respuestas de FAQ
    mostradas directo en el chat, resultados de navegación como tarjetas
    clicables, categorías de respaldo cuando no hay match, y una consulta
    en vivo (`GET /tickets/mine`, `/account-requests/mine`,
    `/resource-requests/mine`, `/onboarding-requests/mine`,
    `/offboarding-requests/mine`, ya existentes) cuando detecta que
    preguntan por el estatus de algo que ya reportaron. Sigue siendo 100%
    basado en reglas — nada de IA ni servicio externo, cero costo de tokens.
  - `frontend/src/components/PortalLayout.jsx` — monta `<HelpBot />` una
    sola vez en el cascarón compartido, así aparece en todas las páginas
    del portal (Mesa de Ayuda, Mis Tickets, Mis Solicitudes, Manuales,
    Reportar Ticket) sin repetirlo en cada una.
  - `frontend/src/pages/MesaDeAyuda.jsx` — el buscador de la pantalla
    principal ahora importa `searchTopics` de `utils/helpSearch.js` en vez
    de su copia local, así las mejoras (sinónimos, tolerancia a errores)
    benefician también al buscador de siempre, no solo al bot.
- **Cómo se probó:** `npm run build`; `vite preview` + Playwright con
  `page.route()` simulando los 6 endpoints y `localStorage` con sesión de
  empleado — se probaron: sinónimo+typo ("no prende mi compu" encuentra
  resultados de Hardware), respuesta de FAQ mostrada inline, consulta de
  estatus en vivo (mostró el ticket mockeado con su folio y estatus), y el
  fallback con chips de categoría cuando no hay coincidencia; además una
  prueba en viewport móvil (390×844) confirmando que el panel se adapta
  sin desbordarse. Capturas de pantalla revisadas visualmente.
- **Commit(s):** `bc32d5b`

---

### 2026-07-22 — El tratamiento de color + animación de Reportar Ticket se extiende a toda la Mesa de Ayuda
- **Qué pasó:** el usuario dijo que le encantó el rediseño de tarjetas con
  color y animación de "Reportar un problema" (franja superior de color +
  burbuja de ícono tintada + glow al pasar el mouse, por sección) y pidió
  aplicarlo a **toda** la Mesa de Ayuda — empezando por "Solicitudes" (la
  pantalla principal) y las opciones dentro de cada solicitud, "de lo
  general a lo particular con sus colores".
- **Qué cambié:**
  - `frontend/src/pages/MesaDeAyuda.jsx`/`.module.css` — las 6 tarjetas de
    "¿Qué necesitas?" ganan cada una su propio acento (`ROOT_ACCENTS`):
    Acceso a un sistema o correo = ámbar, Equipo/accesorio/servicio = azul,
    Alta de ingreso = verde, Baja de personal = gris, Tengo un problema =
    naranja, Manuales = gris. Mismo patrón de `.needCard`/`.iconBadge` que
    ya usa `ReportarTicket.module.css` (franja superior + burbuja tintada +
    glow en hover), con el mismo respaldo `var(--accent, var(--p-orange))`
    en el punto de uso para no repetir el bug ya documentado de pisar el
    valor heredado si se declara en el contenedor padre.
  - `frontend/src/pages/SolicitarCuenta.jsx`/`.module.css` — los 3
    checkboxes de "¿Qué necesitas?" (Gmail/Plataformas/ERP) pasan de una
    lista plana en columna a tarjetas en fila con su propio color (azul/
    verde/ámbar) y animación de hover; cada sección de detalle que se
    revela después (Gmail/Plataformas/ERP) hereda el MISMO color en su
    título y en los radio/checkbox de adentro — el color se fija UNA vez en
    el contenedor de la sección (`--accent`/`--accent-soft` inline) y baja
    solo por herencia de CSS custom properties a todos sus hijos, sin
    repetirlo en cada campo. Esto es justo el "de lo general a lo
    particular con su color" que pidió: el nivel general (la sección) trae
    el color, lo particular (cada radio/checkbox de adentro) solo lo hereda.
  - `frontend/src/pages/SolicitarIngreso.jsx` — mismo patrón: "Correo
    corporativo" = azul; dentro de "Equipo necesario", Computadora = verde,
    Teléfono = ámbar, Accesorios = gris (a propósito más discreto — es el
    catch-all, no necesita competir con los otros 2).
  - `frontend/src/pages/SolicitarRecurso.jsx` — su checklist de recursos
    (~13 opciones planas, sin subgrupos reales) gana un solo acento verde
    (igual que su tarjeta "Equipo, accesorio o servicio" en Mesa de Ayuda)
    en vez de tarjetas individuales por opción — con 13 ítems sin
    agrupamiento natural, colorear cada uno por separado se habría sentido
    como ruido, no como orden; un acento consistente en toda la lista
    aporta vida sin perder densidad de información.
- **Verificación:** `npm run build` sin errores; `vite preview` +
  Playwright en las 4 páginas (Mesa de Ayuda, Solicitar Cuenta/Ingreso/
  Recurso) con capturas revisadas visualmente — confirmé los colores
  correctos por tarjeta/sección, que el color de una sección de detalle sí
  se propaga a sus radios/checkboxes internos, y que `ConfirmarEnvio.jsx`/
  `EmployeeLoginWidget.jsx` (comparten el mismo CSS module pero no usan
  `.checkOption`/`.platformBlock`) no se vieron afectados; repetí en
  390px (celular) sin overflow horizontal.
- **Commit(s):** `ea027f0`.

---

### 2026-07-22 — Se fusiona la categoría "ERP" dentro de "Aplicaciones" (ya no vive por separado en el wizard)
- **Qué pasó:** el usuario reportó que la categoría raíz "ERP" (dentro de
  "Programas y sistemas") le parecía redundante con la app "ERP" que ya
  existe en el catálogo de Aplicaciones Internas — pidió quitar el módulo
  ERP standalone del wizard y mover TODO su contenido dentro de
  "Aplicaciones", aclarando que ahí (Aplicaciones → ERP) es "el verdadero
  reporte del ERP".
- **El riesgo real que había que evitar:** los tickets de tipo `erp` tienen
  un aislamiento de visibilidad muy deliberado desde el 2026-07-17 — SOLO
  lider.erp/analista.erp los ven, el resto de Sistemas nunca (`canViewTicket`
  en `backend/src/routes/tickets.js` depende 100% de
  `ticket.ticketType === 'erp'`, no de a qué app esté ligado el ticket).
  Todas las demás apps especiales dentro de "Aplicaciones" (Solicitud de
  Pagos, Ventas, Gestor de Constancias) siempre mandan `ticketType:
  'aplicacion'` — si "ERP" se hubiera fusionado como una app especial más
  sin ningún ajuste, sus tickets se habrían creado como `'aplicacion'` en
  vez de `'erp'`, **rompiendo por completo ese aislamiento** (el resto de
  Sistemas habría empezado a ver tickets de ERP que antes tenía prohibido
  ver). Se corrigió antes de implementar, no se descubrió después.
- **Qué cambié:**
  - `frontend/src/config/ticketCategories.js` — se quitó la categoría raíz
    `erp` de `CATEGORIES` por completo. Nuevo `isErpApp()`/`ERP_SUBAREAS`
    (mismo shape que `PAYMENT_REQUEST_SUBAREAS`/`VENTAS_SUBAREAS`, con los
    mismos 4 problemas de siempre, sin cambios de contenido) agregado a
    `SPECIAL_APPS` — "ERP" ahora se reconoce como una app especial más
    dentro de Aplicaciones, con un único apartado ("general").
  - `frontend/src/pages/ReportarTicket.jsx` — como ERP solo tiene 1
    apartado, se agregó lógica genérica (útil para cualquier futura app
    especial con un solo apartado) que salta directo a la lista de
    problemas sin mostrar un selector de "elige entre 1 opción"; "← Cambiar
    apartado" regresa directo a la lista de apps en ese caso, no a ese
    picker inexistente. Nuevo `form.forcedTicketType`: se fija a `'erp'`
    solo cuando la app elegida es ERP (y se apaga explícitamente si se
    elige cualquier otra), y el envío usa
    `form.forcedTicketType || category` en vez de `category` a secas —
    así el ticket se sigue guardando con `ticketType: 'erp'` aunque la
    categoría raíz del wizard siga siendo "Aplicaciones".
- **Acción manual pendiente (fuera de este repo, no se puede hacer desde
  aquí):** para que el apartado "ERP" aparezca de verdad en el wizard, tiene
  que existir una Aplicación Interna real dada de alta en `/internal-apps`
  con el nombre exacto **"ERP"** (sin distinguir mayúsculas/minúsculas) —
  igual que ya se pidió para "Solicitud de Pagos"/"Ventas"/"Gestor de
  Constancias Aduaneras" en sesiones anteriores. Sin esa app registrada, el
  buscador de Mesa de Ayuda y el catálogo de Aplicaciones simplemente no
  van a mostrar la opción.
- **Verificación:** `npm run build` sin errores (189 módulos); `vite
  preview` + Playwright con el catálogo de apps mockeado (incluyendo una
  app "ERP" de prueba) — confirmé que "ERP" ya no aparece como tarjeta de
  categoría raíz, que Aplicaciones → ERP salta directo a la lista de
  problemas (sin picker de apartado), que el Asunto se precarga
  correctamente, que el ticket se envía con `ticketType=erp` y el `appRef`
  ligado a la app real; probé también "← Cambiar apartado" (regresa a la
  lista de apps) y que elegir después una app normal distinta (sin
  apartados) apaga `forcedTicketType` correctamente (esa se manda con
  `ticketType=aplicacion`, sin quedar contaminada por la elección anterior
  de ERP).
- **Commit(s):** `05b63ed`.

---

### 2026-07-22 — Alta de Proveedores: segundo adjunto obligatorio (comprobante bancario) + se quita "no aparece en el catálogo"
- **Qué pasó:** siguiendo la entrega anterior (mismo día), el usuario pidió
  2 ajustes más al apartado "Alta de Proveedores": (1) además de la CSF, que
  también pida un archivo adjunto de los datos bancarios (comprobante,
  aparte del texto ya capturado); (2) quitar del catálogo la opción "Un
  proveedor no aparece en el catálogo".
- **Qué cambié:**
  - `frontend/src/config/ticketCategories.js` — se quitó por completo el
    problema "Un proveedor no aparece en el catálogo" del apartado
    (quedan 3: dar de alta, actualizar, "Otro tema de proveedores" — este
    último sin cambios).
  - `backend/src/models/Ticket.js` — nuevos `bankProofData`/
    `bankProofMimeType`/`bankProofFileName`: SEGUNDO adjunto aparte de la
    CSF (`attachmentData` de siempre), comprobante de los
    `providerBankDetails` ya capturados como texto.
  - `frontend/src/pages/ReportarTicket.jsx` — nuevo campo de archivo
    "Comprobante de datos bancarios (carátula/estado de cuenta) *",
    obligatorio junto con la CSF cuando `requiresProviderInfo`; nuevo estado
    `bankProofFile` y validación antes de enviar.
  - `backend/src/routes/tickets.js` — `POST /tickets/mine` pasa de
    `upload.single('attachment')` a `upload.fields([...])` (2 archivos:
    `attachment` + `bankProofAttachment`); revalida que ambos vengan
    presentes cuando `requiresProviderInfo === 'true'`; nueva ruta
    `GET /:id/bank-proof-attachment` (mismo patrón que la de la CSF) para
    que Sistemas pueda verlo desde el panel.
  - `backend/src/utils/graphMail.js` — `notifyEmail({attachment})` pasa a
    `notifyEmail({attachments})` (arreglo) para poder mandar la CSF **y**
    el comprobante bancario incrustados en el mismo correo a pagos@ (sigue
    aplicando solo a la audiencia `'externo'`, igual que la entrega
    anterior).
  - `frontend/src/pages/TicketDetailModal.jsx` — segundo botón "Ver
    adjunto" para el comprobante bancario, y la etiqueta del adjunto
    original ahora dice "Constancia de Situación Fiscal (CSF)" en vez de
    "Evidencia" cuando el ticket trae datos de proveedor.
- **Verificación:** `node --check` en los 4 archivos backend tocados;
  `npm run build` sin errores; `vite preview` + Playwright — confirmé que
  "Un proveedor no aparece en el catálogo" ya no existe (mientras "Otro
  tema de proveedores" sigue intacto), que aparecen los 2 campos de
  archivo, que enviar solo con la CSF (sin el comprobante bancario)
  bloquea con el aviso correcto, y que adjuntando ambos el ticket se envía
  con `requiresProviderInfo=true` y los 2 archivos reales en el
  `multipart/form-data` (`bankProofAttachment` incluido).
- **Commit(s):** `0bd4da1`.

---

### 2026-07-22 — Alta de Proveedores: campos estructurados (datos del proveedor + CSF) en vez de texto libre
- **Qué pasó:** el usuario pidió que, dentro de Reportar un problema →
  Programas y sistemas → Aplicaciones → Solicitud de Pagos → Alta de
  Proveedores, los problemas "dar de alta un proveedor" y "actualizar
  proveedor" pidan datos estructurados — Constancia de Situación Fiscal
  (CSF), datos bancarios y datos del proveedor (nombre, correo, teléfono) —
  en vez de dejarlos sueltos en la descripción; "otro tema de proveedores"
  se queda como está (solo pide que expliquen el problema).
- **Qué cambié:**
  - `frontend/src/config/ticketCategories.js` — los 2 problemas relevantes
    del apartado "Alta de Proveedores" ganan `providerFields: true`; los
    otros 2 ("no aparece en el catálogo"/"Otro tema") no se tocaron.
  - `frontend/src/pages/ReportarTicket.jsx` — al elegir uno de esos 2
    problemas, el formulario final agrega un bloque "Datos del proveedor"
    (nombre, correo, teléfono, datos bancarios, los 4 obligatorios) y el
    campo de adjunto (antes "evidencia opcional") se vuelve obligatorio y
    cambia de etiqueta a "Constancia de Situación Fiscal (CSF) *". Al
    cambiar a un problema distinto que ya no lo pida, se apaga solo (no se
    queda prendido de la elección anterior).
  - `backend/src/models/Ticket.js` — 4 campos nuevos:
    `providerName`/`providerEmail`/`providerPhone`/`providerBankDetails`.
  - `backend/src/routes/tickets.js` (`POST /tickets/mine`) — revalida en el
    servidor (no solo confiar en el frontend) que los 4 campos y el adjunto
    vengan completos cuando `requiresProviderInfo === 'true'`.
  - **Hallazgo importante al probar el correo real de este flujo:** el
    ticket de "Alta de Proveedores" se enruta por correo a
    `pagos@selectshop.com.mx` (audiencia `'externo'`, sin sesión en el
    panel) — pero `notifyEmail()`/`graphMail.js` **nunca soportó adjuntar
    archivos al correo**, solo mandaba `{to, subject, html}`. Sin esto,
    pagos@ habría recibido la solicitud pero **sin ninguna forma de
    obtener la CSF** (no tiene login para ir a descargarla del panel) —
    la mitad del pedido no habría servido de nada. Se agregó soporte real
    de adjuntos a `notifyEmail` (Microsoft Graph `sendMail` con
    `attachments[].contentBytes` en base64) y se conecta solo para la
    audiencia `'externo'` (Sistemas ya tiene el botón al panel, no lo
    necesita).
  - `backend/src/utils/emailTemplates.js` — nueva `providerSection()`
    (compartida por ambas plantillas): muestra Proveedor/Correo/Teléfono/
    Datos bancarios cuando existen, con una nota de que la CSF va adjunta
    (solo aplica de verdad en la plantilla externa, que es la que la
    incluye).
  - `frontend/src/pages/TicketDetailModal.jsx` — nueva sección "Datos del
    proveedor" en el detalle del ticket para cuando Sistemas lo revisa
    desde el tablero (el ticket es visible ahí aunque el correo se haya
    enrutado a pagos@, ya que la visibilidad del tablero y el enrutamiento
    de correo son cosas separadas).
- **Bug real encontrado y corregido durante la prueba:** el primer intento
  nunca mandaba el flag `requiresProviderInfo` en el `FormData` del
  frontend — solo los 4 campos, condicionados a un flag que el backend
  jamás recibía. Como el backend valida contra
  `body.requiresProviderInfo === 'true'`, la validación del servidor nunca
  se habría activado (silenciosamente aceptando tickets sin los datos ni la
  CSF). Se detectó inspeccionando el payload real capturado con Playwright,
  no solo confiando en que "el formulario se ve bien".
- **Verificación:** `node --check` en los 4 archivos backend tocados;
  `npm run build` sin errores; `vite preview` + Playwright con el catálogo
  de apps mockeado — confirmé que el bloque de proveedor aparece solo en
  los 2 problemas correctos (no en "Otro tema de proveedores"), que enviar
  vacío bloquea con el aviso esperado, que llenar todo + adjuntar un
  archivo de prueba manda un `POST /tickets/mine` con
  `requiresProviderInfo=true` y los 4 campos + el adjunto real, y que el
  ticket se crea correctamente (folio de prueba).
- **Commit(s):** `34ebb47`.

---

### 2026-07-22 — Correo de tickets: plantilla amigable para destinatarios externos a Sistemas/ERP/BI
- **Qué pasó:** el usuario confirmó que la plantilla actual del correo de
  avisos de ticket está "PERFECTA" para Sistemas — y aclaró explícitamente
  que ERP y BI (lider.erp/analista.erp) cuentan como el mismo departamento
  de Sistemas para este propósito, aunque su correo o puesto sugiera otra
  cosa — pero la sintió "muy brusca" para destinatarios genuinamente
  externos, como `gerente.contabilidad@` y `pagos@` (reciben ciertos
  apartados de "Solicitud de Pagos" enrutados directo a ellos, sin pasar
  por Sistemas — ver CHANGELOG 2026-07-20) — un correo con SLA, prioridad en
  rojo y aviso de "impide trabajar" los alarmaría sin necesidad, sobre todo
  porque ni siquiera tienen sesión en el panel para darle seguimiento ahí.
- **Qué cambié:**
  - `backend/src/utils/emailTemplates.js` — nueva
    `buildExternalTicketNotificationEmail()`: mismo branding (franja
    naranja, tipografía), pero sin SLA/prioridad/aviso rojo de "impide
    trabajar"/tipo de soporte/equipo ni el botón "Ver ticket en el panel"
    (no tienen acceso ahí) — solo folio, fecha, quién solicitó, aplicación,
    asunto y descripción, con tono cálido ("Hola, te compartimos el detalle
    de una solicitud...") y un cierre que no suena a alerta de IT. La
    plantilla original (`buildTicketNotificationEmail`) **no se tocó**, tal
    cual la pidió el usuario.
  - `backend/src/routes/tickets.js` — `getTicketEmailRecipients()` ahora
    regresa `{ emails, audience }` en vez de solo un arreglo de correos
    (`audience: 'sistemas' | 'externo'`); cada regla de enrutamiento ya
    declara la suya (`SOLICITUD_PAGOS_RECIPIENTS` gana el campo
    `audience` por entrada — "usuario" → `sistemas` porque va a lider.erp/
    analista.erp; "costo"/"motivo de pago"/"proveedor" → `externo`; el
    resto de reglas — Seguridad, Ventas, Gestor de Constancias, ERP, el
    enrutamiento general — se quedan en `sistemas`, sin cambios de
    comportamiento). Al armar el correo, se elige la plantilla según
    `audience`.
- **Verificación:** `node --check` en ambos archivos; rendericé las 2
  plantillas con datos de prueba idénticos (mismo ticket, ambas rutas) y las
  revisé visualmente vía Playwright — la de Sistemas se ve exactamente
  igual que antes (SLA, prioridad, franja roja, botón); la externa ya no
  tiene ninguno de esos elementos y se lee en tono cálido, sin jerga
  técnica.
- **Commit(s):** `1e5e9d2`.

---

### 2026-07-22 — FIX: el link de aviso de ticket por correo mandaba a un 404 si no había sesión iniciada
- **Qué pasó:** el usuario reportó que al llegar desde el aviso de un ticket
  nuevo al panel (botón "Ver ticket en el panel" del correo, enlaza a
  `${FRONTEND_URL}/tickets`), si no tenía sesión iniciada en ese momento
  caía en el 404 genérico — pidió que en ese caso mande a iniciar sesión en
  vez de un callejón sin salida, ya que sabe que ese 404 es a propósito
  (`PrivateRoute`, 2026-07-07) para rutas privadas visitadas al azar, pero
  este es un link legítimo compartido por correo, no alguien adivinando la
  URL.
- **Por qué no se tocó `PrivateRoute` directamente:** ese 404 sigue siendo
  la defensa correcta contra alguien que llega a la raíz del sitio quitando
  partes de una URL pública (ej. `/solicitar-cuenta`) por curiosidad — no
  quería revertir esa decisión para TODA la app, solo arreglar este punto de
  entrada específico (un link real, ya compartido con Sistemas).
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — el link del correo pasa de apuntar
    directo a `/tickets` a `/login?next=%2Ftickets`.
  - `frontend/src/pages/Login.jsx` — nuevo soporte para `?next=` (mismo
    patrón ya usado en `EmployeeLogin.jsx` para el portal de empleado): si
    ya hay una sesión vigente (token guardado), salta directo a `next` sin
    mostrar el formulario (`<Navigate>`, no `navigate()` durante el render,
    para no romper el ciclo de renderizado de React); si no hay sesión,
    muestra el login normal y, al entrar, navega a `next` en vez de siempre
    `/`. Sin `next` en la URL, el comportamiento no cambia (sigue yendo a
    `/` como siempre).
- **Verificación:** `node --check` en `tickets.js`; `npm run build` sin
  errores; `vite preview` + Playwright con 3 casos — sin sesión y
  `?next=/tickets` muestra el formulario de login (ya no 404); con un token
  ya guardado y la misma URL, salta directo a `/tickets` sin mostrar el
  formulario; `/login` sin `next` se comporta exactamente igual que antes.
- **Commit(s):** `cf60265`.

---

### 2026-07-22 — FIX: lider.erp/analista.erp no podían autoasignarse tickets ni eliminarlos, aunque el backend ya los autorizaba
- **Qué pasó:** el usuario reportó que lider.erp/analista.erp (usuarios
  "ERP-only": rol no-admin, con `canManagePlatformAccountsErp`, ver
  `isErpOnlyUser()` en `backend/src/routes/tickets.js`) no aparecían en la
  lista de "Asignar a" de un ticket ERP — ni siquiera ellos mismos, para
  autoasignarse — y en general sentía que sus permisos de Tickets no eran
  parejos con el resto, cuando debería ser indiferente quién sea el usuario.
- **La causa real:** `canManageTicket()`/`canViewTicket()` en `tickets.js`
  YA autorizan a un ERP-only a ver/gestionar sus propios tickets `erp` desde
  el 2026-07-17 — el bug no estaba ahí. Dos lugares del FRONTEND seguían
  revisando `role === 'admin'` a secas en vez de "¿puede de verdad gestionar
  Tickets?" (admin O ERP-only):
  1. `frontend/src/pages/TicketsLayout.jsx` pedía la lista para el selector
     de asignación a `GET /api/users` — una ruta protegida con `adminOnly`
     a secas (`backend/src/routes/users.js`). Como lider.erp/analista.erp
     no son `role: admin`, esa llamada regresaba 403 y el `.catch()` dejaba
     `users = []` — el `<select>` de "Asignar a" quedaba con solo la opción
     "Sin asignar", sin nadie que elegir (ni ellos mismos).
  2. El botón "Eliminar" del detalle de ticket usaba
     `canDelete={currentUser.role === 'admin'}` — aunque el backend
     (`DELETE /tickets/:id`) ya los dejaba eliminar un ticket `erp` que
     tuvieran asignado (mismo criterio de `canManageTicket()`), el botón ni
     siquiera se mostraba para un ERP-only.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — nueva ruta `GET /tickets/assignable-users`
    (dentro del mismo guard de router ya existente, admin o ERP-only): un
    ERP-only ve a los demás ERP-only (con quienes de verdad comparte los
    tickets `erp`); todo el resto ve a los admins de Sistemas — mismo
    criterio de partición que `canViewTicket()`, sin exponer el resto de la
    ficha de Usuarios (permisos, oficina) que no hace falta para este
    selector, a diferencia de reusar `GET /api/users` tal cual.
  - `frontend/src/pages/TicketsLayout.jsx` — el fetch de usuarios para el
    selector pasa de `GET /users` a `GET /tickets/assignable-users`;
    `canDelete` pasa a `currentUser.role === 'admin' || isErpOnlyUser(currentUser)`
    (reusando el helper ya exportado de `components/Layout.jsx`, sin
    duplicar el criterio).
  - Comentarios desactualizados corregidos en `tickets.js`
    (`canManageTicket`) y `TicketDetailModal.jsx` (`canManage`) que decían
    "Todos son admin" — ya no es cierto desde que existen los ERP-only.
- **Qué NO cambié:** `GET /api/users` se queda `adminOnly` tal cual (crear/
  editar/eliminar usuarios y ver la ficha completa de permisos de todos
  sigue siendo exclusivo de administradores) — el fix es un endpoint nuevo
  y acotado, no abrir el existente.
- **Verificación:** `node --check` en `tickets.js`; `npm run build` sin
  errores (189 módulos); revisé a mano el orden de las rutas para confirmar
  que `/assignable-users` queda antes de `/:id` (si no, Express la habría
  interpretado como un ticket con id "assignable-users").
- **Commit(s):** `57e59a6`.

---

### 2026-07-22 — Solicitar Cuenta: simplificado el formulario de acceso al ERP (feedback del líder de ERP)
- **Qué pasó:** el usuario compartió una captura del formulario público
  "Solicitar Cuenta" (sección "Acceso al ERP") anotada a mano por el líder de
  ERP, marcando qué quitar — contexto: ya no usan Gmail para estas cuentas,
  usan correo institucional con alias. Antes de tocar un formulario ya en
  producción se aclararon 3 puntos ambiguos de las anotaciones (con
  vistas previas de opciones): "Sistema / ERP" se confirmó que pasa de texto
  libre a un catálogo (selector); el checklist de "Módulos" se confirmó que
  se reduce a un solo campo de texto libre; y sobre "Usuario" el usuario
  aclaró en el chat que ese campo se quita por completo y se reemplaza por
  "¿A qué tienda deseas ingresar?" (texto libre, con ejemplos "Nexus,
  Alegra...").
- **Qué se quitó del formulario:** "Empresa(s) del grupo con acceso", el
  checklist de 10 módulos fijos (Ventas/Compras/Inventarios/CxC/CxP/
  Finanzas/Bancos/Nómina/Reportes), "Nivel de acceso" (los 4 radio buttons),
  y el campo de correo/usuario alias (ya no aplica — RH validado por el
  jefe directo fuera del sistema, no algo que deba capturar Sistemas).
- **Qué cambió:**
  - `frontend/src/pages/SolicitarCuenta.jsx` — "Sistema / ERP" pasa de
    `<input>` a `<select>` (SAP/Odoo/Aspel + catálogo que crece +
    "Otro / no está en la lista" revela texto libre, mismo patrón que el
    selector de impresoras de Reportar Ticket). Nuevos campos "¿A qué
    tienda deseas ingresar?" y "¿Qué módulo(s) necesitas?" (ambos texto
    libre). `EMPTY.erp` se simplifica a `{ system, store, moduleOther }`.
  - **Catálogo que crece solo** (mismo patrón ya usado en Solicitud de
    Recursos, `CustomResourceOption`): nuevo modelo
    `backend/src/models/CustomErpSystemOption.js`, nueva ruta pública
    `GET /account-requests/custom-erp-systems/public`, y en
    `PUT /account-requests/:id/approve` se agrega el sistema al catálogo si
    el admin marca el nuevo checkbox "Agregar '{sistema}' al catálogo de
    sistemas ERP" (visible solo para solicitudes ERP en
    `frontend/src/pages/AccountRequests.jsx`).
  - `backend/src/models/AccountRequest.js` — se quitan `erpGroupCompanies`/
    `erpModules`/`erpAccessLevel`; se agrega `erpStore`; `erpModuleOther` se
    conserva como el único campo de módulo.
  - `backend/src/routes/accountRequests.js` — `POST /public` guarda los 3
    campos nuevos en vez de los 5 anteriores.
  - `backend/src/utils/accountRequestPdf.js` — `drawErpSection()` se
    simplifica: Sistema/ERP + Tienda en una fila, Módulo(s) en la otra; se
    quita el bloque de dibujo a mano del checklist de módulos (ya no aplica).
  - `backend/src/routes/platformAccountsErp.js` — el prefill de la
    Responsiva (`GET /:id/request-defaults`) ya no intenta precargar
    empresas del grupo/módulos/nivel de acceso desde la solicitud (esos
    campos ya no se preguntan ahí) — esos campos de la Responsiva quedan en
    blanco, igual que cuando la solicitud original tampoco los traía.
- **Qué NO se tocó a propósito:** la Responsiva de ERP real (el documento
  legal que se firma al crear la cuenta, `PlatformAccountsErp.jsx`, con su
  propio checklist de Módulos y Nivel de acceso según el .docx oficial
  compartido el 2026-07-03) — el pedido era solo sobre el formulario de
  intake (Solicitud), no sobre el documento formal que Sistemas llena al dar
  de alta la cuenta.
- **Verificación:** `node --check` en los 4 archivos backend tocados;
  `npm run build` sin errores (189 módulos); `vite preview` + Playwright
  contra el formulario real — el selector de "Sistema / ERP" muestra
  SAP/Odoo/Aspel + "Otro / no está en la lista", elegir "Otro" revela el
  campo de texto libre correctamente, y los 2 campos nuevos ("¿A qué tienda
  deseas ingresar?"/"¿Qué módulo(s) necesitas?") se ven con sus placeholders
  esperados; sin errores de consola propios del formulario (el único aviso
  fue el fetch del catálogo cayendo a lista vacía por no haber backend real
  en el entorno de prueba, manejo ya esperado).
- **Commit(s):** `445f994`.

---

### 2026-07-22 — Reportar Ticket: las tarjetas de categoría aprovechan el ancho disponible sin verse gigantes
- **Qué pasó:** el usuario mandó una captura marcando con círculos rojos el
  espacio vacío enorme a la derecha de las tarjetas de "Tu equipo" (2
  categorías) y "Programas y sistemas" (3, con espacio de sobra después de
  ERP) — el ancho fijo de tarjeta (300px, del ajuste anterior) las mantenía
  chicas y ordenadas, pero desperdiciaba la mayoría del panel en monitor
  grande. Pidió "aprovechar el espacio de toda la pantalla".
- **El dilema real (documentado en el propio CSS):** no se puede "llenar
  toda la pantalla" y "que las tarjetas no se vean gigantes" al mismo
  tiempo si el panel mide ~1650px y una sección solo tiene 2-3 tarjetas —
  estirarlas sin tope reproduce el bug de "alargadas" ya corregido el
  2026-07-20; ponerles un tope fijo dejaba el hueco que se acaba de
  reportar. Antes de adivinar una 4ª vez, se le presentaron 3 estrategias
  reales con vista previa (estirar sin tope / columnas fijas con hueco
  visible / acotar el bloque a un ancho razonable) — eligió la 3ª, y aclaró
  que le importa que el layout se ajuste solo si el catálogo crece a
  futuro, sin tener que tocar CSS a mano.
- **Qué cambié** (`frontend/src/pages/ReportarTicket.jsx` y
  `.module.css`):
  - Nueva `.catStepWrap` (max-width 1200px, centrado) envolviendo los 3
    pasos que usan tarjetas (categoría, Computadoras/Celulares, apartado de
    app) — el resto del wizard (lista de problemas, formulario final) se
    queda a pantalla completa, sin cambios (decisión ya tomada antes, no se
    tocó).
  - `.catGrid` pasa de CSS Grid a **flexbox** (`flex-wrap: wrap`) y
    `.catCard` gana `flex: 1 1 230px; max-width: 440px` — las tarjetas
    crecen para llenar la fila dentro del bloque de 1200px, con un tope de
    440px cada una. Se probó primero mantener Grid con
    `minmax(230px, min(1fr, 440px))` (mezclar `fr` con un tope en px dentro
    de `min()`) — el navegador lo ignora por completo (tipos no
    compatibles), las tarjetas volvían a ocupar el 100% del bloque sin
    importar cuántas hubiera, reproduciendo el mismo bug para "Otro" (1 sola
    categoría, se habría estirado a los 1200px completos). Flexbox con
    `max-width` sí resuelve esto de forma nativa y sin trucos.
  - Se descarta a propósito envolver TODAS las categorías en un solo grid
    continuo (sin grids por sección) — ya se había pedido expresamente
    agruparlas por sección con su propio encabezado (2026-07-20, "siento que
    está todo revuelto"); mezclar tarjetas de distintas secciones en la
    misma fila visual reintroduciría exactamente ese problema.
  - Se ajusta solo si el catálogo crece: más categorías en una sección
    simplemente brincan a otra fila del mismo contenedor flex, sin tocar
    ningún número fijo en el CSS.
- **Verificación:** `npm run build` sin errores (189 módulos); prueba de
  layout aislada con Playwright reproduciendo el CSS real a 1920px — fila de
  2 (440px c/u, ~300px de margen dentro del bloque de 1200px, ya no del
  panel completo de 1650px), fila de 3 (llena el bloque completo, 384px
  c/u), fila de 1 ("Otro", tope de 440px en vez de estirarse a 1200px);
  repetido a 390px (celular) confirmando una sola columna por fila sin
  overflow horizontal (`scrollWidth === 390`), igual que antes.
- **Commit(s):** `6bbc3e0`.

---

### 2026-07-22 — Reportar Ticket: más espacio entre tarjetas y secciones — se sentía "todo junto"
- **Qué pasó:** tras alinear las tarjetas a la izquierda (ver entrada de
  abajo), el usuario confirmó que ya no se veían "al centro raro" pero pidió
  un ajuste moderado ("no tanto, pero sí siento que está todo junto") — con
  el `gap` de 1rem entre tarjetas y el respiro entre secciones sin tocar
  desde el rediseño de color, las tarjetas quedaban muy pegadas entre sí y
  contra el siguiente grupo.
- **Qué cambié** (`frontend/src/pages/ReportarTicket.module.css`, todo
  ajustes moderados de espaciado, sin tocar layout/color):
  - `.catGrid` — `gap` de 1rem a 1.5rem (más separación entre tarjetas de una
    misma fila).
  - `.catCard` — padding interno de `1.1rem 1.15rem 1.2rem` a
    `1.3rem 1.35rem 1.4rem` (la tarjeta respira más por dentro).
  - `.catIcon` — `margin-bottom` de 0.7rem a 0.9rem (más aire entre la
    burbuja del ícono y el título).
  - `.catSection`/`.catSectionTitle` — más espacio antes de cada grupo nuevo
    (`margin-top`/`padding-top` de 2.25rem/1.5rem a 2.75rem/1.85rem) y antes
    de sus tarjetas (`margin-bottom` del título de 0.85rem a 1.05rem).
- **Verificación:** `npm run build` sin errores (189 módulos).
- **Commit(s):** `87ad9d3`.

---

### 2026-07-22 — FIX: tarjetas de Reportar Ticket flotaban centradas sin orden; el color por sección no llegaba a la tarjeta
- **Qué pasó:** el usuario confirmó que el color le gustó ("está muy bonito")
  pero reportó, con una captura nueva, que el acomodo se veía "todo al
  centro raro" en vez de ordenado — cada sección (2, 3 o 2 tarjetas) quedaba
  flotando centrada dentro del panel ancho, con huecos vacíos iguales a los
  lados y, como cada sección tiene un número distinto de tarjetas, ninguna
  arrancaba en el mismo punto — nada se alineaba verticalmente entre
  secciones. Al revisar la captura también se confirmó un bug real del
  cambio anterior (2026-07-22, "color por sección"): el punto de color junto
  al título de cada sección sí variaba (azul/naranja/verde/ámbar), pero la
  franja superior y la burbuja del ícono de TODAS las tarjetas se veían del
  mismo naranja, sin importar la sección.
- **La causa (color):** `.catGrid` fijaba `--accent`/`--accent-soft` en
  naranja como "valor por default" — pero un custom property declarado en
  una clase CSS se aplica siempre a ese elemento, no solo cuando falta; como
  `.catGrid` es hijo directo del contenedor de sección (que sí trae el color
  correcto vía `style` inline), su propia declaración pisaba la heredada
  antes de que llegara a `.catCard`/`.catIcon` — el "respaldo" nunca era tal,
  ganaba siempre.
- **Qué cambié:** `frontend/src/pages/ReportarTicket.module.css` —
  `justify-content: center` → `start` en `.catGrid` (todas las secciones
  arrancan en el mismo borde izquierdo, sin importar cuántas tarjetas
  tengan); se quitó la redeclaración de `--accent`/`--accent-soft` de
  `.catGrid` y el respaldo se movió al punto de uso real
  (`var(--accent, var(--p-orange))` en `.catCard`/`.catIcon`) — ahí sí
  funciona como un verdadero fallback, sin pisar el valor heredado cuando
  existe.
- **Verificación:** `npm run build` sin errores (189 módulos).
- **Commit(s):** `e7a0e50`.

---

### 2026-07-22 — Reportar Ticket: tarjetas de categoría con color por sección (antes todas grises e idénticas)
- **Qué pasó:** el usuario compartió una captura de la pantalla "¿De qué tipo
  es el problema?" (modo oscuro) señalando que se veía "súper feo" — las 10
  tarjetas de categoría, agrupadas en 5 secciones desde el 2026-07-20, eran
  visualmente idénticas entre sí (mismo gris sobre negro, sin ninguna
  jerarquía de color), el emoji de cada ícono flotaba suelto sin contenedor
  (con tamaños dispares entre glifos y renderizado inconsistente en Windows),
  y los encabezados de sección ("TU EQUIPO", "PROGRAMAS Y SISTEMAS"...) eran
  monospace diminuto casi ilegible — preguntó cómo lograr que se viera
  estético y ordenado a la vez.
- **Qué cambié:**
  - `frontend/src/config/ticketCategories.js` — nuevo `SECTION_ACCENTS`: un
    color por cada una de las 5 secciones (Tu equipo=azul, Programas y
    sistemas=naranja, Conexión e impresión=verde, Cuentas y seguridad=ámbar,
    Otro=gris), reusando los mismos 5 tonos ya definidos en
    `portal-theme.css` (nada nuevo que mantener).
  - `frontend/src/pages/ReportarTicket.jsx` — el wrapper de cada sección fija
    `--accent`/`--accent-soft` (CSS vars) según su color; los pasos
    "Computadoras/Celulares" y "¿de qué apartado es?" (sin sección propia)
    usan el naranja de marca por default.
  - `frontend/src/pages/ReportarTicket.module.css` — `.catCard` gana una
    franja superior de 3px y una sombra/glow al pasar el mouse del color de
    su sección (antes solo se movía 2px, plano); `.catIcon` pasa de emoji
    suelto a una burbuja de tamaño fijo con fondo tintado del acento (empareja
    el tamaño visual entre glifos dispares); `.catSectionTitle` pasa de
    monospace diminuto a texto más grande y legible con un punto de color al
    lado; más espacio entre secciones.
- **Decisión técnica:** el fondo tintado de la burbuja del ícono usa el par
  `--accent-soft` fijado a mano (`--p-blue-soft`, `--p-orange-soft`, etc.),
  **no** `color-mix()` — ese helper ya causó un bug real documentado el
  2026-07-16 (tarjetas grises en navegadores sin soporte).
- **Verificación:** `npm run build` sin errores (189 módulos).
- **Commit(s):** `57d4b79`.

---

### 2026-07-22 — FIX: tarjetas de categoría de Reportar Ticket se veían "alargadas" en monitor grande
- **Qué pasó:** el usuario compartió una captura de `/reportar-ticket` en
  monitor ancho — las tarjetas de categoría se veían "súper alargadas y
  raras" en secciones con pocas tarjetas (ej. "Tu equipo": Hardware y
  Accesorios, ~780px de ancho cada una), mientras que la sección de 3
  tarjetas ("Programas y sistemas") se veía razonable (~490px) — pidió que
  se viera bien, "ni chica ni súper larga".
- **La causa:** cada sección del wizard pinta su PROPIO grid CSS
  independiente (`ReportarTicket.jsx`, un `.catGrid` por grupo de
  `categoriesBySection`) — y 4 de las 5 secciones tienen solo 1-2 categorías
  (`ticketCategories.js`: Tu equipo=2, Conexión e impresión=2, Cuentas y
  seguridad=2, Otro=1; solo Programas y sistemas tiene 3). Con
  `grid-template-columns: repeat(auto-fit, minmax(230px, 1fr))` (fix del
  2026-07-20 para el bug anterior de "todo a la izquierda"), sin ningún
  tope máximo, cada tarjeta se estira a `1fr` = casi todo el ancho del panel
  cuando el grid de esa sección solo tiene 1-2 columnas — el caso típico,
  no la excepción.
- **Qué cambié:** `frontend/src/pages/ReportarTicket.module.css` —
  `.catGrid` cambia a `minmax(230px, 300px)` (tope máximo real, ya no
  `1fr`) + `justify-content: center` — las tarjetas miden lo mismo sin
  importar cuántas haya en la sección, y una fila con espacio de sobra
  queda centrada en vez de pegada a la izquierda con un hueco vacío (evita
  reintroducir el bug de `auto-fill` de antes, y evita también flexbox —ya
  descartado en Mesa de Ayuda el mismo día por el mismo motivo: el ancho de
  columna se calcula por fila, no consistente entre secciones—). El mismo
  `.catGrid` se reutiliza en los pasos "device-split"
  (Computadoras/Celulares) y "app-subarea" (apartados de apps especiales),
  así que el fix aplica ahí también sin tocar más código.
- **Verificación:** `npm run build` sin errores; Playwright en 1920×1080
  (el tamaño real del reporte) y 1440×900 — confirmé que "Tu equipo" (2
  tarjetas) y "Programas y sistemas" (3 tarjetas) miden EXACTAMENTE lo
  mismo (300px c/u, antes 780px vs 490px) y que ambos bloques quedan
  centrados (hueco izquierdo = hueco derecho, sin diferencia) en las 5
  secciones; en celular (390×844) sigue una sola columna como antes, sin
  overflow horizontal ni errores de consola en ningún viewport.
- **Commit(s):** `0dd43f8`.

---

### 2026-07-22 — Solicitud de Ingreso: nombre siempre en mayúsculas + obligatorio elegir quién solicita
- **Qué pasó:** el usuario reportó 2 problemas de Solicitud de Ingreso
  (`/solicitar-ingreso`): (1) reclutamiento captura el nombre del nuevo
  ingreso con mayúsculas/minúsculas mezcladas, y debería quedar siempre en
  mayúsculas (como el resto de nombres de empleado en la app); (2) Nicolás
  (RH) escribe su propio nombre a mano en la sección "Tu nombre" (quién
  solicita) sin nunca elegir la sugerencia real del buscador que ya existía,
  así que el registro nunca queda ligado a un empleado real — pidió que no
  se deje avanzar sin seleccionar el nombre de la lista.
- **Qué cambié:**
  - **Mayúsculas:** `frontend/src/pages/SolicitarIngreso.jsx` — el campo
    "Nombre completo *" (nuevo ingreso) fuerza mayúsculas en vivo mientras
    se escribe. `backend/src/routes/onboardingRequests.js` — `POST /public`
    guarda `employeeName` con `.toUpperCase()`; **`PUT /:id/approve`
    también fuerza mayúsculas en el `name` que crea el `Employee` real**,
    sin importar qué se haya editado en el modal de aprobación — es el
    punto donde de verdad se crea el registro, la garantía tiene que
    quedar ahí, no solo en el guardado de la solicitud.
    `frontend/src/pages/OnboardingRequests.jsx` (modal "Aprobar") — el
    campo se precarga y se edita siempre en mayúsculas, normalizando
    también solicitudes pendientes de antes de este fix.
  - **Obligar a elegir "quién solicita":** el buscador de la sección 4 ya
    existía (autocompleta correo al elegir un empleado real), pero
    `handleSubmit` nunca revisaba si de verdad se había elegido algo de la
    lista — ahora bloquea el envío con un aviso si `matchedRequester` es
    `null` (mismo patrón ya usado en `SolicitarCuenta.jsx` para el
    solicitante de Cuentas, CHANGELOG 2026-07-07). Refuerzo del lado del
    servidor: `POST /public` ahora también valida `requestedByName` contra
    un `Employee` activo real (regex insensible a mayúsculas, mismo
    `escapeRegex` de `accountRequests.js`) y **sobrescribe**
    `requestedByName`/`requestedByEmail` con los datos reales del Employee
    encontrado — nunca con lo que mande el cliente — por si alguien llama
    la ruta directo sin pasar por el formulario.
- **Verificación:** `npm run build` (frontend) y `node --check` (backend)
  sin errores; Playwright contra el backend real conectado a Mongo —
  confirmé que "juan Carlos Perez lopez" se ve `JUAN CARLOS PEREZ LOPEZ` en
  vivo mientras se escribe y que así queda guardado en Mongo; escribí un
  nombre parcial real ("MIGUEL GAR") en "Tu nombre" SIN elegir la
  sugerencia y confirmé que el envío se bloquea con el aviso esperado y
  que no se dispara ningún `POST` real; al elegir la sugerencia sí procede,
  y el documento creado en Mongo quedó con `requestedByName`/
  `requestedByEmail` exactos del Employee real encontrado. Sin errores de
  consola. Dato de prueba borrado de Mongo al terminar.
- **Commit(s):** `3c77710`.

---

### 2026-07-22 — La tarjeta de bienvenida de Mesa de Ayuda crece más en monitor grande
- **Qué pasó:** el usuario confirmó, con una captura de su monitor a pantalla
  completa (~1920×1080), que el ajuste anterior (mismo día, ver entrada de
  abajo — centrado + 460px→520/580px) ya no se veía pegada a la izquierda,
  pero seguía sintiéndose chica: "sigue muy pequeño, ¿no?".
- **Qué cambié:** `frontend/src/pages/MesaDeAyuda.module.css` — `.loginCard`
  da un salto real en vez de uno tímido: 560px base, 680px desde 640px de
  ancho de viewport, **780px desde 1200px** (antes el techo era 580px fijo).
  A partir de 1200px también crecen un poco el texto/iconos internos del
  teaser (`.teaserGrid`/`.teaserItem`/`.teaserIcon`) y `.loginIntro`, para
  que no se sienta solo como más relleno vacío alrededor del mismo contenido
  chico.
- **Verificación:** `npm run build` sin errores; Playwright en 1920×1080
  (el tamaño real que reportó el usuario), 2560×1440, 1440×900 y 390×844 —
  confirmé 780px de ancho y centrado exacto en 1920×1080 (antes 580px, +34%
  perceptible a simple vista, no sutil), que no crece más allá de 780px en
  2560×1440 (no hay un tercer escalón, a propósito — no se pidió estirar
  a pantalla completa), y que celular sigue igual sin overflow. Nota
  encontrada durante la prueba (no es un bug, solo aritmética del
  breakpoint): cualquier laptop con viewport ≥1200px (1280/1366 con zoom/
  1440/1536, muy común) ya cae en el escalón de 780px, no en el intermedio
  de 680px — ese solo aplica en la franja angosta 640–1199px.
- **Commit(s):** `54be4e8`.

---

### 2026-07-21 — FIX: la tarjeta de bienvenida/login de Mesa de Ayuda se veía pegada a la izquierda y chica
- **Qué pasó:** el usuario reportó que al compartir el link de Mesa de Ayuda,
  el recuadro donde el empleado pone su correo/no. de empleado y contraseña
  se veía "a la izquierda y súper pequeño" en monitor/computadora/celular —
  "se ve rarísimo". Pidió centrarlo (sin usar toda la pantalla) y agrandarlo
  un poco.
- **La causa:** `frontend/src/pages/MesaDeAyuda.module.css` — `.loginCard`
  (la tarjeta de la pantalla de bienvenida sin sesión, `WelcomeScreen` en
  `MesaDeAyuda.jsx`) tenía `max-width: 460px` fijo pero le faltaba
  `margin: 0 auto` — al ser un hijo `block` normal dentro de `.page` (que sí
  ocupa el 100% del ancho), el navegador lo alineaba por default al borde
  izquierdo en vez de centrarlo. Su clase hermana en el mismo patrón,
  `.loginCardNarrow` (usada por `EmployeeLogin.jsx`, la página de login
  standalone equivalente), sí tenía `margin: 0 auto` desde siempre — era una
  duplicación de estilos entre 2 módulos CSS que se desincronizó, no un
  problema de diseño nuevo.
- **Qué cambié:** `.loginCard` gana `margin: 0 auto` (centrado horizontal) y
  crece de 460px a 520px de ancho máximo (580px desde tablet en adelante,
  vía `@media (min-width: 768px)`) — en celular sigue ocupando el ancho
  disponible igual que antes (`width: 100%`, sin desbordar), no se estira a
  pantalla completa (pedido explícito: "no digo que uses toda la pantalla").
- **Verificación:** `npm run build` sin errores; Playwright en 4 tamaños de
  pantalla (1920×1080, 1440×900, 768×1024, 390×844) — confirmé centrado
  exacto (gap izquierdo = gap derecho, 0px de diferencia) en los 4, ancho de
  580px en monitor/laptop/tablet y 326px en celular (ancho disponible menos
  el padding de la página), y sin overflow horizontal en ninguno; capturas
  revisadas visualmente sin recortes ni rotación.
- **Commit(s):** `bfb6be2`.

---

### 2026-07-21 — Se quita el "Link para compartir" de las bandejas de revisión (ya vive en Mesa de Ayuda)
- **Qué pasó:** aclaración del pedido anterior (ver entrada "Revertido" más
  abajo) — lo que el usuario quería quitar era específicamente el recuadro
  "🔗 Link para compartir: [url] [Copiar]" que aparece arriba de la tabla en
  algunas bandejas de revisión (agregado el 2026-07-08 como atajo para no
  tener que buscar/memorizar el link cada vez que alguien lo pedía), no el
  link de navegación del menú a la página en sí. Confirmó con una captura de
  "Solicitudes de Recursos" señalando exactamente ese recuadro.
- **Qué cambié:** se quitó `<PublicLinkBanner path="..." />` (y su import) de
  las 3 páginas donde vivía — `frontend/src/pages/AccountRequests.jsx`
  (`/solicitar-cuenta`), `frontend/src/pages/OnboardingRequests.jsx`
  (`/solicitar-ingreso`) y `frontend/src/pages/ResourceRequests.jsx`
  (`/solicitar-recurso`). Como ya no lo usaba nadie, se borró por completo el
  componente (`frontend/src/components/PublicLinkBanner.jsx` y su
  `.module.css`) en vez de dejarlo muerto. Solicitudes ERP, Bajas RH y
  Envíos nunca tuvieron este banner — no se tocaron.
- **Por qué:** esos 3 formularios públicos (Solicitar Cuenta/Ingreso/
  Recurso) ya viven dentro del wizard de Mesa de Ayuda — el link suelto para
  compartir ya no hace falta ahí.
- **Verificación:** `npm run build` sin errores (189 módulos, antes 191);
  Playwright — confirmé que el recuadro ya no aparece en las 3 páginas, que
  el resto del layout (título, tabs, tabla) se ve igual sin ningún hueco
  vacío, y que Bajas RH/Envíos siguen funcionando sin cambios; sin errores
  de consola ni referencias rotas al componente borrado.
- **Commit(s):** `9c27e94`.

---

### 2026-07-21 — Reporte de Asignaciones activas: incluye activos sin asignar + número de contrato
- **Qué pasó:** el usuario pidió que el reporte de "Asignaciones activas"
  también muestre los activos que NO están asignados (disponibles en
  inventario), y que aparezca el campo de número de contrato en ese
  reporte.
- **Qué cambié:** `frontend/src/pages/Assignments.jsx`
  - Se agrega un fetch a `GET /assets?status=disponible` (mismo filtro que
    ya usa Disponibilidad/Stock.jsx) y se combina con las asignaciones
    activas en una sola lista — cada activo sin asignar se convierte en
    una fila `{ asset, employee: null, ... }` para reutilizar tal cual la
    tabla, los filtros y la exportación ya existentes, sin duplicar
    lógica. La columna "Nombre" muestra "Sin asignar" (en cursiva/gris) en
    vez de dejarlo en blanco, tanto en pantalla como en el Excel.
  - El campo `'No. Contrato'` del Excel (ya existía solo para las
    categorías Cómputo/Celulares/Tablets) se movió a la fila base, así
    sale también al exportar "Todo el inventario" (la vista por default),
    que antes lo perdía.
  - El encabezado cambió de "X asignaciones totales" a "X asignados · Y
    sin asignar" para que el conteo mixto no confunda.
- **Verificación:** `npm run build`; Playwright — confirmé el encabezado,
  que la tabla y el Excel exportado incluyen los activos sin asignar
  (con "Sin asignar" en Nombre y el resto de columnas de empleado en
  blanco) junto con las asignaciones reales sin alterarlas, y que "No.
  Contrato" sale en el Excel de "Todo el inventario".
- **Commit(s):** `4faa402`.

---

### 2026-07-21 — Revertido: quitar links de "solicitudes" del menú admin (malentendido)
- **Qué pasó:** el usuario pidió "quitar los links de las solicitudes a
  excepción de los envíos, ya que todo ya está en la mesa de ayuda" — se
  interpretó (mal) como quitar del menú/barra de navegación admin los
  links a las bandejas de revisión (Solicitudes de Cuentas, Solicitudes
  ERP, Ingresos RH, Bajas RH, Solicitudes de Recursos), agregando además
  "Bajas RH" a "Pendientes de revisión" del Dashboard para que no quedara
  sin ningún acceso. El usuario aclaró que el pedido real era otro: quitar
  el **link para compartir** (el recuadro con el link público + botón
  Copiar que aparece en esas mismas páginas, ver entrada del 2026-07-08
  "Recordatorio del link público en cada bandeja de revisión"), no el link
  de navegación a la página en sí — las bandejas de revisión siguen siendo
  necesarias para que Sistemas/RH procesen lo que ya llega desde Mesa de
  Ayuda.
- **Qué se revirtió:** `git revert` de los 2 commits que quitaban los links
  de `frontend/src/components/Layout.jsx` (`accountPages`/`operacionItems`
  vuelven a tener Solicitudes de Cuentas/ERP, Ingresos RH, Bajas RH y
  Solicitudes de Recursos) y agregaban la tarjeta "Bajas RH" a
  `frontend/src/pages/Dashboard.jsx` (se quita esa tarjeta, ya no hacía
  falta).
- **Commit(s):** `97e20f7`, `fec720f`.

---

### 2026-07-21 — FIX: lider.erp/analista.erp no veían botones de categoría en la barra superior
- **Qué pasó:** el usuario reportó que al entrar como Lider.erp o Analista
  (usuarios "ERP-only": sin rol admin, sin Gmail ni Plataformas generales,
  solo con el permiso de Plataformas ERP) sí veían los cambios recientes de
  navegación, pero en la barra superior solo aparecía el botón "Menú" — sin
  ningún botón de categoría, a diferencia de un usuario normal que ve varios
  (Catálogos y Activos, Cuentas y Plataformas, Operación, Tickets,
  Indicadores) repartidos en la propia barra.
- **La causa:** `frontend/src/components/Layout.jsx` — el bloque `<nav>` que
  pinta los botones de categoría en la barra estaba envuelto en un gate
  `{!erpOnly && (...)}` que se saltaba el render COMPLETO para un usuario
  ERP-only, sin importar qué hubiera calculado `CATEGORIES` — el botón
  "Menú" sí ya mostraba correctamente sus 4 páginas reales (`erpOnlyPages`:
  Cuentas Plataformas ERP, Solicitudes ERP, Responsivas, Tickets ERP) como
  tarjetas dentro del panel, pero nunca como botones directos en la barra.
- **Qué cambié:** se agregó la rama hermana `{erpOnly ? (...) : (...)}` — un
  usuario ERP-only ahora ve sus 4 páginas (`erpOnlyPages`) como botones
  directos en la barra (navegan de un clic, sin pasar por "Menú"), mismo
  patrón ya usado para Tickets/Indicadores en el resto de usuarios. El botón
  "Menú" se queda igual (sigue mostrando las mismas 4 tarjetas), y la barra
  para el resto de usuarios (admin, Gmail-only, Plataformas-only) no se
  tocó.
- **Verificación:** `npm run build` sin errores; Playwright con sesión
  ERP-only simulada — confirmé los 4 botones ("Cuentas Plataformas ERP",
  "Solicitudes ERP", "Responsivas", "Tickets ERP") en la barra, que
  "Responsivas" navega directo a `/responsivas`, y que "Menú" sigue
  funcionando igual; repetí con sesión de admin normal y confirmé que sus
  botones de categoría siguen apareciendo sin cambios, sin errores de
  consola en ningún caso.
- **Commit(s):** `1443efa`.

---

### 2026-07-21 — FIX: el buscador de empleado en Cuentas (Gmail/Plataformas/ERP) dejaba de aceptar texto
- **Qué pasó:** el usuario reportó que en "Crear cuentas", en Empleados y en
  "todo lo que tenga un buscador del nombre del empleado" no lo dejaba
  escribir el nombre completo — escribía un pedazo, aparecían opciones, y ya
  no aceptaba más teclas. Investigué línea por línea los ~10 buscadores de
  empleado por nombre que ya existen en el repo (Solicitar Cuenta/Recurso/
  Ingreso, Confirmar Envío, Assets/Accessories/Stock, etc.) sin encontrar
  ningún bug de foco/estado en ninguno — todos usan el patrón correcto (input
  controlado + dropdown de botones). El campo real con el problema estaba en
  otro lado: el modal "Nueva cuenta" de Cuentas Gmail/Plataformas/ERP y el
  modal de "Asignar a otro empleado" (reasignar cuenta) en la ficha de
  empleado usaban un `<select>` HTML nativo con un `<option>` por cada
  empleado activo de toda la empresa — al hacer foco y escribir, el
  navegador usa su propio "type-ahead" (salta a la primera opción que
  empieza con el texto acumulado, buffer que se reinicia solo tras ~1s de
  pausa); con varios empleados compartiendo las mismas letras iniciales,
  esto se siente exactamente como "escribo un pedazo, aparecen opciones,
  pero ya no me deja escribir más" — no era un bug de React, era la
  limitación nativa de un `<select>` usado como buscador de una lista larga.
- **Qué cambié:** los 4 `<select>` de empleado (uno por archivo) se
  reemplazaron por el mismo patrón de búsqueda real (input de texto
  controlado + dropdown de botones con avatar/nombre/número, más una
  tarjeta de "seleccionado" con botón "Cambiar") que ya usa `Assets.jsx`
  para asignar un activo — sin inventar un componente nuevo, solo
  replicando el que ya estaba probado:
  - `frontend/src/pages/GmailAccounts.jsx` — modal "Nueva cuenta Gmail"
    (se conserva `handleEmployeeChange` para la autosugerencia de correo,
    ahora disparada al elegir del dropdown en vez de un `onChange` de
    `<select>`).
  - `frontend/src/pages/PlatformAccounts.jsx` — modal "Nueva cuenta de
    plataforma".
  - `frontend/src/pages/PlatformAccountsErp.jsx` — modal "Nueva cuenta ERP"
    (el `useEffect` que busca "¿ya existe con Gmail?" sigue funcionando
    igual, ya que reacciona a `form.employeeId` sin importar si cambia
    desde un `<select>` o desde el nuevo dropdown).
  - `frontend/src/pages/EmployeeDetail.jsx` — modal "Asignar a otro
    empleado" al desasignar una cuenta de plataforma (reusa las clases ya
    existentes de `Assets.module.css`, importado ahí como `assetStyles`,
    sin duplicar CSS).
  - `GmailAccounts.module.css`, `PlatformAccounts.module.css`,
    `PlatformAccountsErp.module.css` — se agregaron las clases del
    dropdown/tarjeta de seleccionado (`.empSearchWrap/.empDropdown/
    .empOption/.assignSelected/...`) copiadas de `Assets.module.css`, con
    su bloque de modo oscuro correspondiente.
- **Qué NO se tocó:** el `<select>` por fila dentro de la tabla de
  importación de Excel de Cuentas ERP (`PlatformAccountsErp.jsx`, columna
  "Empleado — corrobora o cambia") — mismo patrón nativo, pero ahí vive
  dentro de un contenedor con `overflow: auto` (la tabla scrolleable), y un
  dropdown absoluto se recortaría al hacer scroll; además ese campo normal-
  mente ya viene pre-emparejado por el importador, solo se usa para
  corregir casos puntuales. Se deja documentado como pendiente de menor
  prioridad si se reporta el mismo problema ahí.
- **Verificación:** `npm run build` sin errores; Playwright con datos
  mockeados (20 empleados, varios con nombres que comparten letras
  iniciales para forzar el escenario reportado) — escribí un nombre
  completo letra por letra en los 4 campos corregidos y confirmé que el
  input termina con el texto exacto sin cortarse, que el dropdown filtra
  correctamente en cada tecla, que seleccionar una sugerencia muestra la
  tarjeta de "seleccionado" y "Cambiar" regresa al buscador; sin errores de
  consola en ninguna de las 4 páginas.
- **Commit(s):** `18a2bdb`.

---

### 2026-07-21 — Tickets: sidebar desplegable de verdad, solo lectura para chats/tickets ajenos, Escalamiento
- **Qué pasó:** el usuario dio 4 observaciones sobre el trabajo reciente de
  Tickets: (1) presionar "Tickets"/"Chats" en el sidebar debía ESCONDER los
  sub-botones si ya estaban abiertos, no solo mostrarlos una vez; (2) un
  chat o ticket que no es mío (asignado a otra persona) debe ser de solo
  lectura, no se me debe dejar responder; (3) "Aplicaciones Internas" no
  debía ser otra categoría en el nav de arriba, debía vivir dentro del
  propio sidebar desplegable de Tickets; (4) nueva categoría "Escalamiento"
  para tickets que se salen del alcance del área y necesitan escalarse.
- **Qué cambié:**
  - `frontend/src/pages/TicketsLayout.jsx` — nuevo estado `openSection`:
    al presionar el link de "Tickets"/"Chats" mientras ya estás en esa
    sección, el clic ya no navega (se previene con `preventDefault`), solo
    alterna mostrar/esconder sus sub-botones. Se agregaron los nav items
    "Escalamiento" y "Aplicaciones Internas".
  - `frontend/src/pages/TicketsChats.jsx` — nuevo `canManageSelected`
    (mismo criterio que `canManage` del modal: Gerente de Sistemas, sin
    asignar, o asignado a mí). Si un chat NO es mío, se esconde la caja de
    responder y se muestra un aviso de solo lectura en su lugar.
  - `backend/src/models/Ticket.js` — nuevos campos `escalated`,
    `escalationReason`, `escalatedByName`, `escalatedAt`.
  - `backend/src/routes/tickets.js` — nuevo `PUT /:id/escalate`, mismo
    permiso (`canManageTicket`) que el resto de acciones sobre un ticket.
  - `frontend/src/pages/TicketDetailModal.jsx` — nueva sección
    "🚀 Escalamiento" (motivo + botón "Marcar como escalado"/"Quitar
    escalamiento").
  - `frontend/src/pages/TicketsEscalamiento.jsx` (NUEVO, ruta
    `/tickets/escalamiento`) — feed de tickets escalados con su motivo,
    quién lo escaló y cuándo.
  - `frontend/src/App.jsx` — ruta `/tickets/aplicaciones` (reutiliza
    `InternalApps.jsx`, se le quita la ruta suelta `/internal-apps`, sigue
    protegida por `AdminRoute` aparte de `TicketsRoute` — mismo permiso que
    tenía antes, no se abre a ERP-only) y `/tickets/escalamiento`.
  - `frontend/src/components/Layout.jsx` — "Tickets" deja de ser una
    categoría con dropdown de un solo tile; ahora es un link directo en el
    nav de arriba (mismo patrón que "Indicadores"), y "Aplicaciones
    Internas" ya no aparece ahí ni en el "Menú" agregado.
- **Verificación:** `npm run build`; `node --check` en el modelo y rutas
  de tickets tocados; Playwright — confirmé el toggle esconde/muestra al
  presionar de nuevo (3 clics: abre/cierra/abre) en Tickets y Chats, que un
  chat asignado a otra persona se ve de solo lectura sin caja de responder,
  que Escalamiento lista lo marcado y el modal deja marcar/quitar el
  escalamiento, que Aplicaciones Internas vive y funciona dentro del
  sidebar de Tickets, y que el nav de arriba ya no tiene el dropdown de
  Tickets ni la entrada suelta de Aplicaciones Internas.
- **Commit(s):** `f80d52a`.

---

### 2026-07-21 — Corrección: el toggle "Todos/Mis..." va en la barra lateral, no en la página
- **Qué pasó:** el usuario aclaró que el toggle "Todos / Mis Tickets" y
  "Todos / Mis Chats" (agregado en la entrada anterior) no debía vivir
  como botones dentro del contenido de la página — quería que al presionar
  "Tickets" o "Chats" en la MISMA barra lateral se desplegaran ahí mismo,
  debajo del link, como botones.
- **Qué cambió:**
  - `frontend/src/pages/TicketsLayout.jsx` — `NAV_ITEMS` ahora acepta un
    `scopeOptions` opcional (Tickets → Todos/Mis Tickets, Chats → Todos/Mis
    Chats). Cuando la sección está activa (la ruta actual coincide), se
    despliegan sus dos botones justo debajo del link en el propio `<nav>`
    del sidebar, apuntando a la misma ruta con `?scope=todos`/`?scope=mios`
    en el query string.
  - `frontend/src/pages/TicketsLayout.module.css` — nuevas clases
    `.navSubRow`/`.navSubBtn`/`.navSubBtnActive` para esos botones
    indentados debajo del link activo.
  - `frontend/src/pages/TicketsBoard.jsx` y `TicketsChats.jsx` — se quitó
    el toggle que vivía dentro de la página (y su estado local `scope`);
    ahora ambos solo leen `useSearchParams().get('scope')`, con el sidebar
    como única fuente de verdad de qué scope está activo.
- **Verificación:** `npm run build`; Playwright — confirmé que los
  sub-botones aparecen SOLO dentro del `<aside>` (nunca en el contenido de
  la página), que se despliegan al entrar a Tickets/Chats y desaparecen en
  Dashboard/otras páginas, que solo una sección los muestra a la vez, y que
  elegir "Mis Tickets"/"Mis Chats" sí filtra el tablero/las conversaciones
  correctamente sin dejar ningún toggle viejo en el cuerpo de la página.
- **Commit(s):** `fde696b`.

---

### 2026-07-21 — Tickets: historial de cerrados, SLA, Calificaciones y Chats estilo Messenger
- **Qué pasó:** el usuario pidió un lote grande de mejoras sobre el módulo
  de Tickets: que el Buscador funcione como historial de tickets cerrados,
  que Notas internas tenga su propio buscador, que Chats y Tickets tengan
  un toggle "Todos / Mis [Chats|Tickets]" (como antes), una categoría nueva
  de SLA (niveles, prioridades, criticidad, cumplimiento) con exportar a
  Excel por si lo pide auditoría, una categoría de Calificaciones (CSAT)
  también exportable a Excel por si lo pide el director de Finanzas, y que
  Chats se sienta como Messenger. Se resolvieron 3 preguntas antes de
  programar: (1) la página "Mis Tickets" se retira del sidebar — se
  consolida como el toggle dentro de Tickets, igual que en Chats; (2)
  "criticidad" en SLA = si el ticket impide trabajar (`blocksWork`) sí/no;
  (3) el rediseño de Chats es panel doble completo (lista + conversación
  con respuesta ahí mismo), no solo un cambio de estilo.
- **Qué cambié:**
  - `frontend/src/pages/TicketsBuscar.jsx` — ahora es un historial: por
    default muestra TODOS los tickets `cerrado` (antes solo aparecía algo
    si se escribía una búsqueda); el buscador acota ese historial en vez
    de buscar en todo el tablero.
  - `frontend/src/pages/TicketsNotasInternas.jsx` — nuevo campo de
    búsqueda arriba del feed, filtra por folio/asunto/quién reportó.
  - `frontend/src/pages/TicketsBoard.jsx` — nuevo toggle "🎫 Todos / 👤 Mis
    Tickets" (mismo componente visual `.viewToggle` que ya existía para
    Tablero/Zabbix). Se eliminó `frontend/src/pages/TicketsMisTickets.jsx`
    y su ruta `/tickets/mios` — esa vista ahora vive dentro de Tickets.
  - `frontend/src/pages/TicketsSLA.jsx` (NUEVO, ruta `/tickets/sla`) —
    desglose por Nivel de Servicio, Prioridad y Criticidad (impide
    trabajar sí/no), tabla de cumplimiento de tiempos (fecha límite vs.
    fecha real de resolución: Cumplido/Incumplido/Vencido/En tiempo) y
    botón "Exportar Excel" (librería `xlsx`, ya usada en otras partes del
    sistema) para auditoría.
  - `frontend/src/pages/TicketsCalificaciones.jsx` (NUEVO, ruta
    `/tickets/calificaciones`) — encuesta de satisfacción (CSAT) que ya
    respondía el empleado en el portal (`MisTickets.jsx`, sin cambios ahí),
    aquí de solo lectura: promedio, distribución de respuestas y tabla,
    también exportable a Excel.
  - `frontend/src/pages/TicketsChats.jsx` — rediseño completo a panel
    doble estilo Messenger: lista de conversaciones a la izquierda +
    conversación abierta a la derecha con burbujas y su propia caja para
    responder (`POST /:id/reply`, mismo endpoint que ya usaba el modal),
    sin tener que abrir/cerrar nada. Un botón "Ver ticket completo" abre el
    modal de siempre para asignar/resolver/notas internas. Nuevo toggle
    "💬 Todos / 👤 Mis Chats".
  - `frontend/src/pages/ticketShared.js` — nuevo `CSAT_OPTIONS` (mismo
    catálogo que ya usaba el portal del empleado, con emoji/score/color
    agregados para Calificaciones).
  - `frontend/src/pages/TicketsLayout.jsx` — sidebar actualizado: se quita
    "Mis Tickets", se agregan "SLA" y "Calificaciones".
  - `frontend/src/pages/Tickets.module.css` — nuevas clases para el panel
    doble de Chats (`.messengerWrap/.messengerList/.messengerThread/...`),
    reemplazando las viejas `.chatList/.chatItem` (ya no se usaban).
  - `frontend/src/App.jsx` — rutas `sla`/`calificaciones` agregadas,
    `mios` retirada.
- **Verificación:** `npm run build`; Playwright con ~16 tickets simulados
  cubriendo cada combinación (cerrados, con SLA clasificado, calificados,
  con notas internas, con mensajes) — confirmé los 8 puntos: toggle
  Todos/Mis Tickets filtra exacto, Buscador solo muestra cerrados, Notas
  internas filtra por búsqueda, SLA muestra los 3 desgloses correctos y
  exporta un .xlsx real, Calificaciones muestra el promedio/distribución
  correctos y también exporta, Chats funciona como panel doble (cambia de
  conversación, responde en vivo, filtra Mis Chats, abre el modal
  completo), sin errores de consola en ninguna página.
- **Commit(s):** `d993321`.

---

### 2026-07-21 — Tickets: se restaura el espaciado entre encabezado, filtros y contenido
- **Qué pasó:** el usuario reportó (con captura del Tablero) que todo se
  veía "amontonado" — el título pegado a los filtros de tipo, y estos
  pegados a las columnas del kanban, sin ningún respiro. Pidió orden
  visual: "estructura, forma, estabilidad".
- **Qué cambió:** al partir la página monolítica de Tickets en 7
  sub-páginas (ver entrada de arriba), ninguna de las 7 conservó la clase
  `.page` (`display:flex; flex-direction:column; gap:1.25rem`) que en el
  archivo original envolvía todo el contenido y era la única fuente del
  espaciado vertical entre encabezado/filtros/contenido — se perdió por
  completo al mover el JSX. Se agregó `className={styles.page}` al `<div>`
  raíz de `TicketsDashboard.jsx`, `TicketsBoard.jsx`, `TicketsMonitoreo.jsx`,
  `TicketsChats.jsx`, `TicketsMisTickets.jsx`, `TicketsNotasInternas.jsx` y
  `TicketsBuscar.jsx`.
- **Verificación:** `npm run build`; Playwright — medí el espacio real
  entre encabezado→filtros y filtros→contenido en las 5 páginas
  principales: 20px en todos los casos (antes 0px), confirmé visualmente
  que las 5 se ven ordenadas y sin nada encimado.
- **Commit(s):** `7d62d53`.

---

### 2026-07-21 — Ajustes de la mini-app de Tickets: sidebar corto y links redundantes
- **Qué pasó:** el usuario reportó, con capturas de pantalla de Dashboard/
  Monitoreo/Chats, que la barra lateral nueva del módulo de Tickets se veía
  "cortita" — solo del alto de sus propios links — dejando un hueco gris
  enorme al lado cuando el contenido de la derecha era más largo (la tabla
  de Monitoreo, el Dashboard con varios paneles). También pidió quitar el
  banner "Link para compartir" de Dashboard y Tablero: ya no hace falta
  porque ese link vive en Mesa de Ayuda.
- **Qué cambié:**
  - `frontend/src/pages/TicketsLayout.module.css` — se quitó
    `align-items: flex-start` de `.wrapper` (vuelve al `stretch` por
    default de flexbox), así el `<aside>` del sidebar siempre iguala el
    alto real del contenido de cada sub-página, aunque sus links no lo
    llenen — `position: sticky` se queda igual, solo que ahora se despega
    justo cuando termina el contenido, no antes.
  - `frontend/src/pages/TicketsDashboard.jsx` y `TicketsBoard.jsx` — se
    quitó `<PublicLinkBanner path="/reportar-ticket" />` y su import (las
    demás sub-páginas del módulo nunca lo tuvieron).
- **Verificación:** `npm run build`; Playwright — medí el alto real del
  `<aside>` contra su `<main>` hermano en `/tickets` y `/tickets/monitoreo`
  (antes muy distintos, ahora 0px de diferencia en ambos), confirmé que
  "Link para compartir" ya no aparece en Dashboard ni Tablero, y que
  Chats/Mis Tickets siguen renderizando bien (sin tocar).
- **Commit(s):** `3062f28`.

---

### 2026-07-21 — Tickets pasa de página única a mini-app con su propio sidebar
- **Qué cambió:** la página monolítica `pages/Tickets.jsx` (1126 líneas) se reemplaza por `pages/TicketsLayout.jsx` (shell con sidebar propio y datos compartidos vía `<Outlet context>`) más 7 páginas hijas: `TicketsDashboard` (índice, `/tickets`), `TicketsBoard` (`/tickets/general`), `TicketsMonitoreo` (`/tickets/monitoreo`), `TicketsChats` (`/tickets/chats`), `TicketsMisTickets` (`/tickets/mios`), `TicketsNotasInternas` (`/tickets/notas`) y `TicketsBuscar` (`/tickets/buscar`). En `App.jsx` la ruta `tickets` (protegida por `TicketsRoute`, sin cambios en su lógica de permisos) pasa de una sola `<Route>` a una ruta padre con las 7 rutas hijas anidadas. `components/Layout.jsx` ajusta `TileGrid` para que el tile de Tickets siga marcado como activo en cualquier sub-ruta (`/tickets/*`), no solo en el índice.
- **Por qué:** la página de Tickets había crecido demasiado (tablero, monitoreo, chats, mis tickets, notas internas y buscador todo junto); separarla en sub-páginas con su propio sidebar la hace más manejable y más fácil de extender.
- **Commit(s):** `bf28b33`.

---

### 2026-07-20 — Dashboard individual de tickets: "asignados a mí" en Tickets e Indicadores
- **Qué pasó:** el usuario pidió que cada usuario de Sistemas tenga un
  dashboard individual, además del que ya existe, donde vea los tickets
  asignados a su propio nombre. Antes de programar investigué qué ya
  existía: el backend YA soportaba filtrar `GET /tickets` por `assignedTo`
  (`routes/tickets.js`), pero el frontend nunca lo usaba — ni Tickets.jsx ni
  Indicadores.jsx tenían nada desglosado por persona asignada.
- **Qué cambié:**
  - `frontend/src/pages/Tickets.jsx` — nuevo botón "👤 Asignados a mí" junto
    a los filtros de tipo, que reutiliza el parámetro `assignedTo` que ya
    aceptaba el backend. Al activarlo, tanto los KPIs de arriba (abiertos,
    vencidos, urgentes, etc.) como el tablero de columnas se recalculan
    solo sobre mis tickets — desactivado, se comporta exactamente igual que
    antes (nada cambia para quien no lo use).
  - `frontend/src/pages/Indicadores.jsx` — nueva tarjeta "Mis tickets
    asignados", justo arriba del resumen de equipo que ya existía: total
    asignado a mí, vencidos, los que le impiden trabajar a alguien,
    prioridad alta, y una lista de mis tickets con folio/asunto/tiempo —
    mismo dato ya cargado para el resumen de equipo (`opsRaw`), solo
    filtrado por `assignedTo._id === user.id`, sin pedir nada extra al
    servidor.
- **Por qué:** para que cada persona de Sistemas vea de un vistazo lo que
  tiene que atender, sin tener que buscarlo dentro del tablero completo del
  equipo.
- **Verificación:** `npm run build`; Playwright con 3 tickets mockeados (2
  asignados al usuario de prueba, 1 a otro admin) — confirmé que la
  tarjeta de Indicadores muestra exactamente 2 asignados/1 vencido/1
  bloqueante/1 alta prioridad con la lista correcta, y que el botón de
  Tickets.jsx recalcula los KPIs y el tablero a solo esos 2 al activarse
  (de 3 tickets totales a 2, de 2 abiertos a 1, etc.); sin cambios de
  backend, no hizo falta `node --check`.
- **Commit(s):** `a4a6d3e`

---

### 2026-07-21 — Tickets ahora es su propia categoría de navegación (con Aplicaciones Internas)
- **Qué pasó:** el usuario preguntó si no convendría que el sistema de
  tickets fuera su propia categoría en el menú, en vez de vivir escondido
  dentro de "Operación" mezclado con Envíos/Ingresos RH/Bajas RH/Auditoría/
  Planos de Red. Le di mi recomendación (sí, y de paso mover Aplicaciones
  Internas ahí también, porque es el catálogo que usa el propio wizard de
  Reportar Ticket para clasificar por app) con el tradeoff de no meter
  Ingresos/Bajas RH ni Solicitudes de Recursos ahí (no son tickets, son
  otro tipo de flujo) — confirmó que estaba bien así.
- **Qué cambié:** `frontend/src/components/Layout.jsx` — nueva categoría de
  nivel superior "Tickets" (acento teal `#0d9488`, junto a Catálogos/
  Cuentas/Operación en la barra superior), con 2 tarjetas: Tickets (tablero
  + Zabbix de equipos) y Aplicaciones Internas (catálogo de sistemas).
  Ambas se sacaron de `operacionItems`, que se queda con Envíos, Ingresos
  RH, Bajas RH, Solicitudes de Recursos, Auditoría y Planos de Red.
- **Por qué:** el sistema de tickets ya creció bastante esta sesión (SLA,
  categorías por apartado, dashboard individual, Zabbix) como para tener su
  propio espacio en la navegación, en vez de compartir categoría con cosas
  que no tienen relación.
- **Verificación:** `npm run build`; Playwright — confirmé que "Tickets"
  aparece como botón propio en la barra superior, que su panel muestra las
  2 tarjetas correctas, y que "Operación" ya NO tiene Tickets ni
  Aplicaciones Internas (sigue con Envíos/Ingresos RH intactos); reconfirmé
  el dashboard individual de tickets (Indicadores + filtro "Asignados a
  mí") sin nada roto. Sin cambios de backend.
- **Commit(s):** (pendiente)

---

### 2026-07-20 — Nuevo ícono de la Mesa de Ayuda (solo el portal, no el panel admin)
- **Qué pasó:** el usuario compartió una imagen (audífonos + flecha naranja de
  la marca) y pidió cambiar el ícono de la Mesa de Ayuda por ese, aclarando
  "solo en la mesa de ayuda" — es decir, sin tocar el panel admin (que usa su
  propio logo "📦 Assets Manager", en `components/Layout.jsx`) ni el
  favicon/íconos de PWA.
- **Qué cambié:**
  - `frontend/public/icons/mesa-ayuda-logo.png` (nuevo) — la imagen tal cual
    la compartió.
  - `frontend/src/components/PortalLayout.jsx` — el `.logoMark` de la barra
    lateral del portal (único lugar donde vivía el ícono anterior, una
    flecha en un cuadro naranja) ahora muestra esta imagen en vez del SVG.
  - `frontend/src/components/PortalLayout.module.css` — `.logoMark` ya no
    pinta su propio fondo naranja (la imagen ya trae su fondo y esquinas
    redondeadas); solo recorta a 30×30px con `border-radius`.
- **Por qué:** identidad visual propia para la Mesa de Ayuda, sin afectar el
  panel de administración de Sistemas.
- **Verificación:** `npm run build`; confirmé que `/icons/mesa-ayuda-logo.png`
  responde 200; Playwright — capturé la barra lateral de Mesa de Ayuda y
  confirmé visualmente el ícono nuevo; `grep` confirmó que la imagen solo se
  referencia desde `PortalLayout.jsx` (nada en el panel admin ni en el
  manifest de PWA cambió).
- **Commit(s):** `f9ced74`

---

### 2026-07-20 — El favicon (pestaña del navegador) también cambia, solo dentro de Mesa de Ayuda
- **Qué pasó:** el usuario notó que el ícono junto al dominio en la pestaña
  del navegador seguía siendo el anterior, y pidió que también cambiara
  ahí — aclarando de nuevo que el panel admin no debe verse afectado.
  Reto: el panel admin y el portal de Mesa de Ayuda son una sola SPA con un
  solo `index.html`, así que solo hay un `<link rel="icon">` físico — no se
  puede tener "2 favicons" fijos a la vez, hay que cambiarlo por JS según la
  ruta actual.
- **Qué cambié:**
  - `frontend/public/icons/favicon-mesa-ayuda.png` (nuevo) — la misma imagen
    del ícono nuevo, reescalada a 32×32.
  - `frontend/src/hooks/useFavicon.js` (nuevo) — hook que, en cada cambio de
    ruta (`useLocation`), revisa si el path actual empieza con alguno de los
    prefijos de Mesa de Ayuda (`/mesa-de-ayuda`, `/reportar-ticket`,
    `/mis-tickets`, `/mis-solicitudes`, `/manuales`, `/empleado`,
    `/solicitar-cuenta`, `/solicitar-recurso`, `/solicitar-ingreso`) y
    reemplaza el `href` del `<link rel="icon">` por el ícono nuevo; fuera de
    esos prefijos (panel admin, `/login`, 404) lo regresa al de siempre
    (`favicon-32.png`).
  - `frontend/src/App.jsx` — nuevo componente `FaviconManager` (usa el hook,
    no renderiza nada) montado dentro de `<BrowserRouter>`, junto a
    `<Routes>` — tiene que vivir ahí porque `useLocation` solo funciona
    dentro del Router.
- **Por qué:** para que la identidad visual de Mesa de Ayuda sea consistente
  también en la pestaña del navegador, sin tocar el ícono del panel admin.
- **Verificación:** `npm run build`; `node --check` en el backend (sin
  cambios ahí); Playwright — navegué a `/mesa-de-ayuda`, `/reportar-ticket` y
  `/manuales/mesa-de-ayuda` y confirmé el favicon nuevo; navegué a `/` y
  `/employees` y confirmé que se queda el de siempre; y probé también una
  navegación client-side (sin recarga completa, vía `pushState`) de admin a
  Mesa de Ayuda para confirmar que el hook reacciona igual sin depender de
  un refresh de página.
- **Commit(s):** `e0139a7`

---

### 2026-07-20 — El ícono al "instalar" la app (PWA) también se actualizó
- **Qué pasó:** el usuario preguntó por qué, al instalar la app (Agregar a
  pantalla de inicio), seguía viendo el logo anterior. Motivo real: el
  favicon de pestaña y el logo del sidebar ya se habían cambiado, pero el
  ícono que usa el sistema operativo al instalar viene de OTROS 4 archivos
  distintos (el manifest de la PWA + el ícono de iOS), que todavía no se
  habían tocado — y como esta PWA es enteramente de Mesa de Ayuda (no existe
  una versión "instalable" del panel admin, ver comentario en
  `vite.config.js`), no hay conflicto de alcance aquí: los 4 se actualizan.
- **Qué encontré al generar los nuevos archivos:** la imagen original que
  compartió el usuario no tiene fondo transparente en las esquinas del
  cuadro redondeado — tiene negro sólido ahí (visible solo al hacer zoom;
  a tamaño normal se confunde con el fondo). Usarla tal cual como ícono de
  "instalar" se habría visto con triángulos negros en las esquinas al
  combinarse con el recorte redondeado que aplica el propio sistema
  operativo. Rellené esas esquinas (con relleno por inundación desde cada
  esquina, sin tocar el dibujo del audífono) para dejar un cuadro completo
  del mismo color crema de fondo, igual que el criterio de los íconos
  anteriores (cuadro completo, sin su propio redondeado — el sistema
  operativo pone el suyo).
- **Qué cambié** (los 4 archivos que faltaban, mismos nombres — el manifest
  y `index.html` ya apuntaban ahí, no hizo falta tocar configuración):
  `frontend/public/icons/icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png` y `apple-touch-icon.png`.
- **Por qué:** para que instalar la Mesa de Ayuda como app muestre el
  ícono nuevo, no el anterior.
- **Verificación:** `npm run build`; confirmé que `dist/manifest.webmanifest`
  sigue apuntando a los mismos 4 archivos y que su contenido (md5) ya es el
  nuevo; revisé visualmente cada ícono generado para confirmar que no
  quedaran esquinas negras.
- **Commit(s):** `679c551`

---

### 2026-07-20 — FIX: esquinas negras en el ícono nuevo (favicon y logo del sidebar)
- **Qué pasó:** el usuario reportó que se veían esquinas negras y feas en el
  ícono. La corrección anterior (esquinas negras del PWA install icon) solo
  había regenerado 4 archivos (`icon-192`, `icon-512`,
  `icon-maskable-512`, `apple-touch-icon`) a partir de una versión ya
  corregida (sin negro) de la imagen — pero se me pasó que
  `favicon-mesa-ayuda.png` (la pestaña del navegador) y
  `mesa-ayuda-logo.png` (el logo del sidebar) todavía venían de la imagen
  ORIGINAL sin corregir, con negro sólido en las esquinas. A tamaño de
  sidebar (30px, con `border-radius` del contenedor) casi no se notaba,
  pero en el favicon (32px, sin ningún recorte redondeado del navegador) el
  negro de las 4 esquinas se veía clarísimo — confirmé el defecto
  ampliando el archivo por pixel antes de corregirlo.
- **Qué cambié:** `frontend/public/icons/favicon-mesa-ayuda.png` y
  `mesa-ayuda-logo.png` — ambos regenerados desde la misma versión ya
  corregida (esquinas rellenas con el color crema de fondo, sin tocar el
  dibujo del audífono) que ya se usaba para los 4 íconos de instalación.
- **Por qué:** para que el ícono nuevo se vea limpio en TODOS los lugares
  donde aparece, no solo en el ícono de instalación.
- **Verificación:** `npm run build`; confirmé por pixel que la esquina de
  ambos archivos ya es crema (245,243,240), no negra; Playwright — capturé
  de nuevo la barra lateral de Mesa de Ayuda para confirmar visualmente.
- **Commit(s):** `f5b379f`

---

### 2026-07-20 — Tarjetas de Mesa de Ayuda y formularios de Solicitud a pantalla completa
- **Qué pasó:** el usuario reportó que las 5 tarjetas de "¿Qué necesitas?"
  se veían "apachurradas", y pidió estirarlas a pantalla completa — y de
  paso, lo mismo para los formularios de Solicitar Cuenta/Recurso/Ingreso
  (que vivían en una tarjeta angosta de `max-width: 760px` centrada, con
  mucho espacio vacío a los lados en pantallas grandes).
- **Qué cambié:**
  - `frontend/src/pages/MesaDeAyuda.module.css` — `.needGrid` pasó de CSS
    Grid de 5 columnas fijas (con 2 breakpoints que las apretaban a 2 y
    luego 1 columna) a flexbox (`flex-wrap` + `.needCard { flex: 1 1
    200px }`). Probé primero con CSS Grid `auto-fit`, pero esa opción deja
    la ÚLTIMA fila sin estirar cuando no completa todas las columnas (la
    tarjeta "Manuales" sola en la fila 2, con un hueco vacío enorme al
    lado) — flexbox si reparte el espacio sobrante entre todas las
    tarjetas de cada fila, incluida una fila incompleta.
  - `frontend/src/pages/SolicitarCuenta.module.css` (compartido por
    Solicitar Cuenta/Recurso/Ingreso) — `.page` ya no centra con
    `display:flex; justify-content:center`, y `.card` ya no tiene
    `max-width: 760px` — ahora ocupan el ancho completo, igual que ya
    hacía el wizard de Reportar Ticket. Nueva clase `.loginCardNarrow`
    (460px, centrada) para los 2 casos que SÍ deben seguir angostos por ser
    formularios pequeños de 1-2 campos: `EmployeeLogin.jsx` y las 5
    pantallas de `ConfirmarEnvio.jsx` (login de empleado y confirmación de
    envío para el mensajero — ninguno de los dos es un "formulario para
    reportar cosas" del que se quejó el usuario).
- **Por qué:** para que ni las tarjetas ni los formularios de solicitud se
  vean encogidos con espacio desperdiciado en pantallas grandes.
- **Verificación:** `npm run build`; Playwright a 1440px — confirmé las 5
  tarjetas en una sola fila sin huecos, y las 3 páginas de Solicitud
  ocupando todo el ancho; repetí a 390px (móvil) para confirmar que se
  siguen apilando bien sin las media queries manuales que quité; confirmé
  que `EmployeeLogin` se sigue viendo angosto y centrado; volví a correr
  las pruebas de Manuales, catálogo de impresoras y favicon dinámico sin
  encontrar nada roto.
- **Commit(s):** `df7961a`

---

### 2026-07-20 — FIX: las tarjetas de Mesa de Ayuda se veían de tamaños distintos entre sí
- **Qué pasó:** el usuario reportó que, al cambiar el tamaño de la ventana,
  no todas las tarjetas ni los formularios se acomodaban igual — "como que
  si se hace grande o chico pero no todos los botones". Reproduje en
  Playwright barriendo 8 anchos de pantalla (375 a 2560px) y encontré el
  problema real en el cambio anterior: usé flexbox (`flex-wrap` +
  `flex-grow`) para que la Mesa de Ayuda estirara sus 5 tarjetas sin dejar
  huecos — pero flexbox calcula el ancho de cada tarjeta POR FILA. A 768px
  y 1024px, por ejemplo, quedaban 3 tarjetas en la fila 1 y 2 en la fila 2
  — y esas 2 crecían mucho más (≈350px) que las 3 de arriba (≈230px), 100+
  px de diferencia, viéndose claramente inconsistentes. Los formularios de
  Solicitud (SolicitarCuenta/Recurso/Ingreso) en cambio sí se comportaban
  bien en todos los anchos probados (usan CSS Grid de columnas fijas, sin
  este problema).
- **Qué cambié:** `frontend/src/pages/MesaDeAyuda.module.css` —
  `.needGrid` regresa a CSS Grid (`repeat(auto-fit, minmax(200px, 1fr))`)
  en vez de flexbox. A diferencia de flex, Grid calcula el ancho de columna
  UNA sola vez para todo el grid — todas las tarjetas miden exactamente lo
  mismo sin importar en qué fila caigan. El único costo es que una fila
  incompleta (ej. la 5ª tarjeta sola) deja espacio vacío a su lado en vez
  de estirarse a todo lo ancho — mismo patrón que ya usa el grid de
  categorías de Reportar Ticket, un comportamiento estándar y esperado en
  cuadrículas de este tipo. Bajé el mínimo de 220px a 200px para que las 5
  quepan en una sola fila con más frecuencia (ej. ya caben a 1440px).
- **Por qué:** que todos los botones se vean consistentes entre sí importa
  más que estirar por completo una fila incompleta.
- **Verificación:** `npm run build`; Playwright barriendo 375/428/768/
  1024/1280/1440/1920/2560px — confirmé 0 scroll horizontal en todos, y
  que las tarjetas miden lo mismo entre filas a 768px/1024px/1440px;
  revisé también Solicitar Cuenta a 1024px y 2560px (se ve bien, solo más
  espaciosa); repetí las pruebas de Manuales y catálogo de impresoras sin
  encontrar nada roto.
- **Commit(s):** `76c94b4`

---

### 2026-07-20 — FIX: Reportar Ticket también se veía "todo a la izquierda" y chico
- **Qué pasó:** el usuario reportó que en Reportar un Problema, en monitor,
  todo se veía pegado a la izquierda, y que los formularios (categoría,
  lista de problemas, datos del ticket) se veían chicos — a pesar de haber
  pedido ya 2 veces que todo abarque la pantalla completa.
- **Qué encontré:** dos problemas separados en
  `frontend/src/pages/ReportarTicket.module.css`, nunca corregidos en los
  cambios anteriores (que solo tocaron Mesa de Ayuda y Solicitar
  Cuenta/Recurso/Ingreso):
  1. `.catGrid` (categorías del paso 1, y también las tarjetas de
     Computadoras/Celulares y de apartados de apps) usaba `auto-fill`, NO
     `auto-fit` — con secciones de pocas categorías (ej. "Tu equipo" solo
     tiene 2: Hardware y Accesorios), `auto-fill` reserva columnas
     invisibles de más para llenar el ancho disponible, dejando las
     tarjetas reales chicas y pegadas a la izquierda con un hueco vacío
     enorme a la derecha — exactamente el "todo a la izquierda" reportado.
  2. `.formWrap` (paso 3, datos del ticket), `.problemList` (paso 2, lista
     de problemas) y `.noteBox` tenían `max-width: 640px` — angostos a
     propósito en un cambio de sesiones anteriores (antes de que el
     usuario pidiera pantalla completa 2 veces), nunca se les quitó el
     límite.
- **Qué cambié:** en `ReportarTicket.module.css` — `.catGrid` de
  `auto-fill` a `auto-fit` (mismo fix ya aplicado en Mesa de Ayuda);
  quité el `max-width: 640px` de `.formWrap`, `.problemList` y `.noteBox`.
- **Por qué:** para que el wizard completo de Reportar Ticket (categoría,
  computadora/celular, lista de problemas, datos del ticket) se vea a
  pantalla completa en cualquier paso, no solo el paso 1.
- **Verificación:** `npm run build`; Playwright a 1920px — recorrí el
  wizard completo (categoría → Hardware → Computadoras → problema →
  formulario) confirmando que cada paso ocupa todo el ancho sin espacio
  vacío a la derecha; repetí a 390px (móvil) sin scroll horizontal;
  reconfirmé Manuales y catálogo de impresoras sin nada roto.
- **Commit(s):** `8cc3693`

---

### 2026-07-20 — FIX: faltaba "← Volver a Solicitudes" en Manuales y Mis solicitudes
- **Qué pasó:** el usuario reportó que desde Manuales no podía regresar a
  Solicitudes. Al revisar, ese link ("← Volver a Solicitudes") ya existía
  en Reportar Ticket y Mis Tickets (pedido explícito de una sesión
  anterior), pero se me pasó agregarlo tanto en `Manuales.jsx` (nuevo, de
  esta sesión) como en `MisSolicitudes.jsx` (ya existía desde antes, con el
  mismo hueco sin que nadie lo hubiera notado hasta ahora).
- **Qué cambié:**
  - `frontend/src/pages/Manuales.jsx` — agregado el link (su CSS ya
    existía en `Manuales.module.css`, quedó sin usar por descuido al
    crear la página).
  - `frontend/src/pages/MisSolicitudes.jsx` + `.module.css` — agregado el
    link y su clase `.backLink` (no existía).
- **Por qué:** para que la navegación de "volver a Solicitudes" sea
  consistente en TODAS las páginas del portal de empleado, no solo en
  tickets.
- **Verificación:** `npm run build`; Playwright — confirmé que el link
  aparece en ambas páginas y que al hacer clic regresa a `/mesa-de-ayuda`.
- **Commit(s):** `7afeade`

---

### 2026-07-20 — El buscador ahora también encuentra problemas dentro de apartados de apps + "Outlook" renombrado a "correo"
- **Qué pasó:** el usuario preguntó si el buscador de Mesa de Ayuda
  encontraba "alta de proveedores" (un problema específico dentro del
  apartado "Alta de Proveedores" de Solicitud de Pagos) — la respuesta real
  era que NO: el buscador nunca se actualizó cuando se agregaron los
  catálogos de apartados de Solicitud de Pagos/Ventas/Gestor de Constancias
  en sesiones anteriores, solo sabía buscar por el NOMBRE de la app, no por
  los problemas específicos dentro de sus apartados. También pidió cambiar
  "Outlook" por "correo" en el catálogo, porque los usuarios no siempre
  saben que su correo corporativo se llama Outlook.
- **Qué cambié:**
  - `frontend/src/config/ticketCategories.js` — nuevo `SPECIAL_APPS` +
    `findSpecialSubareas()` exportados (antes vivían solo dentro de
    `ReportarTicket.jsx`, invisibles para el buscador). Label renombrado:
    "Outlook no me manda o no me llegan correos" → "Mi correo no manda o no
    me llegan correos" (se conserva "outlook" como keyword, por si alguien
    todavía lo escribe así).
  - `frontend/src/pages/ReportarTicket.jsx` — usa el `findSpecialSubareas`
    compartido en vez de su copia local; el efecto que resuelve `?app=<id>`
    ahora también lee `?subarea=<key>&problema=<texto>` y, si coinciden,
    salta directo al formulario (antes solo llegaba hasta "¿de qué apartado
    es?", aunque el buscador ya supiera la respuesta exacta).
  - `frontend/src/pages/MesaDeAyuda.jsx` — `bestTicketMatch()` ahora
    también busca dentro de los apartados de las apps especiales (no solo
    el nombre de la app), y `buildTicketResult()` arma el link con
    `?tipo=aplicacion&app=...&subarea=...&problema=...` para llegar directo
    al formulario. Peso de estas coincidencias (4/1) un punto más bajo que
    un problema de categoría normal (5/2) a propósito: probé primero con el
    mismo peso y una búsqueda genérica como "no puedo entrar al ERP"
    terminaba mostrando arriba "Solicitud de Pagos — Usuarios" (coincidencia
    por la frase genérica "no puedo entrar", que también usan varios
    apartados) en vez del resultado correcto de ERP — con menos peso, el
    apartado solo gana cuando es la coincidencia más específica o la única,
    que es el caso real que se pidió resolver.
- **Por qué:** para que el buscador realmente "haga su chamba" con TODO el
  catálogo de tickets, no solo una parte, y para que el lenguaje de los
  problemas de correo no dé por hecho que todos saben qué es "Outlook".
- **Verificación:** `npm run build`; `node --check` en el backend (sin
  cambios ahí — el ticket que arma este flujo ya usa los mismos campos que
  el wizard manual); Playwright — confirmé que "alta de proveedores"
  encuentra el problema exacto y aterriza directo en el formulario con el
  apartado correcto; probé también con frases de Ventas y Gestor de
  Constancias; confirmé que "no puedo entrar al erp" ya no se ve opacado
  por el ruido de Solicitud de Pagos; volví a correr las pruebas de
  Manuales, catálogo de impresoras, favicon dinámico y los links de "Volver
  a Solicitudes" sin encontrar nada roto.
- **Commit(s):** `61e6cfc`

---

### 2026-07-20 — Manual de Usuario de Gestor de Constancias Aduaneras, subido a Manuales
- **Qué pasó:** el usuario pidió subir el manual de usuario de "Gestor de
  Constancias Aduaneras" (`Manual_Usuario_GestorConstancias.docx`, v1.0 ·
  Junio 2026) a la sección de Manuales y Políticas. Esa app es un sistema
  aparte (`gestor-constancias.vercel.app`), no vive en este repo — se sube
  aquí porque Manuales y Políticas quedó pensado como el lugar central de
  documentación de la empresa, no solo de este Assets Manager.
- **Qué cambié:**
  - `frontend/src/pages/ManualGestorConstancias.jsx` (nuevo) — transcripción
    fiel de las 10 secciones del documento original (Introducción, Acceso al
    sistema, Historial de constancias, Documentos y correo de liberación,
    Módulo de Alertas, Configuración, Notificaciones push, Avisos
    automáticos, Preguntas frecuentes, Glosario), reutilizando el mismo
    módulo de estilos del manual de Mesa de Ayuda (`ManualMesaDeAyuda.module.css`
    — sus clases ya son genéricas, no específicas de esa app).
  - `frontend/src/pages/Manuales.jsx` — nueva tarjeta "Manual de Usuario —
    Gestor de Constancias Aduaneras" en el grupo "Manuales".
  - `frontend/src/App.jsx` — ruta `/manuales/gestor-constancias-aduaneras`
    (protegida igual que el resto del portal de empleado).
- **Por qué:** para que cualquier empleado que use Gestor de Constancias
  Aduaneras tenga su manual a la mano desde el mismo portal, sin depender
  de un .docx suelto.
- **Verificación:** `npm run build`; Playwright — confirmé que la tarjeta
  nueva aparece en `/manuales`, que abre `/manuales/gestor-constancias-aduaneras`,
  que las 10 secciones/6 tablas/10 preguntas frecuentes/13 términos de
  glosario están presentes, que la tabla de contenido navega por ancla y
  que "← Volver a Manuales y Políticas" regresa al índice; reconfirmé el
  manual de Mesa de Ayuda y los links de "Volver a Solicitudes" sin nada
  roto.
- **Commit(s):** `35c52ca`

---

### 2026-07-20 — FIX: el buscador no encontraba palabras genéricas sueltas (ej. "correo")
- **Qué pasó:** el usuario reportó que buscar solo "correo" (sin ninguna
  frase alrededor) no encontraba nada. Motivo real: casi todos los keywords
  del catálogo son frases largas ("no me llegan correos", "firma de
  correo"), más largas que la palabra buscada — el buscador solo sabía
  comparar "¿la búsqueda CONTIENE este keyword completo?", nunca al revés
  ("¿este keyword contiene la palabra buscada?"), así que una palabra corta
  y genérica nunca "cabía" dentro de una frase más larga.
- **Qué cambié:** `frontend/src/pages/MesaDeAyuda.jsx` — `scoreKeywords()`
  suma un caso nuevo, limitado a búsquedas de UNA sola palabra (a
  propósito: así no se reabre el problema que ya evitaba el "matching
  flojo" de antes — una búsqueda de VARIAS palabras enganchando por una
  palabra genérica compartida, ej. "necesito", con una frase sin relación
  real): compara esa palabra contra CADA palabra de cada keyword (aunque
  sea una frase de varias), en ambos sentidos — cubre tanto "correo"
  encontrando "...correos" (la búsqueda es más corta que la palabra del
  keyword) como "proveedores" encontrando "...proveedor..." (la búsqueda es
  más larga, por el plural — lo probé aparte y también fallaba).
- **Por qué:** para que una palabra suelta y común encuentre algo
  razonable, no una pantalla vacía.
- **Verificación:** `npm run build`; Playwright — "correo" ahora regresa 5
  resultados (correo en general, Gmail, correo del celular, phishing,
  Gestor de Constancias) y "proveedores" encuentra el problema exacto de
  Alta de Proveedores; confirmé que "necesito un mouse"/"necesito una
  licencia" NO se contaminaron entre sí (la protección contra palabras
  genéricas compartidas en búsquedas de varias palabras sigue intacta);
  reconfirmé "alta de proveedores", "no puedo entrar al erp", Manuales,
  catálogo de impresoras y los links de "Volver a Solicitudes" sin nada
  roto.
- **Commit(s):** `23099bd`

---

### 2026-07-20 — Nueva "Baja de personal": jefe reporta, RH revisa, Sistemas libera activos
- **Qué pasó:** el usuario pidió un formulario de baja de personal, en
  espejo con "Alta de un nuevo ingreso" pero en 2 etapas: un jefe reporta
  que alguien de su equipo causa baja, RH lo revisa, y RH le avisa a
  Sistemas para que libere el equipo asignado. Aclaró explícitamente: solo
  jefes y RH deben ver esto, y quiere poder elegir a mano qué personas
  entran en cada grupo. Antes de programar, pregunté 3 cosas: (1) si RH
  tenía que volver a capturar a mano qué activos hay que recoger o el
  sistema ya lo sabe — eligió que el sistema ya lo muestre solo; (2) si el
  permiso de RH para bajas es el mismo que ya usan para altas o uno nuevo —
  eligió uno nuevo y separado; (3) el catálogo de motivos — eligió el
  estándar de RH (Renuncia voluntaria, Despido justificado, Despido
  injustificado, Término de contrato, Abandono de empleo, Fallecimiento,
  Otro).
- **Qué encontré antes de programar:** Empleados YA tiene un botón "Dar de
  baja" que marca al empleado inactivo y libera automáticamente todos sus
  activos asignados (`utils/releaseAssetsOnBaja.js`) — no hizo falta
  reconstruir esa parte, solo la cola de solicitudes/aprobación que lleva
  hasta ahí. La acción realmente destructiva (marcar inactivo + liberar
  activos) se reutiliza tal cual, solo detrás de `auth + adminOnly` de
  Sistemas, sin cambios.
- **Qué cambié — backend:**
  - `models/Employee.js` — 2 permisos nuevos y separados:
    `canRequestOffboarding` (jefe, cualquier área) y `canManageOffboarding`
    (RH, igual que `canManageOnboarding`).
  - `models/OffboardingRequest.js` (nuevo) — status de 2 etapas
    (`pendiente_rh` → `pendiente_sistemas` → `completada`, o rechazada en
    cualquiera de las 2), y `assetsSnapshot`: foto de qué activos tenía
    asignados la persona AL MOMENTO en que el jefe reportó la baja (para
    que RH no dependa de entrar a Activos).
  - `routes/offboardingRequests.js` (nuevo) — `POST /` (jefe, requiere
    sesión de empleado — a diferencia de Solicitud de Ingreso, esta SÍ
    exige login en las 3 etapas, porque termina liberando activos de una
    persona real), `GET /mine`, `GET /pending-rh` + `PUT /:id/rh-approve` /
    `rh-reject` (RH), y ya detrás de `auth+adminOnly`: `GET /`,
    `PUT /:id/complete` (un clic marca inactivo + libera activos,
    reusando `releaseAssetsOnBaja`) y `PUT /:id/sistemas-reject`.
  - `routes/employeeAuth.js` — los 2 permisos nuevos viajan en el JWT y en
    la respuesta de login/activate, mismo patrón que `canManageOnboarding`.
- **Qué cambié — frontend:**
  - `config/offboardingReasons.js` (nuevo) — catálogo de motivos.
  - `pages/BajaPersonal.jsx` + `.module.css` (nuevos, ruta
    `/baja-personal`) — una sola página con 2 secciones independientes:
    "Reportar una baja" (visible con `canRequestOffboarding`) y
    "Solicitudes por revisar (RH)" (visible con `canManageOffboarding`,
    muestra el snapshot de activos y botones Aprobar/Rechazar) — alguien
    con los 2 permisos ve ambas.
  - `pages/MesaDeAyuda.jsx` — nueva tarjeta "Baja de personal" (visible con
    cualquiera de los 2 permisos) y nuevo tema de búsqueda restringido;
    generalicé `restricted` en `SOLICITUD_TOPICS` para aceptar tanto un
    nombre de permiso como una función (necesario para "jefe O RH").
  - `pages/OffboardingRequests.jsx` (nuevo, panel admin,
    `/offboarding-requests`) — cola de Sistemas con el mismo detalle de
    activos, botón "Procesar baja y liberar activos" y "Rechazar".
  - `pages/Employees.jsx` — 2 checkboxes nuevos en el modal de editar
    empleado (el de jefe sin restricción de área, el de RH igual que
    altas).
  - `pages/MisSolicitudes.jsx` — las bajas que reportó el jefe se suman al
    historial, con su propio estatus de 2 etapas.
  - `components/Layout.jsx` — nuevo link "Bajas RH" junto a "Ingresos RH".
- **Por qué:** para que la baja de una persona quede registrada con su
  motivo, pase por la revisión de RH y termine liberando su equipo sin que
  nadie tenga que escribir 2 veces qué activos tiene asignados.
- **Verificación:** `npm run build`; `node --check` en todos los archivos
  de backend nuevos/tocados; Playwright — confirmé la tarjeta visible solo
  con el permiso correcto (jefe/RH/ambos/ninguno) en Mesa de Ayuda y en el
  buscador; probé el envío completo del formulario del jefe; probé que RH
  aprueba y pasa a "pendiente_sistemas"; probé el panel admin de Sistemas
  (detalle con activos + "Procesar baja"); confirmé los 2 checkboxes nuevos
  en Empleados; confirmé que las bajas aparecen en Mis Solicitudes; repetí
  Manuales, catálogo de impresoras, favicon y el buscador de "correo" sin
  encontrar nada roto.
- **Commit(s):** `dc677b4`

---

### 2026-07-20 — Manual de Ventas (Vendedor Foráneo y Telemarketing), con selector de perfil
- **Qué pasó:** el usuario pidió subir 2 manuales más a Manuales y
  Políticas — `Manual_Vendedor_SelectShop.docx` y
  `Manual_Telemarketing_SelectShop.docx`, ambos de la misma app de Ventas
  (`ventas-mobile.vercel.app`, tampoco vive en este repo) pero contados
  desde 2 puntos de vista distintos. Pidió explícitamente UN solo botón
  general ("Manual de Ventas") que deje elegir entre los 2, en vez de
  mostrar 2 tarjetas sueltas en el índice o mezclar ambos documentos en uno.
- **Qué cambié:**
  - `frontend/src/pages/ManualVentas.jsx` (nuevo, ruta `/manuales/ventas`)
    — página "selector": 2 tarjetas (Vendedor Foráneo / Telemarketing), cada
    una lleva a su manual completo. Mismo patrón de "picker intermedio"
    entre el índice de Manuales y el contenido real.
  - `frontend/src/pages/ManualVentasVendedor.jsx` (nuevo, ruta
    `/manuales/ventas/vendedor`) — transcripción fiel de las 10 secciones
    del manual del vendedor (Introducción, Acceso, Menú Principal, Ventas
    Foráneas — Visitas y Cotizaciones, Mis Cotizaciones, Viáticos,
    Historial de Visitas, Catálogo, FAQ, Glosario).
  - `frontend/src/pages/ManualVentasTelemarketing.jsx` (nuevo, ruta
    `/manuales/ventas/telemarketing`) — transcripción fiel de las 9
    secciones del manual de telemarketing (mismo esqueleto, pero con
    Llamadas en vez de Visitas — resultado automático de llamada,
    historial de llamadas con resumen/filtros). Ambos reusan
    `ManualMesaDeAyuda.module.css` (clases genéricas, ya lo hace también
    Gestor de Constancias) y agregan un ícono 💡 ("Tip") además del 📌
    ("Nota") que ya existía, porque el documento original de Telemarketing
    trae ambos tipos de recuadro.
  - `frontend/src/pages/Manuales.jsx` — nueva tarjeta "Manual de Ventas"
    (icono 💼) que en vez de `to` directo, lleva al picker.
  - `frontend/src/App.jsx` — 3 rutas nuevas, mismo patrón de anidación que
    ya usa Manuales → manual específico.
- **Por qué:** un solo botón de entrada es más claro que 2 tarjetas sueltas
  cuando ambos documentos son la misma app vista desde 2 roles distintos.
- **Verificación:** `npm run build`; Playwright — confirmé la tarjeta en el
  índice, que abre el picker con las 2 opciones, que cada una abre su
  manual completo (10/9 secciones, 5/7 tablas, 11/11 preguntas frecuentes,
  18/19 términos de glosario respectivamente) con su tabla de contenido y
  su propio "← Volver a Manual de Ventas"; reconfirmé Manuales, Baja de
  Personal y los links de "Volver a Solicitudes" sin nada roto.
- **Commit(s):** `8cfa22b`

---

### 2026-07-20 — Nueva sección "Manuales y Políticas" + manual de usuario de Mesa de Ayuda
- **Qué pasó:** el usuario pidió una sección de "Manuales y Políticas" a un
  lado del botón "Tengo un problema" en la pantalla principal de Mesa de
  Ayuda, y dentro un manual de usuario de la propia Mesa de Ayuda (cómo
  entrar, cómo levantar un ticket, todas las funciones). Compartió
  `Manual_Usuario_GestorConstancias.docx` como referencia del formato que
  usan para sus manuales (tabla de contenido, secciones numeradas, notas 📌,
  preguntas frecuentes ❓ y glosario al final).
- **Qué cambié:**
  - `frontend/src/pages/Manuales.jsx` + `Manuales.module.css` (nuevos) —
    página índice `/manuales` con 2 grupos: "Manuales" (por ahora solo el de
    Mesa de Ayuda) y "Políticas" (vacío, con mensaje de "aún no hay" — la
    sección ya existe para cuando se agregue una).
  - `frontend/src/pages/ManualMesaDeAyuda.jsx` + `.module.css` (nuevos) —
    manual completo en `/manuales/mesa-de-ayuda`, mismo formato que el
    ejemplo compartido (tabla de contenido con anclas, 8 secciones:
    Introducción, Acceso al sistema, Pantalla principal, Reportar un
    problema/ticket con todo su detalle real (categorías por sección,
    computadora/celular, notas de "esto no es una falla", apps con
    apartados propios, selector de impresoras), Mis tickets (estatus,
    Nivel de Servicio, conversación, cierre, encuesta de satisfacción), Mis
    solicitudes, Preguntas frecuentes y Glosario), con notas y FAQ
    colapsable (`<details>`).
  - `frontend/src/pages/MesaDeAyuda.jsx` — nueva 5ª tarjeta "Manuales y
    Políticas" junto a "Tengo un problema", con su propio ícono de libro.
  - `frontend/src/pages/MesaDeAyuda.module.css` — la cuadrícula de tarjetas
    pasa de 4 a 5 columnas.
  - `frontend/src/components/PortalLayout.jsx` — nuevo link "Manuales" en
    la barra lateral del portal, junto a Solicitudes/Mis tickets/Mis
    solicitudes.
  - `frontend/src/App.jsx` — rutas `/manuales` y `/manuales/mesa-de-ayuda`
    (protegidas igual que el resto del portal de empleado).
- **Por qué:** para que cualquier empleado pueda aprender a usar la Mesa de
  Ayuda sin tener que preguntarle a Sistemas, con el mismo formato de manual
  que ya usan en otras apps de la empresa.
- **Verificación:** `npm run build`; `node --check` en todo el backend (sin
  cambios ahí, solo para confirmar que nada se rompió); Playwright —
  confirmé que la tarjeta aparece en Mesa de Ayuda, que lleva a `/manuales`,
  que el manual abre desde ahí, que la tabla de contenido navega por ancla,
  que las preguntas frecuentes se expanden, que el link "← Volver a
  Manuales y Políticas" regresa al índice, y volví a correr la prueba del
  selector de impresoras para confirmar que el flujo de tickets sigue
  intacto.
- **Commit(s):** `70d86ec`

---

### 2026-07-20 — Manual de Mesa de Ayuda: agregadas las 3 Solicitudes (Cuenta, Recurso, Ingreso)
- **Qué pasó:** el usuario preguntó si el manual estaba completo y describía
  toda la página. Revisión honesta: cubría a fondo el sistema de tickets
  (lo que se pidió con más énfasis) pero solo mencionaba de pasada, sin
  describir sus pasos, los otros 3 formularios de la pantalla principal
  (Solicitar Cuenta/Recurso/Ingreso). El usuario pidió agregarlos con el
  mismo nivel de detalle.
- **Qué cambié:** `frontend/src/pages/ManualMesaDeAyuda.jsx` — leí a fondo
  `SolicitarCuenta.jsx`, `SolicitarRecurso.jsx` y `SolicitarIngreso.jsx`
  para documentar sus campos reales (no inventados) y agregué 3 secciones
  nuevas al mismo nivel de detalle que "Reportar un problema", entre
  "Pantalla principal" y "Reportar un problema" (con la renumeración de
  todo lo que sigue, 8 → 11 secciones en total):
  - **4. Solicitar acceso a un sistema o correo** — datos del solicitante
    con autocompletado desde Empleados, los 3 tipos de cuenta (Gmail con
    tipo Individual/Compartida y uso principal; Plataformas de venta con
    roles fijos de Mercado Libre vs. permisos generales de las demás; ERP
    con módulos y nivel de acceso), justificación/vigencia, y el texto
    legal de obligaciones que hay que aceptar para poder enviarla.
  - **5. Solicitar equipo, accesorio o servicio** — catálogo completo de
    recursos (monitor, mouse, teclado, impresora, línea telefónica,
    software/licencia, etc.), con los campos condicionales de "Software o
    Licencia" y "Otro (especifica)".
  - **6. Alta de un nuevo ingreso (solo RH)** — datos del nuevo ingreso
    (empresa/sucursal con sus catálogos reales), correo corporativo
    sugerido, equipo necesario (computadora/teléfono/accesorios) y datos
    de quién solicita.
  - Nota agregada en la sección 3 (Pantalla principal): estos 3
    formularios son páginas públicas, no requieren sesión — se pueden
    compartir por link directo.
  - 3 preguntas nuevas en el FAQ sobre estos formularios (sesión no
    requerida, nombre no encontrado en Empleados, por qué no llevar
    nombres de persona en el correo/usuario) + término "Cuenta
    institucional" en el Glosario.
- **Por qué:** para que el manual realmente cubra "toda la página", no solo
  la parte de tickets.
- **Verificación:** `npm run build`; Playwright — confirmé las 11 secciones
  con sus anclas, que las 3 secciones nuevas existen y mencionan datos
  reales (ej. los roles de Mercado Libre), y que el resto del manual/flujo
  de tickets sigue intacto.
- **Commit(s):** `ddd732c`

---

### 2026-07-20 — "¿Cuál impresora es?" ahora es un selector real, no texto libre
- **Qué pasó:** el usuario compartió el catálogo real de impresoras de la
  empresa (archivo "DIGITAL COPY 26 (2).xlsx", contrato de arrendamiento de
  copiadoras) — extraje la tabla MODELO/SERIE/NOMBRE por sucursal (hoja
  MARZO, la más reciente; confirmé que el listado de equipos no cambia
  mes a mes, solo las copias usadas). Pidió que esto alimentara el campo
  "¿Cuál impresora es?" del ticket, en vez de texto libre.
- **Qué encontré:** 6 sucursales con impresoras reales — Naucalpan (1,
  "General"), Polanco (4: Administración/Ventas/Contabilidad/RH),
  Tepotzotlán del contrato Select Shop (4: Bodega Meli/Oficinas/Bodega/
  Entrada), Iztapalapa (4: P1 Alto Valor/Facturación/Almacén/Taller),
  Tepotzotlán del contrato Bloom & Blush (1: CEDIS) y Cuernavaca (3: Eq. 1
  Administración/Eq. 2 Enfermería/Golden) — hay 2 sucursales distintas
  llamadas "Tepotzotlán" en el archivo original (contratos distintos, cada
  una con su propio grupo de equipos), se distinguen por la empresa del
  contrato entre paréntesis.
- **Qué cambié:**
  - `frontend/src/config/printerCatalog.js` (nuevo) — `PRINTER_CATALOG`
    con las 6 sucursales y sus equipos (nombre/modelo/serie reales).
  - `frontend/src/pages/ReportarTicket.jsx` — el campo de la categoría
    Impresoras pasa de `<input>` de texto libre a un `<select>` agrupado
    por sucursal (`<optgroup>`), mostrando "Ubicación — Modelo (Serie)".
    Elegir uno rellena `otherTypeDetail` con sucursal + modelo + serie
    completos, de un jalón. Se conserva la opción "Otra / no está en la
    lista", que revela el campo de texto libre de siempre — para una
    impresora nueva o una sucursal que aún no esté en el catálogo.
- **Por qué:** con el modelo y número de serie reales, Sistemas ya sabe
  exactamente cuál equipo físico es sin tener que preguntar ni adivinar
  por una descripción escrita a mano.
- **Verificación:** `npm run build`; Playwright — confirmé las 6 sucursales
  en el selector, que elegir una impresora real arma correctamente
  "Sucursal — Ubicación — Modelo (Serie ...)", que "Otra" revela el texto
  libre y sigue validando que no quede vacío, y volví a correr las pruebas
  de Solicitud de Pagos/Ventas/Gestor de Constancias/Hardware-Software-Red
  sin encontrar nada roto.
- **Commit(s):** `7c963c3`

### 2026-07-20 — Gestor de Constancias Aduaneras: catálogo de 8 apartados, a sistemas.3
- **Qué pasó:** el usuario pasó el catálogo completo de soporte de "Gestor de
  Constancias Aduaneras" (8 apartados, 30 problemas específicos, tal cual se
  los compartieron) y pidió que todo el correo llegue exclusivamente a
  `sistemas.3@selectshop.com.mx`, sin importar el apartado — mismo esquema
  que Ventas.
- **Qué cambié:**
  - `frontend/src/config/ticketCategories.js` — nuevo
    `GESTOR_CONSTANCIAS_SUBAREAS` con los 8 apartados tal cual se pasaron
    (Inicio de sesión y cuentas, Permisos y roles, Documentos (PDFs),
    Importar/Exportar Excel, Correos (recordatorios y liberación),
    Notificaciones push, Calendario Outlook, General) + helper
    `isGestorConstanciasApp()`. Cada apartado agrega un catch-all "Otro
    problema de..." (mismo criterio que el resto del catálogo, no venía en
    la lista original).
  - `frontend/src/pages/ReportarTicket.jsx` — se registra como una app
    "especial" más en `SPECIAL_APPS` (mismo mecanismo genérico que ya sirve
    a Solicitud de Pagos y Ventas, sin duplicar código).
  - `backend/src/routes/tickets.js` — `getTicketEmailRecipients()`: nueva
    regla exclusiva, todo el correo de esta app llega solo a
    `sistemas.3@selectshop.com.mx`, sin importar el apartado.
- **Verificación:** `node --check`; `npm run build`; Playwright — probé el
  flujo completo (categoría → Gestor de Constancias Aduaneras → 8 apartados
  visibles → Documentos (PDFs) → problema específico → formulario,
  `otherTypeDetail` correcto) y confirmé el enrutamiento a sistemas.3;
  volví a correr las pruebas de Solicitud de Pagos, Ventas y el flujo de
  Hardware/Software/Red sin encontrar nada roto.
- **Commit(s):** (pendiente)

### 2026-07-20 — "← Volver a Solicitudes" en Reportar Ticket y Mis Tickets
- **Qué pasó:** el usuario dijo que al entrar a "Tengo un problema" (Reportar
  Ticket) o estar en Mis Tickets, la única forma de regresar a Solicitudes
  era el link del sidebar — pidió un camino más directo mientras está
  reportando el ticket.
- **Qué cambié:** mismo patrón que ya se usaba en Solicitar Cuenta/Recurso/
  Ingreso — `<Link to="/mesa-de-ayuda">← Volver a Solicitudes</Link>`
  agregado arriba de todo en `frontend/src/pages/ReportarTicket.jsx` (en
  las 2 vistas: el wizard completo — visible en cualquier paso, categoría,
  problema, formulario — y la pantalla de "Ticket enviado") y en
  `frontend/src/pages/MisTickets.jsx`. Nueva clase `.backLink` en
  `MisTickets.module.css` (no existía ahí; en ReportarTicket ya existía,
  se reusó).
- **Verificación:** `npm run build`; Playwright — confirmé que el link
  aparece y funciona en el paso de categorías, a mitad del wizard (paso de
  problema específico) y en Mis Tickets, navegando correctamente a
  `/mesa-de-ayuda` en los 3 casos.
- **Commit(s):** (pendiente)

### 2026-07-20 — Categorías de Reportar Ticket agrupadas por sección
- **Qué pasó:** el usuario dijo "siento que está todo revuelto" en la
  pantalla de "¿De qué tipo es el problema?" — con 10 categorías en una
  sola cuadrícula plana no se notaba ningún orden, aunque ya estuvieran
  agrupadas por tipo internamente.
- **Qué cambié:**
  - `frontend/src/config/ticketCategories.js` — cada categoría visible
    declara ahora un `section`: **Tu equipo** (Hardware, Accesorios),
    **Programas y sistemas** (Software, Aplicaciones, ERP), **Conexión e
    impresión** (Red / Conectividad, Impresoras), **Cuentas y seguridad**
    (Cuenta / Acceso, Seguridad), **Otro**. Nuevo `CATEGORY_SECTIONS` fija
    el orden de los grupos.
  - `frontend/src/pages/ReportarTicket.jsx` — la pantalla de categorías ya
    no pinta una sola cuadrícula: agrupa por `section` (respetando el
    orden de `CATEGORY_SECTIONS`) y pinta un encabezado por grupo, con una
    línea divisoria entre secciones.
- **Verificación:** `npm run build`; Playwright — confirmé los 5
  encabezados de sección en el orden correcto, y volví a correr las
  pruebas de Hardware/Software/Red (Computadoras/Celulares), Solicitud de
  Pagos y Ventas para confirmar que nada se rompió con el reordenamiento.
- **Commit(s):** (pendiente)

### 2026-07-20 — Un solo botón de Hardware/Software/Red, con el paso de Computadoras/Celulares adentro
- **Qué pasó:** después de separar Hardware/Software/Red en 7 botones (ver
  entrada de abajo), el usuario pidió volver a UN solo botón por categoría
  en la pantalla principal — y que, al apretarlo, ahí sí aparezcan los
  botones de Computadoras/Celulares como un paso intermedio, en vez de
  llenar la pantalla de botones sueltos.
- **Qué cambié:** `frontend/src/config/ticketCategories.js` — las 6
  categorías de Computadoras/Celulares (hardware_pc, hardware_celular,
  software_pc, software_celular, red_pc, red_celular) se marcan `hidden:
  true` (ya no se muestran como botón propio, pero conservan su catálogo de
  problemas de siempre) y se agregan 3 categorías agrupadoras — "Hardware",
  "Software", "Red / Conectividad" — con `problems: 'device-split'` y sus
  2 opciones (Computadoras/Celulares, con el mismo filtro de "solo si
  tienes uno asignado" de antes). `frontend/src/pages/ReportarTicket.jsx`
  — nuevo paso "device-split": al elegir una categoría agrupadora, se
  muestra el picker de Computadoras/Celulares; al elegir una, se activa la
  categoría real (ej. hardware_pc) y sigue exactamente igual que antes
  (mismo catálogo de problemas, sin selector de equipo). "← Cambiar
  categoría" desde la lista de problemas ahora regresa primero a ese picker
  intermedio, no directo a la pantalla principal.
- **Verificación:** `npm run build`; Playwright — confirmé que la pantalla
  principal ya solo muestra "Hardware"/"Software"/"Red / Conectividad" (un
  botón cada una, más "Accesorios" aparte), que al apretar "Hardware"
  aparecen "Computadoras"/"Celulares", que sin celular asignado solo
  aparece "Computadoras", que el flujo completo hasta enviar el ticket
  sigue funcionando igual (mismo `ticketType` final, sin selector de
  equipo), y que la navegación "← Cambiar categoría"/"Cambiar" regresa al
  paso correcto en cada nivel. Volví a correr las pruebas de Solicitud de
  Pagos/Ventas/Impresoras sin encontrar nada roto.
- **Commit(s):** (pendiente)

### 2026-07-20 — Hardware/Software/Red separados por Computadoras/Celulares
- **Qué pasó:** el usuario pidió separar el catálogo de Hardware, Software y
  Red entre "Computadoras" (laptop/escritorio/all-in-one) y "Celulares" —
  ya no le hacía sentido que alguien reporte "mi laptop no enciende" y
  encima tenga que elegir manualmente que es su laptop en un selector
  aparte. Pidió también que si alguien no tiene celular asignado, esas
  categorías de Celulares ni le aparezcan (basado en sus activos reales), y
  que los accesorios rotos (ej. una base de laptop) se llamen "Accesorio",
  no "Consumible" (término que no se entiende igual).
- **Qué cambié:**
  - `frontend/src/config/ticketCategories.js` — las 3 categorías genéricas
    se reemplazan por 7: **Hardware Computadoras**, **Hardware Celulares**,
    **Accesorios** (mouse, teclado, monitor, base para laptop, cargador,
    audífonos — antes vivía escondido como un problema más dentro de
    Hardware), **Software Computadoras** (mismo contenido que antes),
    **Software Celulares** (nuevo: app lenta, no abre, no instala,
    correo en el celular), **Red Computadoras** y **Red Celulares** (nuevo:
    WiFi/datos/VPN desde el celular). Nuevo `CATEGORY_ASSET_REQUIREMENT`
    mapea qué tipo de activo necesita cada categoría de Computadoras/
    Celulares.
  - `frontend/src/pages/ReportarTicket.jsx` — el paso de categorías ahora
    filtra contra `myAssets` (ya se traía de `GET /tickets/mine/assets`
    para el selector de equipo, que además se elimina para las 7
    categorías nuevas — ya no hace falta preguntar, el botón ya lo dice).
    Mientras el fetch de activos no termine, se muestran todas para no
    hacer parpadear la pantalla con una lista incompleta.
  - `backend/src/models/Ticket.js` — `TICKET_TYPES`/`TICKET_TYPE_LABELS`
    agregan las 7 claves nuevas; `hardware`/`software`/`red` (genéricos) se
    quedan en el enum SOLO por los tickets ya existentes con ese tipo — el
    wizard ya no los ofrece.
  - `frontend/src/pages/Tickets.jsx`, `Indicadores.jsx`, `MisTickets.jsx` —
    sus mapas de tipo→label/ícono agregan las 7 claves nuevas (con
    fallback ya existente para no romper con tickets viejos).
- **Verificación:** `node --check`; `npm run build`; Playwright — probé 3
  escenarios: empleado con laptop pero sin celular (categorías de
  Celulares ocultas), empleado con solo celular (categorías de
  Computadoras ocultas), y empleado con AMBOS (laptop + celular) —
  confirmé que ya NO aparece "¿sobre cuál de tus equipos es esto?" ni
  siquiera en ese último caso, que antes sí la disparaba. Probé también el
  flujo completo de "Accesorios" con el ejemplo exacto del usuario ("La
  base para laptop está rota o dañada"), y volví a correr las pruebas de
  Solicitud de Pagos/Ventas/Impresoras para confirmar que nada se rompió.
- **Commit(s):** (pendiente)

### 2026-07-20 — FIX: un ticket de Ventas le llegó a todo Sistemas, no solo a sistemas.2
- **Qué pasó:** el usuario reportó que un ticket real de "Ventas" le llegó
  por correo a todo el equipo de Sistemas, en vez de solo a
  `sistemas.2@selectshop.com.mx` como se había pedido explícitamente.
- **La causa:** `getTicketEmailRecipients()` comparaba el nombre de la app
  por IGUALDAD EXACTA (`=== 'ventas'` / `=== 'solicitud de pagos'`) contra
  el nombre real que tenga la app en el catálogo de Aplicaciones Internas —
  si ese nombre no coincidía letra por letra (mayúsculas, espacios de más,
  algo distinto a "Ventas" tal cual), la comparación nunca reconocía la app
  y el ticket caía al enrutamiento genérico (todo el equipo de Sistemas).
  Mismo patrón de bug que ya se había visto antes esta sesión con
  coincidencias de texto exactas (nombres, keywords de búsqueda).
- **Qué cambié:** `backend/src/routes/tickets.js` — ambas comparaciones
  (Ventas y Solicitud de Pagos) pasan de igualdad exacta (`===`) a
  substring (`.includes()`) — con que el nombre de la app CONTENGA
  "ventas"/"solicitud de pagos" basta, sin depender de que quede idéntico.
- **Verificación:** `node --check`; probé la comparación contra variantes
  reales (" Ventas ", "VENTAS", "Sistema de Ventas") — todas se reconocen
  correctamente ahora, sin falsos positivos en apps no relacionadas
  ("Cuentas por Pagar").
- **Commit(s):** (pendiente)

### 2026-07-20 — Ventas: apartados con catálogo de Miguel, todo a un solo correo
- **Qué pasó:** siguiendo el mismo patrón de Solicitud de Pagos, el usuario
  pidió dar de alta "Ventas" con el catálogo de problemas que le pasó Miguel
  (3 apartados: Aprobación de Solicitudes, Cotizaciones/Clientes/Catálogo,
  Acceso/Usuario Bloqueado/Permisos) — pero a diferencia de Pagos, aquí
  TODO el correo llega exclusivamente a `sistemas.2@selectshop.com.mx`, sin
  importar el apartado.
- **Qué cambié:**
  - `frontend/src/pages/ReportarTicket.jsx` — generalicé el mecanismo que
    hasta ahora era específico de "Solicitud de Pagos" (`paymentSubarea` →
    `subarea`/`subareaOptions`, pasos `payment-subarea`/`payment-problem` →
    `app-subarea`/`app-subarea-problem`) para que cualquier app "especial"
    del catálogo de Aplicaciones pueda tener sus propios apartados sin
    duplicar código — ahora sirve tanto a Solicitud de Pagos como a Ventas
    (y deja el camino listo para "Gestor-Constancias" cuando se necesite).
  - `frontend/src/config/ticketCategories.js` — nuevo `VENTAS_SUBAREAS`
    con los 3 apartados de Miguel; los problemas específicos de cada uno
    son propuestos por mí (Miguel solo dio los nombres de los apartados y
    quién los atiende en la realidad — no confirmados por Ventas, ajustar
    si piden otra redacción) + helper `isVentasApp()`. El `desc` de cada
    apartado documenta quién lo atiende en la vida real (jefe directo,
    Dirección, Admin, Sistemas) — es solo informativo para quien reporta,
    no afecta el enrutamiento del correo.
  - `backend/src/routes/tickets.js` — `getTicketEmailRecipients()`: para la
    app "Ventas", el correo SIEMPRE llega solo a
    `sistemas.2@selectshop.com.mx`, sin mirar el apartado ni sumar a nadie
    más (a diferencia de Solicitud de Pagos, que sí enruta distinto por
    apartado).
- **Verificación:** `node --check`; `npm run build`; Playwright — probé el
  flujo completo de Ventas (categoría → Ventas → Acceso/Usuario
  Bloqueado/Permisos → "Olvidé mi contraseña" → formulario) y confirmé el
  payload; volví a correr las pruebas de Solicitud de Pagos para confirmar
  que la generalización no rompió nada; verifiqué que el enrutamiento de
  Ventas da siempre `sistemas.2@selectshop.com.mx` sin importar el
  apartado elegido.
- **Commit(s):** (pendiente)

### 2026-07-20 — Solicitud de Pagos: 3 apartados con enrutamiento propio + quitar equipo en Aplicaciones
- **Qué pasó:** el usuario pidió 2 cosas para la categoría "Aplicaciones" de
  Mesa de Ayuda: (1) quitar la pregunta "¿sobre cuál de tus equipos es
  esto?" (una aplicación no es equipo personal, igual que ya se hizo para
  Impresoras); (2) que la app "Solicitud de Pagos" tenga su propio
  sub-catálogo de 3 apartados — Usuarios, Centro de Costos/Motivo de Pago,
  Alta de Proveedores — cada uno enrutado por correo a un equipo distinto,
  externo a Sistemas.
- **Qué cambié:**
  - `frontend/src/pages/ReportarTicket.jsx` — `NO_ASSET_SELECTOR_CATEGORIES`
    ahora incluye también `'aplicacion'` (antes solo `'impresora'`). Al
    elegir la app "Solicitud de Pagos" del catálogo, en vez de ir directo al
    formulario (como cualquier otra app), se agregan 2 pasos nuevos:
    elegir apartado (Usuarios / Centro de Costos.../ Alta de Proveedores) y
    luego el problema específico DE ese apartado — mismo patrón que ya usan
    las demás categorías. El apartado elegido se guarda en
    `otherTypeDetail` (mismo campo libre que ya se reusa para "Otro"/
    "Impresoras") y se muestra en el formulario como dato de solo lectura.
  - `frontend/src/config/ticketCategories.js` — nuevo
    `PAYMENT_REQUEST_SUBAREAS` con los 3 apartados y sus problemas
    específicos (Usuarios: contraseña olvidada, alta de cuenta, cuenta
    bloqueada, no veo mi historial, permisos — pedidos explícitos del
    usuario; Centro de Costos/Motivo de Pago y Alta de Proveedores:
    opciones que propuse yo, el usuario dijo explícitamente "de contabilidad
    no sé" — ajustar si el equipo de Contabilidad pide otra redacción) +
    helper `isSolicitudDePagosApp()`.
  - `backend/src/routes/tickets.js` — `getTicketEmailRecipients()`: para
    tickets de la app "Solicitud de Pagos", el correo ya NO le llega a
    Sistemas ni al Gerente de Sistemas (a diferencia de antes) — se enruta
    EXCLUSIVO según el apartado guardado en `otherTypeDetail`: Usuarios →
    `lider.erp@selectshop.com.mx` + `analista.erp@selectshop.com.mx`;
    Centro de Costos/Motivo de Pago → `gerente.contabilidad@selectshop.com.mx`;
    Alta de Proveedores → `pagos@selectshop.com.mx`. Un apartado
    desconocido (dato viejo antes de este cambio) cae al enrutamiento
    general de Sistemas, para no perderse sin avisar a nadie.
- **Verificación:** `node --check`; `npm run build`; Playwright — probé el
  flujo completo (categoría → Solicitud de Pagos → Usuarios → "Olvidé mi
  contraseña" → formulario, sin la pregunta de equipo, con "Apartado:
  Usuarios" visible) y confirmé que el payload manda `otherTypeDetail:
  "Usuarios"`; probé también que otra app cualquiera sigue yendo directo al
  formulario sin pasar por apartados, y que la navegación "← Cambiar
  apartado"/"Cambiar" (desde el formulario) regresa al paso correcto.
  Verifiqué los 3 mapeos de correo directamente contra la función real.
- **Commit(s):** (pendiente)

### 2026-07-20 — Confirmar antes de salir de un panel de editar con cambios sin guardar
- **Qué pasó:** el usuario reportó que, si seleccionaba algo "hacia la izquierda"
  (el menú/sidebar) mientras editaba un panel, este se cerraba solo y
  perdía todo lo escrito, sin avisar. Pidió protección general, en todas las
  páginas con panel de editar, con una confirmación antes de salir.
- **La causa real:** el fondo oscuro detrás de cada modal (`.overlay`, con
  `position: fixed; inset: 0`) cubre TODA la pantalla — así que un clic
  "hacia el menú" en realidad cae sobre ese fondo semi-transparente, no
  sobre el menú de verdad. El fondo ya tenía su propio `onClick={() =>
  setShowModal(false)}` de toda la vida, sin ningún aviso.
- **Qué hice:** `frontend/src/hooks/useConfirmDirtyNavigation.js` (nuevo) —
  un solo listener global (montado en `App.jsx`, junto a los otros 2 hooks
  de esta semana) que cubre los ~20 modales de edición del panel admin y del
  portal de empleado, todos con las mismas clases `overlay`/`modal`, sin
  tocar cada página una por una. Detecta "¿hay cambios sin guardar?"
  tomando una foto del valor real de cada campo apenas aparece en el DOM (vía
  `MutationObserver` + `WeakMap`) y comparándola contra el valor actual —
  **no** contra la propiedad nativa `defaultValue`, que en un primer intento
  resultó no servir: React la resincroniza sola en cada re-render para que
  coincida con el valor actual (para que un reset del navegador restaure al
  último valor, no al original), así que dejaba de detectar cambios en
  cuanto la persona tecleaba una letra.
- **Qué NO cambia:** clics dentro del contenido del modal (campos, Guardar,
  Cancelar, la X) siguen igual, sin ninguna confirmación de más — solo se
  protege la navegación hacia otro lado. Los `<select>` no cuentan para
  "¿está sucio?" (mismo problema del `defaultValue`, pero sin forma
  confiable de arreglarlo sin tocar cada página) — solo inputs, textareas,
  checkboxes y radios.
- **Verificación:** `npm run build`; Playwright — probé en el panel de
  Empleados (editar) y en la conversación de un ticket (Mis Tickets):
  confirmar cancela y conserva los datos; aceptar sí navega; un modal
  SIN tocar nada no muestra ningún aviso (antes daba falso positivo por los
  `<select>`, ya corregido); y sin ningún modal abierto, navegar funciona
  exactamente igual que siempre.
- **Commit(s):** (pendiente)

### 2026-07-20 — Tab rellena los ejemplos ("Ej. ...") de cualquier campo, en toda la app
- **Qué pasó:** el usuario pidió que, en cualquier página/pestaña, si un campo
  vacío muestra un ejemplo como placeholder (ej. "Ej. Héctor Ramírez"), poder
  usar Tab para rellenarlo con ese ejemplo en vez de escribirlo a mano.
- **Qué hice:** `frontend/src/hooks/useTabFillExamples.js` (nuevo) — un solo
  listener de teclado global, montado una vez en `App.jsx`, que cubre TODA
  la app sin tocar cada formulario uno por uno. Solo actúa cuando: el campo
  enfocado es un `<input>` de texto o un `<textarea>`, está vacío, y su
  placeholder empieza con "Ej."/"ej." (la única señal confiable de "esto es
  un valor literal para aceptar" — placeholders instructivos como "Escribe
  tu nombre..." o "¿Por qué se necesita?" no califican, a propósito). El
  primer Tab rellena el campo (sin mover el foco, para poder ver/editar lo
  que puso); como ya deja de estar vacío, el segundo Tab navega normal al
  siguiente campo — igual que aceptar un autocompletado.
- **Por qué:** para no tener que teclear a mano un ejemplo que de todos modos
  ya está escrito en el placeholder.
- **Verificación:** `npm run build`; Playwright — confirmé en el campo "¿Cuál
  impresora es?" de Reportar Ticket que el 1er Tab rellena con el ejemplo y
  el 2do mueve el foco al siguiente campo sin tocar lo que ya tenía texto;
  y confirmé que un buscador sin "Ej." (ej. el de Empleados) NO se rellena.
- **Commit(s):** (pendiente)

### 2026-07-20 — Quitado el checkbox "esto me impide trabajar" — ya lo deriva el SLA
- **Qué pasó:** el usuario recordó que ya se había acordado que la Categoría de
  Falla (SLA) del problema elegido debía ser la que determinara si algo
  impide trabajar o no — pero el checkbox manual "⚠️ Esto me impide trabajar"
  seguía en el formulario de Reportar Ticket, permitiendo que cualquiera lo
  marcara sin relación real con la prioridad de su problema.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — `applySlaCategory()` (ya compartida
    entre la clasificación automática al reportar y la reclasificación manual
    de un admin) ahora también fija `ticket.blocksWork` según la prioridad de
    la categoría: `alta`/`critica` → `true` (Hardware Local, Cuentas
    Críticas/ERP-SAE, Infraestructura Local, CCTV, Incidentes de Seguridad,
    Servidores y Core); `baja`/`media` → `false` (Cuentas y Accesos,
    Ofimática, Periféricos, Software, Red Local). `POST /tickets/mine` ya no
    acepta `blocksWork` de quien reporta.
  - `backend/src/models/Ticket.js` — comentario del campo actualizado para
    reflejar que ya no lo marca quien reporta.
  - `frontend/src/pages/ReportarTicket.jsx` — se quitó el checkbox del
    formulario y su envío en el `FormData`.
- **Por qué:** una autoevaluación libre ("¿esto te impide trabajar?") la
  marcaba cualquiera casi siempre que sí, sin relación con la urgencia real
  — la prioridad ya resuelta por el problema específico elegido es una señal
  mucho más consistente y ya existía de todos modos.
- **Verificación:** `node --check`; `npm run build`; probé la derivación
  contra las 11 categorías del SLA_CATALOG (mapeo correcto en todas);
  Playwright — confirmé que el checkbox ya no aparece en el formulario y que
  un ticket de Hardware ("No enciende o no prende") se envía sin
  `blocksWork` en el payload, quedando clasificado solo por `slaHint`.
- **Commit(s):** (pendiente)

### 2026-07-20 — FIX: ticket de Impresoras preguntaba por el equipo equivocado
- **Qué pasó:** el usuario notó que, al reportar un ticket de Impresoras, el
  formulario podía preguntar "¿Sobre cuál de tus equipos es esto?" — pero esa
  lista solo muestra el equipo PERSONAL asignado al empleado (laptop, celular),
  nunca una impresora (las impresoras no se asignan a una persona, son equipo
  compartido). La pregunta no tenía ninguna respuesta válida para este caso.
- **Qué cambié:**
  - `frontend/src/pages/ReportarTicket.jsx` — para la categoría "Impresoras":
    ya NO se muestra la pregunta "¿Sobre cuál de tus equipos es esto?"; en su
    lugar aparece un campo obligatorio "¿Cuál impresora es? *" (ej. "HP de
    Recepción, planta baja"), reusando el mismo campo `otherTypeDetail` que ya
    existía para la categoría "Otro" — no fue necesario un campo nuevo en el
    modelo, y ya se muestra sin más en la lista de tickets del admin
    (`Tickets.jsx` ya lo mostraba genéricamente, sin importar el tipo).
  - `backend/src/routes/tickets.js` — `POST /tickets/mine` ahora también
    exige `otherTypeDetail` cuando `ticketType === 'impresora'` (antes solo
    se exigía para `'otro'`).
- **Por qué:** para que Sistemas sepa DE VERDAD cuál impresora reportaron,
  en vez de una pregunta que nunca podía responderse bien.
- **Verificación:** `node --check`; `npm run build`; Playwright — simulé un
  empleado con 2 equipos personales asignados (para forzar que antes SÍ
  saliera la pregunta vieja) y confirmé que en Impresoras ya no aparece, que
  el campo nuevo es obligatorio (bloquea el envío vacío), y que el ticket se
  manda con el detalle de la impresora en `otherTypeDetail`.
- **Commit(s):** (pendiente)

### 2026-07-20 — Login de Mesa de Ayuda: autocompletar el dominio del correo
- **Qué pasó:** el usuario preguntó si se podía loguear por nombre en vez de
  correo — se le explicó que el riesgo es que dos empleados compartan nombre
  (ya nos pasó esta sesión con "Felipe Gómez"). También se descartó el no. de
  empleado como atajo porque, en palabras del usuario, "estas personas no se
  saben su número de empleado". La idea que sí adoptó: no pedir el correo
  completo, solo la parte de antes del "@" — mucho menos que teclear en un
  teclado de celular, sin perder nada de la unicidad del correo real.
- **Qué cambié:** `frontend/src/components/EmployeeLoginWidget.jsx` — nueva
  `resolveUsername()`: si lo que se escribió ya trae "@" (correo completo) o
  son puros dígitos (no. de empleado), se manda tal cual; cualquier otro caso
  se asume la parte local de un correo y se le agrega `@selectshop.com.mx`
  antes de mandarlo a `/employee-auth/lookup`. Sin cambios en el backend — ya
  aceptaba correo completo o no. de empleado indistintamente. Placeholder y
  un hint nuevo bajo el campo aclaran que no hace falta escribir el dominio.
- **Verificación:** `npm run build`; Playwright — confirmé que "felipe.gomez"
  se manda como "felipe.gomez@selectshop.com.mx", que "60378" (no. de
  empleado) se manda tal cual sin tocar, y que un correo completo tampoco se
  duplica.
- **Commit(s):** (pendiente)

### 2026-07-20 — Mesa de Ayuda como PWA (instalable en el celular, gratis)
- **Qué pasó:** después de arreglar la versión de teléfono (ver entrada de abajo),
  el usuario preguntó si se podía tener una app de Android/iOS reutilizando todo
  el código ya existente. Se le explicaron 2 caminos: PWA (gratis, instalable
  directo desde el navegador) o Capacitor (app real de tienda, con costo de
  cuentas de desarrollador Apple/Google). Eligió la ruta gratuita: PWA.
- **Qué cambié:**
  - `frontend/vite.config.js` — se agregó el plugin `vite-plugin-pwa`
    (`registerType: 'autoUpdate'`), con manifest apuntando a `start_url:
    '/mesa-de-ayuda'` (el portal de empleado, no el login de Sistemas) y
    `navigateFallbackDenylist` para que el service worker NUNCA cachee
    `/api/**` — son datos en vivo (tickets, activos), no algo que deba
    "verse offline" con información vieja.
  - `frontend/public/icons/` (nuevo) — 5 íconos PNG generados con Python/Pillow
    a partir del mismo logotipo (flecha blanca sobre naranja `#E8431A`) que ya
    usa el sidebar del portal (`PortalLayout.jsx`): `icon-192`, `icon-512`,
    `icon-maskable-512` (para el masking de Android), `apple-touch-icon` y
    `favicon-32`.
  - `frontend/index.html` — meta tags específicas de iOS (Apple no sigue el
    estándar de `manifest.json`): `apple-mobile-web-app-capable`,
    `apple-touch-icon`, `theme-color`, etc.
  - `README.md` — documentada la nueva pieza del stack y cómo instalar la app
    desde Android/iPhone.
- **Por qué:** dar de alta un ticket desde el celular (ej. "no prende mi compu")
  sin necesitar cuentas de desarrollador ni pasar por revisión de App
  Store/Play Store — el empleado instala directo desde el link que ya usan.
- **Verificación:** `npm run build` (genera `manifest.webmanifest`, `sw.js`,
  `registerSW.js` además del bundle normal); Playwright — confirmé que el
  manifest se sirve y es válido, que el service worker se registra y queda
  `active`, y que los 5 íconos responden 200.
- **Commit(s):** (pendiente)

### 2026-07-20 — Mesa de Ayuda: versión de teléfono (no una app, sino que la web se adapte)
- **Qué pasó:** el usuario quiere que un empleado pueda reportar un ticket desde su
  teléfono empresarial cuando, por ejemplo, su computadora no prende — no una app
  nueva, sino que la Mesa de Ayuda ya funcione bien en el navegador del celular.
- **Qué encontré:** al probar con Playwright en un viewport de teléfono (390px), el
  portal del empleado (`PortalLayout.jsx`, usado por Mesa de Ayuda, Reportar
  Ticket, Mis Tickets y Mis Solicitudes) se desbordaba horizontalmente y era
  inusable — el sidebar se veía correcto a simple vista, pero el contenido
  principal quedaba empujado fuera de la pantalla.
- **La causa real:** `PortalLayout.module.css` ya tenía una regla
  `@media (max-width: 900px)` que convertía el sidebar en una barra horizontal
  arriba (`position: static; width: 100%`), pero nunca cambiaba `.wrapper` de
  `display: flex` (fila) a columna — con el sidebar ahora ocupando el 100% de una
  fila, `.main` se renderizaba DESPUÉS de él (a la derecha, fuera de la pantalla)
  en vez de abajo. Agregar `.wrapper { flex-direction: column; }` dentro de ese
  mismo media query arregló el layout completo de un jalón (afecta a las 4
  páginas que usan `PortalLayout`, no solo Mesa de Ayuda).
- **Qué más ajusté:**
  - `MisTickets.module.css`/`MisSolicitudes.module.css`: la tabla de 4 columnas
    (Folio/Ticket/Estatus/Fecha) ya no cabía en una pantalla angosta y la columna
    "Fecha" quedaba invisible — agregué un `@media (max-width: 640px)` que
    convierte cada fila en una tarjeta apilada (mismo contenido, sin tabla).
- **Lo que ya estaba bien** (verificado, sin cambios): pantalla de login/bienvenida,
  el wizard completo de "Reportar un problema" (los 3 pasos), el modal de
  conversación de un ticket, y los formularios públicos Solicitar Cuenta/Recurso —
  todos ya eran responsive de antes.
- **Verificación:** `npm run build`; Playwright con viewport de 390×844 (iPhone) en
  las 5 páginas del portal + el modal de ticket — confirmé que ya no hay
  desbordamiento horizontal (`document.documentElement.scrollWidth === 390`) en
  ninguna, con capturas de pantalla revisadas una por una.
- **Commit(s):** (pendiente)

### 2026-07-17 — Revertido: SAE/COI/NOI en el catálogo de ERP (aún no se implementa)
- **Qué pasó:** el usuario aclaró, después de la entrada de abajo, que
  SAE/COI/NOI todavía no se van a implementar por ahora.
- **Qué cambié:** `frontend/src/config/ticketCategories.js` — quité de la
  categoría ERP las palabras clave `sae`/`coi`/`noi`, el problema "No puedo
  entrar al ERP (SAE, COI o NOI)" (regresó a su versión original "No puedo
  entrar al ERP") y el problema nuevo "Error al timbrar o generar un CFDI".
  El resto de lo agregado en la entrada de abajo (Software, Impresoras,
  Cuenta/Acceso) NO se tocó — solo aplicaba a lo relacionado con SAE/COI/NOI.
- **Verificación:** `npm run build` OK.
- **Commit(s):** (pendiente)

### 2026-07-17 — Mesa de Ayuda: catálogo de problemas ampliado con el histórico del sistema anterior
- **Qué pasó:** el usuario pidió sacar cada problema real que existía en el sistema
  de tickets anterior (`BD_Helpdesk.csv`, exportado del sistema viejo, 1,172
  tickets históricos) y agregarlos al catálogo actual donde correspondiera —
  para que el buscador de Mesa de Ayuda y el wizard "Reportar Ticket" ya cubran
  problemas reales que la gente reportaba, no solo los que se me ocurrieron al
  diseñar el catálogo original.
- **Qué hice:** parseé el CSV (Python, 1,172 filas, columna `Descripción_soporte`)
  y comparé cada descripción contra las palabras clave que ya existían en
  `ticketCategories.js` para medir qué tanto quedaba sin cubrir (61% cubierto
  antes). Con el 39% restante, agrupé por tema recurrente (frecuencia de
  palabras + lectura de muestras reales) para encontrar problemas genuinos que
  no tenían dónde caer.
- **Qué cambié** (`frontend/src/config/ticketCategories.js` — única fuente para
  ambos, wizard y buscador):
  - **ERP**: agregué `sae`/`coi`/`noi` como palabras clave — nadie le dice "ERP"
    al sistema, le dicen por su nombre real (SAE = ventas/facturación, COI =
    contabilidad, NOI = nómina/RH). Nuevo problema "Error al timbrar o generar
    un CFDI" (muy repetido en Contabilidad/Auditoría).
  - **Software**: 3 problemas nuevos — "Office pide activarse / licencia
    vencida" (el tema más repetido de todo el histórico y no tenía dónde
    caer), "No tengo acceso a una carpeta compartida", "Necesito configurar mi
    firma de correo". Y una nota (no falla, redirige a Solicitar Recurso, mismo
    patrón que "No encuentro Word/Excel..."): "Necesito instalar un programa
    nuevo (Zoom, AnyDesk, etc.)".
  - **Impresoras**: nuevo problema "El escáner no funciona o no puedo
    escanear" (mismo equipo multifunción, volumen propio en el histórico).
  - **Cuenta/Acceso**: "Mi cuenta está bloqueada" ahora también cubre "no
    puedo iniciar sesión"/"inicio de sesión".
  - Amplié los keywords de "Outlook no me manda o no me llegan correos" con
    variantes reales encontradas ("no me permite abrir mi correo", "recepción
    de correos", etc.).
- **Qué dejé fuera a propósito:** una parte grande del histórico eran
  solicitudes de alta de cuenta/correo nuevo ("crear correo para fulano", "dar
  de alta en el ERP a...") — eso ya tiene su propio flujo (Solicitar Cuenta),
  no es un ticket de "algo que ya tengo y no funciona", así que no lo agregué
  al catálogo de tickets.
- **Impacto medido:** de 61% a 74% de los 1,172 tickets históricos ahora
  coinciden con un problema específico del catálogo (antes muchos caían al
  "Otro problema de..." genérico de su categoría). El resto es cola larga de
  casos únicos, errores de dedo o solicitudes fuera de alcance de Tickets.
- **Verificación:** `npm run build`; Playwright contra Mesa de Ayuda con datos
  mockeados — confirmé que buscar "SAE", "escáner", "firma de correo", "no
  tengo licencia office", "CFDI" y "carpeta compartida" ya llegan al problema
  correcto (antes ninguno daba resultado).
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX: la coincidencia de "Felipe" era demasiado amplia (podía tomar a otro Felipe)
- **Qué pasó:** el usuario detectó que el criterio anterior ("felipe" como substring
  del nombre capturado) era demasiado permisivo: si hubiera otro empleado que
  también se llame Felipe, sus envíos también encenderían el botón y podrían
  terminar con la firma de Luis Felipe Gomez Gonzalez en un PDF que no es suyo.
  Pidió explícitamente: "solo debe ser Luis Felipe Gomez Gonzalez o
  sistemas.4@selectshop.com.mx, no ningún otro Felipe".
- **Qué cambió:**
  - `backend/src/routes/shipments.js` — `getFelipeIfRecipient` ya no acepta con
    que "felipe" aparezca en el texto; ahora exige que coincidan al menos 2
    palabras de su nombre real registrado (`namesLikelyMatch`), tomado de su
    ficha de Empleado (ligada a `sistemas.4@selectshop.com.mx`). Un simple
    "Felipe" suelto ya NO califica; "Felipe Gómez", "Luis Felipe Gomez" o su
    nombre completo sí.
  - `frontend/src/pages/Shipments.jsx` — el botón "🖊 Firma" usa el mismo
    criterio (exige "felipe" + "gomez" juntos, no "felipe" solo).
- **Por qué:** evitar que la firma de Felipe se guarde o se imprima en el PDF de
  recepción de una persona distinta que comparta el mismo nombre de pila.
- **Verificación:** `node --check`; probé `namesLikelyMatch` directo — "Felipe"
  solo y "Felipe Torres" ya NO coinciden con "Luis Felipe Gomez Gonzalez",
  pero "Felipe Gómez"/"LUIS FELIPE GOMEZ GONZALEZ" sí. Playwright confirmó que
  el botón solo aparece en envíos de él, no en uno de "Felipe Torres" ni en uno
  con solo "Felipe" sin apellido.
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos: subir la firma de Felipe directo desde el panel, sin depender de coincidencia de nombre
- **Qué pasó:** después del fix anterior, el usuario pidió algo mucho más simple y
  directo: poder habilitar la firma de Felipe UNA VEZ desde la página de Envíos
  (no desde el link público), en cualquiera de los envíos ya existentes, y que de
  ahí en adelante todos sus PDF de recepción salgan ya firmados — sin depender de
  que ningún texto libre coincida con nada.
- **Qué cambió:**
  - `backend/src/routes/shipments.js`: nueva ruta autenticada
    `POST /shipments/:id/signature` — sube la imagen directo a la ficha de
    Empleado de Felipe (por su correo corporativo), sin comparar nombres; el
    envío elegido en la tabla es solo el punto de entrada, no condiciona nada.
    Además, `getFelipeIfRecipient` (la que decide si un PDF de recepción debe
    llevar su firma) ahora compara por *substring* ("¿aparece 'felipe' en el
    texto?") en vez de exigir que el nombre completo coincida exactamente contra
    su ficha de Empleado — mucho más tolerante a como se haya escrito su nombre.
  - `frontend/src/pages/Shipments.jsx`: nuevo botón "🖊 Firma" en la tabla,
    visible solo en envíos cuyo destinatario/quien confirmó contiene "felipe" —
    abre el selector de archivo y sube directo, sin pasar por el link público.
- **Por qué:** la lógica anterior dependía de que el nombre tecleado en el envío
  coincidiera con el registrado en Empleados — fuente de bugs repetidos. Esta
  versión no depende de eso: es una acción manual, directa, desde el panel que
  ya usa el equipo de Sistemas.
- **Verificación:** `node --check`; `npm run build`; Playwright con rutas
  mockeadas — confirmé que el botón "🖊 Firma" aparece solo en los envíos de
  Felipe (no en uno de "Otra Persona"), y que subir un archivo llama al nuevo
  endpoint y muestra la confirmación.
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX real: la firma de Felipe se comparaba contra el nombre equivocado
- **Qué pasó:** el fix del acento (ver entrada de abajo) no resolvió el problema. El
  usuario mandó captura de un envío real ya confirmado, donde claramente decía
  "confirmado como recibido por LUIS FELIPE GOMEZ GONZALEZ" — un nombre que ni de
  cerca se parece a lo que normalmente se teclea como "Destinatario" al crear el
  envío (ej. solo "Felipe"). Ahí encontré el bug de fondo: `getFelipeIfRecipient` en
  los 4 lugares donde se usa comparaba contra `shipment.recipientName`, que es texto
  libre capturado al CREAR el envío (antes de saber quién lo recibiría) — no contra
  `shipment.receivedByName`, el nombre que la propia persona confirma/teclea al
  recibir, que es mucho más probable que coincida con su nombre real registrado en
  Empleados. No era un problema de acentos: eran dos campos distintos.
- **Qué cambió:** `backend/src/routes/shipments.js` — los 4 call sites de
  `getFelipeIfRecipient` (`GET /public/:token`, `POST /public/:token/confirm`,
  `POST /public/:token/signature`, `GET /:id/reception-pdf`) ahora priorizan
  `shipment.receivedByName || shipment.recipientName` (o la variable local
  `receivedByName` ya disponible en el handler de confirmación), en vez de comparar
  solo contra `recipientName`.
- **Por qué:** para que el sistema reconozca a Felipe usando el nombre que él mismo
  confirma al recibir el envío, que es el dato más confiable disponible, en vez del
  nombre casual/corto que se haya escrito al despachar el envío.
- **Verificación:** `node --check src/routes/shipments.js` OK.
- **Nota:** si tras este fix el link sigue sin mostrar la opción de subir firma, el
  único dato pendiente de confirmar en la base de datos real es que la ficha de
  Empleado de Felipe tenga `sistemas.4@selectshop.com.mx` en "Correos corporativos" —
  eso no lo puedo verificar yo desde aquí.
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX: la firma de Felipe no se reconocía por un acento
- **Qué pasó:** el usuario reportó que en un link de envío ya confirmado, no le
  aparecía la opción de subir la firma. Encontré el bug real: `getFelipeIfRecipient`
  comparaba `shipment.recipientName` contra `Employee.name` con `.toLowerCase()` pero
  SIN quitar acentos — "Felipe Gómez" (como puede estar en Empleados) y "Felipe
  Gomez" (como se haya escrito al crear el envío) nunca coincidían, así que el
  sistema nunca reconocía que ese envío era de Felipe.
- **Qué cambió:** `backend/src/routes/shipments.js` — nueva `normalizeName()`
  (mismo criterio que ya se usa en el buscador de Mesa de Ayuda: `.normalize('NFD')`
  + quitar diacríticos) usada en `getFelipeIfRecipient` en vez de la comparación
  simple anterior.
- **Si después de este fix sigue sin aparecer**, hay 2 datos en la base de datos
  reales que no puedo verificar yo desde aquí — pídele a quien tenga acceso que
  confirme: (1) que la ficha de Empleado de Felipe tenga
  `sistemas.4@selectshop.com.mx` en "Correos corporativos", y (2) que el
  "Destinatario" capturado en ese envío sea su nombre tal cual está en Empleados
  (ej. si en Empleados dice "Felipe Gómez Ramírez" pero el envío dice solo "Felipe",
  no va a coincidir).
- **Verificación:** `node --check`; probé `normalizeName()` directamente confirmando
  que "Felipe Gómez" y "Felipe Gomez" ahora sí coinciden.
- **Commit(s):** (pendiente)

### 2026-07-17 — Reportar ticket: nueva categoría "Impresoras"
- **Qué pasó:** el usuario pidió una categoría propia de "Impresoras" en Mesa de
  Ayuda — antes "La impresora no imprime" vivía escondida como un problema más
  dentro de "Red / Conectividad", sin su propio botón.
- **Qué cambió:** `frontend/src/config/ticketCategories.js` — nueva categoría
  `impresora` (🖨️) con 6 problemas curados (no imprime, se atora el papel, falta
  tóner/tinta, mala calidad de impresión, no conecta, otro), todos clasificados como
  SLA "Periféricos". Se quitó "La impresora no imprime" de Red/Conectividad (ya no
  vive ahí, para no duplicarla). `backend/src/models/Ticket.js`,
  `frontend/src/pages/Tickets.jsx`, `MisTickets.jsx` — nueva entrada `impresora` en
  los 3 catálogos de tipos/etiquetas. El buscador de Mesa de Ayuda no necesitó ningún
  cambio — se genera del mismo catálogo, así que ya apunta solo a la tarjeta nueva
  con las palabras clave que se le dieron.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando: la
  tarjeta "Impresoras" aparece y funciona de punta a punta (`ticketType=impresora`,
  `slaHint=Periféricos` en el envío real), buscar "no imprime la impresora" apunta a
  Impresoras, y buscar "wifi" sigue apuntando a Red/Conectividad (sin regresión).
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos: habilitar la subida de firma en un envío ya confirmado
- **Qué pasó:** la firma reutilizable de Felipe (ver entrada anterior) solo se podía
  subir DURANTE la confirmación de recepción de un envío en curso — pero el usuario
  necesitaba habilitarla en un envío que ya se había hecho y confirmado antes, sin
  esperar a que llegara uno nuevo. El link público de un envío ya "recibido" solo
  mostraba la pantalla de "ya confirmado", sin ninguna forma de subir la firma ahí.
- **Qué cambió:**
  - `backend/src/routes/shipments.js` — nueva ruta pública `POST
    /public/:token/signature`, independiente de `/confirm`: solo guarda la imagen en
    la ficha de Felipe, sin importar el estatus del envío ni tocar ningún otro dato
    (a diferencia de `/confirm`, que sí exige que el envío siga sin confirmarse).
  - `frontend/src/pages/ConfirmarEnvio.jsx` — la pantalla de "recepción confirmada"
    ahora también incluye el campo para subir la firma cuando
    `needsSignatureUpload` sigue siendo verdadero (no depende del estatus, solo de
    si Felipe ya tiene una guardada) — usa esta nueva ruta, no `/confirm`.
- **Cómo usarlo:** el mismo link que ya se le compartió a Felipe para ese envío (el
  que ya está "recibido") ahora sirve para esto — no hace falta generar uno nuevo.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando que la
  sección de subir firma aparece en un envío ya "recibido" (cuando hace falta),
  que el envío del formulario pega a `/signature` (no a `/confirm`) como
  `multipart/form-data`, y que desaparece cuando ya no hace falta.
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos: firma escaneada de Felipe, reutilizable en el PDF de Recepción
- **Qué pasó:** el usuario pidió que Felipe (ÚNICAMENTE para envíos donde él es el
  destinatario) pueda subir una foto de su hoja de recepción firmada, para que de
  ahí en adelante todos sus PDFs de "Formato de Recepción" salgan ya con su firma
  real en vez de solo el nombre impreso — sin volver a pedírsela en cada envío. También
  pidió que ese PDF de recepción solo se pueda generar una vez que de verdad se
  confirmó la recepción (hoy se podía descargar en cualquier momento, incluso antes
  de confirmarse, lo cual no tenía sentido — no hay nombre/firma real que mostrar
  todavía).
- **Cómo se resolvió (con el usuario):** Felipe se identifica por su correo
  `sistemas.4@selectshop.com.mx` (resuelto contra su ficha de Empleado, mismo patrón
  que ya existía para Gerente de Sistemas) — como `Shipment.recipientName` es texto
  libre (no hay referencia a Empleado), se compara por nombre. Subir la foto es
  opcional (con recordatorio en cada envío hasta que la suba una vez), no bloquea la
  confirmación de recepción si tiene problemas para subirla en el momento.
- **Qué cambió:**
  - `backend/src/models/Employee.js` — nuevos campos `signatureImageData` (Buffer),
    `signatureImageMimeType`, `signatureUploadedAt` — firma reutilizable, no atada a
    un envío en particular.
  - `backend/src/routes/shipments.js` — `GET /public/:token` ahora regresa
    `needsSignatureUpload` (true solo si el destinatario es Felipe y todavía no tiene
    firma guardada). `POST /public/:token/confirm` acepta un archivo opcional
    `signatureImage` (multer, solo JPG/PNG — son los únicos formatos que pdfkit
    puede dibujar directo sin conversión) y lo guarda en la ficha de Felipe si
    aplica. `GET /:id/reception-pdf` ahora exige `status === 'recibido'` (400 si
    no), y le pasa la firma guardada de Felipe al PDF cuando corresponde.
  - `backend/src/utils/shipmentPdf.js` — `signatureRow()` ahora puede dibujar una
    imagen (`doc.image()`) arriba de la línea de firma en vez del nombre impreso,
    cuando se le pasa una; si la imagen falla al dibujarse (formato corrupto), no
    truena el PDF completo, solo se omite. `buildShipmentReceptionPdf(shipment,
    recipientSignatureImage)` gana ese segundo parámetro opcional.
  - `frontend/src/pages/ConfirmarEnvio.jsx` — nuevo campo de archivo (opcional) en el
    paso de "Confirmar recepción", solo visible cuando el backend dice que hace
    falta; el envío del formulario pasa a `multipart/form-data` para poder incluirlo.
  - `frontend/src/pages/Shipments.jsx` — el botón "⬇ Recepción" ahora se deshabilita
    hasta que el envío esté en estatus "recibido", en vez de fallar con una alerta al
    intentarlo antes.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando que el
  campo de subida aparece/desaparece según `needsSignatureUpload` y que el envío del
  formulario manda el archivo como `multipart/form-data`. Generé ambos PDFs de
  recepción (con y sin imagen de firma) directamente con `buildShipmentReceptionPdf`
  y los revisé visualmente (vía miniatura de Quick Look) — la imagen se incrusta
  correctamente en la caja de firma cuando existe, y el nombre impreso sigue
  funcionando igual que antes cuando no hay firma guardada.
- **Commit(s):** (pendiente)

### 2026-07-17 — Empleados: columna AnyDesk en la tabla
- **Qué pasó:** el usuario pidió ver en la tabla de Empleados el AnyDesk ID de la(s)
  computadora(s) asignada(s), para tenerlo a la mano sin entrar a Activos.
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — `load()` arma un mapa
  `anydeskByEmployee` (laptop/escritorio/all-in-one asignado → su
  `specs.anydesk`) a partir de la misma llamada a `GET /assignments` que ya se
  hacía (mismo patrón que el mapa de teléfono agregado antes). Nueva columna
  "AnyDesk" en la tabla, entre "Departamento" y "Acciones" — si tiene más de un
  equipo con AnyDesk capturado, se muestran todos separados por coma.
- **Verificación:** `npm run build`; Playwright con 3 casos: un equipo con AnyDesk,
  dos equipos con AnyDesk (se unen con coma), y alguien sin computadora asignada
  (guión). Revisé la captura — se ve limpio, formato código para el ID.
- **Commit(s):** (pendiente)

### 2026-07-17 — Empleados: precargar "Teléfono" con el número del celular asignado
- **Qué pasó:** el usuario pidió que, al editar un empleado que tiene un celular
  como activo asignado, el campo "Teléfono" se llene solo con el número de línea de
  ese celular (`Asset.specs.lineNumber`, el mismo campo que ya se captura al dar de
  alta un celular en Activos).
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — `load()` ahora también arma
  un mapa `phoneByEmployee` (celular asignado → su `specs.lineNumber`) a partir de
  la misma llamada a `GET /assignments` que ya se hacía. `openEdit(emp)` usa ese
  mapa como respaldo SOLO si `emp.phone` está vacío — si ya hay un teléfono
  capturado a mano, no se toca.
- **Verificación:** `npm run build`; Playwright con 3 casos: empleado sin teléfono
  con celular asignado (se precarga), empleado con teléfono ya capturado y celular
  asignado (no se sobreescribe), empleado sin teléfono ni celular (queda vacío,
  igual que antes).
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX: "Solicitar Cuenta/Recurso/Ingreso" eran caminos sin regreso
- **Qué pasó:** el usuario reportó que al entrar a las tarjetas de Mesa de Ayuda como
  "Acceso a un sistema o correo", ya no podía regresar a Solicitudes. Causa: esas 3
  páginas (`SolicitarCuenta.jsx`, `SolicitarRecurso.jsx`, `SolicitarIngreso.jsx`) son
  públicas a propósito (no requieren sesión, para que RH pueda compartir el link a
  quien lo necesite) y por eso NUNCA usaron `PortalLayout` — es decir, nunca tuvieron
  el sidebar con el botón "Solicitudes". Quien llegaba ahí desde Mesa de Ayuda se
  quedaba sin ninguna forma de regresar dentro de la app.
- **Qué cambió:** `frontend/src/pages/SolicitarCuenta.jsx`, `SolicitarRecurso.jsx`,
  `SolicitarIngreso.jsx` — nuevo link "← Volver a Mesa de Ayuda" arriba del
  encabezado (en el formulario y en la pantalla de éxito tras enviar). Nueva clase
  `.backLink` en `SolicitarCuenta.module.css` (compartida por las 3).
- **Verificación:** `npm run build`; Playwright entrando a las 3 tarjetas desde Mesa
  de Ayuda y confirmando que el link "Volver a Mesa de Ayuda" aparece y de verdad
  regresa a `/mesa-de-ayuda`.
- **Commit(s):** (pendiente)

### 2026-07-17 — Correo de tickets: plantilla formal en vez del formato de Telegram
- **Qué pasó:** el usuario pidió mejorar el contenido del correo — el formato de
  texto plano (copiado del mensaje de Telegram) no era apropiado para un correo
  formal de empresa.
- **Qué cambió:**
  - `backend/src/utils/emailTemplates.js` (nuevo) — plantilla HTML profesional,
    hecha a prueba de Outlook de escritorio a propósito (layout de tablas +
    estilos inline únicamente, nada de flexbox/grid ni imágenes externas, ya que
    el motor de Outlook no las soporta bien y es justo el cliente que usa el
    equipo, según la captura que mostró el usuario). Incluye: encabezado con marca
    de SelectShop (`#E8431A`), aviso destacado en rojo si el ticket "impide
    trabajar", tabla de datos precisos (folio, fecha de reporte, reportado por,
    tipo de soporte, prioridad con color, Categoría de Falla SLA + fecha límite de
    resolución si ya se clasificó, equipo, aplicación), asunto y descripción en
    secciones separadas, botón "Ver ticket en el panel" (enlaza a
    `${FRONTEND_URL}/tickets`), y pie de página aclarando que es un aviso
    automático que no se debe responder.
  - `backend/src/routes/tickets.js` — `POST /mine` ahora arma el correo con
    `buildTicketNotificationEmail(...)` en vez del HTML ad-hoc anterior.
- **Verificación:** `node --check`; rendericé la plantilla con datos de ejemplo (un
  caso completo con SLA/prioridad alta/impide trabajar, y un caso mínimo sin nada
  de eso) y la revisé visualmente vía captura — se ve limpia y formal en ambos
  casos, sin secciones vacías cuando faltan datos opcionales.
- **Commit(s):** (pendiente)

### 2026-07-17 — Corrección: Seguridad va solo al Gerente de Sistemas, no a todos
- **Qué pasó:** al configurar las credenciales de Azure junto con el usuario, aclaró
  que los tickets de Seguridad deben llegarle SOLO a Bruno (Gerente de Sistemas) por
  el momento — mi implementación anterior se los mandaba a él ADEMÁS de todo el resto
  de Sistemas (interpretación aditiva de "que le lleguen a él los de seguridad").
- **Qué cambió:** `backend/src/routes/tickets.js` — `getTicketEmailRecipients` ahora
  regresa temprano `[GERENTE_SISTEMAS_EMAIL]` en exclusiva para `ticketType ===
  'seguridad'`, sin pasar por el enrutamiento de área ni juntarse con el resto de
  Sistemas. La regla de "Solicitud de Pagos" no cambió (sigue sumándose al resto de
  Sistemas, no se pidió cambiarla).
- **Verificación:** `node --check`.
- **Commit(s):** (pendiente)

### 2026-07-17 — Aviso de tickets por correo (Microsoft Graph), enrutado por área
- **Qué pasó:** el usuario mostró cómo el sistema de tickets ANTERIOR (Zoho o similar)
  mandaba cada ticket nuevo por correo a una lista fija de ~6 personas, sin importar
  de qué se tratara — y pidió que, al conectar la notificación por correo de este
  sistema (vía Microsoft Graph/Azure, además de Telegram que ya existe), NO se repita
  ese problema: que se reparta por área en vez de mandarse a todos. Aclaró 2 reglas
  fijas: Gerente de Sistemas debe recibir siempre los tickets de Seguridad y los de
  su aplicación "Solicitud de Pagos".
- **Decisiones tomadas con el usuario:** (1) las áreas se calculan reusando permisos
  que ya existen (lider.erp/analista.erp = área ERP, mismo criterio que la partición
  de tickets ERP; el resto de admins de Sistemas = área sistema-IT) — sin campos
  nuevos que alguien tenga que llenar a mano; (2) el correo se agrega COMO CANAL
  ADICIONAL, Telegram se queda igual; (3) la aplicación "Solicitud de Pagos" no
  existía en el catálogo — queda pendiente que el usuario la dé de alta en
  Aplicaciones Internas con ese nombre exacto para que el enrutamiento la reconozca.
- **Qué cambió:**
  - `backend/src/utils/graphMail.js` (nuevo) — envío de correo vía Microsoft Graph
    (flujo de credenciales de cliente, sin login de usuario), mismo patrón
    best-effort que `utils/telegram.js`: nunca rompe el flujo si Azure falla o si
    faltan las variables de entorno (queda inerte hasta configurarlas).
  - `backend/src/routes/tickets.js` — `getTicketEmailRecipients(ticket, appName)`
    calcula los destinatarios: tickets `erp` → equipo ERP; el resto → todo admin de
    Sistemas ("área sistema-IT"); tickets `seguridad` y los de la app "Solicitud de
    Pagos" agregan SIEMPRE al Gerente de Sistemas. Se dispara junto con la
    notificación de Telegram existente al crear un ticket (`POST /tickets/mine`),
    sin bloquear la respuesta al empleado si falla.
  - `README.md` — documentadas las variables de entorno nuevas (`AZURE_TENANT_ID`,
    `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `NOTIFICATIONS_FROM_EMAIL`) y, de paso,
    las de Telegram que ya existían pero nunca se habían documentado ahí.
- **Pendiente de acción manual (fuera de este repo):** el usuario todavía necesita
  crear un App Registration en Azure AD (permiso de aplicación `Mail.Send` con
  consentimiento de admin) y cargar esas 4 variables en Render — hasta entonces el
  código queda inerte (no manda nada, no rompe nada), igual que Telegram antes de
  tener su bot configurado. También falta dar de alta "Solicitud de Pagos" en
  Aplicaciones Internas.
- **Verificación:** `node --check` en los 2 archivos nuevos/modificados. No se pudo
  probar el envío real (requiere las credenciales de Azure, que todavía no existen)
  ni la consulta de usuarios por rol contra una base de datos real (sin acceso a
  Mongo desde este entorno) — la lógica de enrutamiento se verificó por revisión de
  código, replicando exactamente el mismo criterio ya probado de `isErpOnlyUser`.
- **Commit(s):** (pendiente)

### 2026-07-17 — El checkbox de RH solo se ofrece a quien de verdad es de RH
- **Qué pasó:** el usuario vio que el checkbox nuevo de "Alta de un nuevo ingreso"
  aparecía en el formulario de edición de TODOS los empleados, y no le gustó — pidió
  que solo se ofrezca a quien tenga "Recursos Humanos" en su Área.
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — nuevo helper `isRHArea(area)`
  (compara sin distinguir mayúsculas/espacios, ya que "Área" es texto libre, no un
  catálogo fijo). El checkbox ahora solo se muestra en el modal cuando
  `form.area` es "Recursos Humanos" — para cualquier otro empleado, ese campo del
  formulario ni aparece.
- **Para activarlo en Nicolás:** su campo "Área" tiene que decir exactamente
  "Recursos Humanos" (sin importar mayúsculas) para que el checkbox aparezca al
  editarlo — si su área dice otra cosa (ej. "RH" a secas), hay que corregirla primero.
- **Verificación:** `npm run build`; Playwright confirmando que el checkbox está
  oculto para un empleado con área "Ventas" y visible para uno con área
  "Recursos Humanos".
- **Commit(s):** (pendiente)

### 2026-07-17 — "Alta de un nuevo ingreso" restringido a RH (Nicolás)
- **Qué pasó:** el usuario pidió que el login de Mesa de Ayuda jale los datos del
  empleado desde su correo corporativo — al investigar, esto YA funcionaba (el
  campo de login acepta correo corporativo o no. de empleado indistintamente,
  contra `Employee.corporateEmails`, y desde ahí ya se jalan los activos
  asignados). Lo que sí faltaba era su segundo pedido: que solo Nicolás (RH,
  `reclutamiento.1@selectshop.com.mx`) pueda ver/enviar "Alta de un nuevo
  ingreso" — hoy esa página es 100% pública (sin sesión) y la tarjeta aparece
  en el menú de Mesa de Ayuda para cualquier empleado logueado, así que
  cualquiera podía mandar un ingreso sin querer.
- **Qué cambió:**
  - `backend/src/models/Employee.js` — nuevo campo `canManageOnboarding`
    (booleano, default `false`).
  - `backend/src/routes/employeeAuth.js` — el login/activación del portal ahora
    incluye este flag en la respuesta y en el JWT.
  - `frontend/src/components/EmployeeLoginWidget.jsx` — lo guarda en
    `localStorage.employeeUser`.
  - `frontend/src/pages/MesaDeAyuda.jsx` — la tarjeta "Alta de un nuevo ingreso"
    y la sugerencia del buscador para ese mismo tema solo aparecen si
    `canManageOnboarding` es verdadero. El link público (`/solicitar-ingreso`)
    sigue funcionando sin login — a propósito, según lo decidido: por si
    Nicolás lo comparte para que alguien más lo llene en su nombre.
  - `frontend/src/pages/Employees.jsx` — nuevo checkbox "Puede ver y enviar
    'Alta de un nuevo ingreso' en Mesa de Ayuda (RH)" en el modal de edición,
    mismo patrón que los permisos de Users.jsx.
- **Pendiente de acción manual:** no tengo acceso directo a la base de datos de
  producción desde aquí — después de que esto despliegue, hay que entrar a
  Empleados, buscar a Nicolás (reclutamiento.1@selectshop.com.mx) y marcar la
  casilla nueva para que el permiso quede activo de verdad.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando: (1)
  un empleado sin el permiso no ve la tarjeta ni la sugerencia del buscador; (2)
  alguien con el permiso sí las ve; (3) el login real (lookup→login) guarda el
  flag correctamente en `localStorage`; (4) el checkbox en Employees.jsx se
  guarda vía `PUT /employees/:id`.
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX: nadie podía editar tickets/envíos asignados a sí mismo
- **Qué pasó:** el usuario reportó que ya no podía hacer nada en un ticket, ni
  siquiera asignándoselo a sí misma — los campos aparecían deshabilitados. Descarté
  primero que fuera algo de los cambios de esta noche (SLA, notas internas, ERP):
  reproduje su escenario exacto con Playwright contra el build en producción y el
  candado NO debía dispararse, así que el bug estaba en otro lado. Encontrado: el
  login (`POST /auth/login`) nunca mandaba el `id`/`_id` del usuario en la
  respuesta, y `Login.jsx` tampoco lo guardaba en `localStorage.user` — así que
  `currentUser.id` siempre fue `undefined` en el frontend. La regla "un ticket/envío
  asignado sigue siendo de quien lo atiende" (`ticket.assignedTo._id ===
  currentUser.id` en Tickets.jsx, `s.sentBy === currentUser.id` en Shipments.jsx)
  comparaba contra ese `undefined` — nunca coincidía con nadie, excepto el Gerente
  de Sistemas (que se valida por email, no por id). Esto llevaba roto desde que se
  construyó esa función (antes de esta noche), no es una regresión de hoy — solo
  ahora alguien lo notó al probar exactamente ese caso.
- **Qué cambió:** `backend/src/routes/auth.js` — `POST /login` ahora incluye `id:
  user._id` en la respuesta. `frontend/src/pages/Login.jsx` — lo guarda en
  `localStorage.user.id`.
- **Importante — acción para quien ya tenía sesión iniciada:** este fix aplica en el
  próximo login. Quien ya estaba con sesión abierta (como Lilly) sigue con el
  `localStorage.user` viejo (sin `id`) hasta que cierre sesión y vuelva a entrar, o
  hasta que el token expire solo (8h). **Cerrar sesión y volver a entrar arregla el
  problema de inmediato.**
- **Verificación:** `node --check`; `npm run build`; Playwright simulando el flujo
  real de login (no solo inyectando localStorage a mano, para no repetir el mismo
  punto ciego) y confirmando que, tras loguearse, un ticket asignado a uno mismo ya
  no aparece bloqueado.
- **Commit(s):** (pendiente)

### 2026-07-17 — Tickets: SLA automático desde el problema específico elegido
- **Qué pasó:** el usuario preguntó si el SLA ya existente (10 Categorías de Falla con
  nivel/prioridad/tiempos de respuesta y resolución, `Ticket.SLA_CATALOG`) debía
  aplicarse también a lo que se acaba de agregar (el wizard de problemas
  específicos), en vez de depender del checkbox "¿esto me impide trabajar?" —
  argumentando que todo mundo lo va a marcar aunque no sea cierto. Estuve de acuerdo:
  el propio código ya tenía un comentario reconociendo justo este problema
  ("blocksWork... no una escala de prioridad que nadie llena bien"), y hoy el SLA
  solo se asignaba a mano por un admin después de reportado, nunca automático.
  Mapeé los problemas específicos contra las 10 categorías del SLA oficial; 2 no
  tenían un cajón que les quedara bien (Seguridad, Aplicaciones) y se resolvieron
  con el usuario: Seguridad gana una categoría nueva en el catálogo
  ("Incidentes de Seguridad", prioridad crítica); Aplicaciones se queda sin SLA
  automático porque cada app interna puede tener un responsable distinto.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nueva fila `Incidentes de Seguridad` en
    `SLA_CATALOG` (nivel 3, prioridad crítica, respuesta 15 min, resolución 120 min
    — mismo nivel de urgencia que "Servidores y Core").
  - `backend/src/routes/tickets.js` — se extrajo `applySlaCategory(ticket,
    slaCategory)`, compartida entre `PUT /:id/sla-category` (clasificación manual,
    sin cambios de comportamiento) y la nueva lógica en `POST /mine`: si el
    problema específico elegido trae un `slaHint` reconocido, el ticket queda
    clasificado (nivel/prioridad/fechas límite) desde que se crea. Un valor
    desconocido o manipulado simplemente se ignora, sin tronar el envío.
  - `frontend/src/config/ticketCategories.js` — cada problema específico ganó un
    campo opcional `sla` con la Categoría de Falla que le corresponde (ej. "No
    enciende" → Hardware Local; "El teclado o el mouse no funciona" → Periféricos,
    NO Hardware Local — el SLA oficial ya los separaba; Outlook/OneDrive/Teams/
    Excel → Ofimática y Archivos, no "Software y Sistema Operativo" en general).
    Las categorías Seguridad y ERP quedaron mapeadas por completo (incluido su
    "Otro" respectivo) porque toda la categoría ES esencialmente un solo nivel de
    urgencia; Aplicaciones se dejó sin `sla` a propósito.
  - `frontend/src/pages/ReportarTicket.jsx` — captura el `sla` del problema elegido
    y lo manda como `slaHint` al crear el ticket.
  - `frontend/src/pages/Tickets.jsx` — se agregó "Incidentes de Seguridad" a la
    copia del catálogo que ya tenía (duplicada del backend solo para pintar el
    selector, como ya se documentaba ahí).
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando el
  `slaHint` correcto para 9 problemas específicos de distintas categorías,
  confirmando que Aplicaciones y Otro NO mandan `slaHint` (se quedan sin
  clasificar, como antes).
- **Commit(s):** (pendiente)

### 2026-07-17 — Selector de equipo en tickets: solo el tipo genérico, sin marca/modelo/serie
- **Qué pasó:** el usuario pidió que el selector "¿sobre cuál de tus equipos es
  esto?" (Reportar Ticket) no le muestre a quien reporta la marca/modelo/serie del
  equipo — solo el tipo genérico: "Celular" si es celular, "Laptop" o "Escritorio"
  si es de cómputo.
- **Qué cambió:** `frontend/src/pages/ReportarTicket.jsx` — `assetLabel()` ahora
  regresa solo `ASSET_TYPE_LABELS[a.type]` (ej. "Laptop", "Celular", "Escritorio"),
  sin concatenar `brand`/`model`/`serialNumber` como antes.
- **Nota:** si alguna vez alguien tiene 2 equipos del MISMO tipo asignados (ej. 2
  laptops), el selector los mostraría igual dos veces ("Laptop"/"Laptop") — sigue
  funcionando (cada opción liga al equipo correcto por su _id interno), solo que no
  se distinguirían a simple vista entre sí. No lo resolví porque no se pidió y es un
  caso raro (la mayoría tiene un equipo por tipo) — avisar si se quiere un
  desempate visual para ese caso.
- **Verificación:** `npm run build`; Playwright confirmando que el selector muestra
  "Laptop"/"Celular" en vez del detalle de marca/modelo/serie.
- **Commit(s):** (pendiente)

### 2026-07-17 — Quitar el botón "Volver al panel" del portal de empleado
- **Qué pasó:** el usuario pidió quitar el botón "Volver al panel" de la Mesa de
  Ayuda — los empleados no deben tener acceso al panel de administración en
  absoluto. Ya existía una condición (`hasAdminSession`, solo se mostraba si el
  navegador también tenía un `token` de admin en `localStorage`, pensado para
  cuando alguien de Sistemas usa ambas sesiones a la vez), pero el usuario prefirió
  quitarlo del todo en vez de depender de esa condición.
- **Qué cambió:** `frontend/src/components/PortalLayout.jsx` — se eliminó el
  `NavLink` "Volver al panel" y la variable `hasAdminSession` que lo controlaba.
- **Verificación:** `npm run build`; Playwright confirmando que el botón no
  aparece ni siquiera con un `token` de admin presente en `localStorage`.
- **Commit(s):** (pendiente)

### 2026-07-17 — Buscador de Mesa de Ayuda: también de lo general a lo particular
- **Qué pasó:** el usuario preguntó si el buscador debía seguir el mismo criterio de
  "general a particular" que ya tiene el wizard de Reportar Ticket. Al revisar el
  código encontré 2 problemas reales: (1) el buscador (`SEARCH_TOPICS` en
  `MesaDeAyuda.jsx`) era un catálogo de palabras clave SEPARADO del wizard
  (`CATEGORIES` en `ReportarTicket.jsx`) — ya se había desincronizado una vez (faltó
  "Aplicaciones" cuando se agregó) y le iba a volver a pasar; (2) aunque el texto
  buscado fuera muy específico (ej. "no me llegan correos de outlook"), el resultado
  solo llevaba a la categoría general (Software), todavía a un clic de lo particular.
- **Qué cambió:**
  - `frontend/src/config/ticketCategories.js` (nuevo) — única fuente de verdad para
    ambos archivos: exporta `CATEGORIES` (antes vivía solo en `ReportarTicket.jsx`),
    ahora con `keywords` por categoría Y por cada problema específico dentro de ella.
    `ReportarTicket.jsx` importa de aquí en vez de definir su propia copia.
  - `frontend/src/pages/ReportarTicket.jsx` — nuevo soporte para `?problema=<texto
    exacto>` (y `?app=<id>` para la categoría Aplicaciones, resuelto una vez que el
    catálogo de apps carga): si el buscador ya resolvió el problema específico, el
    formulario llega directo precargado, saltándose TAMBIÉN el paso 2 (no solo la
    categoría) — de lo general a lo particular sin pasos de más.
  - `frontend/src/pages/MesaDeAyuda.jsx` — el buscador ahora arma sus resultados de
    ticket dinámicamente desde `CATEGORIES`: por cada categoría se queda con el MEJOR
    match posible (un problema específico si alguno coincidió — más particular, gana
    siempre —, si no la categoría en general como respaldo), nunca ambos a la vez.
    También se agregó el catálogo de Aplicaciones Internas al buscador, para llegar
    directo a una app específica (ej. "no funciona Cuentas por Pagar"). Las
    solicitudes (pedir algo nuevo) se quedaron en su propio catálogo aparte, sin este
    nivel de detalle porque no lo necesitan.
  - Se encontró y corrigió un bug real de scoring durante las pruebas: el matching
    "flojo" (por palabra suelta) se aplicaba también a frases completas, así que una
    palabra genérica compartida (ej. "necesito") hacía ganar a la categoría con MÁS
    frases que empezaban igual, no a la más relevante ("necesito una cuenta de gmail
    nueva" apuntaba a "Equipo o accesorio" en vez de "Correo Gmail"). Se limitó el
    matching flojo a keywords de una sola palabra.
- **Verificación:** `npm run build`; Playwright con 6 búsquedas confirmando que una
  consulta genérica lleva a la categoría, una específica salta directo al formulario
  precargado (o a la nota interactiva de licencia, cuando aplica), una que nombra una
  aplicación específica llega directo con `appRef` resuelto, y que las solicitudes
  (no-tickets) siguen funcionando. Reconfirmé también el wizard completo y la
  navegación de Mesa de Ayuda sin regresiones.
- **Commit(s):** (pendiente)

### 2026-07-17 — Reportar ticket: categoría Seguridad, síntomas reales de M365, aviso de licencia y pantalla completa
- **Qué pasó:** se investigó en internet cómo categorizan tickets las mesas de ayuda
  reales (ITIL/ITSM, Freshservice/Zendesk/ServiceNow, ERPs tipo Odoo) y las diferencias
  entre licencias de Microsoft 365 Básica/Estándar, para enriquecer el catálogo de
  "problemas específicos" con ejemplos reales en vez de inventados. Hallazgo clave: casi
  toda referencia tiene una categoría de "Seguridad" (correo sospechoso/phishing) que a
  nosotros nos faltaba por completo, y M365 Básico NO incluye las apps de escritorio de
  Office (solo la versión web) — una causa real y común de tickets que en realidad son
  de licencia, no de falla. El usuario pidió implementar 3 puntos de esa investigación
  (Seguridad, síntomas de M365, aviso de licencia), insistiendo en que como los
  empleados no saben nada de Sistemas, todo debe quedar fácil/didáctico/interactivo, y
  además ajustar la pantalla para usar todo el ancho disponible (antes el panel tenía
  un tope de 700px con mucho espacio vacío al lado).
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nuevo tipo `seguridad` en `TICKET_TYPES`/
    `TICKET_TYPE_LABELS`.
  - `frontend/src/pages/ReportarTicket.jsx` — nueva categoría "🛡️ Seguridad" (correo
    sospechoso, cuenta posiblemente vulnerada, enlace raro pidiendo contraseña).
    "Software" ganó problemas específicos reales de M365 en lenguaje simple ("Outlook
    no me manda o no me llegan correos", "OneDrive no guarda o no sincroniza mis
    archivos", "Teams no tiene audio o video"). Nuevo problema interactivo "No
    encuentro Word, Excel o PowerPoint en mi computadora": en vez de ir directo al
    formulario, muestra una nota explicando que eso suele ser el plan de licencia
    (versión web, no de escritorio) y da a elegir entre "Ir a Solicitar Recurso" (pedir
    el upgrade) o "Aún así, reportarlo como ticket" (por si de verdad es una falla).
  - `frontend/src/pages/ReportarTicket.module.css` — se quitó el `max-width: 700px` del
    panel (ahora usa todo el ancho disponible, pedido explícito); las tarjetas de
    categoría pasan a `auto-fill` para aprovechar el espacio con más columnas en
    pantallas anchas. El paso final (datos del ticket) se limita a 640px con una nueva
    clase `.formWrap` — un input de texto de 1300px se lee peor, no mejor.
  - `frontend/src/pages/Tickets.jsx`, `MisTickets.jsx`, `MesaDeAyuda.jsx` — nueva
    entrada "Seguridad" en catálogos de etiquetas y un tema nuevo en el buscador de
    Mesa de Ayuda (phishing, correo sospechoso, "me hackearon"...).
- **Verificación:** `node --check`; `npm run build`; Playwright: categoría Seguridad
  completa de punta a punta, lista de Software con los nuevos síntomas de M365, la nota
  de licencia se muestra en vez del formulario y ambos botones (ir a Solicitudes /
  reportar de todos modos) funcionan, medición real del ancho del panel a 1600px de
  viewport (1288px, ya no 700px) con el formulario final limitado a 640px, envío
  end-to-end con `ticketType=seguridad`. Reconfirmé el buscador de Mesa de Ayuda sin
  regresiones.
- **Commit(s):** (pendiente)

### 2026-07-17 — Reportar ticket: wizard de 2 pasos (categoría → problema específico)
- **Qué pasó:** el usuario vio el formulario de "Reportar un problema" (radio buttons
  planos: Hardware/Software/Red/Cuenta/ERP/Otro) y no le gustó — lo sintió
  desordenado. Pidió volver a la idea de tarjetas independientes por categoría, pero
  con contenido curado y específico por cada una (ej. bajo "Software": problemas con
  Office 365, lentitud, etc.), no la misma lista genérica repetida. Aclaró además que
  "Software" y "Aplicaciones" NO son lo mismo: un programa instalado en tu equipo vs.
  una página o sistema interno de la empresa — deben ser botones separados. Pidió que
  el flujo siempre vaya de lo general a lo particular.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nuevo tipo `aplicacion` en `TICKET_TYPES`/
    `TICKET_TYPE_LABELS`, separado de `software`.
  - `frontend/src/pages/ReportarTicket.jsx` — reescrito como wizard de 2 pasos: 1)
    7 tarjetas de categoría (Hardware, Software, Aplicaciones, Red/Conectividad,
    Cuenta/Acceso, ERP, Otro), cada una con su propia descripción; 2) lista de
    problemas específicos SOLO de esa categoría (ej. Hardware: "No enciende",
    "Pantalla no da imagen"...; Software: "Windows lento", "Microsoft 365", "Macros o
    plantillas de Excel"...). La categoría "Aplicaciones" arma su lista del paso 2
    dinámicamente desde el catálogo de Aplicaciones Internas (antes ese selector vivía
    escondido dentro de "Software" — ya se quitó de ahí). Elegir un problema
    específico precarga el Asunto (editable) y salta al formulario final
    (equipo/descripción/adjuntar, sin repetir la categorización). "Otro" salta directo
    al formulario pidiendo su propio detalle libre, sin paso 2 (no aplica una lista
    curada para "no encaja en las anteriores"). El buscador de Mesa de Ayuda
    (`?tipo=X`) sigue funcionando: ahora salta directo al paso 2 de la categoría ya
    resuelta por la búsqueda.
  - `frontend/src/pages/Tickets.jsx`, `MisTickets.jsx` — nueva entrada "Aplicaciones"
    en los catálogos de etiquetas (los tabs/desgloses ya eran dinámicos, no
    requirieron más cambios).
  - `frontend/src/pages/MesaDeAyuda.jsx` — el buscador tenía "aplicacion" como palabra
    clave de Software por error (quedó así desde la sesión anterior); se corrigió y se
    agregó un tema propio "Aplicaciones — reportar ticket".
- **Verificación:** `node --check`; `npm run build`; Playwright con 7 escenarios
  (categoría→problema→asunto precargado, Software sin selector de app, Aplicaciones
  con catálogo dinámico, Otro sin paso 2, `?tipo=` saltando directo al paso 2,
  navegación "Cambiar categoría", envío end-to-end confirmando `ticketType=aplicacion`
  en el POST) — todos pasaron. Reconfirmé el buscador de Mesa de Ayuda sin
  regresiones tras el cambio de keywords.
- **Commit(s):** (pendiente)

### 2026-07-17 — Mesa de Ayuda: buscador interactivo tipo centro de ayuda
- **Qué pasó:** el usuario pidió un buscador como el de Google/un centro de ayuda,
  donde la persona escriba su problema en sus propias palabras (ej. "no me funciona
  la macros") y se le sugiera a dónde ir, en vez de tener que adivinar en cuál de las
  4 tarjetas encaja.
- **Qué cambió:** `frontend/src/pages/MesaDeAyuda.jsx` — nuevo campo de búsqueda
  arriba de las 4 tarjetas (que se quedan igual, como respaldo para navegar a mano).
  Trae un catálogo curado de 13 "temas" (5 tipos de ticket + 3 tipos de solicitud de
  cuenta + 3 tipos de solicitud de recurso + alta de ingreso), cada uno con su propia
  lista de palabras/frases clave y su ruta real de destino (reutilizando las mismas
  rutas `?tipo=...` que ya existían). Conforme se escribe, se compara el texto contra
  esas palabras clave (frase completa = coincidencia fuerte; palabra suelta de 4+
  letras parecida = coincidencia débil) y se muestran hasta 5 sugerencias ordenadas
  por relevancia; cada una navega directo al formulario correcto en un clic. Sin
  coincidencias, se avisa explícitamente para que la persona use las tarjetas de
  abajo. Todo el matching es local (sin IA ni servicio externo) — un catálogo chico y
  controlado como este no lo necesita.
- **Verificación:** `npm run build`; Playwright probando 7 búsquedas distintas (incluida
  la del ejemplo del usuario, "no me funciona la macros" → Software) confirmando que
  cada una sugiere el destino correcto y navega bien al hacer clic. Se encontró y
  corrigió un falso positivo real durante la prueba (una palabra de 3 letras como
  "que" calzaba por accidente dentro de "bloqueada") subiendo el umbral de coincidencia
  débil a 4+ letras.
- **Commit(s):** (pendiente)

### 2026-07-17 — Mesa de Ayuda: quitar la pantalla intermedia redundante
- **Qué pasó:** el usuario reportó (con capturas) que "Tengo un problema o algo no
  funciona" llevaba a una pantalla intermedia (Hardware/Software/Red/Cuenta/Otro como
  tarjetas) que luego, al elegir una, mandaba al formulario real de reportar ticket —
  el cual vuelve a mostrar EXACTAMENTE la misma lista, ahora como radio buttons. Dos
  pasos preguntando lo mismo. Al revisar el código encontré que el mismo patrón
  (pantalla intermedia que solo repite la lista del formulario de destino) también
  existía en "Acceso a un sistema o correo" (`SolicitarCuenta.jsx`) y "Equipo,
  accesorio o servicio" (`SolicitarRecurso.jsx`); el usuario pidió corregir los 3.
  Bono: la pantalla intermedia de tickets ni siquiera tenía la opción "ERP" (quedó
  desactualizada cuando se agregó ese tipo), así que además de redundante estaba
  desincronizada.
- **Qué cambió:** `frontend/src/pages/MesaDeAyuda.jsx` — se eliminó por completo la
  capa `STEPS` (la segunda pregunta con su propio card-grid) y el estado `step` que la
  controlaba. Las 4 tarjetas raíz ("Acceso a un sistema o correo", "Equipo, accesorio o
  servicio", "Alta de un nuevo ingreso", "Tengo un problema o algo no funciona") ahora
  navegan DIRECTO al formulario real (`/solicitar-cuenta`, `/solicitar-recurso`,
  `/solicitar-ingreso`, `/reportar-ticket` respectivamente) en un solo clic — la
  clasificación real (tipo de soporte, tipo de cuenta, tipo de recurso) se sigue
  preguntando una sola vez, dentro de esos formularios, que ya la tenían y que
  siguieron sin cambios. Las descripciones de las tarjetas se actualizaron para seguir
  dando una vista previa de las opciones (ej. "Hardware, software, red, cuenta/acceso,
  ERP...") sin necesidad de una pantalla extra.
- **Verificación:** `npm run build`; Playwright confirmando que las 4 tarjetas
  navegan cada una a su ruta esperada en un solo clic (sin pantalla intermedia).
- **Commit(s):** (pendiente)

### 2026-07-17 — Corrección: la etiqueta de tickets ERP mencionaba SAE por error
- **Qué pasó:** al agregar el tipo de ticket "ERP" (partición para lider.erp/
  analista.erp), la etiqueta que ve el empleado decía "🏭 ERP (SAE, módulos,
  reportes...)". El usuario aclaró que SAE, COI y NOI son OTRAS aplicaciones que aún
  no se quieren incluir en esta partición — mencionar SAE ahí era engañoso: alguien
  con un problema de SAE podría marcar "ERP" por error (llegando a quien no debe), o
  alguien con un problema real del ERP no reconocerlo si asocia la etiqueta con SAE.
  Los empleados sí conocen el sistema simplemente como "ERP", así que el nombre en sí
  no era el problema — el paréntesis con el ejemplo equivocado sí.
- **Qué cambió:** `frontend/src/pages/ReportarTicket.jsx` — la etiqueta pasa a
  "🏭 ERP (módulos, reportes, accesos...)", sin mencionar SAE/COI/NOI. `Tickets.jsx` y
  `MisTickets.jsx` ya decían solo "ERP" sin ese paréntesis, no requirieron cambio.
- **Verificación:** `npm run build`.
- **Commit(s):** (pendiente)

### 2026-07-17 — Reportar ticket: preguntar sobre cuál equipo, si tiene más de uno
- **Qué pasó:** el usuario notó que los tickets de alguien con celular Y laptop
  asignados arrastraban ambos equipos en el registro, aunque la falla solo fuera de
  uno. Pidió que Mesa de Ayuda pregunte sobre cuál equipo es el problema cuando aplique
  (más de un activo asignado); si solo tiene uno, que se siga ligando automático sin
  preguntar nada.
- **Qué cambió:**
  - `backend/src/routes/tickets.js` — nueva ruta `GET /tickets/mine/assets`
    (`employeeAuth`) que regresa los equipos activos asignados a quien reporta (vía
    `Assignment`, igual criterio que ya usaba `POST /mine`). En `POST /mine`: si la
    persona tiene más de un equipo asignado, ahora se exige un `assetId` (validado
    contra sus propios activos asignados) y el ticket solo queda ligado a ese uno; con
    0 o 1 equipo el comportamiento no cambió (se sigue ligando automático).
  - `frontend/src/pages/ReportarTicket.jsx` — nuevo selector "¿Sobre cuál de tus
    equipos es esto?" que solo aparece cuando `GET /tickets/mine/assets` regresa 2 o
    más equipos, con la opción explícita "No es sobre un equipo en particular" para
    fallas que no son de un dispositivo específico (red, cuenta, etc.). Obligatorio
    elegir algo antes de poder enviar el ticket cuando aplica.
- **Verificación:** `node --check`; `npm run build`; Playwright con 0/1/2 equipos
  asignados confirmando que el selector solo aparece con 2+, y que intentar enviar sin
  elegir muestra el error de validación esperado.
- **Commit(s):** (pendiente)

### 2026-07-17 — Notas internas: solo lectura una vez que el ticket se cierra
- **Qué pasó:** el usuario preguntó si las notas internas se pueden seguir agregando
  mientras el ticket está abierto y si quedan como solo lectura al cerrarse — al
  revisar el código de la feature recién agregada, encontré que no había ningún
  bloqueo: se podían seguir agregando notas incluso con el ticket ya `cerrado`.
- **Qué cambió:**
  - `backend/src/routes/tickets.js` — `POST /:id/internal-notes` ahora rechaza
    (400) si `ticket.status === 'cerrado'`, mismo criterio que ya usaba
    `POST /:id/messages` del lado del empleado.
  - `frontend/src/pages/Tickets.jsx` — nuevo `notesLocked` (= ticket cerrado); con el
    ticket cerrado se oculta la caja de texto y el botón de "Agregar nota interna",
    mostrando en su lugar el aviso "🔒 Ticket cerrado — las notas internas quedan
    como solo lectura." Las notas ya escritas se siguen viendo siempre. Si el ticket
    se reabre (botón "Reabrir" ya existente), se desbloquea solo.
- **Verificación:** `node --check`; `npm run build`; Playwright con un ticket abierto
  y uno cerrado (ambos con una nota interna previa) confirmando que el textarea/botón
  solo aparecen en el abierto y que el mensaje de solo-lectura solo aparece en el
  cerrado.
- **Commit(s):** (pendiente)

### 2026-07-17 — Tickets ERP: aislados, solo lider.erp y analista.erp los ven
- **Qué pasó:** el usuario pidió que los tickets de tipo ERP únicamente lleguen a
  `lider.erp@selectshop.com.mx` y `analista.erp@selectshop.com.mx`, y que el resto del
  equipo de Sistemas no los vea en absoluto (no solo "de solo lectura" — invisibles).
  Al investigar encontré que lider.erp/analista.erp hoy no tienen NINGÚN acceso al
  módulo de Tickets (no son rol admin, bloqueados por el middleware `adminOnly`), así
  que además de filtrar qué ve cada quien hubo que abrirles el acceso al tablero.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nuevo tipo `erp` en `TICKET_TYPES`/`TICKET_TYPE_LABELS`,
    seleccionable por el empleado al reportar (partición limpia y explícita, en vez de
    inferirlo de la app referenciada o de la categoría de SLA).
  - `backend/src/routes/tickets.js` — `isErpOnlyUser(user)` (rol no-admin +
    `canManagePlatformAccountsErp` sin Gmail/Plataformas generales) y
    `canViewTicket(req, ticket)` (ERP-only ve solo `ticketType==='erp'`; todos los demás
    ven todo MENOS erp). Se reemplazó el gate `router.use(auth, adminOnly)` por un
    middleware inline que deja pasar `role==='admin' O isErpOnlyUser`. `GET /` y
    `GET /counts-by-asset` filtran por tipo en la query de Mongo; `GET /:id` y
    `GET /:id/attachment` regresan 404 (no 403, para no revelar que el ticket existe) si
    no puedes verlo; las 7 rutas de escritura admin (asignar, prioridad, SLA, estatus,
    responder, notas internas, eliminar) validan lo mismo antes de `canManageTicket`.
  - `frontend/src/App.jsx` — nueva `TicketsRoute` (reemplaza `AdminRoute` en `/tickets`):
    deja entrar a admin o a un usuario ERP-only.
  - `frontend/src/components/Layout.jsx` — `erpOnlyPages` gana "🎫 Tickets ERP".
  - `frontend/src/pages/Tickets.jsx`, `ReportarTicket.jsx`, `MisTickets.jsx` — agregado
    el tipo "🏭 ERP" a los catálogos/labels correspondientes (las demás vistas ya
    derivaban tabs/desgloses dinámicamente, sin listas hardcodeadas que tocar).
- **Verificación:** `node --check` en modelo y rutas backend; `npm run build`;
  Playwright con 3 escenarios contra `/tickets` (admin normal, usuario ERP-only, viewer
  sin permiso) confirmando que el ruteo/redirect del frontend se comporta como se
  espera en cada caso.
- **Commit(s):** (pendiente)

### 2026-07-17 — Tickets: notas internas (bitácora técnica, invisible para quien reportó)
- **Qué pasó:** el usuario propuso, basado en un trabajo anterior, separar los tickets
  en dos canales: "notas públicas" (la conversación con quien reportó, para cerrar el
  ticket) y "notas privadas" (detalle técnico interno — qué se tocó, cómo se
  solucionó — para que el equipo pueda buscar después soluciones ya probadas). Las
  "notas públicas" ya existían como la conversación (`ticket.messages`); faltaba la
  parte privada.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nuevo campo `internalNotes` (arreglo de
    `{authorName, text, createdAt}`), separado de `messages`.
  - `backend/src/routes/tickets.js` — nueva ruta `POST /:id/internal-notes` (gateada
    por `canManageTicket`, igual que responder/resolver). **Crítico:** se agregó
    `stripInternal()` y se aplicó a las 4 rutas del lado EMPLEADO (`GET /mine`,
    `POST /:id/messages`, `/close`, `/satisfaction`) para que `internalNotes` nunca
    llegue a quien reportó — por default Mongoose regresa todos los campos del
    documento, así que sin esto se habría filtrado solo.
  - `frontend/src/pages/Tickets.jsx` — nueva sección "🔒 Notas internas" en el modal de
    detalle (fondo ámbar, claramente distinta de "Responder"), con su propio hilo y
    caja de texto, deshabilitada si no eres quien tiene el ticket asignado.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando que la
  sección aparece, muestra notas existentes y que agregar una nueva llama al endpoint
  correcto. Revisé a mano las 4 rutas del lado empleado para confirmar que ninguna
  expone `internalNotes`.
- **Commit(s):** (pendiente)

### 2026-07-17 — sistemas.3 pasa a ser superadministrador, igual que sistemas.2
- **Qué cambió:** `GMAIL_ROOT_EMAIL` (un solo correo protegido) pasa a ser
  `GMAIL_ROOT_EMAILS` (arreglo) en `backend/src/config/permissions.js`, ahora con
  `sistemas.2@selectshop.com.mx` y `sistemas.3@selectshop.com.mx`. Se actualizaron
  todos los usos: `backend/src/routes/auth.js` (fuerza los 3 permisos de
  Gmail/Plataformas/ERP + rol admin en cada login, sin importar la DB),
  `backend/src/routes/users.js` (solo estas cuentas pueden otorgar/revocar esos
  permisos a otros usuarios) y `frontend/src/pages/Users.jsx` (mismo arreglo
  duplicado, casilla "Siempre activo" sin poder apagarse desde la UI).
- **Por qué:** pedido explícito — sistemas.3 debe tener el mismo nivel
  "superadministrador" protegido que ya tenía sistemas.2 (no apagable por ningún
  admin, ni siquiera por error).
- **Verificación:** `node --check` en los 3 archivos backend; `npm run build`;
  Playwright con sistemas.3 logueado confirmando que ve las columnas de permisos
  (antes solo visibles para sistemas.2), que su propia casilla aparece protegida
  ("Siempre activo", deshabilitada), y que la de un usuario normal (Felipe) sigue
  editable.
- **Commit(s):** (pendiente)

### 2026-07-17 — Se quita "Marcar en tránsito" del panel — solo lo marca el mensajero
- **Qué pasó:** el usuario reportó que sistemas.2 le dio sin querer al botón interno
  "Marcar en tránsito" del panel de admin, cuando ese paso debe hacerlo únicamente el
  mensajero (escaneando el link público desde su teléfono). Ese botón interno además
  nunca capturó quién lo presionó (a diferencia del flujo público, que sí guarda
  `transitByName`), así que era un mecanismo incompleto desde el principio.
- **Qué cambió:** se quitó por completo — `backend/src/routes/shipments.js` ya no
  tiene la ruta `PUT /:id/transit` (la interna, de admin), y
  `frontend/src/pages/Shipments.jsx` ya no tiene el botón "Marcar en tránsito" ni la
  función que lo llamaba. El único camino para pasar a "en tránsito" ahora es que el
  mensajero confirme desde el link público (`POST /shipments/public/:token/transit`,
  sin tocar).
- **Aclaración sobre acceso de Felipe (sistemas.4):** la confirmación de RECEPCIÓN
  nunca pasó por una ruta de admin restringida por dueño — siempre fue, y sigue
  siendo, el link público (`/confirmar-envio/:token`, sin login) el que la persona que
  recibe usa para confirmar, sin importar si tiene o no cuenta de Sistemas. La
  restricción de dueño de la entrada anterior del changelog solo aplica a
  `DELETE /:id` (borrar el envío desde el panel) — ver/descargar PDFs sigue abierto a
  cualquier admin.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando que el
  botón ya no aparece para nadie (ni para quien creó el envío ni para otros).
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos y Tickets ahora respetan al dueño, aunque todos sean admin
- **Qué pasó:** el usuario (sistemas.3) pidió que, aunque todos en Sistemas sean
  admin, un envío o ticket siga siendo "de quien lo creó/atiende" — no quería que
  sistemas.2/sistemas.4 pudieran modificar algo que él está haciendo. Se acordó:
  visible para todos (solo lectura), pero solo el dueño (o el Gerente de Sistemas,
  con visibilidad total) puede modificar/eliminar.
- **Qué cambió:**
  - `backend/src/routes/shipments.js` — nuevo `canManageShipment(req, shipment)`:
    dueño = `shipment.sentBy` (quien lo creó). Aplica a `PUT /:id/transit` y
    `DELETE /:id` (403 si no eres el dueño ni el Gerente). `GET /` y las descargas de
    PDF siguen abiertas a cualquier admin.
  - `backend/src/routes/tickets.js` — nuevo `canManageTicket(req, ticket)`: un ticket
    SIN asignar sigue abierto a cualquiera (alguien tiene que poder tomarlo); ya
    asignado, solo `ticket.assignedTo` (o el Gerente) puede modificarlo. Aplica a
    `PUT /:id/assign`, `/priority`, `/sla-category`, `/status`, `POST /:id/reply` y
    `DELETE /:id`.
  - `frontend/src/pages/Shipments.jsx` — se ocultan "Marcar en tránsito"/"Eliminar"
    para quien no es dueño (se muestra "🔒 De {nombre}" en su lugar); las descargas de
    PDF y "Ver" se quedan visibles para todos.
  - `frontend/src/pages/Tickets.jsx` — el modal de detalle deshabilita
    prioridad/categoría SLA/asignación/responder/resolver/cerrar/reabrir/eliminar si
    el ticket ya está asignado a alguien más, con un aviso "🔒 Asignado a X".
- **Por qué:** aunque el rol sea el mismo (admin) para todo el equipo de Sistemas,
  cada quien debe poder trabajar lo suyo sin que otro lo modifique por encima —
  excepto el Gerente de Sistemas, que sí necesita visibilidad/control total.
- **Verificación:** `node --check` en ambas rutas backend; Playwright simulando dos
  envíos (uno propio, uno ajeno) confirmando que los botones de acción correctos
  aparecen/desaparecen según el dueño.
- **Commit(s):** (pendiente)

### 2026-07-17 — El PDF de Envíos ahora muestra quién marcó "en tránsito" y cuándo
- **Qué cambió:** `backend/src/utils/shipmentPdf.js` — se agregó una línea
  "En tránsito por: {nombre} — {fecha/hora}" justo debajo del estatus, usando
  `transitByName`/`transitAt` (se llenan cuando el mensajero confirma desde el link
  público en su teléfono). Antes esa confirmación solo se veía en la caja de firma
  (sin fecha); ahora aparece igual de visible que "Recibido por", en ambos formatos
  (Salida y Recepción, ya que comparten el mismo cuerpo).
- **Por qué:** pedido explícito — que se vea claro el nombre del mensajero que
  escanea/confirma el tránsito desde su teléfono.
- **Verificación:** `node --check`; PDF de prueba generado con estatus "en_transito"
  confirmando que la línea aparece correctamente.
- **Commit(s):** (pendiente)

### 2026-07-17 — Bug real encontrado: filas de tablas encimadas en PDF de Envíos y Responsivas
- **Qué pasó:** el usuario mandó una captura real (Recepción de un envío con 3 laptops)
  mostrando la descripción del equipo invadiendo la fila de abajo. El cambio a Carta no
  lo arregló porque no era el problema real.
- **Causa encontrada:** dos tablas armadas a mano (no con `kvRow`, que sí mide la altura
  del texto) usaban una altura de fila **fija**: la tabla de equipos en
  `backend/src/utils/shipmentPdf.js` (15pt fijos) y "ACCESORIOS ENTREGADOS" en
  `backend/src/routes/responsiva.js` (16pt fijos). Cuando una descripción/modelo era
  larga, el texto envolvía a una segunda línea pero la fila NO crecía — esa segunda
  línea se dibujaba encima de la fila siguiente. Confirmé además con una prueba directa
  de pdfkit que `lineBreak: false` (que ambas tablas usaban, asumiendo que evitaba el
  ajuste de línea) **no** evita el ajuste — solo desactiva la separación silábica: el
  texto igual envuelve si excede el ancho dado, así que la altura fija era la única
  causa real.
- **Qué cambió:** ambas tablas ahora miden la altura real de cada fila con
  `doc.heightOfString(...)` (mismo criterio que ya usa `measureKvHeight` para las
  secciones de datos) antes de dibujarla, y ya no usan `lineBreak: false`.
- **Verificación:** regeneré el PDF de Recepción con los MISMOS datos de la captura del
  usuario (3 laptops con la descripción larga que causaba el problema) y confirmé
  visualmente que ya no hay superposición; también probé la tabla de accesorios con
  nombres largos. `node --check` en ambos archivos.
- **Commit(s):** (pendiente)

### 2026-07-17 — Todos los PDF pasan de A4 a Carta (Letter)
- **Qué pasó:** el usuario reportó que los PDF de Envíos y Responsivas se ven con
  información "encimada" al imprimirlos, y sospechó que era porque no estaban en
  tamaño Carta (México usa Carta, no A4).
- **Investigación:** revisé a fondo el código compartido de armado de PDF
  (`pdfBranding.js`: `kvRow`/`measureKvHeight`/`clauseBlock`/`sectionBand`) y generé
  PDFs de prueba con datos realistas (nombres largos, justificaciones largas, varias
  plataformas) — no encontré texto encimado en el contenido en sí; el cálculo de
  alturas (`measureKvHeight`) ya contempla valores de varias líneas correctamente.
  Lo que sí confirmé: **todos** los generadores de PDF (Responsivas de Gmail/Plataforma/
  ERP/Activos, Solicitudes de Cuenta, Envíos) usaban `size: 'A4'` mientras que en
  México se imprime en Carta — un tamaño de página distinto al de la hoja física
  real puede causar que el driver de impresión no escale bien y el contenido se vea
  mal alineado o cortado al imprimir.
- **Qué cambió:** `backend/src/utils/pdfBranding.js` — `PAGE_W`/`PAGE_H` pasan de las
  dimensiones de A4 (595.28×841.89pt) a las de Carta (612×792pt). Se cambió
  `size: 'A4'` → `size: 'LETTER'` en los 7 archivos que generan PDF: `gmailAccounts.js`,
  `platformAccounts.js`, `platformAccountsErp.js`, `responsiva.js`,
  `utils/shipmentPdf.js`, `utils/responsivaLegacyPdf.js`, `utils/accountRequestPdf.js`.
- **Nota:** si después de este cambio TODAVÍA se ve algo encimado en un PDF
  específico, hace falta una captura de pantalla de ESE documento en concreto — con
  datos de prueba variados no logré reproducir un encimado real en el contenido, solo
  el tamaño de página incorrecto.
- **Verificación:** `node --check` en los 8 archivos tocados (incluye `pdfBranding.js`);
  se regeneraron localmente Salida/Recepción de Envíos y una Responsiva de Gmail con
  datos de prueba largos, confirmando vía el MediaBox del PDF que ya miden 612×792pt
  y que no hay superposición visual.
- **Commit(s):** (pendiente)

### 2026-07-17 — Ajuste de firmas: Salida = Mensajero + Gerente de Sistemas, Recepción = solo Destinatario
- **Qué cambió:** `backend/src/utils/shipmentPdf.js` — el formato de Salida ahora firma
  "Mensajero" (con `transitByName`) y "Gerente de Sistemas" (nombre real vía
  `GERENTE_SISTEMAS_EMAIL`, mismo patrón que ya usan las responsivas de cuentas). El
  formato de Recepción se redujo a una sola firma centrada: "Destinatario — recibí de
  conformidad" (con `receivedByName`, o `recipientName` si aún no se ha confirmado).
  `signatureRow()` ahora soporta una sola caja sin estirarse a todo el ancho de la hoja.
  `backend/src/routes/shipments.js` — la ruta `GET /:id/pdf` busca al Gerente de
  Sistemas (`Employee.findOne({ corporateEmails: GERENTE_SISTEMAS_EMAIL })`) y se lo
  pasa al PDF.
- **Por qué:** pedido explícito de corrección tras la versión anterior (esta misma
  sesión) — el usuario aclaró que la salida la firman mensajero + gerente, y la
  recepción solo el destinatario.
- **Verificación:** `node --check` en ambos backend; PDFs de prueba generados
  localmente y revisados visualmente vía Quick Look.
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos: dos formatos separados (Salida para el mensajero, Recepción para el destinatario)
- **Qué pasó:** un mensajero insistió en que él tenía que firmar la "hoja de salida", cuando en
  realidad esa confusión venía de que solo existía UN formato para todo el flujo. El usuario pidió
  separar en dos documentos: uno de salida (que ya existía) con la firma del mensajero, y uno nuevo
  de recepción para quien recibe en destino.
- **Qué cambió:**
  - `backend/src/utils/shipmentPdf.js` — se extrajo el cuerpo común (folio, datos del
    solicitante, tabla de equipos, motivo, estatus) a `renderShipmentBody()`, y las cajas de firma a
    `signatureRow()` (ahora imprime el nombre ya capturado digitalmente arriba de la línea, si
    existe, en vez de firmas en blanco). `buildShipmentPdf` (FORMATO DE SALIDA) firma "Entrega
    (Sistemas/Almacén)" + "Mensajero — recibe para transportar" (con `transitByName`).
    `buildShipmentReceptionPdf` (nuevo, FORMATO DE RECEPCIÓN) firma "Mensajero — hace la entrega" +
    "Recibí de conformidad" (con `receivedByName`).
  - `backend/src/routes/shipments.js` — nueva ruta `GET /:id/reception-pdf`.
  - `frontend/src/pages/Shipments.jsx` — el botón único "⬇ PDF" se separó en "⬇ Salida" y
    "⬇ Recepción", cada uno con su tooltip explicando quién firma cuál.
- **Verificación:** `node --check` en ambos backend; generación local de ambos PDFs con datos de
  prueba (revisados visualmente vía Quick Look) confirmando que cada uno trae la sección de firma
  correcta con el nombre digital ya impreso; Playwright confirmando que los dos botones nuevos
  llaman a su endpoint correspondiente.
- **Commit(s):** (pendiente)

### 2026-07-16 — Planos de Red: bug de conexiones "imborrables", quitar import, reemplazar imagen, iconos más chicos
- **Qué pasó:** Felipe reportó que no podía borrar/editar las conexiones (cables) entre
  dispositivos de un plano — las creó por error y se quedaron ahí, "se ven feas".
  También pidió quitar "Importar dispositivos descubiertos" (ya no se usa), poder
  actualizar la imagen de un plano ya existente sin perder los dispositivos ya
  colocados (ejemplo: Tepoz 4 ya tenía una foto más nueva), y reducir el tamaño de
  los íconos un 50% porque se amontonan.
- **Bug real encontrado (no solo "la línea es delgada"):** en
  `frontend/src/pages/NetworkLayoutDetail.module.css`, `.pinsLayer` (el contenedor
  transparente que envuelve los pines, encima del SVG de conexiones) no tenía
  `pointer-events: none` — su área vacía se robaba TODOS los clics sobre el plano
  salvo que cayeran justo encima de un pin, así que un clic sobre una línea de
  conexión casi nunca llegaba realmente al SVG. Esa es la causa real de "no las pude
  quitar". Se corrigió (`pointer-events:none` en la capa, `pointer-events:auto` en
  cada pin) y además se agregó una línea invisible mucho más ancha por debajo de cada
  conexión (la visible seguía siendo de solo 2.5px, muy difícil de acertar incluso sin
  el bug de la capa) para que el área de clic real sea generosa.
- **Qué más cambió:**
  - `backend/src/routes/networkLayouts.js` — nueva ruta `PUT /:id/image` que
    reemplaza `imageData`/`imageMimeType`/`imageFileName` de un plano YA existente
    sin tocar sus dispositivos/conexiones (viven en colecciones aparte, ligadas por
    el id del plano, que no cambia).
  - `frontend/src/pages/NetworkLayoutDetail.jsx` — nuevo modal "🖼️ Reemplazar plano"
    en la barra de herramientas que sube la imagen nueva y la recarga sin recargar
    la página; se quitó por completo el botón/modal "Importar dispositivos
    descubiertos" (y su código: `ImportDiscoveredModal`, `extractDiscoveredRow`, el
    import de `xlsx`) — se deja intacto el catálogo de dispositivos ya importados
    antes y su picker "completar con un dispositivo descubierto", solo se quitó la
    forma de agregar MÁS por archivo.
  - `.pin` pasa de 30px a 15px (icono/borde reducidos a la par) para que no se
    amontonen con varios dispositivos cerca uno del otro.
- **Verificación:** `node --check` en la ruta backend; `npm run build`; Playwright
  simulando un plano con una conexión y confirmando que un clic CERCA (no exacto)
  de la línea ahora sí dispara el borrado, que el botón de importar ya no aparece,
  que el de reemplazar sí, que el pin mide 15×15px, y que el flujo de reemplazar
  imagen manda el archivo correctamente al backend.
- **Commit(s):** (pendiente)

### 2026-07-16 — Fix defensivo: fallas silenciosas en el Inicio ahora se ven en consola
- **Qué pasó:** el usuario reportó que en producción el Inicio se veía "vacío" —
  solo el saludo, accesos directos y (tras refrescar) Pendientes de revisión, pero
  ninguna de las secciones nuevas (Catálogos y Activos, Cuentas y Plataformas,
  Operación, Recursos Humanos). Revisando el código se encontró que el fetch de
  Catálogos y Activos (`/employees` + `/assets` + `/assignments`) no tenía manejo de
  error — si cualquiera de esas 3 llamadas fallaba, esa sección se quedaba vacía
  para siempre sin ningún aviso ni en pantalla ni en consola.
- **Qué cambió:** `frontend/src/pages/Dashboard.jsx` — se agregó `.catch()` a ese
  fetch (cae a listas vacías + `console.error` en vez de quedarse muda), y se
  agregó `console.error` por cada llamada individual que falle dentro de los
  `Promise.allSettled` de Cuentas/Operación/RH (antes fallaban en silencio total,
  cayendo a `[]` sin dejar ningún rastro).
- **Por qué:** esto NO explica por completo por qué las otras 3 secciones nuevas
  tampoco aparecían (esas se alimentan del mismo estado que si mostró "Pendientes"
  correctamente) — se le pidió al usuario la consola del navegador (F12) para
  encontrar la causa real; este cambio es defensivo/de diagnóstico, no se marca como
  el fix final hasta confirmar con la consola.
- **Verificación:** `npm run build`.
- **Commit(s):** (pendiente)

### 2026-07-16 — El Inicio ahora es un feed visual de toda la app (no solo accesos directos)
- **Qué cambió:** `frontend/src/pages/Dashboard.jsx` se amplió para aplicar la misma
  lógica visual de Indicadores (tarjetas KPI con color/ícono, barras de desglose,
  listas tipo feed) a TODA la app, no solo a inventario. Se agregaron 3 secciones
  nuevas — **Cuentas y Plataformas** (conteo de cuentas Gmail/Plataformas/ERP +
  desglose por plataforma), **Operación** (envíos en curso/recibidos por estatus,
  tickets abiertos/bloqueantes por tipo, feed de actividad reciente de Auditoría) y
  **Recursos Humanos** (Ingresos RH y Solicitudes de Recursos por estatus + últimos
  registros) — más un resumen condensado de **Catálogos y Activos** con link directo
  a Indicadores para el detalle a fondo (no se duplica esa página completa). También
  se agregó un filtro global de sucursal/departamento (mismo patrón de chips que
  Indicadores) que afecta todas las secciones donde el dato lo permite: Cuentas
  (vía `employee.office/department`), Ingresos RH (tiene oficina/depto directos),
  Solicitudes de Recursos (solo depto, no guarda oficina) y Envíos (solo sucursal
  origen/destino, no depto) — Tickets y Pendientes de revisión se dejan sin filtrar
  a propósito (Tickets no guarda oficina del empleado hoy; Pendientes son acciones
  por hacer, no analítica, filtrarlas podría esconder algo urgente).
- **Por qué:** pedido explícito — "que fuera un dashboard como el de indicadores pero
  de absolutamente toda la página, como el inicio de FB o LinkedIn... que aplique la
  misma lógica que el de Indicadores." Se confirmó con el usuario que era "todos los
  módulos de un jalón" (no por fases) y que el filtro fuera global.
- **Verificación:** `npm run build`; Playwright con datos simulados de todos los
  módulos (empleados, activos, cuentas, envíos, tickets, ingresos, recursos,
  auditoría) confirmando que las 4 secciones nuevas renderizan bien, que el filtro de
  sucursal actualiza los números correctamente en las secciones donde aplica, y que
  no hay overflow horizontal en móvil (390px).
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: la app se "atoraba" varios minutos en wifi (nunca en cable)
- **Qué pasó:** el usuario reportó que con Ethernet todo funciona bien, pero conectado
  a CUALQUIER wifi (no es cuestión de ancho de banda ni señal débil), acciones como
  seleccionar un empleado en Solicitud de Recursos, Ingresos RH o un Envío se quedan
  pensando hasta 5 minutos.
- **Causa:** ninguna de las dos instancias de axios del frontend
  (`frontend/src/services/api.js`, `frontend/src/services/employeeApi.js`) tenía
  `timeout` configurado (el default de axios es "nunca"). Wifi tiene, por naturaleza
  de la radio (roaming entre puntos de acceso, ahorro de energía), momentos donde una
  conexión queda "en agujero negro" — la petición sale pero nunca llega respuesta ni
  error — y sin timeout, el navegador se queda esperando hasta el timeout de TCP del
  sistema operativo (varios minutos), aunque el ancho de banda esté perfecto. Esto no
  pasa en Ethernet porque ahí esas caídas momentáneas de la conexión prácticamente no
  ocurren.
- **Qué cambió:** ambas instancias de axios ahora tienen `timeout: 90000` (90s — con
  margen de sobra sobre el cold start de Render de ~50s) y un interceptor que
  reintenta UNA vez, automáticamente, cualquier petición GET (son idempotentes, no
  duplican nada) que falle por timeout o sin respuesta del servidor — cubre el blip
  típico de wifi sin que la persona note nada. Si el reintento también falla, ahora sí
  se muestra un error en vez de quedarse pensando indefinidamente.
- **Verificación:** `npm run build`; Playwright simulando una conexión que falla en el
  primer intento y responde bien en el segundo — confirmado que la app se recupera
  sola y sin que el usuario tenga que hacer nada.
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: el modal de Responsiva (Gmail/Plataforma) mostraba un correo/usuario viejo
- **Qué pasó:** el usuario reportó un caso concreto — Felipe (sistemas.4) dio de alta
  una cuenta Gmail, otra persona (sistemas.3) la vio en pantalla, la registró en Google
  real y luego Felipe corrigió el correo en la app. Al generar la responsiva después,
  el título del modal en pantalla seguía mostrando el correo VIEJO, pero el PDF
  descargado ya mostraba el correo corregido — dos personas viendo la misma cuenta
  con datos desincronizados en sus respectivas pestañas.
- **Qué cambió:** `GmailAccounts.jsx`/`PlatformAccounts.jsx` — antes de abrir el modal
  de "Generar responsiva" ahora se pide un dato fresco de esa cuenta al backend
  (`GET /gmail-accounts/:id` y `GET /platform-accounts/:id`, endpoints nuevos) en vez
  de usar el objeto ya cargado en la lista de la pantalla (que puede llevar horas sin
  refrescarse). Además, ambas páginas ahora recargan su lista solas cuando la pestaña
  vuelve a tener foco, para no quedarse viendo datos de hace rato cuando dos personas
  editan las mismas cuentas casi al mismo tiempo.
- **Por qué:** el PDF siempre se generó con datos frescos de la base de datos (eso
  nunca estuvo mal); lo desactualizado era solo lo que mostraba la pantalla — de ahí
  la confusión de "la página dice una cosa y el PDF dice otra".
- **Nota aparte (no era bug):** que existan dos responsivas archivadas (una con cada
  correo) es esperado — cada clic en "Generar responsiva" archiva un PDF nuevo como
  historial; y que el correo viejo ya no aparezca en "Cuentas Gmail" también es
  correcto, porque fue una corrección del mismo registro, no una cuenta duplicada.
- **Verificación:** `node --check` en ambas rutas backend; Playwright simulando lista
  desactualizada + endpoint individual con el dato corregido — confirmado que el
  modal ahora muestra el correo correcto aunque la lista siga vieja.
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: casi todas las páginas se veían angostas en monitores grandes
- **Qué pasó:** el usuario reportó (con capturas de su laptop y su monitor) que todas
  las páginas se veían "angostas, con espacio vacío de más" en pantallas grandes,
  excepto Empleados, que sí llenaba todo el ancho. Causa: cada página tenía su propio
  tope de ancho (`.page { max-width: 1000–1400px }` en su CSS module) menos Empleados
  (`Page.module.css`, sin tope) — en un monitor ancho eso dejaba una franja gris vacía
  a la derecha en Activos, Cuentas de Plataformas, Gmail, Usuarios, Auditoría,
  Tickets, Planos de Red, Stock, Solicitudes, Responsivas e Indicadores/Dashboard.
- **Qué cambió:** se quitó el `max-width` de `.page` en los 13 CSS modules de esas
  páginas para que se comporten igual que Empleados (llenan todo el ancho disponible
  del `<main>`). Se dejaron intactas las páginas públicas fuera del panel (Solicitar
  Cuenta/Ingreso, Mesa de Ayuda, portal de empleado), cuyo formulario angosto y
  centrado sí es intencional.
- **Por qué:** se descartó primero que fuera zoom del navegador (el usuario confirmó
  que ya estaba en 100%); comparando el CSS de Empleados contra el de las demás
  páginas, el `max-width` en `.page` fue la única diferencia real y sistemática.
- **Verificación:** `npm run build` + Playwright a 1920×1040 confirmando que Activos
  y Empleados ahora miden el mismo ancho de contenido (antes: Activos topado en
  1400px con franja vacía; ahora: llena el mismo ancho que Empleados).
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: la responsiva de Gmail/Plataforma quedaba desactualizada tras editar la cuenta
- **Qué pasó:** Felipe reportó que al corregir una cuenta de Gmail (la última que se
  creó, de Javier) el cambio se veía bien en el listado de Gmail, pero la responsiva
  generada seguía mostrando los datos de antes. Causa: cada responsiva se archiva como
  PDF congelado en `ResponsivaArchive` (para tener historial), pero nada volvía a
  generarla cuando la cuenta se editaba después — el archivo se quedaba con los datos
  del momento en que se generó por primera vez.
- **Qué cambió:** `backend/src/models/ResponsivaArchive.js` — se agregó `sourceId`
  (referencia a la cuenta de origen) y `requestData` (los datos puntuales del
  formulario — tienda, jefe directo, vigencia — que antes no se guardaban). En
  `backend/src/routes/gmailAccounts.js` y `backend/src/routes/platformAccounts.js`, el
  dibujo del PDF se movió a una función reutilizable (`renderGmailResponsivaPdf` /
  `renderPlatformResponsivaPdf`), y el `PUT /:id` de cada cuenta ahora, después de
  guardar la edición, busca las responsivas ya archivadas de esa cuenta que **todavía
  no se hayan firmado/subido** (`signedFileData` vacío) y las regenera con los datos
  actuales. Las que ya tienen una copia firmada subida nunca se tocan, para no alterar
  un documento que ya se firmó en papel.
- **Por qué:** decisión explícita del usuario — "si el gmail se modificó, también la
  responsiva" — al preguntarle si prefería regeneración automática o solo un aviso,
  eligió regeneración automática (respetando las ya firmadas).
- **Verificación:** `node --check` en los 3 archivos + `require()` de ambas rutas para
  confirmar que cargan sin errores. No se pudo probar contra Mongo real en este entorno
  (sin acceso a DB/red desde el sandbox) — falta confirmar en producción con una
  edición real de cuenta.
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: la página de Activos se veía "cortada" en pantallas chicas
- **Qué cambió:** `frontend/src/pages/Assets.module.css` — la fila de filtros por tipo de
  activo (💻📱🖨️🌐🔬...) forzaba `flex-wrap: nowrap` + `overflow-x: auto` en móvil,
  metiendo todos los íconos en una sola fila con scroll horizontal oculto (sin indicador
  visual de que había más íconos a la derecha) en vez de simplemente pasar a una segunda
  fila como ya hacían el resto de las páginas (Empleados, Envíos, Indicadores). Se quitó
  ese scroll forzado y ahora la fila se envuelve (`flex-wrap: wrap`) igual que las demás.
- **Por qué:** reporte del usuario — "todas las pantallas se ven cortadas, en empleados
  es la única que sí se acopla con respecto al ancho." Se comparó el CSS de Empleados
  (que sí se adapta bien) contra el de Activos y esta fue la única regla fuera de patrón
  encontrada; se confirmó con Playwright a 390px y 820px de ancho antes/después del fix.
- **Commit(s):** `c7ea2a0`

### 2026-07-16 — Bug: los colores de las tarjetas se veían grises (color-mix sin soporte)
- **Qué pasó:** el usuario reportó que las tarjetas del Menú y de las categorías se
  veían "muy grises", cuando antes tenían color. La causa: los fondos suaves de cada
  categoría se calculaban con la función CSS `color-mix()`, que no está soportada en
  todos los navegadores — donde no lo está, el navegador ignora esa línea y el fondo
  se queda transparente/gris en vez del color pastel esperado (en Chromium, usado para
  probar, sí funcionaba, por eso no se detectó antes).
- **Qué cambió:** `frontend/src/components/Layout.jsx`/`.module.css` — se quitó
  `color-mix()` por completo. Cada categoría ahora trae su color de fondo ya calculado
  a mano (`bg`, ej. `#eff6ff` para azul, `#f5f3ff` para morado), pasado como variable
  CSS (`--accent-bg`) igual que `--accent` — sin depender de que el navegador calcule
  nada. De paso, los botones de categoría en la barra ahora también se pintan del
  color de su categoría al pasar el mouse/tocar (antes se quedaban en gris genérico).
- **Verificación:** `npm run build`; Playwright headless — se confirmó por código
  (`getComputedStyle`) que el color de fondo de las tarjetas ya no depende de una
  función sin soporte garantizado, y visualmente que el hover de categoría en la barra
  ahora se pinta de su color.

### 2026-07-16 — Ajuste de distribución de la barra superior + "Inicio" en el Menú
- **Qué pasó:** segunda vuelta de feedback visual sobre la barra recién reorganizada:
  el botón "Menú" debía quedar pegado al logo (no después de las categorías), las
  categorías debían repartirse a lo ancho de toda la barra (no amontonadas a la
  izquierda), y el engranaje debía quedar pegado al bloque de usuario a la derecha —
  con espacio visible separando los 3 grupos (logo+Menú / categorías / engranaje+
  usuario). También pidió que "Inicio" (la página de aterrizaje) apareciera como su
  propio apartado dentro del Menú, no solo alcanzable picando el logo.
- **Qué cambió:** `frontend/src/components/Layout.jsx`/`.module.css` — la barra se
  reorganizó en 3 grupos flex (`topbarLeft`: logo+Menú: `topbarCats`: categorías con
  `flex:1` y `justify-content: space-evenly`, con margen a los lados para el espacio
  visible; `topbarRight`: engranaje+usuario, empujado a la derecha). El overlay "Menú"
  (vista de todo junto) ahora incluye una primera sección "Inicio" con una tarjeta que
  lleva a `/`.
- **Verificación:** `npm run build`; Playwright headless — se confirmó la distribución
  de los 3 grupos en la barra y la nueva sección "Inicio" al abrir "Menú".

### 2026-07-16 — Navegación tipo Facebook: categorías como botones directos + engranaje de Configuración
- **Qué pasó:** feedback visual del usuario sobre la barra superior/menú (Fase 1 de
  navegación): quería que se sintiera "visual, interactivo, intuitivo, como el home de
  FB que muestra de todo" — sin números (eso es trabajo de Indicadores) — y que las
  categorías que antes eran sub-encabezados dentro de un solo bloque "Administración"
  fueran botones directos en la barra, con el nombre en vez de un ícono (como los
  íconos del home de FB, pero con texto). También pidió un ícono de engranaje aparte,
  solo para Configuración/Usuarios — Auditoría, Planos de Red y Aplicaciones Internas
  NO son configuración.
- **Qué cambió:**
  - `frontend/src/components/Layout.jsx` — reescrito: las categorías
    ("Catálogos y Activos", "Cuentas y Plataformas", "Operación") ya no viven dentro de
    un solo bloque "Administración de Usuarios y Activos" — son botones de texto
    directos en la barra superior, cada uno con su color. Clic en una categoría abre el
    overlay directo en esa categoría (con "← Volver" para ver todo). El botón "Menú" se
    conserva y ahora muestra TODAS las categorías juntas, una tras otra, en una sola
    pantalla visual (como el home de FB) — sin ningún número/estadística. Nuevo botón
    ⚙️ aparte, admin-only, va directo a `/users` (Configuración = solo Usuarios).
    Auditoría, Planos de Red y Aplicaciones Internas se movieron a "Operación".
  - `frontend/src/components/Layout.module.css` — tarjetas rediseñadas tipo
    "dashboard": ícono en burbuja de color, franja de color arriba, descripción corta
    debajo del nombre — cada categoría con su propio color (azul/morado/verde), en vez
    de tarjetas planas de solo ícono+texto.
  - `frontend/src/pages/Dashboard.jsx`/`.module.css` — los accesos directos de la
    página de inicio se actualizaron para reflejar las mismas categorías/colores que la
    barra superior (antes decían "Administración de Usuarios y Activos" genérico).
- **Por qué:** pedido explícito de dirección sobre cómo debía sentirse/verse la
  navegación, con Facebook como referencia concreta.
- **Verificación:** `npm run build`; Playwright headless (rutas mockeadas) — se
  confirmaron los botones de categoría en la barra, el "Menú" mostrando todo junto con
  colores/descripciones, el salto directo a una categoría con "Volver", y el engranaje
  yendo directo a Usuarios.

### 2026-07-16 — División de Naucalpan (última pendiente de sucursales)
- **Qué pasó:** el usuario ya sabe quién queda en NAUCALPAN (TLB) y quién en NAUCALPAN
  (CRISTALERIA) — la única división de sucursales que había quedado pendiente. Como la
  página de Sucursales ya se había quitado (a petición del usuario, una vez usada), se
  reconstruyó un panel puntual, mismo patrón que GOLDEN/Torre Polanco.
- **Qué cambió:**
  - `backend/src/routes/employees.js` — nueva ruta `POST /employees/split-naucalpan`
    (`{ tlbIds }`): los marcados pasan a `NAUCALPAN (TLB)`, el resto de
    `SUC.6 CEDI Naucalpan` pasa a `NAUCALPAN (CRISTALERIA)`; los activos con esa
    ubicación (no distinguen persona) se van todos a Cristalería por default.
  - `frontend/src/pages/Employees.jsx` — nuevo panel temporal "Dividir Naucalpan" arriba
    de la tabla: checklist real de quienes siguen con `SUC.6 CEDI Naucalpan`, botón para
    aplicar. Se oculta solo cuando ya no queda nadie pendiente.
- **Por qué:** cerrar la única división de sucursales que faltaba.
- **Verificación:** `node --check`; `npm run build`; Playwright headless — el checklist
  solo muestra a los empleados de Naucalpan (no a los de otras sucursales), y el flujo
  de confirmar/aplicar corre sin errores. **Pendiente del usuario:** entrar a
  `/employees` y correr la división; una vez aplicada, este panel (y "SUC.6 CEDI
  Naucalpan" de los 3 catálogos de oficina) se puede volver a quitar.

### 2026-07-16 — "KOSHER" se agrega al catálogo de razón social
- **Qué pasó:** aunque ya se quitó la herramienta de reasignación masiva, "KOSHER" sigue
  siendo una razón social real que se va a seguir usando al dar de alta gente nueva — el
  usuario pidió que ya no haya que escribirla a mano cada vez (quedaba solo alcanzable
  vía "Otro").
- **Qué cambió:** `frontend/src/pages/Employees.jsx` y
  `frontend/src/pages/SolicitarIngreso.jsx` — se agregó `'KOSHER'` a `BUSINESS_NAMES` en
  ambos (alta de empleado y Solicitud de Ingreso), como una opción más del selector.
- **Verificación:** `npm run build`; Playwright headless — se confirmó que "KOSHER"
  aparece como opción seleccionable en el desplegable de razón social al crear un
  empleado.

### 2026-07-16 — Se quitan las herramientas de corrección (Sucursales y KOSHER), ya cumplieron su función
- **Qué pasó:** el usuario terminó de aplicar las correcciones de nomenclatura de
  sucursales (renombres 1 a 1, división de GOLDEN, división de Torre Polanco) y de
  razón social (reasignación a "KOSHER"), y pidió quitar ambas herramientas porque ya
  no las necesita. Al preguntarle el alcance sobre Sucursales, confirmó quitar la
  página completa (no solo el panel de corrección), incluyendo el catálogo — Empleados
  y Activos vuelven a usar sus listas de oficina fijas (ya con los nombres correctos).
- **Qué se quitó:**
  - `backend/src/models/Branch.js`, `backend/src/routes/branches.js` — eliminados. Se
    quitó también su montaje (`/api/branches`) de `backend/src/index.js`.
  - `frontend/src/pages/Branches.jsx` — eliminado, junto con su ruta (`/branches`) en
    `App.jsx` y su tarjeta "Sucursales" en el menú (`Layout.jsx`).
  - `backend/src/routes/employees.js` — se quitó `POST /set-business-name` (el
    endpoint de la herramienta KOSHER).
  - `frontend/src/pages/Employees.jsx` — se quitó `BusinessNameToolPanel` y su uso en
    la página.
  - Los 3 `OFFICES` (`assetFields.js`, `Employees.jsx`, `SolicitarIngreso.jsx`) ya no
    incluyen "GOLDEN" (su división ya se aplicó) — sí siguen incluyendo "SUC.6 CEDI
    Naucalpan", porque esa división quedó pendiente (el usuario pidió resolverla
    después) y ya no hay una herramienta de checklist para completarla; de necesitarse,
    tocaría reasignar esos empleados uno por uno desde su ficha, o pedir que se
    reconstruya la herramienta.
- **Verificación:** `node --check` en todo el backend; `npm run build`; Playwright
  headless — se confirmó que el menú ya no muestra "Sucursales" (solo el ya existente
  "Envíos entre Sucursales", que es otra función) y que Empleados ya no muestra el
  panel de KOSHER.

### 2026-07-16 — La herramienta KOSHER ya no muestra a quien ya esté marcado
- **Qué pasó:** el usuario reportó que se le estaba pasando gente en el checklist —
  como el filtro se queda fijo en "direcci", cada vez que volvía a la página veía otra
  vez a los que ya había reasignado y los volvía a marcar por accidente.
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — `BusinessNameToolPanel` excluye
  del filtro a cualquiera cuya razón social ya sea "KOSHER" (comparación sin importar
  mayúsculas/minúsculas), sin importar si su sucursal/área siguen haciendo match con la
  búsqueda.
- **Verificación:** Playwright headless — un empleado con razón social ya "KOSHER" y
  oficina "Dirección General" no aparece en el checklist, aunque los demás con esa
  misma oficina sí.

### 2026-07-16 — "KOSHER" en mayúsculas
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — el valor de razón social que
  asigna la herramienta (y todos los textos del panel que lo mencionan) pasan de
  "Kosher" a "KOSHER", a petición del usuario.

### 2026-07-16 — Ajuste de la herramienta Kosher: el filtro busca en Sucursal/Área, no en razón social
- **Qué pasó:** el usuario corrigió el criterio de búsqueda del panel recién agregado —
  el texto ("dirección", "familia", etc.) no vive en la razón social actual de estos
  empleados, sino en su Sucursal/Oficina o en su Área. La razón social destino sigue
  siendo "Kosher", solo cambió dónde se busca a los candidatos.
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — `BusinessNameToolPanel` ahora
  filtra por `office`/`area` en vez de `businessName`, y el checklist muestra ambos
  campos más la razón social actual de cada quién, para verificar de un vistazo antes
  de marcar.
- **Verificación:** Playwright headless — se confirmó que un empleado con "Dirección
  General" en Oficina y otro con "Familia Dirección" en Área aparecen en el filtro,
  mientras uno sin ninguno de los dos queda fuera.

### 2026-07-16 — Corrección de razón social: reasignar empleados a "Kosher"
- **Qué pasó:** mismo tipo de corrección que las sucursales, pero sobre la razón social
  (`Employee.businessName`). El director de Finanzas indicó que un grupo específico de
  empleados (pagados en efectivo) debe quedar con "Kosher" como razón social. El usuario
  pidió poder filtrar candidatos por texto (ej. "dirección", "dirección general",
  "familia dirección") y elegir a mano quiénes aplican de verdad.
- **Qué cambió:**
  - `backend/src/routes/employees.js` — nueva ruta `POST /employees/set-business-name`
    (`{ employeeIds, businessName }`, `Employee.updateMany` sobre los IDs dados).
    Genérica a propósito (no hardcodeada a "Kosher") para poder reusarse en
    correcciones similares más adelante. A diferencia de la división de sucursales, no
    hay un "resto" que mover a otro valor — quien no se marca se queda como está.
  - `frontend/src/pages/Employees.jsx` — nuevo panel "Corrección de razón social —
    Kosher" arriba de la tabla: input de búsqueda (precargado con "direcci") que filtra
    en vivo sobre los empleados ya cargados en la página (sin pedir nada nuevo al
    backend), checklist de coincidencias, botón para reasignar los marcados.
- **Por qué:** dato real de la empresa (forma de pago), no del documento de Finanzas.
- **Verificación:** `node --check`; `npm run build`; Playwright headless (rutas
  mockeadas) — se confirmó que el filtro encuentra "Dirección General"/"Familia
  Dirección" pero no otras razones sociales, y que el botón aplica el cambio y muestra
  cuántos se actualizaron.

### 2026-07-16 — Segunda excepción de sucursales: Torre Polanco también se divide
- **Qué pasó:** al pedirle al usuario la lista de gente de Polanco Piso 16 para dividir
  GOLDEN, resultó que 6 de esas 7 personas en realidad tienen hoy "SUC.1 Corporativo
  Torre Polanco" como oficina (no GOLDEN) — que el renombre 1 a 1 iba a mandar a
  POLANCO PISO 13. Físicamente están en Piso 16, así que ese renombre tampoco era 1 a 1
  sin excepciones. Se saca "Torre Polanco → Piso 13" del mapa de renombres simples y se
  maneja igual que GOLDEN: como una división con checklist.
- **Qué cambió:**
  - `backend/src/routes/branches.js` — `OFFICE_RENAME_MAP` ya no incluye Torre Polanco
    (queda en 8 renombres, antes 9). Nuevas rutas `GET /torre-polanco-employees` y
    `POST /split-torre-polanco` (mismo patrón que `/split-golden`: los marcados en el
    checklist van a POLANCO PISO 16, el resto a POLANCO PISO 13; los activos, al no
    tener esta ambigüedad, se van todos a Piso 13 de un jalón). Cubre tanto si la
    persona sigue con el nombre viejo como si ya se renombró a Piso 13 por el botón
    anterior.
  - `frontend/src/pages/Branches.jsx` — se extrajo la lógica de "dividir con checklist"
    a un componente compartido (`SplitSection`), usado ahora dos veces (GOLDEN y Torre
    Polanco) en vez de tener el código de GOLDEN duplicado a mano para el segundo caso.
- **Por qué:** dato real de la empresa que el usuario fue descubriendo al revisar el
  checklist de GOLDEN — Xochitl sí quedó correcta ahí (es la única excepción real de
  GOLDEN), pero el resto de su lista pertenecía a otra sucursal con su propia excepción.
- **Verificación:** `node --check`; `npm run build`; Playwright headless (rutas
  mockeadas) — se confirmaron ambas secciones de división funcionando de forma
  independiente (una no afecta a la otra). **Pendiente del usuario:** entrar a
  `/branches`, correr "Aplicar corrección de nombres" si no lo ha hecho, marcar en el
  checklist de GOLDEN solo a Xochitl, y en el checklist de Torre Polanco a Francisco
  Aldana Flores, Jose Angel Guerrero Torres, Jose Joel Castilla Gutierrez, Noemi Sanchez
  Maldonado, Renata Gabriela De Leon Ramirez y Moises Marcovich Goldberg.

### 2026-07-16 — Corrección de nomenclatura de sucursales (Empleados y Activos reales)
- **Qué pasó:** el usuario aclaró que la Fase 2 malinterpretó el catálogo de sucursales —
  la lista vieja de 11 nombres (usada hoy en el desplegable "oficina/sucursal" de
  Empleados) estaba **desactualizada**; la lista de 16 nombres es la correcta. Dio la
  correspondencia exacta 1 a 1 entre ambas, con dos casos especiales: "GOLDEN" se divide
  en CISNES y POLANCO PISO 16 (según quién esté en cada una), y "SUC.6 CEDI Naucalpan" se
  divide en NAUCALPAN (CRISTALERIA) y NAUCALPAN (TLB) — esta segunda división se deja
  pendiente a petición del usuario ("resuelve lo demás primero").
- **Qué cambió:**
  - `backend/src/routes/branches.js` — `DEFAULT_BRANCHES` ahora tiene los 16 nombres
    correctos con su estatus de levantamiento real (de la tabla del documento original).
    Nuevo `OFFICE_RENAME_MAP` (9 renombres 1 a 1, sin ambigüedad) y 3 rutas nuevas:
    `POST /migrate-office-names` (aplica esos 9 renombres sobre `Employee.office`,
    `Asset.location` y el catálogo mismo, de un jalón), `GET /golden-employees` (lista a
    quién le falta dividir de GOLDEN, para armar un checklist real en vez de que alguien
    tenga que teclear nombres), y `POST /split-golden` (divide GOLDEN: los marcados en el
    checklist van a POLANCO PISO 16, el resto a CISNES).
  - `frontend/src/pages/Branches.jsx` — nuevo panel "Corrección de nomenclatura" con el
    botón para aplicar los 9 renombres (muestra cuántos empleados/activos cambiaron por
    cada uno) y el checklist para dividir GOLDEN.
  - `frontend/src/config/assetFields.js`, `frontend/src/pages/Employees.jsx`,
    `frontend/src/pages/SolicitarIngreso.jsx` — los 3 `OFFICES` hardcodeados actualizados
    a los nombres correctos; "GOLDEN" y "SUC.6 CEDI Naucalpan" se dejan temporalmente
    hasta correr/confirmar su división (quitarlos ahora dejaría sin opción visible a
    quien todavía no se ha migrado).
  - `backend/src/models/AuditLog.js` — se agregó `'sucursal'` al enum de `entity`; sin
    esto, los logs de auditoría del catálogo de Sucursales (Fase 2) fallaban en
    silencio (bug encontrado al revisar este cambio).
- **Por qué:** dato real de la empresa, no del documento de Finanzas — el usuario ya
  tenía la sucursal correcta y hacía falta corregir el sistema para reflejarla.
- **Verificación:** `node --check` en los archivos backend tocados; `npm run build`;
  Playwright headless (rutas mockeadas) — se confirmó el panel de migración completo:
  aplicar los 9 renombres (con el resumen de cuántos registros cambiaron) y dividir
  GOLDEN vía checklist (con confirmación antes de aplicar, y el checklist desaparece
  una vez que ya no quedan empleados en GOLDEN). **Pendiente de que el usuario:**
  (1) entre a `/branches` y presione "Aplicar corrección de nombres" y "Aplicar división
  de GOLDEN" en producción (esto no se puede correr desde aquí, no hay acceso directo a
  la base de datos), y (2) confirme cómo dividir Naucalpan Cristalería/TLB para
  completar esa migración después.

### 2026-07-16 — Fase 2 de requerimientos de Finanzas: sucursales, familias de activos, propiedad y telemetría
- **Qué pasó:** continuación del cierre de brechas de `AssetsManager_Requerimientos_2.docx`
  (Fase 1 fue la navegación). Esta fase cubre las secciones 3-4 del documento: catálogo de
  sucursales con estatus de levantamiento físico, familias de activos (incluyendo el
  "equipo especial" de ciertas sucursales), equipo propiedad del empleado (no de la
  empresa), y el gate de acceso a equipos de telemetría.
- **Qué cambió:**
  - **Catálogo de sucursales** — nuevo modelo `backend/src/models/Branch.js`
    (`name`, `inventoryStatus` levantado/pendiente, `equipmentScope`
    solo_telefonico/computo_completo, `notes`) + rutas `backend/src/routes/branches.js`
    (`GET /public` sin auth para formularios públicos, CRUD admin-only) + página nueva
    `frontend/src/pages/Branches.jsx` (ruta `/branches`, tabla editable). Se siembra la
    primera vez que se pide el catálogo con los mismos 11 nombres ya usados hoy como
    `office`/`location` — la tabla de 14 sucursales con estatus que dio la sesión usa
    otros nombres (Cisnes, Horacio, Tepotzotlán II/III/IV, etc.) que no se pudieron
    reconciliar con certeza contra los existentes; queda pendiente que Sistemas
    confirme la correspondencia y renombre/agregue desde esta misma página. **Nota:**
    los 3 selectores de sucursal hardcodeados en el frontend (`assetFields.js`,
    `Employees.jsx`, `SolicitarIngreso.jsx`) todavía NO se conectaron a este catálogo —
    queda para un siguiente ajuste, sin urgencia porque ya tienen los mismos valores.
  - **Familias de activos** — `backend/src/models/Asset.js`: 3 tipos nuevos
    (`microscopio`, `equipo_fiscal`, `escaner_diagnostico`) para el "equipo especial"
    mencionado en la sesión (tienda "Fantástico"). `frontend/src/config/assetFields.js`
    y `frontend/src/pages/Assets.jsx`: labels/iconos/specs + nueva pestaña "Equipo
    especial" en Activos.
  - **Equipo propiedad del empleado** — `Asset.companyOwned` (default `true`). Se
    muestra en el resguardo (badge "👤 empleado" en Activos) pero se excluye de los
    conteos de inventario en `frontend/src/pages/Indicadores.jsx` (Total/Disponibles/
    categorías/donut) cuando es `false`.
  - **Telemetría restringida** — `Asset.isTelemetry` + `User.canViewTelemetryAssets`
    (mismo patrón que los permisos de Gmail/Plataformas/ERP ya existentes — ni admin lo
    trae implícito). `backend/src/routes/assets.js` oculta activos marcados como
    telemetría de listados/detalle para quien no tenga el permiso. Checkbox nuevo en
    `Users.jsx` (solo visible/otorgable por la cuenta raíz de Gmail, mismo criterio que
    los demás). La carta de confidencialidad firmada sigue siendo un proceso de RH/legal
    fuera del sistema — esto solo aplica el gate técnico.
- **Por qué:** pedido explícito del documento de la junta de Finanzas del 10 de julio.
- **Verificación:** `node --check` en todos los archivos backend tocados; `npm run
  build` en frontend; Playwright headless (rutas mockeadas) — se confirmó la página de
  Sucursales (listar/crear), los checkboxes y badges nuevos en Activos (incluyendo la
  pestaña "Equipo especial"), y el checkbox de telemetría en Usuarios.

### 2026-07-16 — Se quita el sidebar fijo: barra superior + menú de selección (tipo Facebook)
- **Qué pasó:** el usuario reportó feedback directo del director tras ver la Fase 1 (sidebar
  reagrupado en 3 secciones): seguía viéndose desordenado, y "el de Mesa de Ayuda" no
  debía estar ahí (es el portal del EMPLEADO, Sistemas no navega hacia allá desde su
  propio panel). Lo que pide el director es no tener un "recuadro lateral enlistando las
  cosas" en absoluto — una página principal desde la que se van seleccionando las demás
  páginas, "tipo Facebook". Se confirmaron 2 decisiones con el usuario antes de
  reconstruir: (1) barra superior fija con botón "Menú" que abre una pantalla de
  selección de bloque → página (no un menú desplegable tradicional ni una página sin
  barra), y (2) una vez dentro de una página, ese mismo botón "Menú" siempre disponible
  para saltar a cualquier otra (no pestañas de páginas hermanas).
- **Qué cambió:**
  - `frontend/src/components/Layout.jsx` — reescrito por completo: ya no hay
    `<aside>` con lista de enlaces. Ahora es una barra superior delgada (logo — que
    lleva al inicio —, botón "Menú", usuario/cerrar sesión) + un overlay de menú de
    dos pasos: primero elegir bloque (Administración de Usuarios y Activos /
    Indicadores — Mesa de Ayuda ya NO aparece aquí), y al elegir "Administración" se
    ve una sola pantalla con todas sus páginas como tarjetas, agrupadas solo
    visualmente (Catálogos y Activos / Cuentas y Plataformas / Operación / Sistema).
    Un usuario ERP-only ve sus 3 páginas directo, sin el paso de bloque. Se
    conservaron exactamente los mismos permisos/condiciones que ya existían por rol
    y por permiso de cuentas (Gmail/Plataformas/ERP) — nada de visibilidad cambió,
    solo cómo se navega hacia ello.
  - `frontend/src/components/Layout.module.css` — reescrito (fuera todo el CSS de
    sidebar/colapsar/mobile-hamburger; nuevo CSS de barra superior + overlay).
  - `frontend/src/pages/Dashboard.jsx` — se quitó la tarjeta de acceso directo a
    "Mesa de Ayuda" (mismo motivo: no es una página a la que Sistemas navegue).
  - Se verificó que quitar el sub-enlace "Empleados → Bajas" del menú no rompe nada:
    `Employees.jsx` ya tiene sus propias pestañas internas (Activos/Bajas) que leen y
    escriben el query param solas, independientes del menú.
- **Por qué:** pedido explícito del director, con ejemplo concreto (Facebook) de cómo
  debía sentirse la navegación — prioridad alta por la revisión de avance del 17 de
  julio.
- **Verificación:** `npm run build`; Playwright headless (rutas mockeadas) — se
  confirmó la barra superior sin sidebar, el overlay de selección de bloque, la
  pantalla de páginas agrupadas dentro de "Administración", y que elegir una tarjeta
  navega y cierra el menú solo, aterrizando en la página correcta con sus propios
  controles intactos (ej. las pestañas Activos/Bajas de Empleados).

### 2026-07-16 — Navegación en 3 bloques + página Indicadores (Fase 1 de requerimientos de Finanzas)
- **Qué pasó:** el usuario compartió `AssetsManager_Requerimientos_2.docx`, resumen de la
  junta de revisión con dirección/Finanzas del 10 de julio (cubre toda la app excepto
  Tickets/Mesa de Ayuda, documentados aparte). Dirección aprobó el fondo ("~80% ya está
  hecho") pero pidió explícitamente reordenar la navegación en 3 bloques claros
  (Mesa de Ayuda / Administración de Usuarios y Activos / Indicadores) antes de la
  siguiente revisión — la app "se ve desordenada" aunque funcionalmente esté bien.
  Se auditó el código completo contra el documento (8 agentes de exploración) para
  separar lo que ya existe de lo que falta; esta es la Fase 1 (navegación), la más
  visible para la revisión del 17 de julio. El resto de fases (catálogo de sucursales,
  familias de activos, alias de marca, responsiva de área, envíos, permisos de
  usuarios internos, catálogo de conceptos) se agregan en los días siguientes.
- **Qué cambió:**
  - `frontend/src/components/Layout.jsx` — sidebar reagrupado en 3 secciones visuales:
    "Mesa de Ayuda" (link directo al portal), "Administración de Usuarios y Activos"
    (Disponibilidad, Empleados, Activos, Asignaciones, Responsivas, Cuentas, Envíos,
    Tickets, Ingresos RH, Solicitudes de Recursos, Usuarios, Auditoría, Planos de Red,
    Aplicaciones Internas) e "Indicadores" (nuevo).
  - `frontend/src/pages/Dashboard.jsx` — se deja como landing simple: saludo, accesos
    directos a los 3 bloques y "Pendientes de revisión". Todo el detalle analítico que
    tenía antes (KPIs de inventario, categorías, donut, top empleados, propiedad de
    cómputo, actividad del equipo, resumen de tickets) se mudó a la nueva página.
  - `frontend/src/pages/Indicadores.jsx` (nuevo, ruta `/indicadores`) — contiene todo
    ese detalle analítico movido de Dashboard.jsx (reutiliza `Dashboard.module.css`),
    incluyendo el leaderboard de actividad por persona/sucursal que ya existía.
  - `frontend/src/components/PortalLayout.jsx` — nuevo link "Volver al panel" en el
    sidebar del portal de empleado, visible solo si el navegador también tiene una
    sesión de Sistemas abierta (`localStorage.token`), para cruzar de un clic entre
    Mesa de Ayuda y el panel admin.
- **Por qué:** pedido explícito y repetido de dirección ("ahora luzcan", estructura de
  3 bloques) — es la brecha de mayor visibilidad para la revisión de avance de mañana.
- **Verificación:** `npm run build`; sin acceso a la base de datos real, se probó con
  `vite preview` + Playwright headless (rutas mockeadas) — se confirmó el sidebar con
  los 3 bloques, que `/indicadores` carga y muestra KPIs/categorías/actividad/tickets
  sin errores de consola, que el Dashboard trimmed muestra los accesos directos y
  pendientes, y que el portal de empleado muestra "Volver al panel" cuando hay sesión
  de Sistemas simultánea.

### 2026-07-15 — Tickets: adjuntar imágenes en la conversación (ambos lados)
- **Qué pasó:** el usuario pidió poder adjuntar imágenes en la conversación de un ticket
  ("para ver los errores y eso") — hasta ahora solo se podía adjuntar UNA evidencia al
  reportar el ticket (`Ticket.attachmentData`), pero no en los mensajes de ida y vuelta.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — `ticketMessageSchema` ahora acepta
    `attachmentData`/`attachmentMimeType`/`attachmentFileName` por mensaje (mismo patrón
    Buffer-en-Mongo que el adjunto del reporte inicial); `text` pasa a ser opcional
    (puede ser solo una imagen).
  - `backend/src/routes/tickets.js` — `POST /:id/messages` (empleado) y `POST /:id/reply`
    (Sistemas) ahora aceptan `multipart/form-data` con un campo `attachment` opcional
    (reutilizan el `upload`/`ALLOWED_ATTACHMENT_MIME` de 15MB que ya existía). Nueva ruta
    `GET /:id/messages/:messageId/attachment` para servir la imagen — como la puede pedir
    cualquiera de los dos lados de la conversación, valida el JWT a mano (no puede colgarse
    de `employeeAuth` ni `adminOnly` a secas, cualquiera de los dos bloquearía al otro lado).
  - `frontend/src/components/MessageAttachmentImage.jsx` (nuevo, compartido) — pide la
    imagen como blob con el axios que sí manda el Bearer token (no puede ser un
    `<img src>` directo) y la muestra como miniatura clicheable (abre el original).
  - `frontend/src/pages/MisTickets.jsx` y `frontend/src/pages/Tickets.jsx` — el composer
    de ambos lados ahora tiene un botón para adjuntar imagen (con chip de "archivo
    seleccionado" y opción de quitarlo antes de enviar), y las burbujas de la conversación
    muestran la miniatura si el mensaje trae una.
- **Por qué:** para poder mostrar capturas de pantalla de un error a media conversación
  (no solo al reportar el ticket), tanto el empleado como Sistemas.
- **Verificación:** `node --check` en Ticket.js/tickets.js; `npm run build` en frontend;
  sin acceso a la BD real, se probó con `vite preview` + Playwright headless (rutas de
  API mockeadas) en ambos lados — se confirmó que la miniatura se ve al abrir un ticket
  con un mensaje con imagen, que se puede adjuntar un archivo desde el composer (aparece
  el chip, se puede quitar) y que tras enviar la nueva burbuja también muestra la imagen.

### 2026-07-15 — Mis Tickets: los mensajes del empleado ahora quedan a la derecha
- **Qué pasó:** en la conversación del empleado, sus propios mensajes ("Tú") se veían a
  la izquierda y los de Sistemas a la derecha — al revés de la convención normal de chat
  (WhatsApp/iMessage), donde "mis mensajes" van a la derecha. El usuario pidió invertirlo.
- **Qué cambió:** `frontend/src/pages/MisTickets.jsx` — se intercambiaron las clases de
  alineación (`bubbleRowRight`/`bubbleGroupRight`) entre los mensajes del empleado y los
  de Sistemas/la resolución final, en las 3 burbujas del hilo (reporte inicial, mensajes
  de ida y vuelta, resolución). Del lado del admin (`Tickets.jsx`) no cambia nada — ahí
  la respuesta del propio admin ya estaba a la derecha, que es lo correcto desde su
  perspectiva.
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `npx vite build` sin errores. Verificado con `vite preview` +
  Playwright headless con una conversación de ida y vuelta: los mensajes de "Tú" aparecen
  a la derecha y los de Sistemas a la izquierda.

### 2026-07-15 — Tickets: clasificación por SLA (reemplaza Severidad)
- **Qué pasó:** el usuario compartió la matriz oficial de Niveles de Servicio (SLA) de
  Grupo Select Shop — 10 categorías de falla, cada una con exactamente un Nivel (1/2/3),
  una Prioridad (P4 Baja/P3 Media/P2 Alta/P1 Crítica) y tiempos objetivo de
  Respuesta/Resolución — y pidió que la app clasifique el ticket automáticamente
  (Prioridad + Nivel) en cuanto Sistemas elige la categoría, reemplazando el campo
  `severity` (Consulta/Baja/Media/Alta/Urgente) agregado unos días antes.
- **Qué cambió:**
  - `backend/src/models/Ticket.js`: nuevo `SLA_CATALOG` (las 10 filas de la matriz,
    exportado como `Ticket.SLA_CATALOG`). Se quita `severity`; se agregan `slaCategory`,
    `slaLevel` (1/2/3), `responseDueAt`/`resolutionDueAt` (calculados desde `createdAt` —
    el reloj del SLA corre desde que se reportó, no desde que se clasificó). `priority`
    pasa de 3 a 4 valores (se agrega `critica`/P1).
  - `backend/src/routes/tickets.js`: `PUT /:id/severity` → `PUT /:id/sla-category` — al
    elegir la categoría, en un solo guardado fija `slaLevel` + `priority` + fechas límite
    según la matriz; Sistemas puede seguir ajustando la prioridad a mano después.
  - `frontend/src/pages/Tickets.jsx` (admin): select "Categoría de Falla (SLA)" en vez de
    "Severidad"; al elegirla se reflejan de inmediato el nuevo Nivel de Servicio, la
    Prioridad (ahora con "Crítica" disponible) y la fecha límite de resolución.
    `isOverdue()` ahora usa la fecha límite real cuando ya se clasificó (antes solo
    heurística de días abierto).
  - `frontend/src/pages/MisTickets.jsx` (empleado, solo lectura): "Severidad Asignada" →
    "Nivel de Servicio" en el detalle y el badge de la lista.
- **Por qué:** pedido explícito del usuario, con la matriz SLA como referencia.
- **Verificación:** `node --check` sobre `Ticket.js`/`tickets.js`; `npx vite build` sin
  errores. Verificado con `vite preview` + Playwright headless: al clasificar un ticket
  como "Servidores y Core" en el admin, Prioridad pasa a "Crítica" y Nivel de Servicio a
  "Nivel 3" solos, con la fecha límite de resolución calculada; el empleado ve "Nivel de
  Servicio: Nivel 3" sin poder editarlo.

### 2026-07-15 — La encuesta CSAT ya no se puede cambiar una vez calificada
- **Qué pasó:** la entrega anterior (mismo día) dejaba volver a calificar/cambiar la
  respuesta en cualquier momento; el usuario pidió que, una vez calificado, solo se vea
  la respuesta elegida, sin poder editarla.
- **Qué cambió:**
  - `frontend/src/pages/MisTickets.jsx` (`CsatSurvey`): si `ticket.satisfactionRating` ya
    tiene valor, se muestra un recuadro fijo con esa respuesta (sin botones); las 5
    opciones solo aparecen mientras no se ha calificado.
  - `backend/src/routes/tickets.js` (`POST /:id/satisfaction`): rechaza con 400 si el
    ticket ya tiene `satisfactionRating` — refuerza en el servidor lo mismo que ya no deja
    hacer la interfaz. Al reabrirse un ticket (mensaje nuevo del empleado sobre uno
    resuelto), se limpia `satisfactionRating` junto con la resolución anterior, para poder
    calificar de nuevo cuando se resuelva esa nueva vuelta.
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `node --check` sobre `tickets.js`; `npx vite build` sin errores.
  Verificado con `vite preview` + Playwright headless: un ticket ya calificado muestra
  solo la respuesta elegida en un recuadro fijo, sin las demás opciones ni forma de
  cambiarla.

### 2026-07-15 — La ventana flotante se cierra sola al calificar la encuesta CSAT
- **Qué cambió:** `frontend/src/pages/MisTickets.jsx` — `CsatSurvey` ahora recibe un
  `onClose` (encadenado desde `MisTickets` → `TicketThread`) y lo llama medio segundo
  después de guardar la calificación — tiempo suficiente para ver la opción marcada antes
  de que la ventana de la conversación se cierre sola.
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `npx vite build` sin errores. Verificado con `vite preview` +
  Playwright headless: al elegir una opción de la encuesta se ve resaltada brevemente y
  luego la ventana flotante se cierra, volviendo a la lista de "Mis tickets".

### 2026-07-15 — Cierre de tickets: manual (Sistemas y empleado) + automático a los 5 días
- **Qué pasó:** el usuario preguntó en qué momento se cierra un ticket — la respuesta era
  que "cerrado" existía como estatus en el modelo/tablero pero ningún botón lo disparaba
  todavía. Pidió que se pudiera cerrar a mano (tanto Sistemas como el propio empleado) y
  que además se cierre solo si nadie responde después de resuelto.
- **Qué cambió:**
  - `backend/src/routes/tickets.js`: nuevo `POST /:id/close` (empleado dueño del ticket,
    solo si está `resuelto`). Nuevo `autoCloseStaleResolved()` — cierra en automático
    cualquier ticket `resuelto` con `resolvedAt` de hace 5+ días; se ejecuta de forma
    perezosa (sin cron real, que no aplicaría en Render free tier) cada vez que se pide la
    lista de tickets, del lado admin (`GET /`) o del empleado (`GET /mine`). Un mensaje
    nuevo del empleado ya reabre el ticket antes de que esto aplique, así que nunca cierra
    uno que sigue en curso.
  - `frontend/src/pages/Tickets.jsx` (admin): botón "Cerrar ticket" junto al ya existente
    "Reabrir", visible cuando el ticket está `resuelto` (reusa `PUT /:id/status`, que ya
    aceptaba `cerrado`).
  - `frontend/src/pages/MisTickets.jsx` (empleado): botón "Cerrar ticket" dentro de la
    conversación, visible cuando está `resuelto` — "¿Ya quedó resuelto y no necesitas
    seguir la conversación?".
- **Por qué:** pedido explícito del usuario — manual para ambos lados, más el cierre
  automático a los 5 días como respaldo.
- **Verificación:** `node --check` sobre `tickets.js`; `npx vite build` sin errores.
  Verificado con `vite preview` + Playwright headless en ambos lados: el botón "Cerrar
  ticket" del empleado cambia el estatus a "Cerrado" en la lista y el modal (composer
  desaparece, queda el aviso de cerrado); el del admin aparece junto a "Reabrir" con un
  ticket resuelto de prueba.

### 2026-07-15 — Rediseño: alias de Microsoft 365 como cuentas independientes + Tienda para Mercado Libre
- **Qué pasó:** el usuario probó el `aliases[]` embebido de la entrega anterior (dentro de
  la cuenta de Microsoft 365, un aviso "🔗 N alias" en la tabla) y pidió algo distinto —
  confirmado explícitamente: cada alias debe verse como **su propio renglón independiente**
  en Cuentas de Plataformas (con su propia contraseña), no escondido dentro de la cuenta
  de 365. También pidió que, al elegir **Mercado Libre**, se pueda capturar la **Tienda**
  a la que pertenece, con un desplegable que se va llenando solo con las tiendas ya
  capturadas antes.
- **Qué cambió (revierte el `aliases[]` embebido de la entrega anterior):**
  - `backend/src/models/PlatformAccount.js`: se quita `aliases[]`; se agregan `store`
    (texto, Tienda) y `aliasOf` (ObjectId → otra `PlatformAccount` de Microsoft 365,
    puramente informativo — no cambia que la cuenta sea 100% independiente: su propia
    contraseña, estado, etc.).
  - `backend/src/utils/createAccount.js` / `backend/src/routes/platformAccounts.js`:
    `POST /`, `POST /import` y `PUT /:id` ahora aceptan/guardan `store`/`aliasOf` en vez
    de `aliases`; `GET /` puebla `aliasOf` para mostrar la etiqueta en la tabla.
    `GET /:id/request-defaults` ahora prefiere `account.store` (si ya se corrigió ahí)
    sobre la tienda que traía la Solicitud original.
  - `frontend/src/pages/PlatformAccounts.jsx`: **Mercado Libre** se agrega a la lista de
    plataformas (no estaba). En "Nueva cuenta"/"Editar cuenta": campo "Tienda" (solo
    Mercado Libre) con `<datalist>` que sugiere las tiendas ya usadas en otras cuentas de
    Mercado Libre (crece solo, sin catálogo aparte); selector "¿Es alias de una cuenta de
    Microsoft 365?" (cualquier plataforma) con las cuentas de 365 existentes. Tabla: nueva
    columna "Tienda"; etiqueta "🔗 alias de {correo}" bajo el usuario cuando aplica.
- **Por qué:** pedido explícito del usuario, aclarado con una pregunta directa sobre qué
  significaba "de forma independiente".
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite build`
  sin errores. Verificado con `vite preview` + Playwright headless: una cuenta de
  Microsoft 365 y una de Mercado Libre (con Tienda y `aliasOf` apuntando a la de 365) se
  ven como renglones independientes en la tabla, cada una con su propia contraseña; al
  abrir "Nueva cuenta" y elegir Mercado Libre aparecen los campos "Tienda" y "¿Es alias
  de...?" correctamente.

### 2026-07-15 — Alias de Microsoft 365 también al crear la cuenta (no solo al editar)
- **Qué cambió:** la entrega anterior (mismo día) solo dejaba agregar/editar alias desde
  "Editar cuenta"; el usuario pidió que también se pudiera desde "Nueva cuenta". Se movió
  la sección de alias a una función compartida (`renderAliasSection`) que usan ambos
  modales, y `POST /platform-accounts` / `POST /platform-accounts/import` (alta nueva y
  registro de cuenta ya existente) ahora también aceptan y guardan `aliases` — mismo
  saneo (`sanitizeAliases`, extraído a `utils/createAccount.js` para no duplicarlo entre
  las 3 rutas que ahora lo usan).
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite build`
  sin errores. Verificado con `vite preview` + Playwright headless: al abrir "Nueva
  cuenta" con Microsoft 365 seleccionado (es la opción por default), aparece la misma
  sección "Alias de este correo" con agregar/quitar filas.

### 2026-07-15 — Cuentas de Plataformas: alias de Microsoft 365 + a qué plataforma se usan
- **Qué pasó:** el usuario explicó que en Microsoft 365 se pueden crear varios alias de
  correo sobre un mismo buzón, y que ya usa esos alias como usuario de login en distintas
  plataformas de venta (Mercado Libre, Amazon...) — preguntó si se podía llevar el
  registro de esos alias dentro de la cuenta de 365 y anotar en cuál plataforma se usa
  cada uno.
- **Contexto encontrado:** no existía una sección aparte de "cuentas de 365" — un buzón de
  Microsoft 365 ya es, hoy, un renglón más de "Cuentas de Plataformas"
  (`PlatformAccount` con `platform: 'Microsoft 365'`, junto con Amazon/Netflix/Adobe/etc.
  como cuentas de software). Se optó por agregar los alias como una lista embebida dentro
  de ese mismo registro, en vez de crear un modelo/página nueva — es la misma cuenta física
  de correo, solo con direcciones adicionales.
- **Qué cambió:**
  - `backend/src/models/PlatformAccount.js`: nuevo campo `aliases: [{ address, usedForPlatform }]`.
  - `backend/src/routes/platformAccounts.js`: `PUT /:id` ahora acepta `aliases` (se manda
    la lista completa cada vez, mismo patrón que `platforms[]` en Solicitar Cuenta).
  - `frontend/src/pages/PlatformAccounts.jsx`: en "Editar cuenta", cuando la plataforma es
    Microsoft 365, aparece "Alias de este correo" — lista editable (agregar/quitar) de
    pares dirección + plataforma en la que se usa. En la tabla, la celda de
    Usuario/Correo muestra "🔗 N alias" con un tooltip listando cada uno.
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite build`
  sin errores. Sin acceso a la base de datos real en este entorno, se verificó con `vite
  preview` + Playwright headless interceptando `GET /platform-accounts` con una cuenta de
  Microsoft 365 con 2 alias de prueba — se confirmó el aviso "2 alias" en la tabla y la
  sección completa (con ambos alias precargados) en el modal de edición.

### 2026-07-14 — Mesa Ayuda: Responsable de Soporte + Severidad + encuesta CSAT
- **Qué pasó:** el usuario pidió dos mejoras al detalle de ticket en Mis Tickets: (1) ver
  quién lo atiende y qué tan severo es, con el nombre real del agente en el hilo en vez
  de "Sistemas" genérico; (2) una encuesta de satisfacción de 5 opciones cuando el ticket
  queda resuelto.
- **Hallazgo antes de programar:** buena parte de (1) ya existía y no hacía falta
  duplicar — `Ticket.assignedByName` ya guarda el nombre del agente asignado (texto
  plano, lo llena `PUT /tickets/:id/assign`), y cada mensaje ya guarda `authorName` real
  (igual `ticket.resolvedByName` para la resolución). El "Sistemas" genérico estaba
  hardcodeado en el frontend, no era una limitación de datos — así que no se agregó un
  campo `assignedAgent` nuevo (habría duplicado `assignedByName` y creado dos fuentes de
  verdad en el mismo modal del admin), solo se dejó de hardcodear.
- **Qué cambió:**
  - `backend/src/models/Ticket.js`: 2 campos nuevos genuinos —
    `severity` (Consulta/Baja/Media/Alta/Urgente, distinto de `priority` que ya existía y
    no se toca) y `satisfactionRating` (las 5 opciones de la encuesta).
  - `backend/src/routes/tickets.js`: `PUT /:id/severity` (admin, mismo patrón que
    `PUT /:id/priority`) y `POST /:id/satisfaction` (empleado dueño del ticket, solo si
    `resuelto`/`cerrado`).
  - `frontend/src/pages/MisTickets.jsx` (portal oscuro): sección "Detalles del ticket"
    (Responsable de Soporte, Severidad Asignada) arriba del hilo; nombre real del agente
    en las burbujas (`m.authorName`/`ticket.resolvedByName`) en vez de "Sistemas"; badge
    de severidad junto al estatus en la lista; encuesta CSAT (5 opciones, un clic,
    se puede volver a cambiar) debajo del hilo, solo si el ticket ya está resuelto/cerrado.
  - `frontend/src/pages/Tickets.jsx` (admin, tema claro sin cambios): nuevo select
    "Severidad" junto al de "Prioridad" que ya existía; línea de solo lectura
    "Satisfacción del usuario"; badge de severidad en la tarjeta del tablero (mismo lugar
    que el badge de prioridad).
- **Por qué:** pedido explícito del usuario, con la aclaración de no tocar el resto del
  diseño/flujo — de ahí la decisión de reusar `assignedByName`/`authorName` en vez de
  agregar un campo redundante.
- **Verificación:** `node --check` sobre `Ticket.js`/`tickets.js`; `npx vite build` sin
  errores. Sin acceso a la base de datos real en este entorno, se verificó con `vite
  preview` + Playwright headless interceptando `GET /tickets/mine` (un ticket en proceso
  con agente/severidad/mensaje de un agente real, otro resuelto sin calificar) y
  `GET /tickets`/`GET /tickets/:id` del lado admin — se confirmó el panel de detalles,
  los nombres reales en las burbujas, el badge de severidad en la lista y el tablero, el
  select de Severidad y la encuesta CSAT completa con sus 5 opciones y colores.

### 2026-07-14 — Mercado Libre: roles fijos en vez de permisos genéricos (Solicitar Cuenta + PDF)
- **Qué pasó:** el usuario compartió la definición oficial de roles de Mercado Libre (KAM/
  Comercial, Atención al Cliente, Operación/Almacén, Business Intelligence, Crédito y
  Cobranza/Finanzas, Marketing/Contenido, Auditoría, Back Office) y pidió que, para esa
  plataforma específicamente, el formulario pida esos roles en vez de la lista genérica de
  permisos (Ventas/Publicaciones/Inventarios/Envío/Pagos/Facturas/Admin) que comparten las
  demás plataformas (Amazon, Walmart, etc.) — y que el PDF de la solicitud refleje lo mismo.
- **Qué cambió:**
  - `frontend/src/pages/SolicitarCuenta.jsx`: nueva constante `ML_ROLE_FIELDS` (los 8
    roles); cuando la plataforma marcada es "Mercado Libre" se muestra un checklist de
    roles (`togglePlatformRole`, campo `roles: []` nuevo por plataforma) en vez del
    checklist de permisos — las demás plataformas no cambian.
  - `backend/src/models/AccountRequest.js`: nuevo campo `roles: [String]` dentro de cada
    entrada de `platforms[]` (junto a `permissions`, sin tocarlo).
  - `backend/src/routes/accountRequests.js`: valida `roles` contra la lista fija
    (`ML_ROLE_KEYS`) antes de guardar, para que nadie mande claves arbitrarias llamando la
    ruta pública directo.
  - `backend/src/utils/accountRequestPdf.js`: la sección de plataformas del PDF muestra
    "ROLES" (con el checklist `[X]/[ ]` de los 8 roles) en vez de "PERMISOS" cuando la fila
    es Mercado Libre — el resto de plataformas se ve exactamente igual que antes.
  - `backend/src/routes/platformAccounts.js`: el "Rol o tipo de acceso" que se precarga al
    generar la Responsiva (una vez aprobada la cuenta) ahora también lee `roles` cuando la
    plataforma es Mercado Libre, en vez de solo derivarlo de `permissions`.
- **Por qué:** pedido explícito del usuario, con la tabla de roles de Mercado Libre como
  referencia.
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite build`
  sin errores. Se generó un PDF de prueba localmente (llamando `buildAccountRequestPdf`
  directo, sin necesidad de la base de datos) con una fila Mercado Libre (roles KAM + BI
  marcados) y una fila Amazon (permisos de siempre) — el PDF muestra "ROLES" con el
  checklist correcto en la primera y "PERMISOS" sin cambios en la segunda. También se
  verificó el formulario en vivo con Playwright: al marcar Mercado Libre aparece el
  checklist de roles; al marcar Amazon aparece el checklist de permisos de siempre.

### 2026-07-14 — Nuevo apartado "Mis Solicitudes" (Cuenta/Recurso/Ingreso)
- **Qué pasó:** el usuario ya tenía "Mis Tickets"; pidió lo mismo para las otras 3
  solicitudes que se llenan desde el wizard de Mesa de Ayuda (Solicitar Cuenta, Solicitar
  Recurso, Solicitar Ingreso) — ver en qué van (pendiente/aprobada/rechazada).
- **Problema encontrado:** ninguno de los 3 modelos (`AccountRequest`/`ResourceRequest`/
  `OnboardingRequest`) guardaba de forma confiable quién, logueado, llenó el formulario —
  `AccountRequest` solo valida el nombre contra un Employee real pero no lo guarda (y ese
  nombre es el beneficiario, no necesariamente quien solicita); `ResourceRequest.employeeRef`
  existe pero lo llena el autocompletado del formulario y el admin YA lo usa para
  auto-asignar el recurso al aprobar (`frontend/src/pages/ResourceRequests.jsx`) — no se
  podía reusar sin arriesgar romper esa asignación.
- **Qué cambió:**
  - Nuevo `backend/src/middleware/optionalEmployeeAuth.js` — decodifica el JWT de
    empleado si viene, pero nunca bloquea la petición (las 3 rutas `/public` se quedan
    públicas, ej. RH puede seguir llenando Solicitar Ingreso a nombre de alguien más).
  - Nuevo campo `submitterRef` (ObjectId → Employee) en los 3 modelos — separado de
    cualquier campo que ya usa el flujo de aprobación, se llena solo con quien esté
    logueado al enviar.
  - Nuevo `GET /account-requests/mine`, `GET /resource-requests/mine`,
    `GET /onboarding-requests/mine` (gated por `employeeAuth`, mismo patrón que
    `GET /tickets/mine`).
  - `SolicitarCuenta.jsx`/`SolicitarRecurso.jsx`/`SolicitarIngreso.jsx`: cambian de la
    instancia de `api` (admin) a `employeeApi`, así el JWT de empleado se manda solo si
    hay sesión — sin JWT, siguen funcionando igual de público que antes.
  - Nueva página `frontend/src/pages/MisSolicitudes.jsx` (ruta `/mis-solicitudes`,
    `EmployeeRoute`) — junta las 3 en una sola lista ordenada por fecha, mismo lenguaje
    visual (tabla + pills) que Mis Tickets/Mesa de Ayuda. Tercer ítem "Mis solicitudes" en
    el sidebar del portal (`components/PortalLayout.jsx`).
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite
  build` sin errores. Sin acceso a la base de datos real en este entorno, se verificó con
  `vite preview` + Playwright headless interceptando los 3 `GET .../mine` con una
  solicitud de cada tipo y estatus distinto — la lista combinada, los pills de color y el
  nuevo ítem de nav se ven correctos.

### 2026-07-14 — Mensajes de tickets "en vivo" (empleado ↔ Sistemas)
- **Qué pasó:** al conversar en un ticket (empleado en Mis Tickets, Sistemas en el
  admin), había que cerrar y volver a abrir para ver la respuesta de la otra parte.
- **Qué cambió:** mientras una conversación está abierta, ambos lados refrescan solos
  cada 5 segundos:
  - `backend/src/routes/tickets.js`: nuevo `GET /tickets/:id` (admin) — ticket individual
    con sus mismos populates (`assetRefs`/`assignedTo`/`appRef`), para no tener que volver
    a pedir el tablero completo en cada refresco.
  - `frontend/src/pages/Tickets.jsx` (`DetailModal`): `setInterval` cada 5s mientras el
    modal está abierto, llama al nuevo endpoint y actualiza `liveMessages`.
  - `frontend/src/pages/MisTickets.jsx`: mismo patrón del lado del empleado, pero
    reaprovechando `GET /tickets/mine` (ya trae los mensajes embebidos) — solo cuando hay
    una ventana de conversación abierta (`selectedId`).
- **Por qué se eligió polling y no WebSockets:** pedido explícito del usuario tras
  comparar ambas opciones — WebSockets da instantaneidad real pero el backend vive en
  Render free tier (se duerme por inactividad), lo que hace poco confiables las
  conexiones largas ahí; polling cada 5s no necesita infraestructura nueva y ya resuelve
  el problema real (ver mensajes sin cerrar/reabrir).
- **Verificación:** `npx vite build` sin errores; `node --check` sobre el backend
  modificado. Sin acceso a la base de datos real en este entorno, se verificó con `vite
  preview` + Playwright headless interceptando las respuestas de la API en ambos lados
  (empleado y admin): un mensaje "nuevo" simulado en la segunda respuesta del servidor
  aparece solo en pantalla ~5-10s después, sin ninguna interacción del usuario.

### 2026-07-14 — Quitar botón "Reportar un problema nuevo" duplicado + Reportar Ticket ya no se ve como ventana aparte
- **Qué cambió:**
  - Se quitó el botón "+ Reportar un problema nuevo" del panel de tickets en el dashboard
    de Mesa de Ayuda y de la parte de arriba de Mis Tickets — quedaba duplicado con la
    tarjeta "Tengo un problema o algo no funciona" del wizard, que ya lleva al mismo lado.
  - `ReportarTicket.jsx` usaba `.card`/`.header` de `SolicitarCuenta.module.css` (la misma
    tarjeta centrada con sombra que usan los formularios públicos sin sidebar), lo que la
    hacía sentir como una ventana flotante aparte del resto del portal. Ahora usa un
    cascarón propio (`ReportarTicket.module.css`: `.mainHead` + `.panel`, mismo patrón
    plano sin sombra que Mesa de Ayuda/Mis Tickets) — el título vive afuera como
    encabezado de página y el formulario en un panel plano, igual que las otras dos.
- **Por qué:** pedido explícito del usuario — ya no usa esos botones porque el wizard
  cubre lo mismo, y quería que Reportar Ticket combinara visualmente con el resto.
- **Verificación:** `npx vite build` sin errores. Capturas con `vite preview` + Playwright
  headless de las 3 pantallas (dashboard, Mis Tickets, Reportar un problema) confirmando
  que ya no aparece el botón duplicado y que Reportar Ticket luce igual de "plano" que las
  otras dos.

### 2026-07-14 — Fix: encabezado/✕/composer de la ventana flotante se escondían al scrollear
- **Qué pasó:** en la ventana flotante de la conversación (ver entrada anterior), todo el
  contenido — encabezado del ticket, burbujas y composer — vivía dentro del mismo
  contenedor con scroll, así que al scrollear la conversación el folio/título/estatus y el
  botón de cerrar (✕) se iban con el scroll, igual que el cuadro para responder.
- **Qué cambió:** el encabezado del ticket y el composer ahora son `position: sticky`
  (arriba y abajo respectivamente) dentro de una franja interna con su propio scroll
  (`.modalScroll`) — solo las burbujas se desplazan; encabezado, ✕ y composer se quedan
  fijos siempre visibles. (Nota técnica: el padding vertical del contenedor se movió al
  header/composer sticky en vez de quedarse en el contenedor — dejarlo en el contenedor
  abría una rendija por la que se asomaba una burbuja al hacer scroll.)
- **Por qué:** pedido explícito del usuario tras probar la ventana flotante.
- **Verificación:** `npx vite build` sin errores. Verificado con `vite preview` +
  Playwright headless con una conversación de 14 mensajes de prueba — capturas antes y
  después de scrollear al fondo confirman que encabezado/✕/composer no se mueven y no hay
  burbujas asomándose por detrás.

### 2026-07-14 — Mis Tickets: lista + ventana flotante para la conversación
- **Qué cambió:** `MisTickets.jsx` mostraba cada ticket como una tarjeta de conversación
  completa apilada una tras otra. Ahora muestra una lista/tabla (folio, tipo + asunto,
  pill de estatus, fecha — mismo lenguaje visual que el panel de tickets de Mesa de
  Ayuda) y, al hacer clic en un renglón, la conversación completa (`TicketThread`: reporte
  inicial, mensajes de ida y vuelta, resolución, composer para responder) se abre en una
  ventana flotante (overlay + modal) sobre la lista, con botón de cerrar.
- **Por qué:** pedido explícito del usuario tras ver el rediseño del portal.
- **Verificación:** `npx vite build` sin errores. Verificado con `vite preview` +
  Playwright headless interceptando `GET /tickets/mine` con tickets de prueba (sin acceso
  a la DB real en este entorno) — se confirmó la lista con los 3 estatus (abierto/en
  proceso/resuelto) y la apertura de la ventana flotante con la conversación al hacer clic.

### 2026-07-14 — Rediseño visual del portal de empleado (Mesa de Ayuda → Mis Tickets)
- **Qué pasó:** el usuario compartió un mockup (`mesa_de_ayuda_v2.html`) con un look oscuro
  tipo "app premium" — sidebar con logo/nav/usuario, dashboard "¿Qué necesitas?" con 4
  tarjetas, panel de tickets con tabla y pills de estatus — y pidió que todo el flujo de
  empleado (desde el login hasta los tickets) adoptara esa identidad visual. Aclaró que no
  debía verse como la tarjeta centrada/flotante del mockup, sino a pantalla completa, igual
  que el sidebar del panel admin (`components/Layout.jsx`).
- **Qué cambió:**
  - Nuevo `components/PortalLayout.jsx`/`.module.css`: sidebar fijo a pantalla completa
    (logo "Mesa Ayuda", nav Solicitudes/Mis tickets con ruta activa, bloque de usuario con
    iniciales + cerrar sesión), calcado del patrón full-viewport de `Layout.jsx` pero con
    el look oscuro del mockup.
  - Nuevo `styles/portal-theme.css` (importado una vez en `main.jsx`): paleta oscura fija
    del portal bajo la clase `.portalDark`, aislada del `:root` para no tocar el modo
    claro/oscuro conmutable del panel admin. Reusa el naranja de marca ya existente
    (`#E8431A`) en vez del de mockup, para que se sienta parte del mismo producto. Se
    agregó Manrope + IBM Plex Mono a `index.html` (junto a Inter, que ya estaba).
  - `MesaDeAyuda.jsx`: el dashboard ya logueado ahora vive dentro de `PortalLayout` y
    reconstruye la vista raíz igual al mockup — encabezado "¿Qué necesitas?", 4 tarjetas
    con íconos SVG de línea (antes emoji), y el panel "Sistema de tickets" con tabla +
    pills conectado a los mismos datos de siempre (`GET /tickets/mine`). El wizard de
    sub-pasos (acceso/recurso/tipo de ticket) sigue funcionando igual, solo restilizado.
  - `MisTickets.jsx` y `ReportarTicket.jsx`: envueltos en `PortalLayout` (se quitó su
    propia barra superior de saludo/logout, ya la resuelve el sidebar); conversación con
    burbujas y formulario restilizados con los mismos tokens.
  - `SolicitarCuenta.module.css` (compartido por Solicitar Cuenta/Ingreso/Recurso,
    Confirmar Envío, Login de empleado) y `EmployeeLoginWidget.module.css`: reescritos con
    la paleta oscura fija — quedan como tarjetas independientes (sin sidebar, siguen
    públicos/sin guard, ej. Alta de Ingreso lo usa RH para gente que aún no es empleada).
- **Por qué:** pedido explícito del usuario, con mockup de referencia adjunto.
- **Verificación:** `npx vite build` sin errores. Sin acceso a red/DB real en este entorno,
  se verificó visualmente con `vite preview` + Playwright headless (sesión de empleado
  simulada en `localStorage`, ya que no hay backend disponible aquí): capturas del login,
  el dashboard con sidebar y las 4 tarjetas, Mis Tickets, Reportar Ticket y Solicitar
  Ingreso — todas con buen contraste y layout a pantalla completa como se pidió.

### 2026-07-14 — Fix: dropdown de búsqueda de activo/solicitante en "Nueva salida de equipo" sin estilos
- **Qué pasó:** tras la auditoría general de contraste en modo oscuro (ver entrada siguiente), se pidió revisar puntualmente dropdowns personalizados (no `<select>` nativos) por si quedó alguno fuera. Se encontró uno real en `CreateShipmentModal.jsx` (modal de Asignaciones para registrar una salida de equipo): el buscador de "activo existente" dentro de cada renglón de equipo y el buscador de "solicitante" usaban las clases `styles.nameDropdown`/`styles.nameOption`/`styles.hint`, pero el componente importa sus estilos de `AccountRequests.module.css`, archivo que nunca definió esas clases (existen en `SolicitarCuenta.module.css`, un archivo distinto). Las clases resolvían a `undefined`, así que ambos dropdowns se renderizaban sin `position: absolute`, sin fondo ni color propio — no solo se veían mal en modo oscuro, no tenían estilo en ningún tema.
- **Qué cambió:** se reemplazaron esas referencias por las clases equivalentes que sí existen y ya tienen su par claro/oscuro correcto en `AccountRequests.module.css`: `.empDropdown`/`.empOption` (mismo patrón usado en el resto del archivo) y `.matchedTag` para el texto de confirmación "vinculado a un activo existente".
- **Por qué:** pedido explícito de continuar la revisión de modo oscuro con foco en listas desplegables, tras confirmar que los `<select>` nativos ya estaban cubiertos casi en su totalidad.
- **Commit(s):** ver `git log` (push inmediato tras el fix).
- **Verificación:** `npx vite build` sin errores; se descartaron como falsos positivos el resto de dropdowns de la app (Solicitar Cuenta/Ingreso/Recurso, Confirmar Envío, Stock, NetworkLayoutDetail, Accessories, Layout) — todos ya tenían su override de modo oscuro correcto.

### 2026-07-14 — Auditoría y corrección de contraste en modo oscuro en toda la app
- **Qué pasó:** el usuario reportó (con capturas) el detalle de un ticket en modo oscuro donde los labels ("Asunto", "Descripción", "Evidencia", "Conversación") y el texto de las burbujas de la conversación eran casi invisibles — texto oscuro sobre fondo oscuro. Se corrigió ese caso puntual y, a petición explícita, se auditó el resto de la aplicación por el mismo tipo de bug: un color de texto pensado para fondo claro que el bloque `@media (prefers-color-scheme: dark)` de ese archivo nunca sobrescribe, aunque el fondo detrás sí se oscureció.
- **Causa raíz típica:** casi todos los módulos de la app declaran su propio bloque de modo oscuro por archivo — cuando se agregaba un elemento nuevo (o una burbuja de chat con estilos en línea) sin acordarse de tocar ese bloque, el fondo se oscurecía pero el texto se quedaba con su color original oscuro.
- **Corregido (13 archivos):**
  - `Tickets.module.css`/`.jsx`: labels y texto del detalle (`.field label`/`.field p`/`.modalHint`), inputs/selects del modal, y las burbujas de conversación (ahora con clases propias `.bubbleText`/`.bubbleMine`/`.bubbleTheirs` en vez de estilos en línea sin color).
  - `AccountRequests.module.css` y `Page.module.css` (compartidos por Empleados/Solicitudes/Asignaciones): pestañas (`.tab`) y botón de cerrar del modal al pasar el mouse.
  - `Assets.module.css`: checkbox de asignación, botón de quitar selección, botón de editar duplicado.
  - `EmployeeDetail.module.css`: la tarjeta de activo seleccionada fuerza un fondo claro en ambos temas — el nombre de marca/modelo se quedaba en blanco sobre ese fondo claro en modo oscuro.
  - `NetworkLayoutDetail.module.css` y `NetworkLayouts.module.css`: leyenda del plano, texto monoespaciado, botón de cerrar.
  - `GmailAccounts.module.css`, `PlatformAccounts(Erp).module.css`, `ImportModal.module.css`: avisos ámbar/naranja (contraseña pendiente, tipo por defecto, alertas de importación) — el fondo del aviso se oscurecía pero el texto de advertencia no.
  - `SolicitarCuenta.module.css` (compartido por Solicitar Cuenta/Ingreso/Recurso, Reportar Ticket, Confirmar Envío, Mesa de Ayuda): checkboxes, bloque de texto legal, tarjetas de folio, fila de aceptación, texto de éxito.
  - `Assignments.jsx`/`Stock.jsx`/`ConfirmarEnvio.jsx`: colores de texto en línea sin variante oscura (chip de no. de empleado, columnas "Puesto"/"Notas"/"Detalle", botón "✕ Ver todas", bloque "Qué se está enviando") — se convirtieron a clases CSS con su propio par claro/oscuro.
  - **2 regresiones encontradas y revertidas:** `Stock.module.css` (`.numDispZero`) y `MesaDeAyuda.module.css` (`.dividerText`) tenían un override de modo oscuro que en realidad oscurecía más el texto en vez de aclararlo — quedaban peor que si no hubiera override.
- **Por qué:** pedido explícito del usuario tras ver el bug — "revisa toda la app y corrige esos detalles, porque no se ve".
- **Verificación:** `npx vite build` sin errores. Se usó un agente de exploración para mapear cada archivo `.module.css` con bloque dark contra los colores de texto oscuro definidos fuera de ese bloque, y para buscar estilos en línea con fondo claro fijo sin `color` explícito — se descartaron los falsos positivos (badges con su propio par fondo+color ya autoconsistente en ambos temas, ej. `.statusBadge`, y el sidebar, que es oscuro a propósito en ambos temas). Se probó en Chromium real con tema oscuro forzado: el detalle de un ticket real con conversación (antes ilegible, ver capturas del reporte), la tabla de Asignaciones, el filtro de Disponibilidad, y el formulario de Solicitar Cuenta — todos con buen contraste ahora. Sin datos de prueba que limpiar (todas las verificaciones fueron de solo lectura contra datos reales).

### 2026-07-14 — Mesa de Ayuda ahora exige login para entrar (no solo para Tickets) + pantalla de bienvenida rediseñada
- **Qué cambió:** la entrega anterior (mismo día) dejaba ver el wizard completo sin sesión y solo pedía login al llegar a Tickets. El usuario probó eso y no le gustó — pidió que **toda la Mesa de Ayuda** requiera sesión desde la entrada. Ahora:
  - **Sin sesión:** solo se ve una pantalla de bienvenida dedicada — logo, una vitrina de 3 iconos de lo que hay adentro (Cuentas y accesos / Equipo y recursos / Tickets) y el formulario de login/activación. Nada del wizard ni de las opciones se muestra hasta iniciar sesión.
  - **Con sesión:** la pantalla se transforma en un home real — encabezado con saludo y "Cerrar sesión" siempre visibles arriba, dos **pills de navegación rápida** ("🧭 Solicitudes" / "🎫 Mis tickets") que bajan directo a cada sección, el wizard de siempre, y la sección de tickets (vista previa + reportar nuevo + ver todos).
  - Como ya no hay forma de llegar al wizard sin sesión, se quitó toda la lógica de "recordar a dónde iba" (`pendingPath`) que se había agregado en la entrega anterior — ya no hace falta, la sesión existe desde antes de ver cualquier opción.
- **Qué NO cambió:** Solicitar Cuenta/Ingreso/Recurso siguen siendo anónimas por su URL directa (`/solicitar-cuenta`, etc.) — el usuario confirmó explícitamente que el login solo debía exigirse para entrar a la Mesa de Ayuda en sí, no para esas páginas (ej. RH sigue pudiendo dar de alta a alguien que ni siquiera existe como empleado todavía). `/empleado/login` se conserva igual, como respaldo para quien llega directo a `/reportar-ticket`/`/mis-tickets` sin pasar por Mesa de Ayuda.
- **Por qué:** feedback directo del usuario tras ver la versión anterior — "no me gustó", quería el login obligatorio desde la entrada y que se viera mejor, con navegación.
- **Verificación:** en Chromium real — sin sesión, `/mesa-de-ayuda` no muestra ningún rastro del wizard (confirmado por ausencia del texto "¿Qué necesitas?" en el DOM); activarse ahí mismo aterriza en la misma pantalla ya completa, sin redirigir a ninguna otra URL; las pills de navegación bajan a la sección correspondiente; recargar la página mantiene la sesión; elegir un tipo de ticket desde el wizard con sesión ya activa navega directo a `/reportar-ticket` con el tipo preseleccionado (sin el rodeo de antes); "Cerrar sesión" limpia el token y regresa a la pantalla de bienvenida. Probado en tema claro y oscuro. El empleado real usado para la prueba (activación vía el flujo) se restableció a su estado original al terminar, y la entrada de auditoría que generó ese restablecimiento se borró por ID puntual.

### 2026-07-14 — Mesa de Ayuda se vuelve la pantalla principal del empleado: login inline + vista previa de sus tickets
- **Qué cambió:** el login del portal (antes solo en `/empleado/login`, a donde se redirigía a quien intentaba entrar sin sesión) ahora vive **dentro de la propia Mesa de Ayuda** — nadie tiene que salir de la pantalla para iniciar sesión o activarse. El recuadro de "Sistema de Tickets" cambia según haya sesión o no:
  - **Sin sesión:** el mismo widget de correo/no. de empleado + contraseña (o crear una, primera vez) aparece ahí mismo, en vez de un botón que llevaba a otra página.
  - **Con sesión:** el recuadro se convierte en un mini-resumen — "Hola, {nombre}" con "Cerrar sesión", una **vista previa de hasta 3 tickets recientes** (folio, asunto, estatus con color) que llevan a "Mis Tickets" al hacer clic, botón "+ Reportar un problema nuevo" y link "Ver todos mis tickets →". Así la Mesa de Ayuda funciona como panorama completo de lo que la plataforma le ofrece a esa persona, no solo un menú de botones.
  - El wizard ("Tengo un problema o algo no funciona") sigue llevando a las mismas 5 sub-preguntas de tipo de ticket, pero si la persona no tiene sesión al elegir una, la elección se recuerda (`pendingPath`) y la pantalla baja sola al recuadro de login — en cuanto inicia sesión ahí mismo, se le manda directo al formulario con el tipo ya preseleccionado, sin perder lo que había elegido.
- **Qué NO cambió:** Solicitar Cuenta/Ingreso/Recurso siguen siendo anónimos, sin login — solo Tickets lo requiere, como ya había quedado. `/empleado/login` se conserva como respaldo para quien llega directo a `/reportar-ticket` o `/mis-tickets` sin pasar por Mesa de Ayuda (ej. un link viejo compartido) — sigue funcionando igual, con el mismo `?next=`.
- **Detalle técnico:** se extrajo la lógica de login/activación a un componente compartido (`frontend/src/components/EmployeeLoginWidget.jsx`, sin navegación propia — recibe `onSuccess`) que usan tanto `EmployeeLogin.jsx` (página completa, para el respaldo) como `MesaDeAyuda.jsx` (embebido, sin duplicar código).
- **Por qué:** pedido explícito del usuario — que el login sea desde la Mesa de Ayuda y que esa pantalla sea la principal, donde el empleado ve de un vistazo todo lo que la plataforma le ofrece (no solo un formulario de reporte).
- **Verificación:** contra el backend real (empleado real activado por el flujo, restaurado a su estado original al terminar) — se probó en Chromium real de punta a punta: elegir "Tengo un problema" → "Software" sin sesión muestra el aviso "Inicia sesión para continuar con tu reporte" en el mismo recuadro; activarse ahí mismo (sin navegar a ninguna otra URL) aterriza directo en `/reportar-ticket?tipo=software` con el radio ya marcado; con sesión, el recuadro muestra los tickets reales de prueba con su estatus; "Cerrar sesión" limpia el token y regresa al widget de login. Se confirmó también que `/empleado/login` sigue funcionando como respaldo y que `/reportar-ticket` sin sesión sigue redirigiendo ahí con `?next=`. Probado en tema claro y oscuro. Los 2 tickets de prueba y las 3 entradas de auditoría se borraron al terminar.

### 2026-07-14 — Medir Tickets por urgencia (prioridad conectada — antes existía en el modelo pero no se usaba en ningún lado)
- **Qué se encontró:** `Ticket.priority` (baja/media/alta) existía en el modelo desde que se construyó el módulo, con un comentario explícito de que "la fija Sistemas al triage" — pero no había ninguna ruta que la cambiara ni ningún lugar de la interfaz que la mostrara o dejara elegirla. Era un campo muerto.
- **Qué se conectó:**
  - **Fijar la prioridad:** en el detalle de un ticket (`/tickets`), nuevo selector **"Prioridad"** (🔴 Alta / 🟡 Media / 🟢 Baja) visible sin importar el estatus, se guarda al cambiarlo sin pasos adicionales.
  - **Verla de un vistazo:** la tarjeta del tablero muestra un punto de color cuando la prioridad no es la media/default (🔴 o 🟢); el detalle también la resalta con el mismo color.
  - **Ordenar por lo urgente, no solo lo nuevo:** cada columna del tablero (Abierto/En proceso/Resuelto/Cerrado) ahora ordena primero por prioridad (alta arriba) y, dentro de la misma prioridad, por lo más reciente — antes solo ordenaba por fecha, así que un ticket urgente podía quedar enterrado debajo de varios triviales más nuevos.
  - **Medirla:** nueva tarjeta KPI "🔴 Urgentes" (prioridad alta entre los activos) en la fila de arriba, y nuevo panel "Por urgencia (activos)" (mismo estilo de barras que "Por tipo de soporte") con el desglose Alta/Media/Baja. En el Dashboard, la tarjeta de Tickets ganó una tercera estadística "🔴 Prioridad alta" junto a "Le impiden trabajar".
- **Por qué:** pedido explícito de la lista de Finanzas — "medir tickets también por urgencia (para KPIs)". El campo ya existía pero nadie podía usarlo ni verlo.
- **Verificación:** contra el backend real — se crearon 3 tickets de prueba, se les fijó prioridad baja/media/alta (`PUT /tickets/:id/priority`), se confirmó que una prioridad inválida se rechaza y que la ruta pide sesión de admin (401 sin token), y que `GET /tickets` devuelve el orden esperado (alta, media, baja) dentro del mismo estatus. Se probó en Chromium real: el tablero muestra los 3 tickets ordenados correctamente con sus puntos de color, el KPI y el panel reflejan los conteos, y cambiar la prioridad de un ticket desde el detalle (sin cerrar el modal) actualiza al instante el badge de la tarjeta, su posición en la columna, el KPI y el panel de fondo. Los 3 tickets de prueba y las 7 entradas de auditoría que generó la prueba se borraron al terminar; el empleado real usado para probar (activación vía el portal) se regresó a su estado original.

### 2026-07-14 — Mis Tickets: conversación real de ida y vuelta (no solo visual)
- **Qué cambió:** la entrega anterior (mismo día) solo pintaba el reporte inicial + la resolución formal como si fuera un chat, pero era de un solo sentido. Ahora es una conversación real:
  - **El empleado** puede escribir un mensaje de seguimiento en cualquier momento desde `/mis-tickets` (campo de texto + "Enviar" debajo del hilo) — ej. "sigue sin funcionar" o responder algo que Sistemas preguntó.
  - **Sistemas** puede responder desde el detalle del ticket en `/tickets` (nuevo campo "Responder") **sin tener que marcar el ticket como resuelto** — para poder preguntar algo o dar un avance antes de llegar a una resolución formal.
  - **Un mensaje nuevo del empleado sobre un ticket ya "Resuelto" lo reabre solo** (pasa a "Abierto" y limpia la resolución anterior, mismo criterio que ya usaba el "Reabrir" manual) — si el problema regresó, no hace falta levantar un ticket nuevo. Sobre un ticket "Cerrado" ya no se puede escribir (se le pide reportar uno nuevo).
  - La primera respuesta de Sistemas en un ticket "Abierto" lo pasa solo a "En proceso" (mismo criterio que ya aplicaba "Asignar").
- **Backend:** `Ticket.messages` (nuevo, arreglo embebido `{ from: 'employee'|'admin', authorName, text, createdAt }`) — la resolución formal (`resolution`/`resolutionNotes`, con su catálogo) sigue siendo un campo aparte, no se tocó. Nuevas rutas: `POST /tickets/:id/messages` (empleado, valida que el ticket sea suyo, bloquea si está cerrado, reabre si estaba resuelto, avisa a Telegram) y `POST /tickets/:id/reply` (admin, pasa de abierto a en_proceso).
- **Frontend:** `MisTickets.jsx` ahora intercala `ticket.messages` entre el reporte inicial y la resolución (si la hay), con su propio campo de texto. `Tickets.jsx` (admin) muestra el mismo hilo dentro del detalle y un campo "Responder" — se actualiza el hilo al instante sin cerrar el modal (para no cortar la conversación a media respuesta), y de fondo se refresca el tablero por si el estatus cambió. Nuevo badge 💬 con el conteo de mensajes en la tarjeta del tablero.
- **Por qué:** pedido explícito del usuario tras la primera versión — quería poder ir y venir con Sistemas, no solo ver un historial de una sola vía.
- **Verificación:** contra el backend real (empleado real activado por API, restaurado a su estado original al terminar) — se armó una conversación completa (empleado → admin → empleado), confirmando que el estatus pasó de abierto a en_proceso solo con la primera respuesta de Sistemas; se resolvió el ticket y se confirmó que un mensaje nuevo del empleado lo reabrió solo (resolución limpiada); se confirmó que un ticket "cerrado" rechaza mensajes nuevos del empleado con el aviso correcto; se confirmó 401 sin sesión. Se probó en Chromium real de punta a punta en ambos lados: el empleado mandó un mensaje desde `/mis-tickets` y lo vio aparecer en su hilo, y Sistemas respondió desde el detalle en `/tickets` sin que el modal se cerrara, viendo su propia respuesta reflejada de inmediato. Ticket de prueba eliminado y las 7 entradas de auditoría que generó la prueba borradas por ID puntual al terminar — no quedó residuo.

### 2026-07-14 — Reportar Tickets ahora requiere login de empleado; nuevo portal "Mis Tickets" con historial tipo conversación
- **Qué cambió (lo grande):** reportar un ticket dejó de ser anónimo — ahora requiere haber iniciado sesión como empleado. Nuevo portal, separado por completo del login de Sistemas:
  - **`/empleado/login`** (público): un solo flujo para login y activación — se escribe correo corporativo o no. de empleado; si la cuenta nunca se ha activado, pide crear una contraseña (mínimo 6 caracteres); si ya existe, pide la contraseña para entrar. **Nadie de Sistemas da de alta estas cuentas a mano** — cualquier empleado activo se activa solo la primera vez, ya que la cuenta "existe" desde que existe su registro de Employee.
  - **`/reportar-ticket`** (ahora protegida): ya no pide ni busca el nombre — la identidad viene de la sesión ("Reportando como **{nombre}**"), así que no puede fallar el emparejamiento por nombre como antes.
  - **`/mis-tickets`** (nueva, protegida): el historial del empleado pintado **como una conversación** — cada ticket es una tarjeta con folio/tipo/estado/app ligada, una burbuja con lo que reportó (izquierda) y, si Sistemas ya lo resolvió, una burbuja con la resolución (derecha) con su fecha; si no, un aviso de "todavía sin respuesta". Es una vista nueva sobre los mismos campos que el ticket ya tenía (`subject`/`description`/`resolution`/`resolutionNotes`) — **sin modelo de mensajes nuevo**, primera versión a propósito solo visual (no se puede responder de vuelta todavía).
  - Quien llega sin sesión a `/reportar-ticket` o `/mis-tickets` (ej. desde el wizard de Mesa de Ayuda o el botón directo de Tickets) se manda a `/empleado/login?next=...` y, al entrar, regresa exactamente a donde iba — si venía con `?tipo=software` desde el wizard, ese tipo sigue preseleccionado después de iniciar sesión.
- **Backend:** `Employee` ganó `password`/`passwordSetAt` (null hasta que el empleado se activa). Nuevo middleware `employeeAuth.js` (JWT separado, payload `{ employeeRef, name, type: 'employee' }`, 30 días — sesión de baja fricción, no la administrativa) y `routes/employeeAuth.js` (`POST /lookup`, `/activate`, `/login`, con límite por IP). `POST /tickets/public` (anónimo) se **retiró por completo** — se reemplazó por `POST /tickets/mine` y `GET /tickets/mine` (ambos con `employeeAuth`), donde la identidad y el activo(s) asignado(s) se resuelven del lado del servidor a partir del `employeeRef` real de la sesión, no de lo que mande el formulario.
- **Fix de seguridad de paso (no relacionado con el pedido, encontrado al agregar los campos nuevos):** `GET /employees`, `GET /employees/:id` y la respuesta de `PUT /employees/:id` excluían campos pero no estaban preparados para uno sensible — se les agregó `.select('-password')`/limpieza explícita para que el hash de la contraseña del portal nunca viaje al frontend; y `POST /employees`/`PUT /employees/:id` ahora descartan explícitamente `password`/`passwordSetAt` si vinieran en el body, para que una edición general de ficha nunca pueda pisar por accidente la contraseña del portal.
- **Recuperación sin correo:** el sistema no manda correos (solo avisos a Telegram), así que si un empleado olvida su contraseña no hay "recuperar por correo". En **Empleados**, cualquier fila que ya se activó muestra un botón **"🔑 Restablecer Tickets"** — limpia su contraseña para que pueda volver a activarse desde cero. Nuevo `PUT /employees/:id/reset-portal-access`.
- **Por qué:** pedido explícito del usuario — quería que el histórico de tickets tuviera dueño real (login) y que el empleado pudiera ver la conversación que ha tenido con Sistemas, no solo reportar y desaparecer.
- **Verificación:** contra el backend real (JWT de admin firmado localmente) — se usó un empleado real que nunca había activado su cuenta: lookup por no. de empleado y por correo (con mayúsculas distintas) antes de activarse, activación con contraseña corta rechazada, activación real, segundo intento de activar rechazado ("ya tiene contraseña"), login con contraseña incorrecta rechazado, login correcto, `POST /tickets/mine` creó el ticket con `employeeRef`/activos asignados resueltos del lado servidor y `appRef` ligado a una app real del catálogo, visible correctamente en `GET /tickets` (admin, con responsable poblado) y en `GET /tickets/mine`. Se confirmó que `POST /tickets/public` ya no acepta solicitudes anónimas. Se probó en Chromium real de punta a punta: entrar sin sesión a `/reportar-ticket?tipo=software` reenvía a login preservando el destino, tras iniciar sesión aterriza de vuelta con "Software" ya marcado, se reportó y resolvió un ticket, y `/mis-tickets` mostró la conversación completa (burbujas, badges, fechas) en tema claro y oscuro; cerrar sesión bloquea `/mis-tickets` de nuevo. Se probó el botón admin de restablecer acceso. Al terminar: ticket de prueba eliminado, el empleado real usado para la prueba se regresó a su estado original (`password: null`, nunca activado) con el mismo botón de restablecer, y las 3 entradas de auditoría que generó la prueba se borraron por ID puntual — no quedó ningún residuo ni se tocó ningún dato real de nadie más.

### 2026-07-13 — Conectar el catálogo de Aplicaciones Internas con Tickets
- **Qué cambió:** un ticket de tipo **Software** ahora puede ligarse a una aplicación específica del catálogo (ver entrada anterior) — en `/reportar-ticket`, al elegir "Software" aparece un selector opcional **"¿Es sobre alguna aplicación en particular?"** con las aplicaciones activas del catálogo (solo si hay al menos una). En la vista de Tickets (admin), el detalle del ticket muestra **"🗂️ Aplicación: {nombre} — enrutar a {responsable}"** cuando aplica, y la tarjeta del tablero lleva un badge 🗂️ — así Sistemas ve de inmediato si el ticket es, por ejemplo, de "Cuentas por Pagar" y a quién le toca (ej. Héctor, no Sistemas), sin abrir el detalle.
- **Backend:** `Ticket.appRef` (nuevo, `ObjectId` opcional → `InternalApp`). Nuevo `GET /api/internal-apps/public` (sin JWT, solo aplicaciones `active`, únicamente `name`/`description` — el responsable y la documentación no le sirven a quien reporta, solo a Sistemas). `POST /tickets/public` acepta `appRef` opcional y lo revalida contra la base (existe + está activa) antes de guardarlo — igual que `employeeRef`, ya que la ruta pública no lleva JWT y el valor podría venir manipulado; si no es válido, se guarda el ticket igual sin ese dato, nunca se rechaza el reporte por esto. `GET /tickets` (admin) ahora puebla `appRef` con `name`/`responsibleName`/`responsibleArea`. El aviso de Telegram al reportarse un ticket nuevo también incluye el nombre de la app cuando aplica.
- **Por qué:** completa el pedido del director de Finanzas — el catálogo por sí solo (entrada anterior) ya documentaba responsables, pero faltaba la pieza que de verdad resuelve "a dónde enruto esto": poder ligar el ticket concreto a la app concreta.
- **Verificación:** contra el backend real (JWT firmado para un admin real) — se creó una aplicación de prueba, se confirmó que `GET /internal-apps/public` la expone sin responsable/documentación, se reportó un ticket público con `appRef` válido y se confirmó que `GET /tickets` lo devuelve con la app poblada (nombre + responsable); se probó también con un `appRef` inventado (24 hex chars pero inexistente) y se confirmó que el ticket se crea igual, sin ese campo. Se probó de punta a punta en un Chromium real: reportar un ticket eligiendo "Software" → aparece el selector con las 2 aplicaciones reales ya registradas ("Cuentas por pagar", "ERP") → se envía → en Tickets (admin) aparece el badge 🗂️ en la tarjeta y el detalle muestra "Aplicación: Cuentas por pagar — enrutar a [responsable real ya registrado]". Ticket, aplicación y las 4 entradas de auditoría de prueba se borraron por ID puntual al terminar — no se tocó ningún dato real (las 2 aplicaciones reales y los 2 tickets reales existentes quedaron intactos).

### 2026-07-13 — Catálogo de Aplicaciones Internas (nuevo módulo admin, para saber a dónde enrutar un ticket de aplicativo)
- **Qué se agregó:** nuevo módulo admin-only **"Aplicaciones Internas"** (`/internal-apps`, enlace en el sidebar dentro de "Administración") — catálogo de aplicativos internos (ej. "Cuentas por Pagar", "Aplicativo de Ventas") con nombre, descripción, **responsable** (nombre + área/departamento en texto libre, ej. "Héctor Ramírez — Costos y SKU") y notas. Cada aplicación puede tener un **documento** (PDF/DOC/DOCX) subido y guardado en Mongo como buffer — mismo criterio que Responsivas/Planos de Red, ya que Render no persiste el filesystem entre despliegues. Tabla con botones para subir/ver/reemplazar/quitar el documento, editar y eliminar la aplicación.
- **Backend:** modelo `InternalApp` (`backend/src/models/InternalApp.js`) + rutas `backend/src/routes/internalApps.js` (`GET/POST /`, `GET/PUT/DELETE /:id`, `POST /:id/document` con `multer` en memoria limitado a PDF/DOC/DOCX de hasta 20MB, `GET /:id/document` para descargar, `DELETE /:id/document` para quitar solo el archivo) — todas protegidas con `auth`+`adminOnly`. Se agregó `'aplicacion_interna'` al enum `entity` de `AuditLog` y se registran `crear`/`editar`/`eliminar` en cada acción.
- **Por qué:** pedido del director de Finanzas (ver nota de proyecto) — que Sistemas tenga un inventario/catálogo de aplicaciones internas con documentación, para saber hacia dónde enrutar un ticket cuando es sobre un sistema específico (ej. que un ticket de "cuentas por pagar" se sepa que es de Héctor, no de Sistemas). Se decidió con el usuario dejar esta primera entrega como **solo el catálogo** — todavía no se liga desde Reportar Ticket ni se muestra en la vista de Tickets; esa conexión queda pendiente para una siguiente sesión.
- **Verificación:** backend corrido localmente contra la base real (JWT firmado para un admin real, sin atajos de código) — se creó una aplicación de prueba, se subió un PDF y se confirmó que la descarga es idéntica byte a byte, se confirmó que un archivo `.txt` se rechaza con el mensaje esperado, se probó editar, quitar solo el documento, eliminar la aplicación, y que sin token la ruta responde 401. Se confirmaron las 5 entradas de auditoría generadas (crear/subir doc/editar/quitar doc/eliminar) y se borraron por ID puntual al terminar, sin dejar residuo. Se probó también el flujo completo en un Chromium real (crear → subir documento → editar → eliminar, con el enlace del sidebar navegando correctamente) sin errores de consola. `npx vite build` sin errores.

### 2026-07-13 — Mesa de Ayuda: "tengo un problema técnico" se integra al wizard (ya no solo acceso directo)
- **Qué cambió:** la pregunta raíz del wizard (`frontend/src/pages/MesaDeAyuda.jsx`) ganó una 4ª opción, **"Tengo un problema o algo no funciona"**, con su propia sub-pregunta "¿de qué tipo es el problema?" — los mismos 5 tipos que ya usa `ReportarTicket.jsx` (Hardware/Software/Red-Conectividad/Cuenta-Acceso/Otro), cada uno navegando a `/reportar-ticket?tipo=...` con el radio correspondiente ya preseleccionado (mismo mecanismo que las otras ramas). La etiqueta de la pregunta raíz pasó de "Solicitudes" a **"¿Qué necesitas?"**, ya que ahora mezcla solicitudes con reportar un problema.
- **El acceso directo a Tickets se queda, pero con el texto aclarado:** el recuadro aparte de "Sistema de Tickets" (siempre visible, debajo del wizard) no se quitó — sigue siendo la vía rápida para quien ya sabe que lo suyo es un ticket. Se reescribió su texto ("¿Ya sabes que es un ticket?" / "Repórtalo directo aquí, sin pasar por las preguntas de arriba.") para que no se lea como si repitiera lo mismo que la nueva rama del wizard, sino como el atajo para quien no necesita que le pregunten nada.
- **Por qué:** pedido explícito del usuario tras la primera versión del wizard — "tengo un problema técnico" también debe caer dentro del árbol de preguntas, no solo quedar como botón suelto aparte.
- **Verificación:** `npx vite build` sin errores. Probado en Chromium real (Playwright) las 5 sub-ramas del nuevo tipo "problema" — cada una navegó a la URL con el `?tipo=` esperado (`hardware`/`software`/`red`/`cuenta_acceso`/`otro`); se confirmó con capturas que el grid de 4 opciones en la raíz y de 5 en la sub-pregunta se acomodan bien (3+1 y 3+2 por fila); se confirmó que `?tipo=otro` marca el radio correcto y además revela el campo "¿De qué se trata?" que ya exigía ese tipo. Sin errores de consola.

### 2026-07-13 — Mesa de Ayuda: enrutamiento inteligente (wizard de preguntas en vez de botones con nombre de módulo)
- **Qué cambió:** el bloque "Solicitudes" de `/mesa-de-ayuda` dejó de ser 3 botones directos con nombre de módulo — ahora es un wizard de 1-2 preguntas en lenguaje cotidiano. Pregunta raíz **"¿qué necesitas hoy?"**: "Acceso a un sistema o correo" (sub-pregunta: Gmail / Plataforma de venta / ERP), "Equipo, accesorio o servicio" (sub-pregunta: Equipo o accesorio / Línea telefónica / Software o licencia) o "Alta de un nuevo ingreso" (navega directo, no tiene sub-tipo). Cada rama final navega al formulario público real que ya existía (`/solicitar-cuenta`, `/solicitar-recurso`, `/solicitar-ingreso`) — el wizard no crea nada nuevo, solo decide a dónde mandar a la persona. Botón "← Volver" para corregir la primera respuesta sin recargar la página.
- **Preselección en el formulario destino:** la rama elegida viaja como `?tipo=` en la URL y el formulario correspondiente lo lee al montar para dejar ya marcada la opción (checkbox/radio) que corresponde — la persona llega a llenar el mismo formulario de siempre, pero un paso adelantado, y puede corregir la preselección libremente:
  - `SolicitarCuenta.jsx`: `?tipo=gmail|platforms|erp` → marca `wantsGmail`/`wantsPlatforms`/`wantsErp`.
  - `ReportarTicket.jsx`: `?tipo=hardware|software|red|cuenta_acceso|otro` → marca el radio de `ticketType` correspondiente (se valida contra `TICKET_TYPES`, un valor inválido o ausente deja el campo vacío como antes).
  - `SolicitarRecurso.jsx`: `?tipo=telefono|software` → agrega `'Línea Telefónica'`/`'Software o Licencia'` a `resourceItems` (las únicas dos opciones estáticas, ya que el resto del catálogo carga async vía `customOptions` y no está disponible de forma síncrona al montar).
  - `SolicitarIngreso.jsx` no recibió cambios — no tiene un campo de "tipo" único que valga la pena preseleccionar desde el wizard.
- **El bloque de Tickets no se tocó:** sigue siendo su propio recuadro aparte, siempre visible, con acceso directo a `/reportar-ticket` sin pasar por ninguna pregunta — a propósito, para quien ya sabe que lo suyo es un ticket de soporte.
- **Por qué:** primera pieza del "enrutamiento inteligente" pedido por el director de Finanzas (ver nota de proyecto) — que el sistema pregunte "qué necesitas" y decida solo hacia dónde enrutar, sin que la persona tenga que saber que existen módulos separados por debajo. Queda pendiente para más adelante que el wizard también pueda cubrir "tengo un problema" con sub-pregunta de tipo de ticket (hoy ese camino solo existe como acceso directo, no integrado al wizard) y que se conecte con el catálogo de aplicaciones internas que también pidió el director.
- **Verificación:** `npx vite build` sin errores. Probado en un Chromium real (Playwright) las 6 combinaciones de rama + sub-tipo (Gmail/Plataforma/ERP, Equipo/Teléfono/Software) más el camino directo de Ingreso — cada una navegó a la URL esperada; se confirmó visualmente con capturas que el checkbox/radio correcto queda marcado en cada formulario destino (ERP marcado en Solicitud de Cuentas, Red marcado en Reportar Ticket, Línea Telefónica marcada en Solicitud de Recursos) y que el resto de las opciones queda sin marcar. Se probó también el botón "← Volver" (regresa a la pregunta raíz sin perder el estado de la página) y no se encontraron errores de consola.

### 2026-07-13 — Nueva página pública "Mesa de Ayuda" (punto de entrada único, primer paso de la reorganización pedida por Finanzas)
- **Qué cambió:** nueva página pública `/mesa-de-ayuda` (`frontend/src/pages/MesaDeAyuda.jsx`, sin login ni sidebar, mismo lenguaje visual que Solicitar Cuenta/Ingreso/Recurso/Reportar Ticket) con un menú de botones en vez de que la persona tenga que saber a cuál de las páginas públicas sueltas entrar. Dos bloques visualmente separados: **"Solicitudes"** (Cuenta o acceso → `/solicitar-cuenta`, Ingreso de personal → `/solicitar-ingreso`, Recurso o servicio → `/solicitar-recurso`) y, aparte, con su propio recuadro destacado, **"Sistema de Tickets"** (→ `/reportar-ticket`) para cuando el problema es una falla/soporte, no una solicitud.
- **No se tocó ninguna página existente:** las 4 URLs públicas (`/solicitar-cuenta`, `/solicitar-ingreso`, `/solicitar-recurso`, `/reportar-ticket`) siguen funcionando exactamente igual si alguien ya las tiene guardadas — `/mesa-de-ayuda` es una puerta de entrada nueva que enlaza hacia ellas, no un reemplazo.
- **Por qué:** feedback del director de Finanzas (2026-07-10, ver nota de proyecto) — pidió que exista un solo punto de entrada ("Mesa de Ayuda") en vez de que el usuario final tenga que decidir por su cuenta entre Reportar Ticket/Solicitar Cuenta/Solicitar Ingreso/Solicitar Recurso. Este cambio cubre esa primera pieza (unificar el "input" del usuario); quedan pendientes las otras dos pedidas (enrutamiento interno automático "qué necesitas" → módulo correcto, y los otros 2 bloques grandes del sistema — Administración e Indicadores) para sesiones futuras, con la presentación al director el 2026-07-17 como referencia de avance.
- **Verificación:** `npx vite build` sin errores; probado en un Chromium real (Playwright) en tema claro y oscuro — los 4 botones navegan a su URL correcta (`/solicitar-cuenta`, `/solicitar-ingreso`, `/solicitar-recurso`, `/reportar-ticket`) y no hay errores de consola propios de esta página (es estática, sin llamadas a API).

### 2026-07-10 — Planos de Red: cableado/conexiones entre dispositivos con código de color
- **Qué pidió Felipe (Infra):** una vez colocadas cámaras, gabinetes intermedios con sus switches y los NVRs del site en el plano, poder dibujar la conexión entre cada cámara y su switch, y los uplinks entre switches y el router — con un trazo personalizado (no una línea recta, para simular el recorrido real del cable) y un color distinto por tipo de conexión (cámara-switch, switch-router, AP-switch), para poder leer la estructura de la red de un vistazo.
- **Qué se agregó:** nuevo modo **"🔌 Conectar dispositivos"** en el editor del plano (junto a "Agregar dispositivo") — clic en el dispositivo de origen, clics sobre el plano para ir marcando el recorrido del cable, y clic en el dispositivo destino para cerrar la conexión. El trazo se dibuja en vivo mientras se traza, y una vez guardado queda como una línea de color sobre el plano, debajo de los pines. Clic en una línea ya dibujada la borra (con confirmación).
- **Color automático, no un campo que haya que llenar:** el color de cada conexión se calcula solo a partir de qué dos tipos de dispositivo conecta (Cámara→Switch verde, AP→Switch azul, Switch→Switch/uplink ámbar, Switch→Router/uplink morado, NVR→Switch cian, cualquier otro par en gris) — nada que Felipe tenga que elegir a mano ni que se pueda desincronizar del par real de dispositivos. Leyenda de colores agregada debajo del plano.
- **Backend:** modelo nuevo `LayoutConnection` (`layout`, `fromDevice`/`toDevice` referencian pines de `LayoutDevice`, `path`: lista de puntos en porcentaje) + `GET/POST /api/network-layouts/:id/connections` + `DELETE /api/network-layouts/connections/:id`. Al guardar, el backend fuerza el primer y último punto del trazo a las coordenadas reales de los pines de origen/destino (no a donde cayó el clic aproximado). Cascada de borrado: eliminar un pin borra las conexiones que lo tocan; eliminar el plano borra todas sus conexiones.
- **Verificación:** probado contra producción (backend local contra la base real, JWT firmado para un admin real) — plano de prueba con 3 pines (cámara/switch/router), conexión cámara→switch con un trazo de 4 puntos confirmando que los extremos quedaron exactos en los pines (no en los puntos de prueba deliberadamente "mal puestos" que se mandaron), conexión switch→router, `GET` trayendo ambas con los dispositivos poblados, borrado del pin del switch confirmando que sus 2 conexiones desaparecieron solas (cascada), y borrado del plano completo. `npx vite build` sin errores. Datos de prueba y las 8 entradas de auditoría específicas que generó se borraron por ID puntual al terminar.

### 2026-07-10 — Planos de Red: catálogo de "dispositivos descubiertos" para identificar cámaras sin el NVR
- **Qué pidió el usuario:** Felipe (Infra) tiene el plano y ya sabe dónde está físicamente cada una de sus ~72 cámaras, pero no tiene las credenciales del NVR, así que no puede saber qué IP/MAC le toca a cada una — solo lo sabe de la única que él mismo instaló ("Cortina 8"). Sus únicas dos opciones eran conseguir acceso al NVR (fácil si se logra) o subir cámara por cámara a leer la etiqueta física (inviable con 72, varias fuera de su alcance por altura). Se le sugirió apoyarse en la herramienta de descubrimiento de red del propio fabricante (SADP de Hikvision, ConfigTool de Dahua, etc.), que lista IP/MAC/modelo/serie de todo lo conectado a la red **sin pedir credenciales** (solo detección pasiva) — el problema que quedaba era cargar esos ~72 registros y saber cuál le toca a cada pin del plano sin capturarlos a mano uno por uno.
- **Qué se agregó:** nuevo botón **"📡 Importar dispositivos descubiertos"** en el editor del plano — sube el .xlsx/.csv que exporta la herramienta de descubrimiento (detecta las columnas de IP/MAC/modelo/serie por palabra clave, ya que el nombre exacto varía por fabricante), muestra una vista previa con checkboxes (excluye automáticamente filas sin MAC o repetidas dentro del mismo archivo) y lo importa como un catálogo aparte — esto **no coloca ningún pin**, solo arma la lista de "lo que hay en la red".
- **Vincular cada pin (nuevo o ya existente) sin escribir IP/MAC a mano:** dentro del formulario de un dispositivo (nuevo o editar uno ya colocado) aparece un buscador **"Completar con un dispositivo descubierto"** que filtra por IP/MAC/modelo/serie y, al elegir uno, llena IP/MAC/serie de un jalón. Conforme Felipe vaya identificando físicamente cuál MAC le toca a cuál cámara (ej. apagando puertos PoE uno a uno en el switch y viendo cuál desaparece del listado de la herramienta de descubrimiento, sin tener que subir a verla), solo busca esa MAC en el picker y la asigna al pin correcto en un clic.
- **Panel de pendientes:** debajo de la tabla de dispositivos aparece "📡 Dispositivos descubiertos por red sin identificar (N)" — la lista de lo importado cuya MAC todavía no coincide con ningún pin ya colocado (comparación por MAC normalizada, sin importar separador ni mayúsculas), con botón para quitar del catálogo una fila mal importada.
- **Backend:** `NetworkLayout.discoveredDevices` (subdocumentos `ip`/`mac`/`model`/`serialNumber`) + `POST /api/network-layouts/:id/discovered-devices` (importa en lote, deduplica por MAC normalizada contra lo ya importado y dentro del mismo archivo) + `DELETE /api/network-layouts/:id/discovered-devices/:discoveredId`. El emparejamiento contra los pines ya colocados se calcula en el frontend comparando MACs normalizadas — no se guarda ningún estado de "ya usado" que se pueda desincronizar.
- **Verificación:** probado contra producción (backend corrido localmente contra la base real, con JWT firmado para un admin real) — importar 4 filas de prueba (1 duplicada con MAC en otro formato, 1 sin MAC) dejó exactamente 2 nuevas (`added:2, skipped:2`); se creó un pin de prueba sin IP/MAC, se le asignó vía `PUT` el IP/MAC de una de las importadas (mismo mecanismo que usa el picker del frontend) y quedó correcto; se probó `DELETE` de una entrada del catálogo. `npx vite build` sin errores. Plano de prueba eliminado (cascada borra su pin) y las 4 entradas de auditoría específicas que generó esta prueba se borraron por ID puntual, no por filtro de entidad completa.

### 2026-07-10 — Módulo de Planos de Red (nuevo, para Infra)
- **Qué pidió el usuario:** su compañero de Infra necesitaba poder subir el layout/plano de una sucursal y "asignarle" encima los datos de cámaras, NVRs, APs, etc. (IP, MAC, número de serie). Al aclarar, salió que ese inventario de cámaras del compañero todavía no está cargado como Activos formales en el sistema (aún no tiene acceso a los grabadores), así que el diseño tenía que soportar tanto ligar a un Activo real como capturar los datos del dispositivo directo sobre el plano, sin depender de que exista el Activo primero.
- **Qué se agregó:** módulo nuevo `/network-layouts` (admin-only, junto a Tickets/Envíos en el sidebar) con dos pantallas:
  - **Lista de planos** (`NetworkLayouts.jsx`): sube una imagen (JPG/PNG/WEBP) por sucursal, con nombre y sucursal opcional; miniatura + conteo de dispositivos por tarjeta.
  - **Editor visual** (`NetworkLayoutDetail.jsx`): plano de fondo con pines colocables con clic (coordenadas guardadas en porcentaje, independientes del tamaño en pantalla), un modal por dispositivo con tipo/estado/IP/MAC/serie/notas y un buscador para **ligar opcionalmente** el pin a un Activo ya existente (o dejarlo como captura libre si el equipo aún no está dado de alta). Tabla de dispositivos debajo del plano como respaldo sin depender de los pines.
- **Backend:** modelos `NetworkLayout` (imagen como `Buffer`, igual que Responsivas/Tickets — el filesystem de Render no persiste) y `LayoutDevice` (`assetRef` opcional), rutas CRUD en `backend/src/routes/networkLayouts.js`, nuevo `'access_point'` como tipo de Activo (con campos `band`/`ssid`/`macAddress`), entidad `plano_red` agregada a Auditoría.
- **Verificación:** probado contra producción con imagen y datos de prueba reales — subida de plano, descarga de imagen (bytes idénticos), creación de dispositivo ligado a un Activo real (cámara Dahua existente) y de un dispositivo con captura libre (sin Activo), edición, conteo de dispositivos por plano, eliminación de dispositivo y de plano completo (con cascada). Limpieza posterior por ID específico tanto del plano de prueba como de las 4 entradas de Auditoría que generó (no por filtro de entidad completa, para no repetir el borrado accidental de auditoría real de una sesión anterior).

### 2026-07-10 — "Zabbix de equipos" dentro de Tickets
- **Qué pidió el usuario:** un apartado inspirado en Zabbix (que en la empresa ya usan para monitorear red) pero para EQUIPOS — quería ver qué máquinas físicas (modelo, número de serie) están dando problemas, sin tener que revisarlo mezclado dentro del ticket normal.
- **Qué se agregó:** toggle arriba de `/tickets` — **"🎫 Tickets"** (el tablero de siempre) / **"🛰️ Zabbix — Equipos"** (nueva vista). La vista Zabbix NO lista tickets, lista ACTIVOS: agrupa todo el histórico de tickets por cada equipo en su `assetRefs` y le calcula una severidad con la misma paleta de colores que usa Zabbix de verdad (Desastre/Alta/Promedio/Advertencia/OK), según una heurística simple documentada en el código: bloqueante+vencido = Desastre; bloqueante o vencido = Alta; 2+ tickets abiertos = Promedio; 1 ticket abierto normal = Advertencia; nada abierto = OK.
- **Tabla:** severidad (con punto de color), equipo (marca/modelo + número de serie), tickets abiertos, total histórico, fecha del último problema, y un botón "Ver tickets →" que manda a la vista normal ya filtrada por ese activo (reutiliza el mismo `?assetId=` que ya existía desde el badge en Activos).
- **Verificación:** probado contra producción — se recalculó a mano la severidad de **9 activos reales** con tickets (celulares, laptops, monitor, tablet, adaptador) usando la misma lógica del componente, confirmando que clasifica correctamente. Todo de solo lectura, sin datos de prueba que limpiar.

### 2026-07-10 — Modo oscuro en toda la aplicación
- **Qué pasaba:** el usuario reportó que con el navegador/sistema en tema oscuro la app "se ve muy extraño" — la causa real: sin declarar `color-scheme`, el navegador pinta los controles nativos (inputs, selects, checkboxes, scrollbar) con su tema oscuro por default mientras el resto de la página (fondos blancos definidos a mano en cada CSS module) se queda en claro fijo — una mezcla, no un diseño oscuro real.
- **Qué se corrigió:** `color-scheme: light dark` en `index.css` (controles nativos coherentes con el tema del sistema) + un bloque `@media (prefers-color-scheme: dark)` en **19 de los 20 archivos CSS del proyecto** (todas las páginas y componentes, excepto `NotFound.module.css` que ya es oscuro por diseño en ambos temas) — mismo criterio en todos: superficies claras (`#fff`/`#fafafa`/`#f0f0f0`) pasan a gris oscuro (`#1c1e22`/`#17181b`/`#2c2e33`), texto oscuro pasa a claro (`#f0f0f0`/`#ccc`/`#999`), y los acentos de color (ámbar de avisos, verde de éxito, azul de info) se oscurecen para no quemar la vista mientras conservan su significado.
- **Cobertura:** shell global (sidebar/fondo), Dashboard, Login, Empleados/Asignaciones/Detalle de Empleado, Activos/Accesorios, Disponibilidad, Auditoría, Usuarios, Cuentas Gmail/Plataformas/ERP, Solicitudes de Cuentas/Ingreso/Recursos/Envíos, Tickets (ya lo traía), Responsivas archivadas, modal de importación de Excel.
- **Verificación:** build de frontend sin errores en cada tanda de archivos; se confirmó con `grep` que 19/20 archivos CSS del proyecto ya tienen su bloque de modo oscuro. No se pudo verificar visualmente en navegador con el tema oscuro activado (sin esa herramienta disponible en el entorno) — es un cambio de solo CSS, sin lógica de negocio de por medio.

### 2026-07-10 — Tickets: rediseño completo como página independiente
- **Qué pidió el usuario:** que `/tickets` se sintiera como su propia aplicación (dashboard, tablero, vencimientos, alertas, reportes), no una tabla más reciclando el estilo de las demás bandejas de revisión.
- **Qué se hizo:** hoja de estilos propia (`Tickets.module.css`, acento teal en vez del naranja de marca, para diferenciarlo visualmente) y rediseño completo de `Tickets.jsx`:
  - **KPIs arriba:** Abiertos, En proceso, Vencidos, Impiden trabajar, Resueltos (7 días), Días promedio para resolver.
  - **Vencimientos/alertas:** heurística simple y documentada en el código (no es un SLA formal) — un ticket que le impide trabajar a alguien y lleva más de 1 día sin resolverse, o uno normal con más de 5, se marca "Vencido" (badge ⏰ en la tarjeta, aviso destacado arriba si hay alguno).
  - **Reportes:** desglose por tipo de soporte (barras), total histórico/resueltos/cerrados/sin asignar, y las resoluciones más comunes (de los tickets ya resueltos).
  - **Tablero tipo kanban** en vez de tabla plana: 4 columnas (Abierto/En proceso/Resuelto/Cerrado), cada ticket como tarjeta con folio, tipo, asunto, quién reportó, equipo, iniciales de quién lo tiene asignado, y badges (⚠️ bloqueante, ⏰ vencido, 📎 con evidencia) — clic en la tarjeta abre el mismo detalle de siempre (asignar/resolver/reabrir/eliminar), ahora con su propio estilo de modal.
  - Filtro por tipo de soporte arriba del tablero; el filtro por activo (que llega desde el badge en Activos) se conserva igual.
- **Verificación:** build de frontend sin errores; se revisaron a mano los 2 tickets reales que ya existen en producción (ambos "En proceso", asignados a Lilly Arroyo, creados hoy) contra la lógica de cómputo (vencidos, desglose por tipo, promedio de resolución) para confirmar que los números que mostraría la página son correctos — sin necesidad de crear ni borrar ningún dato de prueba, todo fue de solo lectura. No se pudo ver el render final en navegador (sin esa herramienta disponible en el entorno).

### 2026-07-10 — Aviso: correo de cuenta Compartida no debe llevar nombres
- **Qué pasaba:** un compañero del usuario tuvo que explicarle a mano a alguien llenando la Solicitud de Cuentas que el correo de una cuenta compartida no debe llevar nombres, solo puesto/área — el formulario no lo decía en ningún lado.
- **Qué se corrigió:** cuando el tipo de cuenta Gmail es **Compartida**, el campo "Correo solicitado" ahora muestra un aviso explícito (⚠️ el correo NO debe llevar nombres — usa el puesto o área, ej. ventas/atencion/compras) y el placeholder cambia a un ejemplo por puesto en vez de `nombre.apellido@gmail.com`.
- **De paso:** la sugerencia automática de correo (que arma `nombre.apellido@gmail.com` a partir del nombre) solo aplicaba antes sin importar el tipo de cuenta — ahora solo sugiere así para **Individual**; si cambian a Compartida y el campo tenía la sugerencia automática (sin que la hayan editado a mano), se limpia solo para que el aviso y el placeholder por puesto tomen su lugar.
- **Verificación:** build de frontend sin errores; es lógica puramente de UI (dos `useEffect` complementarios sin dependencia de backend), revisada a mano para confirmar que no hay ciclo entre ambos.
- **Extendido a Plataformas y ERP:** el usuario pidió que el mismo aviso aplicara "para todo" — se agregó el mismo mensaje (⚠️ No debe llevar nombres — usa el puesto o área) y el mismo placeholder por puesto al campo "Usuario o correo con el que quieres que quede" de Plataformas de venta (uno por cada plataforma marcada) y de ERP, ya que esas cuentas normalmente también son compartidas/departamentales.
- **Extendido también a Gmail Individual:** el usuario aclaró que en Gmail lo normal es "Individual" (Compartida es raro), así que dejar el aviso solo para Compartida significaba que casi nunca se veía. El aviso y el placeholder por puesto ahora se muestran siempre en Gmail, sin importar el tipo de cuenta — se quitó por completo la sugerencia automática `nombre.apellido@gmail.com` (y el estado `gmailTouched` que la acompañaba, ya sin uso), porque ya no aplica ni siquiera para Individual.

### 2026-07-10 — QR del link de seguimiento de Envíos (para cuando no hay a dónde mandarlo)
- **Qué pasaba:** el usuario no siempre tiene el número del mensajero a la mano para mandarle el link de "marcar en tránsito" — necesitaba una forma de dárselo sin escribir ni compartir nada, directo desde su pantalla.
- **Qué se agregó:** en el detalle de un Envío (mientras no esté "recibido"), junto al link de siempre, ahora aparece un **código QR** que apunta al mismo link — el mensajero lo escanea con su celular desde la pantalla de quien está armando el envío y cae directo a la página para marcar "en tránsito" (o, más adelante, a la de confirmar recepción), sin necesitar su número ni mandarle nada.
- **Cómo se hizo:** se agregó la librería `qrcode.react` (genera el QR en el navegador, del lado del cliente — no se manda el link a ningún servicio externo de terceros).
- **Verificación:** build de frontend sin errores, confirmado que el nombre exportado (`QRCodeSVG`) coincide con la librería instalada. No se pudo probar visualmente en navegador esta vez (sin herramienta de navegador disponible en el entorno) — es un componente puro sin lógica de negocio (solo codifica el mismo link ya usado y verificado en el flujo de Envíos).

### 2026-07-10 — Tickets: desglose en Dashboard + campo "especifica" en tipo "Otro"
- **Campo faltante:** al elegir "Otro" como tipo de soporte en `/reportar-ticket`, no había dónde decir de qué se trataba (a diferencia de "Otro" en las demás solicitudes, que sí piden especificar). Se agregó `Ticket.otherTypeDetail` — obligatorio solo si el tipo es "Otro", se ve en la tabla/detalle de Tickets y en el aviso de Telegram.
- **Dashboard — más detalle, no solo el conteo:** el usuario pidió que Tickets no solo apareciera como número en "Pendientes de revisión", sino con más contexto. Se agregó una tarjeta nueva "Tickets" (junto a "Actividad real del equipo") con: total de tickets activos, cuántos le impiden trabajar a alguien (⚠️), desglose por tipo de soporte (Hardware/Software/Red/Cuenta-Acceso/Otro, mismo estilo de barras que "Activos por categoría"), y los 5 tickets más recientes (mismo estilo que "Últimas asignaciones").
- **Nota real (no simulada):** al probar contra producción se encontraron **2 tickets reales** ya reportados por empleados (Lilly Estefany Arroyo y Miguel García) y ya autoasignados por Lilly — el sistema de Tickets ya está en uso real, no solo en pruebas.
- **Incidente durante la limpieza (transparencia):** al borrar mis 2 tickets de prueba, un filtro de limpieza demasiado amplio (`AuditLog.deleteMany({ entity: 'ticket' })`, sin acotar por folio) borró también las 2 entradas reales de Auditoría de cuando Lilly se autoasignó esos tickets reales. Los tickets en sí y su asignación quedaron intactos (no se tocó `Ticket`, solo `AuditLog`) — se perdió únicamente el rastro histórico de esas 2 acciones, ya reportado directamente al usuario. Corregido el criterio para limpiezas futuras: acotar siempre por folio/ID específico, nunca por `entity` completa, en módulos ya en uso real.
- **Verificación:** probado contra producción — se confirmó que "Otro" sin especificar rechaza el envío y con especificar lo acepta; se revisó el detalle real de los 2 tickets de producción para construir la lógica del resumen del Dashboard con datos reales (no simulados). Tickets de prueba propios eliminados al terminar.

### 2026-07-09 — Tickets: quitar que la persona elija/vea el equipo
- **Qué pasaba:** el sistema de Tickets recién agregado le pedía a quien reportaba elegir de cuál de sus equipos asignados era el problema (si tenía más de uno). El usuario pidió explícitamente que NUNCA se le pregunte ni se le muestre eso.
- **Qué se corrigió:** se quitó por completo esa sección del formulario público — ahora solo pide nombre, tipo de soporte, asunto, descripción y evidencia opcional. `Ticket.assetRef` (uno) pasó a ser `Ticket.assetRefs` (arreglo), que el backend llena **solo**, buscando del lado del servidor todos los activos que el empleado (si su nombre coincide con uno real) tiene asignados activos en ese momento — sin que el formulario mande ni pida nada de eso. Si tiene un equipo, el ticket queda ligado a ese; si tiene varios (ej. laptop + celular), a todos; si no hay match de nombre, a ninguno.
- **Por qué así:** era la única forma de seguir cumpliendo el requisito original (que el historial de tickets se refleje por activo, no por persona) sin pedirle nada a quien reporta — el trade-off es que alguien con 2+ equipos hace que el ticket cuente para ambos, en vez de señalar el exacto, pero eso ya no es una decisión de la persona.
- **Verificación:** probado contra producción — se envió un ticket real sin mandar ningún dato de activo desde el cliente, y se confirmó que el backend lo ligó solo a los 2 equipos que esa persona tiene asignados (laptop + celular), y que el conteo por activo (`/tickets/counts-by-asset`) y el filtro por activo específico siguen funcionando igual con el arreglo. Dato de prueba eliminado al terminar.

### 2026-07-09 — Sistema de Tickets (soporte técnico ligado al activo, no a la persona)
- **Qué se agregó:** módulo nuevo de principio a fin — cualquier empleado reporta un problema desde una página pública (`/reportar-ticket`, sin login, mismo patrón que Solicitar Cuenta/Ingreso/Recurso), y Sistemas lo gestiona desde `/tickets`.
- **La pieza clave (pedida explícitamente):** el ticket queda ligado al **activo específico** (por su serie/etiqueta vía `Ticket.assetRef`), no a la persona — porque a quién esté asignado ese equipo puede cambiar, pero el historial de problemas debe quedarse con la máquina física. Al escribir su nombre, si coincide con un Empleado real, el sistema le muestra los equipos que tiene asignados **hoy** (`GET /tickets/public/my-assets`) y elige de ahí cuál está fallando — si tiene solo uno, se selecciona solo; si el nombre no coincide con nadie (ej. alguien muy nuevo), se acepta el reporte igual, solo sin activo ligado.
- **Formulario:** tipo de soporte (Hardware/Software/Red/Cuenta-Acceso/Otro), asunto, descripción, "¿te impide trabajar?", y adjuntar evidencia (foto/captura, opcional — se guarda en Mongo como buffer, igual que los PDFs, porque Render no persiste disco entre despliegues).
- **Del lado de Sistemas:** asignarse el ticket o asignarlo a alguien más (al asignar, si seguía "Abierto" pasa solo a "En proceso"); al resolver, se elige de un **catálogo de resoluciones comunes** que crece con el tiempo (mismo patrón que el catálogo de Solicitud de Recursos: "Otro (especifica)" se puede sumar como opción fija para la próxima vez); reabrir si el problema vuelve a pasar.
- **En Activos:** el modal de editar un activo ya existente muestra un badge "🎫 N tickets" — clic y lleva a Tickets ya filtrado por ese equipo específico, historial completo sin importar quién lo tuviera asignado en cada momento.
- **Conectado al resto del sistema:** tarjeta de "Tickets abiertos" en Pendientes del Dashboard, aviso a Telegram al reportarse uno nuevo, y registrado en Auditoría (asignar/resolver/eliminar) — `AuditLog` ganó la acción `resolver` y la entidad `ticket`.
- **Verificación:** probado de punta a punta contra producción — se reportó un ticket real con empleado emparejado (Luis Felipe Gómez, con 2 activos asignados — se probó que si tiene más de uno hay que elegir cuál) + adjunto (se descargó y se confirmó bit a bit idéntico al original), y otro con nombre sin match y sin activo (para confirmar que no se bloquea). Se probó asignar (con auto-transición a "en proceso"), resolver con una razón nueva agregándola al catálogo, reabrir (se limpia la resolución anterior), el conteo por activo, y que un adjunto con tipo de archivo no permitido se rechaza sin crear el ticket. Todo el dato de prueba (tickets, catálogo, auditoría) se eliminó al terminar.

### 2026-07-09 — El mensajero marca "en tránsito" desde el link público, sin meterse a la app
- **Qué pasaba:** el usuario preguntó cómo hacer que el mensajero marque un envío como "en tránsito" sin tener cuenta en el sistema — hoy esa acción solo se podía hacer autenticado, desde dentro de la app.
- **Decisión:** en vez de montar un bot interactivo de Telegram (requeriría webhook, manejo de botones/`callback_query`, etc. — infraestructura nueva), se reutilizó el mismo link único que ya existía para "confirmar recepción" — ahora ese link se adapta según el estatus del envío: si sigue "enviado", muestra el paso para que el **mensajero** lo marque en tránsito; una vez en tránsito, muestra el paso para que el **destinatario** confirme la recepción, como ya funcionaba. El link se puede compartir por Telegram, WhatsApp o donde sea — para quien lo recibe es solo abrir un link y tocar un botón.
- **Qué se agregó:** `POST /shipments/public/:token/transit` (público, sin login) — pide el nombre de quien marca el tránsito (`Shipment.transitByName`, nuevo campo) y avisa a Telegram igual que ya hace la confirmación de recepción. En el detalle de Envíos (vista de Sistemas) ahora se ve quién lo marcó en tránsito, y el link se relabeleó a "Link de seguimiento (mensajero y destinatario)" con una nota de qué le toca a quién según el estatus.
- **Verificación:** probado de punta a punta contra producción — se creó un envío de prueba, se marcó en tránsito por el link público (sin token de sesión, como lo haría el mensajero real), se confirmó que un segundo intento de marcarlo en tránsito lo rechaza (ya no está en "enviado"), y se confirmó la recepción por el mismo link — los tres estatus (enviado → en tránsito → recibido) quedaron correctos con sus respectivos nombres. Envío y registros de auditoría de prueba eliminados al terminar.

### 2026-07-09 — "Usuario/correo deseado" también en Plataformas y ERP (antes solo Gmail)
- **Qué pasaba:** el usuario notó que solo "Correo Gmail" tenía el campo de "cómo quieren que quede el correo" (Correo solicitado) — Plataformas de venta y ERP no tenían ningún campo equivalente para capturar el usuario/correo deseado en esas cuentas.
- **Qué se agregó:** nuevo campo **"Usuario o correo con el que quieres que quede"** en ambas secciones:
  - **Plataformas de venta:** uno por cada plataforma marcada (junto a Tienda/Cuenta/Seller) — `AccountRequest.platforms[].username`.
  - **ERP:** uno para toda la solicitud (junto a Nivel de acceso) — reutiliza el campo `username` que ya existía en el modelo pero nunca se usaba para este tipo.
  - Aparece también en el PDF de la solicitud en ambos casos.
- **Verificación:** probado contra producción — se envió una solicitud real de prueba con Plataformas (Amazon + usuario deseado) y ERP (SAP + usuario deseado) a la vez, se confirmó que ambos PDFs muestran el campo correctamente sin encimados, y se borró la solicitud de prueba al terminar.
- **Pendiente relacionado (no corregido, se lo señalo al usuario):** el modal de "Aprobar" en Solicitudes de Cuentas (`AccountRequests.jsx`) sigue sin pre-llenar Plataforma/Usuario para solicitudes tipo "platform" — usa un campo `request.platform`/`request.username` de nivel superior que quedó sin uso desde que ese tipo pasó a guardar sus datos en `platforms[]` (un renglón por plataforma). Sistemas puede seguir aprobando escribiendo los datos a mano, pero no ve prellenado lo que la persona ya pidió. Es un hueco preexistente, no algo que haya roto este cambio — lo dejo documentado por si se quiere corregir después.

### 2026-07-09 — Fix: "Correo actual" siempre salía vacío en Solicitud de Cuentas
- **Qué pasaba:** el usuario reportó que en dos solicitudes de plataformas (Mauricio Galicia) el campo "Correo actual" salía en blanco, aunque esas personas sí tienen correo corporativo registrado en el sistema.
- **Causa raíz:** el formulario público (`SolicitarCuenta.jsx`) sí busca al empleado por nombre contra la base real (autocompletar puesto/departamento/teléfono/empresa en automático), y esa búsqueda (`GET /employees/public-lookup`) ya devuelve `corporateEmails` — pero la función que copia los datos encontrados al formulario (`pickEmployee`) nunca copiaba ese campo, y el envío del formulario tampoco lo mandaba al backend. El campo existía en el modelo y el backend ya lo aceptaba — el hueco era 100% frontend.
- **Qué se corrigió:** `pickEmployee` ahora también copia `corporateEmails` al campo `currentEmail` del formulario, y `handleSubmit` ya lo incluye en el POST — mismo patrón "autocompletar sin mostrarlo" que ya usan puesto/departamento/teléfono/empresa.
- **Backfill:** se identificaron 9 solicitudes reales ya existentes (pendientes y aprobadas) cuyo empleado sí tiene correo corporativo registrado pero el campo se guardó vacío por este bug — se les asignó el correo real y se regeneró su PDF guardado para las 9 (mismo criterio que el backfill de PDFs encimados de antes).
- **Verificación:** probado contra producción — se regeneró el PDF de la solicitud reportada (folio PLAT-BC71B5) y se confirmó visualmente que "Correo actual" ya muestra `auditor10@selectshop.com.mx` en vez de "—".

### 2026-07-09 — Nueva sección "Pendientes de revisión" en el Dashboard
- **Qué pasaba:** el usuario notó que el Dashboard seguía sin mostrar nada de los módulos nuevos (Solicitudes de Cuentas/ERP, Ingresos RH, Solicitudes de Recursos, Envíos entre Sucursales) — el fix anterior de auditoría solo hacía que ese trabajo contara para el score de "Actividad real del equipo", pero no había ningún número visible de "esto está pendiente" para esos módulos, a diferencia de Activos/Empleados que sí tienen todo un panorama completo.
- **Qué se agregó:** nueva fila de tarjetas **"Pendientes de revisión"** arriba del Dashboard (debajo de los KPIs), con el conteo de pendientes de cada módulo — clic en cualquiera lleva directo a esa página:
  - **Solicitudes de Cuentas** (Gmail/Plataformas) — pendientes
  - **Solicitudes ERP** — pendientes
  - **Ingresos RH** — pendientes
  - **Solicitudes de Recursos** — pendientes
  - **Envíos entre Sucursales** — en curso (enviado + en tránsito, sin contar lo ya recibido)
- **Visibilidad respeta permisos:** cada tarjeta solo se pide/muestra si el usuario realmente puede ver ese módulo — mismos criterios exactos que ya usa el menú lateral (`Layout.jsx`): Cuentas si administra Gmail o Plataformas, ERP si administra ERP, y RH/Recursos/Envíos solo para admin. Un usuario sin ningún permiso de estos simplemente no ve la sección (como pasaba antes con "Actividad real del equipo").
- **Verificación:** probado contra producción — se confirmó que los 5 endpoints devuelven datos reales con pendientes reales (3 Solicitudes de Cuentas, 3 ERP, 2 Ingresos RH, 4 Solicitudes de Recursos, 1 Envío en curso al momento de la prueba). No se pudo probar visualmente en navegador esta vez (sin Playwright/herramienta de navegador disponible en el entorno) — se verificó a nivel de API + revisión cuidadosa de la lógica de agregación en el código, y build de frontend sin errores.

### 2026-07-09 — Fix: texto encimado en todos los PDFs generados (filas etiqueta/valor)
- **Qué pasaba:** el usuario reportó `Solicitud_platform_bc71b5.pdf` con "Justificación / Funciones" encimado con "Vigencia" — cuando un valor de texto libre (justificación, correo corporativo con varios correos, razón social larga, etc.) ocupaba más de una línea, la fila de abajo empezaba a dibujarse en una posición fija (15pt) sin importar cuánto espacio necesitó realmente la de arriba.
- **Causa raíz:** `kvRow`/`kvPair` en `backend/src/utils/pdfBranding.js` — el helper compartido que usan **todos** los PDFs del sistema (Solicitudes de Cuentas/Gmail/Plataformas/ERP, la Responsiva de equipo, la Responsiva de cuentas Gmail/Plataformas/ERP, y el Formato de Salida de Equipos) — asumía que cada fila mide una sola línea de texto. Un valor largo sí se dibujaba envuelto en varias líneas, pero la altura de la fila nunca se ajustaba, así que la siguiente fila lo pisaba.
- **Qué se corrigió:** `kvRow`/`kvPair` ahora miden el alto real que necesita cada etiqueta y valor (`heightOfString`) ANTES de dibujar, usan el máximo entre columnas como alto real de la fila, y de paso agregan salto de página automático (`guard`) si la fila ya no cabe — antes `kvRow` no protegía contra esto en absoluto. Como es un helper compartido, el fix aplica automáticamente a los 6 generadores de PDF que lo usan, no solo al que reportó el bug.
- **Verificación:** se regeneró el PDF real reportado (`Solicitud_platform_bc71b5.pdf`, folio PLAT-BC71B5) con el código corregido — ya no hay encimado. Se hizo una prueba de estrés del helper con valores extremos (justificación muy larga, lista de varios correos, razón social larga, etiqueta larga, valores vacíos) sin ningún encimado. Se regeneró también una Responsiva de equipo real completa (Luis Felipe Gómez, laptop + celular) para confirmar que no se rompió nada del resto del documento. Todo probado contra producción, solo lectura — no se modificó ningún dato real.
- **Nota importante (por qué seguía saliendo encimado después del fix):** el PDF de una Solicitud de Cuenta se genera **una sola vez**, al crearse, y se guarda como `pdfData` en el propio documento de Mongo — el botón de descarga solo devuelve ese buffer guardado, nunca lo regenera. Las Responsivas (equipo/Gmail/Plataformas/ERP) sí se generan al vuelo en cada descarga, así que esas ya quedaron corregidas en cuanto se desplegó el fix — pero las 9 Solicitudes que ya tenían PDF guardado desde antes seguían mostrando la versión vieja sin importar cuántas veces se descargaran. Se identificaron las 9 (`AccountRequest` con `pdfData` existente) y se regeneraron una por una con el generador ya corregido, actualizando el campo guardado — mismos datos de origen, solo se volvió a renderizar el PDF. Confirmado visualmente que la regeneración quedó sin encimados.

### 2026-07-09 — Autocompletar nombre por Empleados en Confirmar Recepción
- **Qué se agregó:** en la página pública de confirmar recepción de un envío (`/confirmar-envio/:token`), el campo "Tu nombre" ahora busca coincidencias contra Empleados mientras se escribe (mínimo 3 letras) y muestra un dropdown para elegir el nombre exacto — misma búsqueda pública (`GET /employees/public-lookup`) y mismo patrón visual que ya usan Solicitar Cuenta/Ingreso/Recurso.
- **Por qué:** pedido del usuario — que el campo de nombre en el link de confirmar entrega "ya encuentre al usuario" igual que en los otros formularios públicos, en vez de ser un campo de texto libre.
- **A diferencia de los otros formularios:** aquí NO es obligatorio que el nombre coincida con un empleado real (no se bloquea el envío si no hay match) — quien confirma la recepción puede no estar dado de alta en el sistema (ej. guardia de recepción), así que el dropdown es solo una ayuda, no una validación.
- **Verificación:** probado contra producción — `GET /employees/public-lookup?q=luis felipe` devolvió la coincidencia real esperada; se creó un envío de prueba, se confirmó su recepción usando el nombre sugerido, y se verificó que el flujo completo sigue funcionando igual que antes. Envío y registros de auditoría de prueba eliminados al terminar.

### 2026-07-09 — Mover "Responsivas" y "Cuentas" a la sección General del menú
- **Qué cambió:** en el sidebar (`Layout.jsx`), los enlaces "Responsivas" y "Cuentas" (con su submenú Gmail/Plataformas/Plataformas ERP/Solicitudes) ahora aparecen dentro de la sección **General**, junto con Dashboard/Disponibilidad/Empleados/Activos/Asignaciones, en vez de después de la sección "Administración".
- **Por qué:** pedido del usuario — son secciones de uso frecuente, no exclusivas de administración.
- **Verificación:** build de frontend (`vite build`) sin errores; es un cambio de solo orden/ubicación en el JSX, sin lógica de permisos afectada.

### 2026-07-09 — Reflejar los módulos nuevos (Solicitud de Recursos, Envíos, rechazos) en el Dashboard/Auditoría
- **Qué pasaba:** el usuario preguntó si los módulos que se armaron esta semana (Solicitud de Recursos, Envíos entre Sucursales, y los rechazos de Solicitudes de Cuentas/Ingreso) debían reflejarse en el Dashboard, con la misma lógica de "score de actividad" ("Actividad real del equipo") que ya existe ahí. La respuesta era sí, y el motivo técnico exacto era que ninguna de esas rutas llamaba a `logAction` — el aprobar de Solicitud de Recursos, Envíos completo, y el rechazar de Solicitudes de Cuentas/Ingreso/Recursos eran invisibles para Auditoría y, por lo tanto, para el score del Dashboard (que se calcula 100% a partir de `AuditLog`).
- **Qué se corrigió:** se agregaron los registros de auditoría que faltaban:
  - `AuditLog`: se ampliaron los enums — `action` ahora incluye `aprobar`/`rechazar`; `entity` ahora incluye `solicitud_cuenta`/`solicitud_ingreso`/`solicitud_recurso`/`envio`.
  - **Solicitud de Recursos:** aprobar → `aprobar/solicitud_recurso`; rechazar → `rechazar/solicitud_recurso`; eliminar → `eliminar/solicitud_recurso`.
  - **Envíos entre Sucursales:** crear → `crear/envio`; marcar en tránsito → `editar/envio`; eliminar → `eliminar/envio` (la confirmación de recepción, que hace el destinatario sin cuenta, no se audita — no hay usuario del sistema detrás).
  - **Solicitudes de Cuentas:** rechazar → `rechazar/solicitud_cuenta`; eliminar → `eliminar/solicitud_cuenta` (aprobar ya quedaba registrado indirectamente, vía `crear/cuenta_gmail` o `cuenta_plataforma`/`cuenta_plataforma_erp` al crearse la cuenta real).
  - **Solicitudes de Ingreso:** rechazar → `rechazar/solicitud_ingreso`; eliminar → `eliminar/solicitud_ingreso` (aprobar ya quedaba registrado como `crear/empleado`).
  - Dashboard (`ACTION_LABELS`/`ACTION_ICONS`/`ACTION_WEIGHTS`) y Auditoría (`ACTION_CONFIG`/`ENTITY_CONFIG` + filtro) actualizados con las nuevas acciones/entidades — de paso se corrigió que a `ENTITY_CONFIG` le faltaba `cuenta_plataforma_erp` (hueco previo, no relacionado con este cambio).
- **Por qué:** para que el score de "Actividad real del equipo" (pesos fijos por acción, sin nada aprendido — ya documentado así en el propio código) refleje el trabajo real que se hace hoy en el sistema, no solo el de los módulos más antiguos (Activos/Empleados/Cuentas).
- **Verificación:** probado de punta a punta contra producción — se creó y rechazó una Solicitud de Recursos real, se creó/marcó en tránsito/eliminó un Envío real, y se rechazó una Solicitud de Cuenta y una de Ingreso (creadas directo en Mongo para no depender de un empleado real) — se confirmó que las 6 entradas de `AuditLog` quedaron con el `action`/`entity` correcto y que `GET /api/audit` las filtra bien por ambos campos. Todos los registros y documentos de prueba se eliminaron al terminar.

### 2026-07-08 — Conectar Solicitud de Recursos con Envíos entre Sucursales
- **Qué se agregó:** en el detalle de una Solicitud de Recursos ("Ver"), nuevo botón **"🚚 Generar formato de salida"** — arma el formulario de "Envíos entre Sucursales" ya lleno con los datos de esa solicitud (solicitante, departamento, puesto, sucursal destino si el empleado la tiene registrada, destinatario, motivo "Asignación de equipo o recurso", y la justificación como observaciones) para no volver a escribir nombre/equipo/datos desde cero. Sistemas solo confirma la sucursal de origen y ajusta lo que haga falta, y de ahí sale el PDF imprimible + el link de confirmación para el destinatario, igual que un envío normal.
- **Por qué:** el usuario explicó que sigue necesitando el formato de salida para entregar lo que le solicitan (ej. Felipe u otros), y no quería tener que volver a capturar los mismos datos que ya vienen en la solicitud.
- **Backend:** se agregó la opción de motivo **"Asignación de equipo o recurso"** al catálogo de Envíos, y `Shipment.sourceResourceRequest` (referencia opcional, solo para trazabilidad) que liga el envío a la solicitud que lo originó.
- **Refactor:** el formulario de creación de envíos se movió a un componente compartido (`CreateShipmentModal`) para reutilizarlo tanto en Envíos entre Sucursales como desde Solicitudes de Recursos, sin duplicar código.
- **Verificación:** probado de punta a punta contra producción — se envió una Solicitud de Recursos de prueba, se abrió su detalle, se generó el formato de salida (confirmando que todo llegó prellenado correctamente) y se creó el envío — se confirmó que quedó ligado a la solicitud de origen (`sourceResourceRequest`). Solicitud y envío de prueba eliminados al terminar.

### 2026-07-08 — Envíos entre Sucursales (rastreo tipo paquetería para salidas de equipo)
- **Qué se agregó:** nueva sección **"Envíos entre Sucursales"**, digitaliza el "FORMATO DE SALIDA DE EQUIPOS" (Cómputo y Celulares) que Sistemas llenaba en Word. Sistemas arma un envío con uno o varios equipos (buscando activos ya existentes en Activos/Accesorios, o capturando a mano si no están en el sistema), sucursal origen/destino, destinatario y motivo (Mantenimiento, Reparación externa, Préstamo temporal, Baja definitiva, Otro).
- **Rastreo tipo paquetería:** cada envío pasa por **Enviado → En tránsito → Recibido**. "En tránsito" lo marca Sistemas manualmente; **"Recibido" solo lo puede confirmar el destinatario** (ej. Felipe en Tepotz II) desde un link único que se le comparte por WhatsApp/correo — sin necesitar cuenta en el sistema, escribe su nombre y notas opcionales ("llegó completo", etc.).
- **Efecto en Activos:** si el equipo enviado ya estaba vinculado a un activo real del sistema, al confirmarse la recepción se actualiza sola su ubicación a la sucursal destino — Disponibilidad queda correcta sin trabajo manual extra.
- **PDF:** cada envío se puede descargar como PDF con el mismo formato del Word original (folio, datos del solicitante, tabla de equipos, motivo, firmas), más el estatus de rastreo.
- **Backend:** modelo `Shipment` nuevo con folio autogenerado y token de confirmación único; rutas en `shipments.js` (crear/listar/marcar en tránsito/PDF — con sesión; ver y confirmar — públicas, sin sesión).
- **Verificación:** probado de punta a punta contra producción — se creó un envío real con un activo real vinculado (Corporativo Polanco → Tepotzotlán II), se marcó "en tránsito", se descargó el PDF, y se confirmó la recepción desde el link público (sin login) — se confirmó que la ubicación del activo se actualizó sola a la sucursal destino. Envío de prueba eliminado y ubicación del activo restaurada al terminar.

### 2026-07-08 — Separar Solicitudes ERP a su propia página
- **Qué pasaba:** el usuario notó que las solicitudes de cuentas tipo ERP aparecían mezcladas con Gmail/Plataformas en la misma tabla de "Solicitudes de Cuentas" — aunque el backend ya filtraba por permiso (quien no maneja ERP no las veía), quien sí maneja varios tipos (o es admin) las veía todas revueltas.
- **Qué se corrigió:** nueva página **"Solicitudes ERP"** (`/account-requests-erp`), separada de "Solicitudes de Cuentas" — igual que ya está separada la administración de esas cuentas ("Cuentas de Plataformas" vs "Cuentas de Plataformas ERP"). "Solicitudes de Cuentas" general ahora solo muestra Gmail/Plataformas, nunca ERP, ni siquiera para un admin con todos los permisos.
- **Sidebar:** aparece "Solicitudes ERP" como link aparte solo para quien tiene permiso de Plataformas ERP (junto a "Cuentas Plataformas ERP"); el link general "Solicitudes" solo aparece para quien maneja Gmail o Plataformas normales.
- **Backend:** `GET /account-requests` acepta `?type=` para pedir solo ciertos tipos (siempre cruzado con lo que el usuario realmente puede gestionar, nunca se puede pedir un tipo fuera de su permiso).
- **Verificación:** probado con 3 perfiles reales — un usuario solo-ERP ve "Solicitudes ERP" (con sus 2 solicitudes ERP reales) pero no "Solicitudes" general, ni puede entrar a `/account-requests` directo por URL (rebota a su página); un usuario solo-Gmail ve "Solicitudes" pero no "Solicitudes ERP"; un admin con todos los permisos ve las dos por separado y "Solicitudes de Cuentas" ya no mezcla el tipo ERP.

### 2026-07-08 — Recordatorio del link público en cada bandeja de revisión
- **Qué se agregó:** en Solicitudes de Cuentas, Solicitudes de Ingreso y Solicitudes de Recursos aparece un recuadro arriba de la tabla con el link público de ese formulario y un botón **Copiar** — para no tener que buscarlo o memorizarlo cada vez que alguien lo pida.
- **Por qué:** el usuario pidió tener los links a la mano justo donde llegan las solicitudes, por si se les olvida.
- **Verificación:** probado en Chromium — el link se arma con el dominio real de cada entorno (`window.location.origin` + la ruta pública), y el botón Copiar sí deja el link correcto en el portapapeles.

### 2026-07-08 — Búsqueda de respaldo por palabra/sinónimo en Disponibilidad de Solicitudes
- **Qué se agregó:** el usuario señaló que exigir coincidencia exacta de tipo era demasiado rígido — mucho de lo que ya está en Activos vive como "Accesorio" genérico con la descripción en texto libre, y basta con encontrar similitudes (ej. "soporte" y "base" significan lo mismo). Ahora, además de la búsqueda por tipo exacto, "Disponibilidad y recomendación" también busca por palabra clave (con sinónimos comunes: base/soporte/stand, audífonos/diadema/headset, bocina/altavoz/parlante, etc.) entre todo lo guardado como "Accesorio"/"Otro" genérico — incluso para "Otro (especifica)", usando lo que haya escrito quien solicitó.
- **Cómo se distingue:** si hay coincidencia exacta de tipo, se muestra igual que antes (✅ verde). Si no hay tipo exacto pero sí algo que se parece por descripción, se muestra aparte en naranja (🔎 "sin coincidencia exacta, pero se parece — revisa si aplica") — nunca se asume automáticamente, Sistemas decide si aplica antes de asignar.
- **Verificación:** probado contra producción — una solicitud de prueba pidiendo "Bocina" (vía "Otro (especifica)") encontró correctamente un "Amazon Alexa Echo Dot" guardado como Accesorio con descripción "Altavoz inteligente", sin tener ningún tipo exacto en común. Solicitud de prueba borrada al terminar.

### 2026-07-08 — Corrección: "Base para Laptop" (no "Soporte") sin stock encontrado
- **Qué pasaba:** el usuario reportó que ya tenía bases para laptop en Activos pero el sistema no encontraba stock. Dos causas: (1) le puse "Soporte para Laptop" en vez de "Base para Laptop", que es como ya le llaman; (2) sus bases existentes (LAPTOP STAND RT-007, Kishnell OFI-10, HAING N18) estaban registradas como tipo genérico "Accesorio" con la descripción en un campo de texto libre, no como un tipo aparte — por eso el nuevo tipo `base_laptop` no las encontraba, eran 3 cosas totalmente desconectadas entre sí.
- **Qué se corrigió:** se renombró el tipo de "Soporte para Laptop" a **"Base para Laptop"** en toda la app (clave interna también cambió de `soporte_laptop` a `base_laptop`, no había ningún activo real usándola todavía). Con autorización del usuario, se reclasificaron esos 3 activos existentes al tipo nuevo.
- **Verificación:** contra producción — ahora `GET /assets?status=disponible&type=base_laptop` regresa las 3 bases reales con su cantidad real en stock (10, 1 y 11 respectivamente), en vez de nada.

### 2026-07-08 — Generar la Responsiva directo al asignar desde Solicitud de Recursos
- **Qué se agregó:** al asignar un artículo desde "Ver" en Solicitudes de Recursos, junto al artículo ya asignado aparecen dos botones — **"📄 Responsiva nueva"** y **"📄 Anterior"** — que generan y descargan la responsiva de ese activo para ese empleado, reutilizando exactamente el mismo generador que ya existe en la ficha del empleado (mismo archivo, mismo archivado en "Responsivas generadas").
- **Corrección relacionada (bug real, no solo de este flujo nuevo):** al revisar esto encontré que la Responsiva **nueva** (la del botón normal en Empleados) tenía una categorización de accesorios incompleta — solo reconocía Monitor/Mouse/Teclado/Cargadores/Accesorio/Otro. Cualquier otro tipo (Audífonos, Kit Teclado+Mouse, Webcam, Hub USB, Cable, Disco Duro, Adaptador, Impresora, Escáner, Herramienta, Consumible, y el nuevo Soporte para Laptop) **desaparecía por completo** de la responsiva generada — el documento salía sin ese artículo listado, aunque sí estuviera asignado en el sistema. Esto afectaba a cualquier empleado cuyo único equipo asignado fuera uno de esos tipos, no solo a este flujo nuevo.
- **Qué se corrigió:** la sección de accesorios de la responsiva nueva ahora es un catch-all (cualquier tipo que no sea laptop/escritorio/all-in-one/celular/tablet cae ahí), en vez de una lista fija que había que mantener actualizada cada vez que se agregaba un tipo nuevo.
- **Verificación:** contra producción — se asignó un cable de prueba a un empleado real, se generaron ambos formatos de responsiva (nueva y anterior) y se confirmó que el cable sí aparece en "ACCESORIOS ENTREGADOS" de la nueva (antes de la corrección esa sección habría salido vacía). Probado también el flujo completo en Chromium: enviar solicitud → aprobar/asignar → descargar ambas responsivas. Asignación, solicitud y archivo de responsivas de prueba eliminados al terminar.

### 2026-07-08 — Corrección: "empleado no encontrado" en Solicitud de Recursos aunque sí existiera
- **Qué pasaba:** el usuario reportó ver "no encontramos a este empleado" en una solicitud de un empleado real (Miguel García Ramos) que sí estaba en Empleados. Causa: esa solicitud se mandó ~4 minutos antes de que se agregara el guardado de `employeeRef` (ver entrada "Disponibilidad y recomendación..." más abajo) — dependía de un dato fijado al momento de enviar, así que cualquier solicitud de antes de ese cambio (o donde el buscador no encontró el nombre en su momento) se quedaba marcada como "no encontrado" para siempre, aunque el empleado sí existiera.
- **Qué se corrigió:** si la solicitud no trae `employeeRef` guardado, ahora se busca al empleado por nombre exacto (activo) en el momento de revisar, en vez de asumir que no existe. Si encuentra exactamente una coincidencia, deja asignar directo igual que si hubiera venido guardado desde el principio.
- **Verificación:** confirmado contra producción — la solicitud real de Miguel García Ramos ahora muestra "✓ Encontramos a MIGUEL GARCIA RAMOS en Empleados (70476) — se le puede asignar directo" en vez de la advertencia.

### 2026-07-08 — "Soporte para Laptop" y catálogo que crece solo con "Otro (especifica)"
- **Qué se agregó:**
  - **"Soporte para Laptop"** ahora es un tipo de accesorio real en toda la app (Activos, Accesorios, Disponibilidad, Asignaciones, Solicitud de Recursos) — no existía en el catálogo digitalizado aunque sí estaba en el Excel original de accesorios.
  - **"Otro (especifica)"** en Solicitud de Recursos — para lo que todavía no está en el catálogo. Al marcarlo, pide especificar qué es. Al aprobar una solicitud así, aparece una casilla **"Agregar '{lo que pidieron}' a la lista de recursos"** (marcada por default) — si se deja marcada, esa cosa queda disponible como casilla normal para la próxima solicitud, sin necesitar tocar código.
- **Por qué:** el usuario notó que no se podía pedir un soporte/base para laptop, y pidió una forma de que el catálogo crezca con el tiempo según lo que vayan necesitando, en vez de quedar fijo para siempre.
- **Backend:** `soporte_laptop` agregado a `ASSET_TYPES` (Asset.js) y a los catálogos del frontend (`ASSET_TYPE_LABELS`, `ACCESSORY_TYPE_LABELS`, grupos de Activos/Accesorios/Disponibilidad/Asignaciones, íconos y specs). Modelo nuevo `CustomResourceOption` + `GET /resource-requests/custom-options/public` (el formulario las mezcla con las de siempre) + lógica en `PUT /resource-requests/:id/approve` que crea la opción si se pidió agregarla.
- **Verificación:** probado de punta a punta contra producción — "Soporte para Laptop" ya sale como casilla normal; se envió una solicitud con "Otro: Silla ergonómica de prueba", se aprobó marcando "agregar a la lista", y se confirmó que en una visita nueva al formulario ya aparece como casilla propia. Solicitud y opción de prueba borradas al terminar.

### 2026-07-08 — Agregar "Software o Licencia" a Solicitud de Recursos
- **Qué se agregó:** se había quitado por completo al simplificar el formulario (ver entrada de abajo) — el usuario pidió recuperarla, pero con forma de especificar cuál. Ahora "Software o Licencia" es una casilla más junto a los accesorios y Línea Telefónica; al marcarla aparece un campo obligatorio **"¿Cuál software o licencia?"** (ej. "Adobe Acrobat Pro", "Office 365"). Se trata igual que Línea Telefónica: no se controla como stock, se marca aparte en la revisión con el nombre específico que pidieron.
- **Backend:** `ResourceRequest.licenseDetail` (nuevo).
- **Verificación:** probado de punta a punta en Chromium contra producción — el campo aparece solo al marcar la casilla, se guarda y se muestra correctamente en la lista y en el detalle ("Software o Licencia (Adobe Acrobat Pro)"). Solicitud de prueba borrada al terminar (se dejó intacta una solicitud real de otro usuario que ya estaba pendiente).

### 2026-07-08 — Disponibilidad y recomendación al revisar una Solicitud de Recursos
- **Qué se agregó:** al abrir "Ver" en una Solicitud de Recursos, ahora consulta Disponibilidad en tiempo real por cada cosa que pidieron y da una recomendación clara: **✅ X disponibles, se puede dar** o **❌ Sin stock disponible ahorita**, con la lista de artículos concretos (marca/modelo/serie/sucursal) y un botón **Asignar** para dárselo directo al empleado desde ahí mismo, sin salir a Disponibilidad a buscarlo aparte. "Línea Telefónica" se marca aparte como que no se controla como stock (es un servicio con el operador).
- **Para que "Asignar" funcione**, ahora se guarda una referencia al empleado real (no solo su nombre en texto) cuando se encuentra por el buscador al llenar el formulario — si no se encontró (nombre no coincide con nadie registrado), se avisa que hay que asignar manualmente desde Disponibilidad.
- **Por qué:** el usuario pidió que al generarse la solicitud se compare contra Disponibilidad y se dé una recomendación de qué se puede entregar según lo que hay, en vez de tener que ir a consultarlo aparte.
- **Backend:** `ResourceRequest.employeeRef` (nuevo) guarda el `_id` del empleado si se encontró al enviar la solicitud.
- **Verificación:** probado de punta a punta contra producción con stock real — se detectaron correctamente 2 kits de teclado+mouse y 5 mouse disponibles, se asignó uno real a un empleado real desde el modal y se confirmó en Activos que quedó asignado; se revirtió (asignación borrada, activo vuelto a "disponible") y se borró la solicitud de prueba al terminar.

### 2026-07-08 — Simplificar Solicitud de Recursos (ya no "y Servicios")
- **Qué cambió**, a pedido del usuario tras ver la primera versión:
  - Ya no pide **Puesto/Departamento/Jefe directo** como campos a llenar — si encuentra al empleado por nombre, esos datos se guardan por dentro sin volver a mostrarlos (antes se autocompletaban pero igual se veían como inputs editables).
  - Se quitó **"Tipo de solicitud"** (Asignación/Compra/Instalación) — en la práctica siempre es asignación de lo que Sistemas ya tiene en stock; compras las maneja otra área.
  - "Recurso/Servicio" (un solo dropdown con categorías del Excel) se reemplazó por una **lista de casillas con el catálogo real de accesorios** que ya usa el resto de la app (Monitor, Mouse, Teclado, Kit Teclado+Mouse, Audífonos, Cable, etc.) más **Línea Telefónica** aparte — se puede elegir más de uno.
  - Se quitó **"Detalle de la solicitud"** (redundante con Justificación, que sí se conserva y sigue siendo obligatoria).
- **Por qué:** el usuario aclaró que esta solicitud es únicamente para lo que Sistemas puede entregar directo de su stock de accesorios (más línea telefónica si la piden) — nada de compras, instalaciones ni equipo mayor, eso es de otra área.
- **Backend:** `ResourceRequest` ahora guarda `resourceItems` (arreglo) en vez de `requestType`/`resourceService`/`detail`/`directManager`. Como la página llevaba minutos en producción y nadie había mandado una solicitud real todavía, se cambió el esquema directo sin necesidad de migrar datos viejos.
- **Verificación:** probado de nuevo de punta a punta en Chromium real contra producción — nombre autocompleta puesto/departamento sin mostrarlos como campos, casillas de accesorios + línea telefónica funcionan, la bandeja de revisión muestra "Kit Teclado+Mouse, Línea Telefónica" correctamente. Dato de prueba borrado al terminar.

### 2026-07-08 — Nueva página pública: Solicitud de Recursos y Servicios
- **Qué se agregó:** `/solicitar-recurso` — página pública (sin login, sin sidebar) que reemplaza el Excel "FORMATO DE SOLICITUD DE RECURSOS Y SERVICIOS" (SS-STD-DA-F01) que se llenaba e imprimía a mano. Cualquier empleado escribe su nombre (autocompleta puesto/departamento si ya está en Empleados), jefe directo, tipo de solicitud (Asignación / Compra / Instalación — mismas opciones que el Excel), recurso o servicio (Línea telefónica, Equipo de cómputo, Software o licencia, Servicio externo, etc. — misma lista del Excel), detalle y justificación.
- **Bandeja de revisión:** nueva página **"Solicitudes de Recursos"** (solo admin, en el sidebar junto a "Ingresos RH") — lista con pestañas Pendiente/Aprobada/Rechazada/Todas, botón **Ver** para el detalle completo, **Aprobar** (con notas de resolución opcionales, ej. "equipo asignado desde stock") o **Rechazar** (con motivo opcional).
- **Flujo elegido:** una sola revisión (como Ingresos RH), no la cadena de 3 firmas del Excel (Solicitante/Jefe Directo/Dirección) — decisión del usuario para no depender de que jefes y Dirección también entren al sistema.
- **Backend:** `ResourceRequest` (modelo nuevo) + `POST /resource-requests/public` (con límite por IP y honeypot, igual que Cuentas/Ingreso RH) + `GET/PUT/DELETE /resource-requests` (admin). Aviso a Telegram al recibir una solicitud nueva.
- **Verificación:** probado de punta a punta en Chromium real contra el backend de producción — se envió una solicitud de prueba, apareció en la bandeja, se abrió el detalle, se aprobó con notas y se confirmó que se mueve a la pestaña "Aprobada" con quién la aprobó. Registro de prueba borrado de producción al terminar.

### 2026-07-08 — Corrección: los botones de "Acción" se veían recortados en Responsivas
- **Qué pasaba:** al agregar la columna "Firmada" (ver entrada de abajo), la tabla de Responsivas quedó más ancha y los botones "Descargar"/"Eliminar" se recortaban o se apilaban en vez de verse en una sola línea.
- **Causa real:** no era solo cuestión de ancho de columna — el contenedor principal de la página (`.main` en `Layout.module.css`) es un hijo flex sin `min-width: 0`, así que en vez de dejar que la tabla hiciera su propio scroll horizontal (para eso ya existía `overflow-x: auto` en el recuadro de la tabla), toda la página se estiraba de más y el navegador la recortaba en el borde de la pantalla.
- **Qué se corrigió:** se agregó `min-width: 0` a `.main` (arregla este mismo problema en cualquier página con tablas anchas, no solo Responsivas) y se ajustó el ancho mínimo de la tabla y el `.page` de Responsivas para que quepan cómodas las 7 columnas, con scroll horizontal contenido dentro del recuadro de la tabla cuando la pantalla es angosta.
- **Verificación:** probado en Chromium a 1920px (todo visible sin scroll) y a 1440px (con scroll horizontal contenido dentro de la tabla, sin empujar el resto de la página) — "Descargar" y "Eliminar" ya no se cortan ni se apilan.

### 2026-07-08 — Subir la responsiva ya firmada (foto/PDF) en Responsivas generadas
- **Qué cambió:** en "Responsivas generadas", cada fila ahora tiene una columna **Firmada**. Si todavía no se ha subido nada, aparece un botón **"📤 Subir firmada"**; al elegir un PDF o una foto (JPG/PNG/HEIC, hasta 20MB) del documento ya firmado a mano, se guarda junto al registro original. Una vez subida, la fila muestra **"✅ Firmada"** con botones **Ver** (la abre en una pestaña nueva) y **Quitar** (la borra, sin tocar el PDF original generado por el sistema — se puede volver a subir después).
- **Permisos:** igual que para descargar el original — solo un admin o quien generó esa responsiva puede subir/ver/quitar su firmada.
- **Por qué:** el flujo real es generar el PDF en blanco desde el sistema, imprimirlo, firmarlo a mano, y luego escanearlo o tomarle foto — el usuario pidió una forma de guardar esa copia firmada junto al registro, en vez de tenerla suelta en otro lado.
- **Backend:** `ResponsivaArchive` ahora guarda también `signedFileData`/`signedFileName`/`signedFileMimeType`/`signedAt`/`signedByName`. Nuevas rutas en `responsivaArchive.js`: `POST /:id/signed` (sube, usa `multer` en memoria), `GET /:id/signed/download`, `DELETE /:id/signed`. El listado (`GET /`) sigue sin traer binarios pesados (excluye tanto `pdfData` como `signedFileData`).
- **Verificación:** contra el backend real — se generó una responsiva de prueba, se subió un PDF firmado de prueba, se confirmó que aparece en el listado, se descargó y se comparó byte a byte contra el original (idéntico), se probó que un usuario que no generó el documento recibe 403 al intentar subir/ver, y que el dueño sí puede. Se probó también en Chromium real: aparece el botón, sube el archivo, cambia a "✅ Firmada" con Ver/Quitar. Todos los registros de prueba se borraron de la base de producción al terminar.

### 2026-07-08 — Corrección: la Responsiva "formato anterior" no era fiel a la estructura real del Excel
- **Qué pasaba:** la primera versión (misma fecha, entrada de abajo) replicaba el texto/campos correctos pero con un layout **inventado** (tablas con caja en todos los campos, encabezado de una sola línea) — el usuario señaló que no respetaba "tal cual" el Excel como había pedido.
- **Qué se corrigió:** se revisó el Excel celda por celda (bordes, combinaciones de celdas, qué lleva caja y qué no) y se reconstruyó el PDF para igualar esa estructura real: **encabezado de 3 cajas** (logo de la empresa | título | clave + no. de revisión, con la razón social debajo del logo y la revisión debajo de la clave, igual que el Excel), **datos del empleado sin caja** — solo una línea de subrayado bajo cada valor (como el Excel, que tampoco los pone en tabla), **tabla con cuadrícula real de 4 columnas** (CARACTERÍSTICAS | DESCRIPCIÓN | SÍ | NO) para Equipos/Celular y de 2 columnas (Cantidad | Descripción) para Accesorios, y **cajas en blanco para firmar** (Entrega/Recibe/Autoriza) en vez de solo una línea. De paso, ahora usa el logo real de la empresa (ya lo teníamos en `pdfBranding.js`) en la caja donde el Excel intentaba poner uno (su fórmula de logo está rota en el original — "#VALUE!" — así que nunca se veía ahí).
- **Por qué:** el usuario reportó explícitamente que el resultado no respetaba el Excel tal cual, después de haberlo pedido dos veces.
- **Verificación:** se regeneraron los 3 formatos y se compararon visualmente contra la estructura real del Excel (celda por celda) — coinciden en qué lleva borde, qué lleva subrayado y qué no lleva nada. Se volvió a probar contra el backend real (laptop, celular y cable, activos y empleados reales existentes) — los 3 siguen generándose sin errores. Registros de prueba borrados del archivo de Responsivas al terminar.

### 2026-07-08 — Responsiva en el formato ANTERIOR (Excel), como opción junto a la nueva
- **Qué cambió:** al generar la Responsiva de un activo individual (botón "Responsiva" en la ficha del empleado, "Ver activos"), ahora primero pregunta **"Formato nuevo" o "Formato anterior"** antes de descargar — el usuario aclaró que RH todavía no autoriza usar la nueva por temas de políticas, así que Sistemas sigue necesitando la de siempre para algunos casos. La Responsiva nueva (y el botón "Responsiva completa", que combina todos los activos) **no se tocó en absoluto** — el formato anterior es código totalmente aparte, a propósito, para no arriesgar romper ninguna de las dos.
- **El formato anterior replica exactamente** (mismo texto legal, mismos campos, mismo orden, mismas claves de documento) los 3 Excel que compartió el usuario: **RESPONSIVA EQUIPOS** (`SS-IT-P-01-F01`, para laptop/escritorio/all-in-one/tablet — "Tipo/Marca/Modelo/Procesador/Serie/Cargador (CT)/Accesorios (Otros)"), **RESPONSIVA ACCESORIOS** (`SS-IT-P-01-F02`, para el resto de tipos — "Cantidad de Accesorios/Descripción"), y **RESPONSIVA CELULAR** (`SS-IT-P-02-F01`, para celulares — Marca/Modelo/Cargador/Audífonos/Otros/IMEI/Núm. de marcación/Correo Gmail; firma "JEFE DIRECTO" en vez de "JEFE INMEDIATO", igual que en el Excel original). Se elige automáticamente cuál de los 3 usar según el tipo del activo (tablet cae en Equipos, no en Celular, igual que en el Excel "Master" original). Un par de campos del Excel de Celular no existen en la base de datos hoy (número de marcación corto, costo del equipo) y se muestran como "—" en vez de inventarlos.
- **Razón social**: se usa el nombre corto de la empresa en los 3 formatos (igual que ya usan Equipos/Accesorios) — la tabla del Excel de Celular que relaciona nombre corto↔razón social larga no cuadraba fila por fila, así que se evitó adivinar cuál razón social larga corresponde a cada empresa en un documento oficial; el usuario confirmó esta simplificación.
- **Nuevo backend:** `backend/src/utils/responsivaLegacyPdf.js` (3 builders con estilo plano tipo Excel, sin el branding de color de la app) y `GET /api/responsiva/:employeeId/legacy?assetId=` en `responsiva.js` — se archiva igual que la nueva (marcado "(formato anterior)" en la etiqueta) para quedar en el historial de Responsivas.
- **Por qué:** el usuario explicó que aunque ya existe la Responsiva nueva en la app, RH todavía no las deja usar por políticas internas, y siguen trabajando hoy con estos 2 Excel (uno de equipo de cómputo/accesorios, otro de celulares) — pidió subirlos tal cual sin modificar el contenido, sin borrar la nueva, preguntando cuál usar cada vez.
- **Verificación:** contra el backend real (con activos y empleados reales existentes: una laptop, un celular y un cable) se generaron los 3 formatos y se revisaron visualmente contra el Excel original — texto, campos, claves de documento y roles de firma coinciden. Se probó también en un Chromium real que el modal de elección aparece al dar clic en "Responsiva" por activo. Los 4 registros de prueba que quedaron en el archivo de Responsivas se borraron al terminar.

### 2026-07-08 — Quitar "Tablet" duplicada en Accesorios de Solicitud de Ingreso; agregar "Otro"
- **Qué pasaba:** el usuario notó que "Tablet" aparecía tanto en la sección "Teléfono" (Celular/Tablet, correcto — es un tipo de equipo móvil) como en "Accesorios" (porque `ACCESSORY_TYPE_LABELS` en `config/assetFields.js` también incluye `tablet` como categoría de accesorio) — quedaba duplicada en dos secciones del mismo formulario.
- **Qué cambió:** se quitó "Tablet" de la lista de Accesorios (se queda solo en Teléfono); se agregó un campo **"Otro (especifica)"** en Accesorios para lo que no encaje en el checklist, con su propio campo `accessoryOther` en el modelo/ruta, y se muestra en la columna "Necesita" de la revisión.
- **Aclaración (no fue cambio):** Mouse/Teclado/Kit Teclado+Mouse no son redundantes — son categorías reales distintas ya registradas en Disponibilidad (a veces se entrega mouse o teclado sueltos, otras un kit combinado como un solo artículo de stock); se pueden marcar por separado o el kit, según lo que realmente se vaya a entregar.
- **Por qué:** el usuario reportó la duplicación de Tablet y preguntó si Mouse/Teclado/Kit debían ser mutuamente excluyentes.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: se envió una solicitud con accesorios + "Otro: Base para laptop" y se confirmó que ambos datos se guardaron correctamente (dato de prueba borrado al terminar). En un Chromium real se confirmó que "Tablet" ya no aparece en Accesorios (sigue en Teléfono) y que el campo "Otro" se muestra correctamente.

### 2026-07-08 — Se puede corregir el correo/usuario de una cuenta (Gmail/Plataformas/ERP)
- **Qué pasaba:** en el modal "Editar cuenta" de Cuentas Gmail, Cuentas de Plataformas y Cuentas de Plataformas ERP, el campo de correo/usuario aparecía siempre deshabilitado (`disabled`) — no había forma de corregir un correo mal escrito al capturarlo sin borrar la cuenta y volver a crearla.
- **Qué cambió:** ese campo ahora es editable en los tres módulos. Gmail sigue validando que termine en `@gmail.com` y que no choque con otra cuenta ya existente; Plataformas/ERP validan que no choque con otra cuenta de esa misma plataforma (el mismo usuario sí puede repetirse en plataformas distintas, como ya funcionaba al crear). Al corregir un correo de Gmail, también se actualiza `Employee.gmailAccounts[]` para que no quede el correo viejo con el typo colgado ahí. Queda registrado en Auditoría quién corrigió qué (de-a).
- **Por qué:** el usuario reportó que algunos correos se capturaron mal y no había manera de corregirlos.
- **Verificación:** contra el backend real (con un empleado real de prueba, todo borrado al terminar) — se creó una cuenta Gmail con typo, se corrigió, y se confirmó que `Employee.gmailAccounts` reemplazó el correo viejo por el corregido (no quedó duplicado ni residuo); se confirmó que sigue rechazando un correo que no termine en `@gmail.com`. En Plataformas se probó corregir el usuario de una cuenta real de Amazon y se confirmó que un segundo intento de dejarla igual a otra cuenta ya existente de esa misma plataforma se rechaza correctamente.

### 2026-07-08 — Telegram configurado y verificado en producción (sin cambios de código)
- **Qué se hizo:** se creó el bot real (@AssestsAvisos_bot), se armó el grupo "Avisos" en Telegram con el equipo de Sistemas, y se agregaron `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` tanto en el `.env` local como en las variables de entorno de Render (backend en producción). No hubo cambios de código en este paso — solo configuración/credenciales, ya que el código se había dejado listo el mismo día (ver entrada anterior).
- **Detalle del proceso:** el primer intento de sacar el `chat_id` del grupo no funcionaba porque el bot tenía el modo privacidad activado (`can_read_all_group_messages: false`) y no le llegaban los mensajes normales del grupo — se resolvió apagando "Group Privacy" desde @BotFather, tras lo cual sí se pudo leer el `chat_id` real del grupo (`-5381065146`) vía `getUpdates`.
- **Verificación:** se mandó un mensaje de prueba real al grupo "Avisos" (confirmado por el usuario que llegó) y se probó el flujo completo contra el backend de **producción** en Render (no local): se envió una Solicitud de Ingreso de prueba a `https://assets-manager-backend.onrender.com/api/onboarding-requests/public` y se confirmó la llegada del aviso al grupo real. Dato de prueba borrado de la base de producción al terminar.

### 2026-07-08 — Aviso a Telegram cuando llega una Solicitud (de Cuentas o de Ingreso)
- **Qué cambió:** nuevo `backend/src/utils/telegram.js` (`notifyTelegram`) que manda un mensaje a un grupo/chat de Telegram vía la API HTTP del bot (`sendMessage`), sin ninguna librería nueva. Se conectó en `POST /account-requests/public` (un mensaje por envío, resumiendo persona + tipo(s) de cuenta pedidos) y en `POST /onboarding-requests/public` (persona, puesto, y qué necesita). Es **best-effort**: si falla o si `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` no están configuradas, no rompe nada — la solicitud se guarda igual, solo no se manda el aviso (se probó ambos casos contra el backend real).
- **Por qué:** el usuario pidió conectar las notificaciones de ambas Solicitudes a algo más inmediato que entrar a revisar la página — se comparó Telegram vs. WhatsApp Business API vs. correo por Azure/Graph, y Telegram ganó por ser lo más simple de conectar (un bot con @BotFather + una llamada HTTP, sin verificación de negocio ni aprobación de plantillas).
- **Pendiente:** falta crear el bot y darme el `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (instrucciones en la respuesta del chat) y agregarlas en Render — sin eso, el código ya está listo pero no manda nada todavía.
- **Verificación:** `npx vite build`/sintaxis backend sin errores. Contra el backend real, sin las variables configuradas: se envió una Solicitud de Ingreso de prueba y se confirmó que sigue respondiendo 201 normal (el aviso se omite en silencio). Dato de prueba borrado al terminar.

### 2026-07-08 — Fix: faltaba el botón "Eliminar" en Solicitudes de Cuentas
- **Qué pasaba:** el usuario reportó no ver ningún botón de eliminar en "Solicitudes" (Solicitudes de Cuentas, `/account-requests`) — al revisar el código se confirmó que nunca se agregó ese botón ahí, aunque la ruta de backend `DELETE /api/account-requests/:id` ya existía desde que se construyó el módulo. Sí se había agregado correctamente en la página distinta "Ingresos RH" (Solicitud de Ingreso), lo cual generó la confusión.
- **Qué cambió:** se agregó el botón "Eliminar" en la tabla de `AccountRequests.jsx`, con confirmación, visible para quien administre el tipo de cuenta de esa solicitud (mismo criterio de permiso que ya usan Aprobar/Rechazar/PDF).
- **Por qué:** el usuario esperaba poder borrar solicitudes de prueba/erróneas ahí, igual que ya podía en Ingresos RH.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: se creó una solicitud de prueba real (Gmail, con un empleado real existente), se confirmó que aparecía en pendientes, se eliminó con la ruta y se confirmó que ya no aparece en la lista.

### 2026-07-08 — Ingresos RH conectado con Disponibilidad; se quitó "Kit de bienvenida"
- **Qué cambió (conectar con Disponibilidad):** en **Ingresos RH**, cada solicitud ya aprobada (con empleado creado) que haya pedido computadora, teléfono o accesorios ahora tiene un botón **"🔗 Asignar equipo"**. Abre un modal que busca, para cada tipo que se marcó en la solicitud (ej. "Laptop", "Celular", "Monitor"), lo que **realmente está disponible ahorita en Disponibilidad** (mismo dato que `/assets?status=disponible`) y deja asignarlo al nuevo empleado con un clic (mismo mecanismo de asignación que ya usa Disponibilidad/Activos — `POST /assignments`). No hace falta ir a buscarlo aparte ni cruzar manualmente qué se pidió contra qué hay libre.
- **Qué se quitó:** el checkbox "🎁 Kit de bienvenida" — se quitó del formulario público, del modelo, de la ruta y de la columna "Necesita" en la revisión. El usuario aclaró que eso es responsabilidad de RH, no de Sistemas.
- **Hallazgo aparte (no relacionado, se deja documentado):** al probar la asignación contra datos reales se encontró que la laptop LENOVO ThinkPad T14 (no. de serie PF61LNY2) tiene una asignación activa a Ashanty Yocelin Contla Veloz en `Assignment`, pero su campo `Asset.status` sigue en `disponible` — la misma clase de inconsistencia que ya se había corregido antes en sentido inverso (asignaciones huérfanas), aquí es un activo "fantasma disponible" que en realidad ya tiene dueño. No se tocó nada de este registro; queda pendiente decidir si se corrige.
- **Por qué:** el usuario pidió conectar la revisión de ingresos con Disponibilidad para poder asignar directo lo que se pidió, y quitar el kit de bienvenida por no ser tema de Sistemas.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: se creó y aprobó una solicitud de ingreso pidiendo "Laptop", se detectó que la primera laptop "disponible" encontrada en realidad ya tenía dueño (el hallazgo de arriba), se usó una laptop genuinamente libre y se confirmó la asignación real (el activo pasó a `asignado`); se desasignó, se confirmó que regresó a `disponible`, y se borraron la solicitud/empleado/asignación de prueba.

### 2026-07-08 — Equipo/Teléfono/Accesorios en Solicitud de Ingreso: seleccionar, no texto libre; se puede eliminar solicitudes
- **Qué cambió (selección en vez de texto libre):** en `/solicitar-ingreso`, "Teléfono", "Computadora" y "Accesorios" dejaron de tener un campo de texto libre ("Gama, plan...", "Laptop, escritorio...", "Mouse, teclado...") — ahora cada uno muestra un checklist con los tipos que **ya existen registrados en la aplicación** (`ASSET_TYPE_LABELS`/`ACCESSORY_TYPE_LABELS` de `config/assetFields.js`, los mismos que usan Activos/Accesorios): Teléfono → Celular/Tablet; Computadora → Laptop/Escritorio/All-in-One; Accesorios → los 13 tipos de accesorio existentes (Monitor, Mouse, Teclado, Kit Teclado+Mouse, Audífonos, Webcam, Hub USB, Cable, Consumible, Herramienta, Disco Duro/SSD, Adaptador, Accesorio). El modelo cambió de `computerNotes`/`phoneNotes`/`accessoriesNotes` (texto) a `computerTypes`/`phoneTypes`/`accessoryTypes` (arreglos de selección múltiple); la columna "Necesita" en la revisión ahora muestra los tipos elegidos entre paréntesis.
- **Qué cambió (eliminar solicitudes):** nuevo botón "Eliminar" en **Ingresos RH**, disponible para cualquier solicitud sin importar su estado (pendiente/aprobada/rechazada), con confirmación — usa la ruta `DELETE /api/onboarding-requests/:id` que ya existía en el backend pero no tenía botón en la interfaz.
- **Por qué:** el usuario pidió que Teléfono fuera de selección (no texto libre), y que Equipo/Accesorios mostraran las opciones que ya existen en la aplicación en vez de que RH tenga que escribirlas; también pidió poder borrar solicitudes.
- **Verificación:** `npx vite build` sin errores. Se probó en un Chromium real: marcar Computadora/Teléfono/Accesorios y seleccionar Laptop, Celular, Monitor y Mouse; se confirmó contra la base real que la solicitud creada trae exactamente esos valores en `computerTypes`/`phoneTypes`/`accessoryTypes`, y que `DELETE /:id` la elimina correctamente.

### 2026-07-08 — "Quién solicita" en Solicitud de Ingreso también se autocompleta contra Empleados
- **Qué cambió:** en `/solicitar-ingreso`, el campo "Tu nombre" (sección 4, quién de RH llena el formulario) ahora busca en tiempo real contra Empleados (mismo endpoint público `GET /employees/public-lookup`, ya usado para el solicitante en Solicitud de Cuentas) y, al elegir un resultado, autorellena su correo corporativo — el campo "Tu correo" se quitó de la vista, ya no hay que capturarlo a mano. Se agregó `corporateEmails` a los campos que devuelve esa búsqueda pública (antes solo traía puesto/área/teléfono/empresa/oficina).
- **Por qué:** el usuario señaló que todo el personal de RH ya está registrado como empleado en el sistema, así que no tenía sentido pedirles su nombre/correo a mano cuando ya se puede jalar de la base, igual que ya se hacía con el solicitante en Solicitud de Cuentas.
- **Verificación:** contra el backend real — se buscó "bruno" y encontró a Bruno Castañeda Rovira con su correo corporativo real; se completó y envió el formulario en un Chromium real seleccionando ese resultado, y se confirmó en la base que la solicitud creada trae `requestedByEmail: gerente.sistemas@selectshop.com.mx` sin haberlo escrito a mano. Solicitud de prueba borrada al terminar.

### 2026-07-08 — Nueva página pública "Solicitud de Ingreso de Personal" para RH
- **Qué cambió:** nueva página pública **`/solicitar-ingreso`** (sin login, sin sidebar, mismo patrón que Solicitud de Cuentas) para que RH avise un ingreso nuevo — reemplaza el correo manual que mandaban a Sistemas (compartido como ejemplo: "Especialista en métodos y procesos: Computadora SI / Teléfono SI / Kit de bienvenida SI / Si correo"). El formulario pide: datos del nuevo ingreso (nombre, puesto, área/departamento, empresa, oficina, jefe directo, fecha de ingreso), si necesita correo corporativo y **cómo quieren que quede** (ej. "metodosyprocedimientos@selectshop.com.mx", con nota de que es solo sugerencia), y si necesita computadora/teléfono/accesorios/kit de bienvenida (cada uno con notas de tipo/especificaciones si aplica).
- **Revisión (admin) y alta real del empleado:** nueva página **"Ingresos RH"** (`/onboarding-requests`, solo admin — a diferencia de Solicitudes de Cuentas, que se reparte por permiso de Gmail/Plataformas/ERP, esta es de alta de personal así que se dejó admin-only) que lista pendientes/aprobadas/rechazadas. "Aprobar" abre un modal para confirmar/corregir todos los datos — incluyendo el **no. de empleado**, que RH no siempre trae — y crea el `Employee` real (con el correo sugerido guardado en `corporateEmails`); "Rechazar" solo lo marca sin crear nada. Igual que Solicitudes de Cuentas: nunca se crea nada automático, siempre pasa por revisión manual.
- **Nuevo modelo/rutas:** `OnboardingRequest` (`backend/src/models/OnboardingRequest.js`), `backend/src/routes/onboardingRequests.js` (`POST /public` sin auth con honeypot+límite por IP, `GET /`, `PUT /:id/approve`, `PUT /:id/reject`, `DELETE /:id`, todas admin-only salvo la pública).
- **Por qué:** el usuario compartió el correo real que manda RH avisando ingresos nuevos y pidió una página igual a la de Solicitud de Cuentas pero para esto — especificando que quería el formato de correo deseado (con la lógica de que el puesto define el nombre, ej. "metodosyprocedimientos@..."), qué equipo/teléfono/accesorios necesita el nuevo ingreso, y los datos para darlo de alta en el sistema.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: se envió una solicitud de ingreso de prueba completa (equipo, teléfono, kit, correo sugerido), apareció en pendientes, se aprobó capturando un no. de empleado y se confirmó que el `Employee` real se creó con el correo corporativo correcto en `corporateEmails`. Se probó también el formulario público en un Chromium real — las secciones de computadora/correo aparecen solo al marcar la casilla correspondiente, sin errores de consola. Solicitud y empleado de prueba borrados al terminar.

### 2026-07-08 — Se quitan los campos de teléfono de la Solicitud (los resuelve Sistemas, no quien la llena)
- **Qué cambió:** se quitó "Teléfono de recuperación" de la sección de Gmail del formulario público y del PDF, y se quitó "Teléfono / Ext." de la sección "Datos del solicitante" del PDF (ese dato ya se auto-rellenaba desde Empleados sin mostrarse, pero seguía imprimiéndose en el documento). El campo `gmailRecoveryPhone` se eliminó del modelo `AccountRequest`, de la ruta pública y del generador de PDF.
- **Por qué:** el usuario indicó que la parte del teléfono la resuelve Sistemas directamente, no algo que se le deba pedir a quien llena la solicitud ni mostrar en el documento.
- **Verificación:** `npx vite build` sin errores. Se generó un PDF de prueba con marca temporal en ambos campos (teléfono de recuperación y teléfono general) y se confirmó que ninguno de los dos aparece ya en el documento.

### 2026-07-08 — La Responsiva se precarga con los datos de la Solicitud aprobada (Gmail/Plataformas/ERP)
- **Qué cambió:** cuando una cuenta se creó al aprobar una Solicitud pública, el modal de "📄 Responsiva" (en Cuentas Gmail, Cuentas de Plataformas y Cuentas de Plataformas ERP) ya no abre en blanco — se precarga con lo que esa persona puso en su solicitud: jefe directo y vigencia siempre; en Plataformas además tienda/cuenta y un "rol de acceso" armado a partir de los permisos que marcó (ej. "Ventas al detalle, Publicaciones"); en ERP además empresas del grupo, módulos, nivel de acceso, tipo de solicitud y uso en plataformas. Todo sigue siendo editable — quien genera la Responsiva puede corregir cualquier campo antes de descargarla, igual que antes.
- **Cuándo NO se precarga:** si la cuenta se dio de alta a mano (sin pasar por una Solicitud) o si la Solicitud original no traía ese dato, el campo se queda en blanco como siempre — no se inventa ni se copia nada de otra cuenta.
- **Nuevo backend:** `GET /api/gmail-accounts/:id/request-defaults`, `GET /api/platform-accounts/:id/request-defaults` y `GET /api/platform-accounts-erp/:id/request-defaults` — buscan la `AccountRequest` aprobada que generó esa cuenta específica (`createdAccountId`) y devuelven solo los campos relevantes; no modifican nada.
- **Por qué:** el usuario preguntó si tenía sentido que lo llenado en la Solicitud se autorellenara en la Responsiva en vez de volver a capturarlo — confirmó que sí, siempre que quedara editable (a diferencia de una decisión anterior donde se quitó a propósito que la Responsiva "recordara" el último valor usado, por el riesgo de mezclar datos de otra persona; aquí es distinto porque el dato viene de la solicitud de esa cuenta en particular, no de un caché genérico).
- **Verificación:** contra el backend real — se creó una Solicitud ERP de prueba con datos específicos (jefe directo, empresas del grupo, módulos, nivel de acceso, vigencia, uso en plataformas), se aprobó (creando la cuenta real), y se confirmó que `GET .../request-defaults` de esa cuenta devuelve exactamente esos mismos datos. Solicitud y cuenta de prueba borradas al terminar.

### 2026-07-08 — Quitar "Business Intelligence" del PDF de la Solicitud
- **Qué cambió:** el PDF de Solicitud de Cuentas (`backend/src/utils/accountRequestPdf.js`) mencionaba "Área de Sistemas IT & Business Intelligence" en el encabezado y en el pie de página — se quitó, queda solo "Área de Sistemas" / "Uso interno — Sistemas". No se tocó el mismo texto en las Responsivas reales (`gmailAccounts.js`, `platformAccounts.js`, `platformAccountsErp.js`), porque el usuario pidió el cambio específicamente en la Solicitud.
- **Por qué:** el usuario aclaró que ese trámite lo lleva solo el área de Sistemas, no "Business Intelligence".
- **Verificación:** se generó un PDF real de prueba y se confirmó visualmente que ya no aparece "Business" en ningún lado del documento.

### 2026-07-08 — Fix: los botones de Aprobar/Rechazar (y secciones de cuentas) no aparecían recién iniciada la sesión
- **Qué pasaba:** el usuario reportó que en "Solicitudes de Cuentas" veía la lista de pendientes pero no le dejaba hacer nada con ellas — sin botones de Aprobar/Rechazar. La causa: `AccountRequests.jsx` (y también `Stock.jsx` y `EmployeeDetail.jsx`) leían `localStorage.getItem('user')` en una constante **a nivel de módulo** (`const currentUser = ...` fuera del componente), que solo se ejecuta **una vez**, cuando el navegador carga el bundle de JavaScript por primera vez — normalmente antes de haber iniciado sesión, cuando `localStorage` todavía está vacío. Como iniciar sesión no recarga la página (React Router navega del lado del cliente), esa constante se quedaba pegada para siempre en `{}` durante toda la sesión, aunque el login sí hubiera guardado los permisos reales — por eso ningún botón que dependiera de `currentUser.canManageX` aparecía hasta refrescar la página a fuerzas (F5).
- **Qué cambió:** en los tres archivos, esa lectura se movió de nivel de módulo a la primera línea de la función del componente, para que se vuelva a evaluar cada vez que se visita la página (con el `localStorage` ya actualizado por el login).
- **Por qué:** el usuario probó el flujo real después de iniciar sesión y no podía aprobar/rechazar ninguna solicitud pendiente, aunque sí las veía listadas.
- **Verificación:** `npx vite build` sin errores. Se reprodujo el bug exacto en un Chromium real (Playwright): cargar la página sin sesión, simular un login sin recargar (igual que hace `Login.jsx`) y navegar del lado del cliente a Solicitudes — con el fix, el botón "Aprobar" aparece correctamente en ese mismo escenario.
- **Aparte:** se confirmó y borró de la base real la solicitud de prueba "Miguel Garcia Ramos" (Gmail, pendiente) a petición del usuario — no se tocaron las otras 2 pendientes (Jesús Eduardo Marquez Gonzalez y Lilly Estefany Arroyo Huerta) porque no se pidió borrarlas.

### 2026-07-08 — El PDF de la Solicitud ya no se ve igual que la Responsiva
- **Qué pasaba:** el PDF que se genera al enviar el formulario de Solicitud de Cuentas (`backend/src/utils/accountRequestPdf.js`) reutilizaba exactamente el mismo lenguaje visual que la Responsiva real (título centrado en color sólido, franjas de color detrás de cada encabezado de sección, cláusulas de obligaciones numeradas con fondo alternado tipo Responsiva) — el usuario notó que se veían prácticamente idénticos.
- **Qué cambió:** la Solicitud ahora tiene su propio layout, más ligero — badge "SOLICITUD" en contorno (no relleno), título en gris oscuro (no en el color de acento), líneas delgadas debajo de cada encabezado de sección en vez de franjas de color sólido, aviso en cursiva de "Pendiente de revisión — la Responsiva correspondiente se genera y firma al aprobarse esta solicitud", y la sección de obligaciones se condensó a un solo párrafo breve (sin viñetas ni franjas alternadas) que menciona el mismo fundamento legal (LFT Arts. 134/135/47, LFPDPPP, Código Penal Federal Art. 211 Bis 1) pero sin el énfasis/formalidad de la Responsiva — remite a que el detalle completo se formaliza ahí. La sección de aceptación electrónica también se simplificó (ya no lleva el recuadro con franja de color). El color de acento y logo por empresa (misma colorimetría) se mantienen igual que en la Responsiva — no se tocó `pdfBranding.js`, que sigue siendo el que usan las Responsivas reales.
- **Por qué:** el usuario pidió que la Solicitud y la Responsiva no se vieran "igualitas" — que compartieran la colorimetría de marca, pero que la Solicitud mencionara las mismas obligaciones/fundamento legal sin el mismo énfasis formal que sí debe tener la Responsiva.
- **Verificación:** se generó un PDF real de prueba (tipo ERP) y se revisó visualmente — badge de contorno, títulos oscuros, líneas delgadas, párrafo único de obligaciones, todo con el acento de Select Shop MB. Contra el backend real se envió una solicitud con los 3 tipos (Gmail, Plataformas, ERP) y los 3 PDFs se generaron sin errores; datos de prueba borrados al terminar.

### 2026-07-07 — El formulario público exige que el nombre exista en Empleados (frontend y backend)
- **Qué pasaba:** el campo "Nombre completo" del formulario de Solicitud de Cuentas dejaba enviar cualquier texto, incluso si no coincidía con nadie en el autocompletado — solo era una sugerencia, no una validación.
- **Qué cambió:** ahora es obligatorio elegir un nombre de la lista de sugerencias (que sale de `Employee`, empleados activos) para poder enviar la solicitud. Si se escribe un nombre y no aparece nadie en el buscador, se muestra un aviso ("No encontramos a nadie con ese nombre...") y el botón de enviar lo rechaza con el mismo mensaje hasta que se seleccione una coincidencia real. Se agregó la misma validación en el backend (`POST /api/account-requests/public` ahora busca el nombre exacto, sin distinguir mayúsculas, contra empleados activos y responde 400 si no existe) — por si alguien llama la ruta directo sin pasar por el formulario.
- **Por qué:** el usuario pidió confirmar que el nombre capturado sí exista en la base de empleados en vez de aceptar cualquier texto.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: una llamada directa con un nombre inventado devolvió 400 con el mensaje esperado. En un Chromium real (Playwright): escribir un nombre inexistente mostró el aviso y bloqueó el envío (se quedó en el formulario); seleccionar a una empleada real de la lista sí permitió enviar la solicitud normalmente. Solicitud de prueba creada y borrada al terminar.

### 2026-07-07 — Visitar el sitio sin sesión ya no invita a iniciar sesión — muestra un 404 genérico
- **Qué cambió:** antes, cualquier ruta privada (empezando por la raíz `/`) visitada sin sesión redirigía a `/login`, mostrando el formulario de inicio de sesión — así, alguien que llegara al link público de `/solicitar-cuenta` y le borrara esa parte de la URL por curiosidad se encontraba con el login real del sistema interno. Ahora `PrivateRoute` muestra un 404 genérico (`NotFound.jsx`) en vez de redirigir a `/login`; también se agregó una ruta catch-all (`*`) para cualquier URL que no exista. `/login` y `/solicitar-cuenta` siguen funcionando exactamente igual si se entra directo a esa dirección.
- **Por qué:** el usuario notó que quitar `/solicitar-cuenta` de la URL revelaba el login del sistema y pidió que en vez de eso diera una página de "no encontrado", para no delatar que ahí vive una aplicación interna a quien solo esté curioseando el link.
- **Nota operativa:** quien ya usa la app con sesión iniciada no nota ningún cambio; para volver a entrar después de cerrar sesión (o en un dispositivo nuevo) hay que ir directo a `/login` — la raíz del sitio ya no ofrece esa invitación.
- **Verificación:** `npx vite build` sin errores. Probado en un Chromium real (Playwright): visitar la raíz sin token muestra el 404 (sin rastro del formulario de login), una ruta inventada también muestra 404, y tanto `/login` como `/solicitar-cuenta` entrando directo siguen funcionando sin cambios.

### 2026-07-07 — Formulario público de Solicitud de Cuentas: autocompletar por nombre, campos ocultos, y ajustes de contenido
- **Qué cambió (autocompletar sin mostrar datos):** el campo "Nombre completo" ahora busca en tiempo real contra `Employee` (nuevo endpoint público `GET /api/employees/public-lookup?q=`, sin JWT, solo empleados activos, mínimo 3 caracteres, máx. 8 resultados, límite de 20 búsquedas/minuto por IP) y, al elegir un resultado, rellena en automático puesto/área-departamento/teléfono/empresa/no. de empleado — pero esos campos ya **no se muestran** en el formulario; solo aparece una confirmación ("✓ Te encontramos en el sistema"). Si la persona no aparece en el buscador (ej. de alta muy reciente), esos datos simplemente quedan vacíos y Sistemas los completa al revisar.
- **Qué se quitó:** los campos "Correo actual", "Tu correo (para avisarte)" y "Tipo de solicitud" (alta/modificación/baja) — este último ahora siempre se manda como `alta` fijo, ya no se pregunta.
- **Qué cambió (Gmail sugerido):** el campo "Correo solicitado" ahora se autocompleta con una sugerencia (`nombre.apellido@gmail.com`, sin acentos) en cuanto se marca la casilla de Gmail, editable, con la nota "Es solo una referencia — puede quedar así o puede que Google ya lo tenga ocupado; Sistemas confirma el correo final."
- **Qué cambió ("Perfil de referencia" → "Accesos"):** ese campo (antes "usuario con permisos similares") ahora pregunta directamente "Accesos — ¿para qué vas a utilizar estas cuentas en las plataformas?" — la etiqueta del PDF también se actualizó a "Uso en plataformas".
- **Por qué:** el usuario probó el formulario ya en producción y pidió que buscara al empleado por nombre y rellenara sus datos solo, sin mostrárselos a quien llena el formulario (para no alargar la vista ni pedirle datos que el sistema ya tiene); quitar los dos campos de correo y el tipo de solicitud (siempre son altas); cambiar "perfil de referencia" por una pregunta de uso real; y sugerir el correo de Gmail dejando claro que no es definitivo.
- **Verificación:** `npx vite build` sin errores. Contra la base real (solo lectura para la búsqueda; solicitud de prueba creada y borrada al terminar): se probó de principio a fin en un Chromium real (Playwright) — buscar "monica priego" encontró a la empleada real, seleccionarla mostró solo la confirmación (sin exponer ningún valor de puesto/depto/teléfono en ningún input visible), la sugerencia de Gmail generada fue `monica.becerra@gmail.com`, la nota de "puede que Google ya lo tenga ocupado" se mostró, la etiqueta "Accesos" reemplazó a "Perfil de referencia", y los campos quitados ya no aparecen en ningún lado del formulario.

### 2026-07-07 — Formulario público de Solicitud de Cuentas y Accesos (sin login) + módulo de revisión con PDF y fundamento legal
- **Qué cambió:** nueva página pública **`/solicitar-cuenta`** (`SolicitarCuenta.jsx`, sin sidebar ni login, fuera del `Layout`/`PrivateRoute`) para que cualquier persona de la empresa pida cuentas/accesos sin tener usuario en el sistema. Está basada en el formato real que compartió el usuario (`Solicitud_Cuentas_y_Accesos_Unificada.docx`), pero acortado y **dinámico**: solo se marca qué se necesita (Gmail / Plataformas de venta / ERP) y únicamente aparece la sección correspondiente — a diferencia del documento original, que mostraba las tres secciones completas siempre.
- **Aislamiento entre ERP y el resto (petición explícita del usuario):** si se marca más de un tipo a la vez (ej. Gmail + ERP), el backend crea **un `AccountRequest` por tipo**, cada uno solo con los datos de su propia sección — un revisor de ERP nunca ve la parte de Gmail/Plataformas de esa misma solicitud, y viceversa. Reutiliza el mismo filtro por permiso (`canManageGmailAccounts`/`canManagePlatformAccounts`/`canManagePlatformAccountsErp`) que ya aislaba la lista de "Solicitudes de Cuentas".
- **Se guarda el PDF, como las Responsivas:** al enviar el formulario se genera y guarda (en Mongo, no en disco — Render no persiste el filesystem) un PDF por cada solicitud creada, con el mismo estilo visual que las Responsivas existentes (`backend/src/utils/accountRequestPdf.js`, reutiliza `pdfBranding.js`). Nuevo botón "⬇ PDF" en **Solicitudes de Cuentas** (`AccountRequests.jsx`) para descargarlo, protegido por el mismo permiso por tipo — `GET /api/account-requests/:id/pdf`.
- **Fundamento legal agregado:** la sección de obligaciones de cada PDF y del formulario cita explícitamente Ley Federal del Trabajo Art. 134 Fracc. I/IV/XIII (cumplir normas, ejecutar el trabajo con cuidado, guardar secretos comerciales/administrativos), Art. 135 Fracc. IX (prohibición de usar los accesos para fines distintos) y Art. 47 Fracc. II/IX (causal de rescisión sin responsabilidad patronal por revelar información reservada); además Ley Federal de Protección de Datos Personales en Posesión de los Particulares (datos de clientes/colaboradores) y Código Penal Federal Art. 211 Bis 1 (acceso ilícito a sistemas informáticos). Como es un formulario en línea sin firma autógrafa, se agregó una sección de "Aceptación electrónica" (checkbox + nombre + fecha/hora) fundamentada en los Arts. 89 y 97 del Código de Comercio (mensaje de datos con la misma validez que una firma).
- **Antiabuso sin secretos en el frontend:** la ruta pública (`POST /api/account-requests/public`) no usa el secreto compartido que ya tenía el webhook de Power Automate (`POST /webhook`, se deja intacto y sin usar por ahora) — un secreto en el código del navegador es visible para cualquiera. En su lugar: límite de 8 solicitudes por IP cada 15 minutos (en memoria) y un campo trampa (honeypot) invisible que los bots suelen llenar. Se agregó `app.set('trust proxy', 1)` en `index.js` para que `req.ip` refleje la IP real del visitante detrás del proxy de Render.
- **Backend reordenado para reutilizar la misma lógica de alta:** `gmailAccounts.js`, `platformAccounts.js` y `platformAccountsErp.js` ahora llaman a `backend/src/utils/createAccount.js` (`createGmailAccount`/`createPlatformAccount`/`createPlatformErpAccount`) en vez de duplicar la lógica de alta inline — la misma función la usa tanto el alta manual de siempre como la aprobación de una solicitud (`PUT /account-requests/:id/approve`), que sigue sin crear nada automático: cada solicitud se revisa y se empareja a mano con el empleado real antes de generar la cuenta.
- **Por qué:** el usuario preguntó si se podía dar un link de un formulario "que sea básicamente la misma página sin que lo sepan" en vez de depender de Microsoft Forms/Power Automate — se optó por una página pública nativa dentro de la misma app (más simple, sin dependencia externa). Después compartió el formato real usado por la empresa y pidió: acortarlo/hacerlo dinámico por tipo, que ERP quede separado del resto, que el PDF se archive como las Responsivas, y agregar fundamento legal de la LFT y argumentos legales de México/CDMX.
- **Verificación:** `npx vite build` sin errores. Contra la base real (datos de prueba creados y borrados al terminar): se envió una solicitud con Gmail+Plataformas+ERP a la vez y se confirmó que se crearon 3 documentos separados; un usuario con solo permiso ERP recibió 403 al pedir el PDF de la solicitud de Gmail, solo vio el tipo ERP en su lista, y sí pudo descargar su propio PDF. Se revisó visualmente el PDF generado (logo, secciones, fundamento legal, sin fuga de datos de otros tipos). Se probó el formulario público de principio a fin en un Chromium real (Playwright): sin sidebar/login visible, las secciones de Gmail/ERP aparecen y desaparecen correctamente al marcar/desmarcar las casillas, envío exitoso con folios, sin errores de consola.

### 2026-07-07 — Corrección del fix anterior: no borrar `freedFromEmployee` sin una reasignación real; se restauró el dato de un activo
- **Qué pasó:** el cambio anterior (mismo día) limpiaba `freedFromEmployee` en cuanto el `status` del activo dejaba de ser `disponible` por `PUT /assets/:id`, sin verificar que existiera una asignación real a un empleado nuevo. El usuario había cambiado el Estado del Motorola de Arandy a "Asignado" por error (sin asignarlo a nadie realmente) y luego lo regresó a "Disponible" — pero como el fix anterior ya le había borrado `freedFromEmployee` en el camino (al verificar ese fix se hizo un `PUT` real sobre ese mismo activo), la sección "Liberado por salida de personal" ya no lo mostraba, y regresarlo a disponible no lo trajo de vuelta porque el dato ya no existía.
- **Qué cambió:** `PUT /api/assets/:id` ahora solo limpia `freedFromEmployee` si de verdad existe una `Assignment` activa para ese activo (es decir, si en efecto quedó asignado a un empleado) — un simple cambio de "Estado" a mano sin asignación real ya no borra el dato.
- **Dato restaurado:** se regresó `freedFromEmployee` (nombre, puesto, sucursal, fecha original) al Motorola MOTO G04 de Arandy Itzel Onofre Mendoza, que había quedado sin ese dato por el fix anterior. Vuelve a aparecer en "Liberado por salida de personal" con su línea 5521091242.
- **Por qué:** el usuario reportó que, tras corregir el Estado a mano, el equipo seguía sin aparecer en Disponibilidad — el fix del cambio anterior era demasiado agresivo y borró un dato válido sin que hubiera pasado una reasignación real.
- **Verificación:** contra la base real — se confirmó que el activo no tenía ninguna `Assignment` activa (0 asignaciones), se restauró el campo con los valores exactos que se habían capturado antes de borrarlo, y se confirmó que la sección vuelve a mostrar los 4 activos liberados esperados.

### 2026-07-07 — `PUT /assets/:id` no limpiaba `freedFromEmployee` al reasignar editando el activo a mano
- **Qué pasaba:** el usuario preguntó por qué la sección "Liberado por salida de personal" de Disponibilidad mostraba 3 y no los 4 que esperaba. Se confirmó contra la base real que sí eran 4 originalmente, pero uno (el Motorola de Arandy Itzel Onofre Mendoza) ya se había reasignado — su `status` pasó de `disponible` a `asignado`, así que desaparecer de esa lista era el comportamiento correcto. Al investigar se encontró que esa reasignación se hizo editando el activo directamente (cambiando "Estado" a mano en el modal de Activos) en vez de usar el flujo de "Asignar" — `POST /assignments` sí limpia `freedFromEmployee` al asignar (`$unset`), pero `PUT /assets/:id` nunca lo hacía, así que ese registro se quedó con la etiqueta "liberado de Arandy" aunque ya no aplicaba. No causaba nada visible mientras el activo siguiera `asignado` (la sección solo muestra `disponible`), pero habría mostrado datos incorrectos si ese activo volvía a `disponible` por otra vía que tampoco limpiara el campo.
- **Qué cambió:** `PUT /api/assets/:id` ahora limpia `freedFromEmployee` en cuanto el `status` deja de ser `disponible`, sin importar por qué ruta se edite (mismo criterio que ya aplicaba `POST /assignments`).
- **Por qué:** para que la etiqueta de "de dónde vino" nunca quede obsoleta, sin importar si el activo se reasigna por el flujo de asignación o editándolo directamente.
- **Verificación:** contra la base real — se confirmó el registro afectado (Motorola de Arandy, `status: asignado` con `freedFromEmployee` aún seteado), se reprodujo el fix con un `PUT` real (antes: seguía con el campo viejo; después del fix: `freedFromEmployee: undefined`), y se dejó ese registro limpio. El conteo de la sección (3 disponibles) se confirmó correcto y sin cambios — el fix solo evita que se repita a futuro.

### 2026-07-07 — La columna "Datos" de equipo liberado muestra no. de serie o teléfono, no el contrato
- **Qué cambió:** en la sección "Liberado por salida de personal" de Disponibilidad, la columna "Datos" mostraba línea telefónica, IMEI **y** no. de contrato para cualquier tipo de equipo. Ahora es específico por tipo: para celulares/tablets muestra línea telefónica e IMEI (sin contrato); para cómputo y el resto (laptops, escritorios, accesorios, etc.) muestra el **no. de serie** — el contrato ya no aparece ahí, porque para decidir a quién reasignar un equipo importa más su serie o su número que el contrato.
- **Por qué:** el usuario indicó que ver el no. de contrato ahí no le servía para las computadoras — prefiere no. de serie (o teléfono en el caso de celulares); para accesorios, la marca/modelo (que ya se muestra en la columna "Artículo") es suficiente.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-07 — Renombrado "Bajas de personal" en Disponibilidad para no confundirse con activos "de baja"
- **Qué pasaba:** la sección de Disponibilidad que muestra equipo liberado por salida de un empleado se llamaba "Bajas de personal" — el usuario notó que el KPI "De baja" del Dashboard (activos con `status: 'baja'`, es decir, equipo dado de baja/desechado) siempre da 0 porque nunca marca un activo así, y le pareció inconsistente que apareciera una sección de "Bajas" con datos en Disponibilidad. En realidad son dos conceptos sin relación que comparten la palabra "baja": el estado del **activo** (`baja` = desechado) vs. que un **empleado** se dio de baja (dejó la empresa) y liberó su equipo, que sigue contando como `disponible`, no como `baja`. No había ningún bug de datos — el 0 del Dashboard y el conteo de esta sección miden cosas distintas.
- **Qué cambió:** la sección se renombró a "🔁 Liberado por salida de personal" con una nota aclaratoria debajo ("Este equipo está disponible (no 'de baja')..."); se actualizó también el texto de confirmación al dar de baja a un empleado en Empleados, que mencionaba el nombre viejo de la sección.
- **Por qué:** el usuario preguntó por qué "Bajas" aparecía en Disponibilidad si el Dashboard mostraba 0 "de baja" — la reutilización de la palabra "baja" para dos cosas distintas (activo desechado vs. empleado que se fue) era genuinamente confusa.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-07 — Búsqueda por palabras (no por campo único) en Empleados/Activos/Accesorios/Asignaciones; búsqueda nueva en Disponibilidad; número de línea visible en "Bajas de personal"
- **Qué pasaba (búsqueda de un solo campo):** todas las búsquedas comparaban el texto completo escrito contra un campo a la vez (`campo.includes(query)`) — si el dato buscado venía repartido en dos campos (ej. escribir "motorola 5521091242" para buscar por marca y por línea telefónica al mismo tiempo), no encontraba nada, porque esa cadena completa no vive en ningún campo individual. Se confirmó el bug contra la base real: esa búsqueda combinada daba 0 resultados con la lógica anterior.
- **Qué pasaba (Disponibilidad sin buscador y sin mostrar el teléfono):** la página de Disponibilidad (Stock.jsx) no tenía ninguna caja de búsqueda (solo el filtro de sucursal), y la sección "Bajas de personal" no mostraba el número de línea/IMEI del equipo liberado — así que, al dar de baja a alguien con un celular asignado, no había forma de encontrar ni de ver qué número de teléfono traía ese equipo para poder reasignarlo, aunque el dato (`Asset.specs.lineNumber`) ya existía en la base.
- **Qué cambió:** nuevo `frontend/src/utils/search.js` (`matchesSearch`) — búsqueda tipo "todas las palabras", cada una puede venir de un campo distinto (se junta todo el texto buscable en una sola cadena y se exige que cada palabra escrita aparezca en algún lado). Se aplicó en `Employees.jsx`, `Assets.jsx`, `Accessories.jsx` y `Assignments.jsx` (reemplazando su comparación de campo único), ampliando también qué se busca: en Activos ahora se incluyen todos los `specs` del equipo, notas, ubicación y el empleado del que se liberó por baja (`freedFromEmployee`); en Empleados se agregó puesto, teléfono y correos. `Stock.jsx` (Disponibilidad) ahora tiene una caja de búsqueda (antes no tenía ninguna) que filtra tanto las tarjetas agregadas por tipo como "Bajas de personal" por marca/modelo/serie/specs/ubicación o por el nombre del empleado del que se liberó; la tabla de "Bajas de personal" ahora muestra una columna "Datos" con el número de línea, IMEI y no. de contrato del equipo cuando aplica.
- **Por qué:** el usuario reportó que la búsqueda "está súper general" y no permite combinar datos (ej. marca + número de serie en una sola búsqueda), y dio un caso concreto: dio de baja a un empleado (Arandy Onofre) y no podía encontrar ni saber qué número de teléfono traía su equipo para reasignarlo.
- **Verificación:** `npx vite build` sin errores. Contra la base real (solo lectura): la búsqueda combinada "motorola 5521091242" pasó de 0 resultados (lógica vieja) a encontrar exactamente el Motorola correcto (lógica nueva); se confirmó el caso real reportado — Arandy Itzel Onofre Mendoza tiene un Motorola Moto G04 liberado con línea 5521091242, y la nueva búsqueda "Arandy Onofre" en Disponibilidad lo encuentra y muestra ese número directamente en la tabla.

### 2026-07-07 — La búsqueda de Empleados y de Activos ahora cruza entre los dos módulos
- **Qué pasaba:** en Empleados, el buscador solo comparaba contra campos del propio empleado (nombre, número, departamento, área, oficina, razón social) — buscar la marca/modelo/número de serie de un activo no encontraba al empleado que lo tiene asignado, aunque esa misma relación sí se ve en su ficha ("Ver activos"). Viceversa, en Activos el buscador solo comparaba contra campos del propio activo — buscar el nombre de un empleado no encontraba sus equipos asignados, aunque la tabla ya muestra a quién está asignado cada uno.
- **Qué cambió:** `Employees.jsx` ahora también carga `/api/assignments` y arma un mapa `empleado → texto de sus activos` (marca, modelo, no. de serie, etiqueta de inventario); el buscador compara también contra ese texto. `Assets.jsx` ya cargaba `/api/assignments` para mostrar el nombre del empleado en la columna Estado (`assigneeMap`) pero el buscador no lo usaba — ahora `assigneeMap` guarda nombre + número de empleado y el buscador también compara contra eso. Ambos placeholders del buscador se actualizaron para reflejarlo. Assignments.jsx ya buscaba correctamente en ambos sentidos desde antes, no se tocó.
- **Por qué:** el usuario reportó que buscar un activo desde Empleados (o un empleado desde Activos) no encontraba nada, aunque esa relación empleado↔activo ya es visible dentro de cada módulo por separado.
- **Verificación:** `npx vite build` corrió sin errores. Contra la base real (solo lectura, JWT firmado localmente, sin atajos de código): se buscó el número de serie de un activo real desde la lógica de Empleados y encontró correctamente a todos los empleados con ese activo asignado (incluyendo un caso de stock a granel — un cable de red compartido entre ~51 empleados, comportamiento esperado); se buscó el nombre de una empleada real desde la lógica de Activos y encontró correctamente sus 2 equipos asignados (un celular OPPO y una PC Lenovo).

### 2026-07-06 — Cuentas Gmail/Plataformas/ERP agrupadas en "Cuentas" en el sidebar
- **Qué cambió:** las tres cuentas (Gmail, Plataformas, Plataformas ERP) vivían como tres enlaces sueltos en "Administración", cada uno visible solo si el usuario tiene ese permiso específico. Ahora, si el usuario tiene **más de uno** de esos permisos, aparecen agrupadas bajo un enlace padre **"🔑 Cuentas"** con el mismo comportamiento que Empleados/Activos: sub-enlaces (nombres cortos: "Gmail", "Plataformas", "Plataformas ERP") que solo se muestran mientras estás dentro de cualquiera de esas tres páginas, se ocultan al volver a apretar "Cuentas" estando ya ahí, y se resetean al salir. Si el usuario solo tiene **un** permiso de cuentas, se queda como un enlace simple (agruparlo con un solo elemento no aportaba nada).
- **Detalle técnico:** a diferencia de Empleados/Activos, "Cuentas" no es una página real — el botón navega a la primera cuenta disponible para ese usuario si aún no está en el grupo (Gmail > Plataformas > ERP, el orden en que ya aparecían), o solo togglea la lista si ya está dentro de alguna.
- **Por qué:** el usuario pidió aplicar el mismo desglose a las tres páginas de cuentas.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Volver a apretar "Empleados"/"Activos" ya en esa sección oculta la sub-lista
- **Qué cambió:** los sub-enlaces (Empleados→Activos/Bajas, Activos→Equipos/Accesorios) solo se ocultaban al navegar a otra sección — si ya estabas dentro y volvías a apretar el enlace padre, no pasaba nada visible. Ahora, si haces clic en "Empleados" estando ya en Empleados (o en "Activos" estando ya en esa sección), la sub-lista se oculta; un clic más la vuelve a mostrar. Al salir de la sección por completo, se resetea sola para que la próxima vez que entres vuelva a aparecer por default.
- **Por qué:** el usuario señaló que solo se ocultaba al entrar a otro módulo, no al volver a apretar el mismo.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Activos y Accesorios agrupados en el sidebar (mismo patrón que Empleados)
- **Qué cambió:** "Accesorios" vivía en su propia sección aparte del menú ("Accesorios TI", con su propio encabezado), separada de "Activos" (en la sección "General") — visualmente parecían dos módulos sin relación. Se quitó el encabezado "Accesorios TI" y ahora "Activos" y "Accesorios" están agrupados igual que Empleados/Bajas: el enlace "Activos" tiene sub-enlaces **"Equipos"** (→ `/assets`) y **"Accesorios"** (→ `/accessories`) que solo aparecen mientras estás dentro de cualquiera de esas dos páginas, y desaparecen al navegar a otra sección.
- **Por qué:** el usuario pidió aplicar el mismo desglose que se hizo para Empleados/Bajas — le parecía que Activos y Accesorios estaban "muy separados" en el menú cuando en realidad son el mismo tipo de inventario.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Fix: los sub-enlaces de Empleados quedaban visibles fuera de esa sección
- **Qué pasaba:** el desglose "Empleados → Activos/Bajas" del cambio anterior usaba un estado (`empExpanded`) que se ponía en `true` la primera vez que se entraba a Empleados y nunca se revertía — así que, tras visitar esa página una vez, los sub-enlaces se quedaban visibles en el menú para siempre, incluso navegando a Dashboard, Activos, etc.
- **Fix:** se quitó ese estado (y el botón "▸/▾" que lo controlaba); ahora los sub-enlaces "Activos"/"Bajas" se derivan directo de la ruta actual — solo se muestran mientras estás dentro de `/employees`, y desaparecen automáticamente en cuanto navegas a cualquier otra sección.
- **Por qué:** el usuario reportó que la lista se quedaba a la vista por default en vez de aparecer solo al entrar a Empleados.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — "Empleados" se desglosa en el menú lateral: Activos / Bajas
- **Qué cambió:** siguiendo el cambio anterior (las dos tablas se volvieron pestañas dentro de Empleados), ahora el enlace "Empleados" del menú lateral es expandible — un botón "▸/▾" a su derecha despliega dos sub-enlaces indentados, **"Activos"** y **"Bajas"**, que llevan directo a `/employees` o `/employees?estado=baja` con la pestaña correspondiente ya seleccionada. Se expande solo automáticamente al entrar a Empleados; el estado de expandido/colapsado del grupo es independiente del colapso general del sidebar (los sub-enlaces se ocultan si el menú completo está colapsado, igual que el resto de etiquetas).
- **Detalle técnico:** `Employees.jsx` ahora sincroniza la pestaña activa (Activos/Bajas) con el query param `?estado=` de la URL (antes era solo un estado interno con dos tablas apiladas) — así el menú lateral y la página se mantienen en el mismo estado sin duplicar lógica. Se agregaron las clases de tabs a `Page.module.css` (mismo patrón visual que ya usan Activos/Accesorios).
- **Por qué:** el usuario pidió que el propio menú lateral desglosara estas "pestañas" en vez de tener que entrar a Empleados y cambiar de pestaña ahí.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Sección aparte de "Bajas de personal" en Empleados (en vez de mezclarlas con el checkbox)
- **Qué cambió:** el checkbox "Mostrar bajas" del cambio anterior mezclaba a los empleados de baja dentro de la misma tabla — se reemplazó por una **segunda tabla aparte**, debajo de la principal, titulada "🔴 Bajas de personal (N)", que solo aparece si existe al menos un empleado inactivo. Respeta la misma búsqueda/filtro de sucursal que la tabla de arriba, y tiene los mismos botones por fila (Ver activos, Editar, Reactivar, Eliminar). La tabla principal ahora siempre muestra solo activos (ya no necesita la columna "Estado", que era redundante fuera de una lista mixta).
- **Por qué:** el usuario pidió, además de poder mostrar las bajas, tener una sección dedicada solo a ellas — más clara que un checkbox que las mezclaba con el resto.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Un empleado de baja deja de contar como parte del equipo (pero su puesto y activos se pueden reasignar)
- **Qué cambió:** complementa el cambio anterior (baja libera activos a "Bajas de personal"). Ahora un empleado de baja: (1) deja de aparecer en la lista de **Empleados** por default — nuevo checkbox "Mostrar bajas (N)" en la barra de filtros para verlos cuando haga falta (ej. para reactivarlos); (2) deja de contar en los headcounts del **Dashboard** (KPI "Empleados", desglose "Empleados por sucursal", chips de filtro de sucursal/departamento); (3) deja de aparecer como opción al buscar a quién asignarle un activo físico **nuevo** — se corrigió esa búsqueda en Stock (Disponibilidad), Assets y el modal de alta de activos, que no filtraban por `active` (a diferencia de las cuentas Gmail/Plataformas, que sí lo hacían desde antes).
- **Lo que NO cambió (a propósito):** el registro del empleado no se borra — sigue existiendo (reactivable), su historial de asignaciones pasadas sigue en Assignments/Auditoría tal cual, y sus activos ya liberados siguen disponibles en "Bajas de personal" listos para asignarse a alguien nuevo o a un empleado interno que tome ese puesto (ya sea creando un empleado nuevo con el mismo puesto, o eligiendo a uno ya existente — el puesto es solo texto libre en el empleado, no hay que "liberarlo" de nada aparte).
- **Por qué:** el usuario aclaró que el punto de la baja es justo eso — que la persona deje de contar como parte del equipo activo (ya no debe aparecer en Empleados ni en los conteos), mientras que su puesto y sus activos sí deben poder reutilizarse por alguien más.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Dar de baja a un empleado libera sus activos solo a "Bajas de personal" en Disponibilidad
- **Qué se encontró:** `Employee.active` existe en el modelo desde siempre, pero no había ningún botón en la UI para ponerlo en `false` — no existía forma de "dar de baja" a un empleado. Además, si se hubiera podido, nada devolvía sus activos asignados: se habrían quedado marcados como "asignados" a alguien que ya no está.
- **Qué cambió:** en Empleados, nueva columna "Estado" (Activo/Baja) y botón "Dar de baja"/"Reactivar" por fila (con confirmación explícita). Al dar de baja a un empleado (`PUT /api/employees/:id` con `active:false`), el backend ahora desasigna automáticamente **todos** sus activos activos (misma lógica que ya usaba el botón "Desasignar" — cierra la `Assignment`, recalcula status para productos a granel) y los deja `disponible`, marcándolos con de dónde vinieron (`Asset.freedFromEmployee`: nombre, puesto, sucursal, fecha). Nueva sección **"🔴 Bajas de personal"** en Disponibilidad (Stock.jsx) que lista justo esos activos aparte del resto del stock — con botón "Asignar" para reciclarlos directo. La etiqueta se limpia sola en cuanto el activo se vuelve a asignar a alguien.
- **Por qué:** el usuario explicó que "una baja" no es solo un activo disponible genérico — viene de un puesto específico, y quería verlo aparte en Disponibilidad para poder decidir qué hacer con ese equipo (reasignarlo al reemplazo de ese puesto, etc.) en vez de que se perdiera mezclado en el stock general.
- **Detalle técnico:** la función que libera los activos se extrajo a `backend/src/utils/releaseAssetsOnBaja.js` (mismo patrón que `utils/audit.js`, `utils/archiveResponsiva.js`) para poder probarla aislada.
- **Verificación:** contra la base real — se creó un empleado y un activo de prueba, se asignó el uno al otro, se llamó la función real de baja y se confirmó: el activo quedó `disponible` con `freedFromEmployee` correcto (nombre, puesto), la asignación quedó cerrada con `returnDate`, y `freedCount` regresó 1. Se borraron por completo el empleado, activo, asignación y su entrada de auditoría de prueba al terminar — no quedó ningún residuo.

### 2026-07-06 — Dashboard 100% interactivo + se descubrieron y filtraron cuentas de prueba huérfanas
- **Qué cambió (interactividad, el resto de las tarjetas):** además del drill-down de categorías (cambio anterior el mismo día), ahora todo el Dashboard lleva a algo al hacer clic: "Estado del inventario" (Asignados → Asignaciones, Disponibles → Disponibilidad, De baja → Activos), "Empleados por sucursal"/"Departamentos" (clic en una fila aplica ese filtro al propio Dashboard, igual que los chips de arriba), "Últimas asignaciones" y "Top empleados" (cada fila lleva a la ficha de ese empleado), "Propiedad — Cómputo" (lleva a Activos) y cada persona en "Score de actividad" (lleva a Auditoría filtrada por esa persona). Para que estos últimos dos destinos lleguen ya filtrados, se agregó soporte de query params (`?office=` en Empleados, `?userId=` en Auditoría) que antes no existía — ambas páginas solo tenían filtros por estado interno, no leían la URL.
- **Qué se encontró (usuarios de prueba huérfanos en el score de actividad):** al revisar por qué aparecían nombres desconocidos en "Score de actividad por persona", se confirmó contra la base real que 6 nombres ("Verify Test", "Usuario ERP Prueba", "Tester Import", "Tester Dup", "Tester Reimport", "Tester Delete Guard") corresponden a cuentas de `User` creadas y borradas en verificaciones de features anteriores — el borrado del usuario fue correcto, pero `AuditLog` nunca borra su rastro (así debe ser, es un log de auditoría), así que sus acciones seguían apareciendo como si fueran gente real y activa hoy. No existe ninguna cuenta de automatización/agente en el sistema.
- **Fix:** el cálculo de "Actividad real del equipo" ahora cruza cada entrada de `AuditLog` contra la lista de usuarios que existen hoy (`GET /api/users`) y descarta las de cuentas ya eliminadas, antes de calcular totales, desglose por acción y el score por persona. No se borró nada de `AuditLog` — el historial completo se sigue viendo en la página de Auditoría; solo se dejó de mostrar en este widget del Dashboard.
- **Por qué:** el usuario pidió que absolutamente todo lo que se muestra en el Dashboard sea interactivo (no solo la categoría de activos), y por separado notó nombres que no reconocía como personas reales en el score de actividad y preguntó si eran de prueba o si alguno era "el agente" — se confirmó que son residuos de pruebas, no hay ningún agente/bot.
- **Verificación:** `npx vite build` corrió sin errores. El conteo de `AuditLog` real de los últimos 7 días (828 entradas) se contrastó contra la lista de usuarios reales para identificar exactamente los 6 nombres huérfanos antes de aplicar el filtro.

### 2026-07-06 — Dashboard: drill-down a ubicación física + todo agrupado por sucursal
- **Qué cambió (interactividad — "¿dónde están esos equipos?"):** la tarjeta "Activos por categoría" tenía 2 niveles (categoría → tipo). Se agregó un tercer nivel: al hacer clic en un tipo (ej. "Laptop" dentro de "Cómputo"), ahora se muestra el desglose por sucursal de esos equipos (usando `Asset.location`), con el mismo patrón de barras y botón "← Volver" que ya existía entre los otros niveles.
- **Qué cambió (Donut y Propiedad-cómputo ahora respetan la sucursal):** "Estado del inventario" (donut) y "Propiedad — Cómputo" estaban marcadas explícitamente como "siempre global" — no cambiaban aunque se filtrara por sucursal en la barra de filtros. Ahora, si hay una sucursal seleccionada, ambas usan `Asset.location` para mostrar solo lo físicamente en esa sucursal (incluyendo disponibles/de baja, no solo lo asignado). Los KPIs de arriba (Asignados/Disponibles/De baja/Total) siguen mostrando el número global a propósito — están etiquetados "global" y eso no cambió.
- **Qué cambió (actividad separada por sucursal):** se agregó el campo `office` a `User` (antes no existía — un usuario de Sistemas no tenía sucursal asociada). Nuevo selector "Sucursal" en el modal de Usuarios (mismo catálogo `OFFICES` que Empleados, ahora exportado desde `Employees.jsx` para no duplicarlo) y nueva columna en la tabla. El "Score de actividad por persona" del Dashboard ahora agrupa a cada persona bajo la sucursal de su cuenta (`GET /api/users`, cruzado por `userId` contra `AuditLog`), y si se selecciona una sucursal en el filtro del Dashboard, solo se muestra el grupo de esa sucursal.
- **Por qué:** el usuario pidió (1) que las gráficas/números fueran interactivos — dar clic en "X equipos de cómputo" y ver dónde están físicamente esos equipos, no solo un total; y (2) que toda la actividad mostrada se separe por sucursal (ejemplo real: Felipe en Tepotzotlán, Lilly en Polanco), no solo los empleados que ya se filtraban antes.
- **Nota operativa:** los usuarios de Sistemas existentes quedan con "Sin asignar" hasta que un admin les capture su sucursal desde Usuarios — sin eso, su actividad aparece agrupada como "Sin sucursal asignada" en el Dashboard.
- **Verificación:** `npx vite build` corrió sin errores tras el cambio.

### 2026-07-06 — Dashboard: score de actividad por persona (lógica tipo ML, sin modelo)
- **Qué cambió:** dentro de la tarjeta "Actividad real del equipo" (agregada más temprano el mismo día), se sumó un desglose por persona: cada usuario que aparece en `AuditLog` en los últimos 7 días recibe un **score compuesto** (`ACTION_WEIGHTS` en `Dashboard.jsx`: crear/asignar pesan 1, editar/eliminar/devolver pesan 0.5 — pesos fijos, no aprendidos) y se clasifica en **Actividad alta/media/baja** de forma relativa al máximo del propio equipo en el periodo (≥66% del máximo = alta, ≥33% = media, el resto = baja). Cada persona muestra su score, su nivel (con color) y el detalle de qué acciones hizo (ej. "3 altas · 5 ediciones · 1 baja").
- **Por qué:** el usuario pidió llevar el diagnóstico anterior "al siguiente nivel" — quería la lógica de un modelo de scoring/clasificación (features + pesos + umbrales) sin entrenar un modelo real de ML. Es una regla determinística (sin datos de entrenamiento, sin aprendizaje), pero sigue el mismo patrón que un clasificador: combina varias señales en un score y lo traduce a una categoría.
- **Cuidado de diseño:** el texto junto al score aclara explícitamente que no es una evaluación de desempeño, sino una señal relativa dentro del equipo — para no repetir, a nivel individual, el mismo error que motivó todo este cambio (juzgar a alguien solo por un número sin contexto).
- **Verificación:** `npx vite build` corrió sin errores tras el cambio.

### 2026-07-06 — Dashboard: tarjeta de "Actividad real del equipo" (diagnóstico, no solo descriptivo)
- **Qué cambió:** el Dashboard solo mostraba KPIs y gráficas descriptivas (activos por categoría, estado del inventario, últimas asignaciones, top empleados) — todas basadas en conteos de inventario/asignaciones. Se agregó una nueva tarjeta, visible solo para `role: admin`, que contrasta las **asignaciones nuevas de los últimos 7 días** contra el **total de acciones registradas en `AuditLog`** en el mismo periodo (altas, ediciones, bajas, devoluciones, además de asignar), con un desglose por tipo de acción y un mensaje diagnóstico automático cuando las asignaciones nuevas son pocas pero el resto de la actividad no lo es. Nuevo `useEffect` en `Dashboard.jsx` que llama a `GET /api/audit?from=<hace 7 días>` (endpoint que ya existía, sin cambios de backend).
- **Por qué:** el usuario señaló, usando como ejemplo un reporte de eficiencia de vendedores (que solo mide ventas por día y por eso no refleja los días sin venta pero con actividad — llamadas, etc.), que el Dashboard tiene el mismo problema: "asignaciones" es un conteo de resultado (como las ventas), no de esfuerzo — un periodo con pocas asignaciones nuevas no significa que Sistemas no hizo nada, ya que gran parte del trabajo (ediciones, altas de cuentas, bajas, correcciones de datos) no genera una asignación nueva. Se pidió agregar ese tipo de análisis diagnóstico (el "por qué", no solo el "qué") al Dashboard existente.
- **Verificación:** `npx vite build` del frontend corrió sin errores tras el cambio.

### 2026-07-03 — Disponibilidad ahora muestra la sucursal de cada equipo; se rellenaron 474 sucursales faltantes
- **Qué cambió:** en la página de Disponibilidad, cuando se ven "Todas las sucursales", ahora aparece un desglose por sucursal debajo del número de "Disponibles" en cada renglón (ej. "SUC.1 Corporativo Torre Polanco: 5 · SUC.7 CEDI TEPOTZ JSB: 2"). En el modal de "Asignar", cada unidad disponible en la lista ahora muestra su sucursal (📍) junto al nombre y la etiqueta/serie, para poder elegir la unidad correcta según dónde esté físicamente.
- **Dato faltante corregido:** de 659 activos, solo 159 (24%) tenían el campo `location` (sucursal) capturado directamente. Los otros 500 no lo tenían, pero 474 de ellos SÍ estaban asignados a un empleado que ya tiene su oficina/sucursal registrada — se copió esa oficina al campo `location` del activo (sin tocar ningún otro dato). Quedaron 26 sin poder inferir: 6 asignados a un empleado que tampoco tiene oficina capturada, 6 con más de una asignación activa (se dejaron para no adivinar cuál oficina aplica), y 14 sin asignar (disponibles/de baja, sin empleado del cual copiar). Resultado: de 159 a 633 de 659 activos (96%) con sucursal.
- **Investigado y descartado como falsa alarma:** se encontraron 23 activos con más de una asignación activa simultánea, lo cual parecía un bug (un mismo equipo "asignado" a 2+ personas a la vez) — pero al revisar uno por uno, los 23 son artículos de stock a granel (cables, mouses, kits, consumibles con `stockTotal`), donde es normal y esperado que varias personas tengan una porción del mismo lote asignada al mismo tiempo. No se tocó nada ahí.
- **Por qué:** el usuario reportó que Disponibilidad no mostraba a qué sucursal pertenecía cada equipo, y que esa información ya existía en la app (visible al ver qué empleado tiene asignado cada activo) — solo faltaba mostrarla/copiarla en el lugar correcto.

### 2026-07-03 — Reorganización de Activos/Accesorios: nuevas categorías (Almacenamiento, Adaptadores, Infraestructura) y limpieza de datos
- **Qué se encontró:** el cajón "Otros" de Accesorios (`type: 'accesorio'`) tenía 68 artículos de naturaleza muy distinta mezclados — discos duros y SSD sueltos, switches/routers/cámaras IP/NVRs/inyectores PoE/UPS/insumos de red (equipo de infraestructura, no accesorios de oficina), adaptadores, y varios que ya encajaban en categorías existentes (mouse, hub USB, audífonos, kit teclado+mouse, cargador celular, consumible, herramienta) pero nunca se movieron ahí. Además, 258 activos (80 laptops, 139 celulares, 21 escritorios, 18 all-in-one) no tenían el campo `category` asignado en absoluto.
- **Nuevas categorías creadas:** `disco_duro` (Almacenamiento, dentro de Accesorios), `adaptador` (Adaptadores, dentro de Accesorios), y **Infraestructura** como sección nueva dentro de Activos con 7 tipos: `router`, `switch`, `camara_ip`, `nvr`, `poe_injector`, `ups`, `insumo_red` — cada uno con sus propios campos de especificaciones (puertos, IP, canales, capacidad, etc.).
- **Migración de datos aplicada:** 61 de los 68 artículos de "Otros" se reclasificaron (revisados uno por uno con el usuario antes de aplicar) — 26 a Almacenamiento, 8 a Adaptadores, 15 a Infraestructura (pasaron de `category: 'accesorio'` a `category: 'equipo'`, ahora aparecen en Activos, no en Accesorios), y 12 a categorías ya existentes que no se habían usado. Quedan 7 en "Otros" sin categoría clara (bases para laptop, enfriadores, un Echo Dot, una batería suelta, un gabinete vacío). Los 258 activos sin `category` se corrigieron a `equipo` (coincide con sus tipos: laptop/celular/escritorio/all-in-one).
- **Causa raíz corregida:** la importación masiva por Excel (`mapAssetRows` en `importCategories.js`) nunca establecía el campo `category` — se quedaba con el default del esquema (`equipo`) sin importar qué categoría se eligiera al importar, lo que probablemente causó buena parte del desorden original. Cada categoría de importación ahora declara su `category` correcta y se aplica siempre. También se agregaron 3 nuevas categorías de importación (Almacenamiento, Adaptadores, Infraestructura) con sus propias plantillas de Excel.
- **6 listas de tipos hardcodeadas, todas actualizadas:** además de `ASSET_GROUPS`/`ACCESSORY_GROUPS` (compartidas en `assetFields.js`), se encontraron y actualizaron listas independientes en Disponibilidad (`STOCK_SECTIONS`), Dashboard (`CATEGORIES`), Asignaciones (`FILTER_CATS`), Accesorios (`TABS`) y Activos (`TABS`) — sin esto, los nuevos tipos habrían quedado invisibles en esas páginas aunque existieran en la base.
- **Por qué:** el usuario reportó "mucho desorden" en Accesorios, con cosas en "Otros" que no debían estar ahí o que pertenecían a categorías que no existían (adaptadores, infraestructura).
- **Verificación:** se revisó cada uno de los 68 artículos de "Otros" con el usuario antes de mover nada; tras aplicar, se confirmó que no queda ningún activo sin `category`, que "Otros" bajó exactamente a los 7 esperados, y que el total de activos (659) no cambió — solo se reclasificaron, nada se creó ni se borró.

### 2026-07-03 — La Responsiva de Cuentas ERP usa su propio formato (Responsiva_Acceso_ERP.docx)
- **Qué cambió:** el usuario compartió la plantilla real que usa Sistemas para el acceso al ERP, distinta a la de marketplaces que se venía reutilizando. Se reescribió por completo el contenido de `GET /api/platform-accounts-erp/:id/responsiva` para seguir ese formato: título "SOLICITUD Y CARTA RESPONSIVA DE ACCESO AL SISTEMA ERP", sección de usuario con "Empresa / Razón social" (`employee.businessName`) en vez de teléfono (esta plantilla no lo pide), y una sección 2 completamente distinta: **Módulos** del ERP (Ventas, Compras, Inventarios/Almacén, Facturación, CxC, CxP, Finanzas/Contabilidad, Bancos/Tesorería, Nómina/RH, Reportes/BI, Otro) con selección múltiple, **Nivel de acceso** (Consulta/Captura-Operación/Autorización-Supervisión/Administrador) de selección única, **Tipo de solicitud** (Alta/Modificación/Baja), **Empresa(s) del grupo con acceso**, **Vigencia** y **Perfil de referencia** — y el texto legal de la sección 3 y las firmas (Usuario responsable / Jefe directo (autoriza) / Sistemas (configura acceso), cada una con su propia línea de fecha en blanco) tomados verbatim de la plantilla, distintos a los de la Responsiva de marketplaces.
- **Sin tocar Plataformas/Gmail:** las Responsivas de Cuentas de Plataformas (general) y Cuentas Gmail siguen exactamente igual, con su checklist de marketplaces — solo la de ERP cambió, porque es la única que de verdad tiene un formato distinto.
- **Igual que siempre:** ninguno de estos datos (tipo de solicitud, módulos, nivel de acceso, etc.) se guarda en la cuenta — el modal siempre abre en blanco, viajan solo como parámetros de esa descarga puntual.
- **Por qué:** el usuario indicó que "la responsiva de ERP es diferente" y compartió el .docx real que usa Sistemas para dar de alta accesos al ERP.
- **Verificación:** se generó una Responsiva real con varios módulos y un nivel de acceso marcados a la vez — el PDF resultante coincide con la plantilla campo por campo (título, secciones, checklist de módulos envuelto en varias líneas cuando no cabe, firmas con línea de fecha en blanco).

### 2026-07-03 — La Responsiva mostraba Gmails en "Correo corporativo"; datos corregidos y validación agregada
- **Qué pasaba:** el usuario reportó que la Responsiva ponía "todos los gmails del usuario" en el campo "Correo corporativo" en vez del de Microsoft. La causa: 2 empleados tenían direcciones `@gmail.com` mezcladas dentro de `Employee.corporateEmails` (el campo que se supone solo debe tener correos de Microsoft/corporativos) — probablemente capturadas ahí por error, ya que "Correos corporativos" y "Gmail" en el formulario de Empleados son dos campos de texto libre (tipo tags) sin ninguna validación de dominio entre ellos.
- **Fix de datos:** se movieron esos gmails de `corporateEmails` a `gmailAccounts` (nunca se borró nada) — Oscar Ivan Ramirez Lopez (#70399) tenía 3 gmails mezclados con su único correo real de Microsoft (`analista.bi@selectshop.com.mx`, que se quedó); Eliyahu Cojab Yedid (#SDWERFG) tenía solo un gmail y ningún correo de Microsoft real. Se confirmó que ya no queda ningún empleado con un gmail dentro de `corporateEmails`.
- **Fix de prevención:** el campo "Correos corporativos" en el formulario de Empleados ahora rechaza cualquier valor que termine en `@gmail.com`, con el aviso de que ese va en el campo "Gmail" de abajo — así no se puede volver a mezclar por accidente.
- **Por qué:** la Responsiva de cualquiera de las tres páginas (Plataformas, ERP, Gmail) toma "Correo corporativo" directo de `employee.corporateEmails.join(', ')` — el código siempre fue correcto, el problema era que ese campo tenía datos que no debían estar ahí.
- **Verificación:** se confirmó que el registro de Oscar ya solo devuelve `analista.bi@selectshop.com.mx` en ese campo, y que no quedan más empleados con gmails mezclados en corporateEmails.

### 2026-07-03 — No se puede eliminar un activo asignado; se limpiaron 3 asignaciones huérfanas
- **Qué pasaba:** algunos activos se habían eliminado directamente sin desasignarlos primero, dejando la `Assignment` activa apuntando a un activo que ya no existe. La ficha del empleado ("Ver activos") truena en ese caso porque intenta leer `asset.type`/`asset.brand`/etc. de un activo que llega como `null` tras el `populate`. Afectaba a 3 empleados: Bruno Castañeda Rovira, Andros Cuauhpn Ochoa Lopez y Sistemas.
- **Fix 1 (evitar que vuelva a pasar):** `DELETE /api/assets/:id` ahora revisa si el activo tiene una asignación activa antes de borrarlo; si la tiene, responde 400 con "Este activo está asignado a &lt;empleado&gt;; desasígnalo primero antes de eliminarlo." y no borra nada. Se corrigieron también dos huecos donde ese aviso no llegaba a verse: el borrado en lote de Activos ignoraba silenciosamente cualquier error (`.catch(() => {})`) y ahora junta los fallos y los muestra en una alerta; el borrado individual en Accesorios no tenía manejo de errores en absoluto (la promesa fallida se perdía sin avisar nada) y ahora sí captura y muestra el mensaje.
- **Fix 2 (limpieza de datos):** se identificaron y eliminaron las 3 asignaciones activas huérfanas ya existentes (el activo referenciado ya no existía, así que no había nada que preservar). Además, `GET /api/employees/:id` ahora filtra cualquier asignación cuyo activo no exista (`asset: null` tras el `populate`) antes de devolverla — la misma defensa que ya tenía `responsiva.js` (`.filter(Boolean)`) — como red de seguridad adicional por si una asignación queda huérfana por otra vía en el futuro.
- **Por qué:** el usuario reportó empleados con la vista de activos rota por esta causa exacta y pidió (1) limpiar los datos huérfanos y (2) bloquear el borrado de un activo asignado, avisando que hay que desasignarlo primero.
- **Verificación:** contra los routers reales — intentar borrar un activo con asignación activa da 400 y no lo borra; tras desasignarlo, si se borra correctamente; simulando un huérfano igual al reportado (activo borrado sin pasar por la ruta protegida), `GET /employees/:id` ya no lo incluye y ninguna asignación devuelta tiene `asset: null`. Las 3 asignaciones huérfanas reales se identificaron primero (vista previa) y se confirmó que ya no quedan tras la limpieza.

### 2026-07-03 — La vista previa del importador de Excel también detecta duplicados dentro del mismo archivo
- **Qué se confirmó (el import nunca borra nada):** el importador de Excel de Cuentas ERP (`POST /bulk-import`) solo llama `.create()` para cuentas nuevas — nunca actualiza, sobrescribe ni elimina un documento existente. Se verificó de forma empírica contra la base real: el conteo de cuentas solo sube por cada una creada, nunca baja.
- **Qué se corrigió (duplicados que sí se detectan, pero no se avisaban en la vista previa):** el backend ya rechazaba correctamente una fila duplicada (misma plataforma+usuario), incluso si las dos copias venían en el mismo archivo — pero la **vista previa** del frontend solo comparaba contra las cuentas ya existentes en la base, no contra otras filas del mismo Excel, así que si el archivo traía el mismo correo dos veces, ambas se veían como "✓ Listo" hasta que se importaba (recién ahí el backend omitía la segunda). Ahora la vista previa marca "Ya existe" también cuando el correo se repite dentro del mismo archivo, quedando excluida por default como cualquier otro duplicado. De paso se corrigió que la comparación contra la base ahora es por plataforma+usuario (como es realmente único), no solo por usuario — antes podía marcar como "ya existe" una cuenta con el mismo correo pero de otra plataforma, que en realidad sí es válida.
- **Por qué:** el encargado de ERP preguntó si el import podía borrar datos, y si un duplicado se agregaría dos veces — la respuesta a ambas dudas debía quedar clara y, en el segundo caso, corregida donde faltaba (la vista previa).
- **Verificación:** contra el router real, un lote con la misma cuenta repetida 3 veces (incluyendo variación de mayúsculas) solo crea 1 y omite las otras 2 con "Ya existe una cuenta con ese usuario en esa plataforma"; el conteo de documentos en la base solo sube en +1. La lógica de la vista previa se probó por separado: fila nueva (no marcada), fila repetida en el archivo (marcada), fila ya existente en la misma plataforma (marcada) y fila con el mismo correo pero otra plataforma (correctamente NO marcada).

### 2026-07-03 — "¿Ya existe con Gmail?" en Cuentas ERP: toma la contraseña sola
- **Qué cambió:** al dar de alta una cuenta en Cuentas de Plataformas ERP, la elección "¿Esta cuenta ya existe o es nueva?" tiene ahora una tercera opción: **"¿Ya existe con Gmail?"**. Al elegirla (con un empleado ya seleccionado), busca las cuentas Gmail de ese empleado ya registradas en Cuentas Gmail y toma la contraseña automáticamente — sin escribirla a mano. Si el empleado tiene varias cuentas Gmail, deja elegir cuál; si no tiene ninguna, avisa y sugiere usar "Ya existe" para capturarla a mano. La opción "Ya existe" original no cambió.
- **Nuevo endpoint:** `GET /api/platform-accounts-erp/gmail-lookup?employeeId=` — devuelve las cuentas Gmail (correo + contraseña) del empleado. Requiere el permiso `canManagePlatformAccountsErp`, **no** `canManageGmailAccounts` — un usuario de ERP no tiene por qué ver el resto de Cuentas Gmail, solo la contraseña puntual del empleado que está dando de alta.
- **Por qué:** el encargado de ERP reportó que, para las cuentas que ya existen, su contraseña es la misma que la de su Gmail — así que no tiene caso volver a escribirla si ya está guardada en el sistema.
- **Verificación:** contra el router real, con un empleado real que tiene 6 cuentas Gmail (confirma el selector de "cuál usar"), un empleado sin ninguna (devuelve `[]`, correcto) y sin `employeeId` (400).

### 2026-07-03 — Responsiva también en Cuentas Gmail, con selección múltiple de plataformas
- **Qué cambió:** Cuentas Gmail ahora tiene el mismo botón "📄 Responsiva" que Cuentas de Plataformas/ERP — genera la "Solicitud y Carta Responsiva de Cuenta de Acceso a Plataformas Digitales" para una cuenta Gmail usada para entrar a marketplaces. Nuevo `GET /api/gmail-accounts/:id/responsiva`.
- **Diferencia clave:** una cuenta Gmail puede dar acceso a varias plataformas a la vez (ej. una sola cuenta usada para Mercado Libre + Amazon + Walmart + TikTok Shop), a diferencia de Cuentas de Plataformas donde cada cuenta es de una sola. El checklist de plataformas en el modal es ahora de **selección múltiple** (checkboxes, no un dropdown de una sola opción), y en el PDF aparecen marcadas `[X]` todas las que apliquen. Se agregó **Coppel** y **Liverpool** a la lista de marketplaces (antes solo tenía Mercado Libre/Amazon/Walmart/TikTok Shop) — esta lista ahora vive centralizada en `pdfBranding.js` (`MARKETPLACE_OPTIONS`) y la usan las tres páginas.
- Como siempre: plataformas/tienda/jefe directo/rol/vigencia nunca se guardan en la cuenta, el modal siempre abre en blanco, y queda archivada en el historial de Responsivas (`type: 'cuenta_gmail'`).
- **Por qué:** el usuario está dando de alta cuentas Gmail específicamente para acceso a marketplaces (compartió una tabla real: 8 cuentas, cada una usada para entre 1 y 5 plataformas distintas) y necesitaba la misma Responsiva que ya existía para Cuentas de Plataformas.
- **Verificación:** contra el router real, generando una Responsiva con 4 plataformas marcadas a la vez — el PDF las muestra todas correctamente marcadas, el resto sin marcar, y la cuenta Gmail queda exactamente igual después (sin rastro de los datos de la solicitud); se confirmó el archivado con el tipo correcto y se limpiaron los datos de prueba.

### 2026-07-03 — Los encabezados de sección del menú se veían aplastados/encimados
- **Qué pasó:** el usuario reportó (con captura) que en el menú lateral los nombres de los apartados se veían "encimados". Era un efecto secundario del arreglo del scroll del nav (2026-07-03, entrada más abajo): los encabezados de sección (`.navSection` — "Accesorios TI", "Administración") tienen `overflow: hidden` para truncar texto largo, y por la especificación de flexbox, un hijo flex con `overflow` distinto de `visible` puede encogerse hasta 0 de alto en vez de mantener su tamaño natural. Cuando la ventana no tenía suficiente alto para las ~14 filas del menú, el navegador aplastaba esos encabezados casi a la nada en vez de dejar que el `<nav>` scrolleara — el texto comprimido se veía encimado/ilegible. Los enlaces normales (Dashboard, Empleados, etc.) no tenían este problema porque no llevan `overflow`.
- **Fix:** se agregó `flex-shrink: 0` a `.navSection` (y por seguridad a `.link`) — ahora conservan su tamaño natural siempre, y es el `<nav>` el que scrollea si no cabe completo, como se pretendía desde el arreglo anterior.
- **Por qué:** el usuario señaló correctamente que esto no se veía normal; se confirmó con la captura que compartió.

### 2026-07-03 — Disponibilidad (Stock) no tenía ningún ajuste para pantallas pequeñas
- **Qué se encontró:** al revisar a fondo cada hoja de estilos del frontend, `Stock.module.css` (página Disponibilidad) era la única sin un solo `@media` — cero ajustes para tablet/celular. Además su tabla usaba `overflow: hidden` en vez de scroll horizontal (a diferencia de todas las demás páginas, que usan `overflow-x: auto`), así que en pantallas angostas la tabla se recortaba en vez de poder desplazarse lateralmente.
- **Qué se corrigió:** `.tableWrap` ahora usa `overflow-x: auto` + `min-width` en la tabla (scroll horizontal en vez de recorte); la fila de filtro de sucursal pasó de estilo inline a una clase (`.filterRow`) para poder ajustarla en móvil; y se agregó un bloque `@media (max-width: 640px)` que reduce el título, ajusta el filtro y hace que el modal de asignación se comporte como hoja inferior (igual que en el resto de la app) en vez de modal centrado de escritorio.
- **Revisión del resto de la app:** se revisaron todas las demás hojas de estilos (Dashboard, Activos/Accesorios, Empleados/Asignaciones, Auditoría, Login, Usuarios, Gmail/Plataformas/ERP, Responsivas) — ya tenían manejo razonable de tablet/celular (scroll horizontal en tablas, modales tipo hoja inferior en móvil, grids que se colapsan). El hueco real estaba únicamente en Disponibilidad.
- **Por qué:** el usuario señaló, con razón, que el ajuste anterior (scroll del menú lateral) fue un parche puntual, no un acoplamiento real a distintos dispositivos — esta revisión encontró y corrigió el caso concreto donde sí faltaba.

### 2026-07-03 — Mismo arreglo de "Otra" también en Cuentas de Plataformas (general)
- **Qué cambió:** la página general de Cuentas de Plataformas tenía exactamente el mismo problema que se acababa de corregir en la de ERP — lista de plataformas fija (`Microsoft 365`, `Amazon`, `Netflix`, etc.), y escribir una nueva con "Otra" nunca quedaba disponible para elegir después. Se aplicó la misma solución: la lista ahora se arma con la base fija más cualquier plataforma ya registrada entre las cuentas existentes. Cuentas Gmail no tiene este problema — no maneja un campo de "plataforma" (todas sus cuentas son `@gmail.com`).
- **Por qué:** el usuario preguntó si el arreglo de ERP también aplicaba a "las otras cuentas" — sí debía aplicar, y de hecho tenía el mismo defecto exacto ahí.

### 2026-07-03 — Las plataformas ERP escritas con "Otra" quedan disponibles para elegir después
- **Qué cambió:** en Cuentas de Plataformas ERP, la lista de "Plataforma" al crear una cuenta o importar por Excel era fija (`SAP`, `Oracle NetSuite`, `Microsoft Dynamics`, `Odoo`, `Aspel`, `Contpaqi`, `Otra`) — si escribías un nombre nuevo con "Otra", quedaba guardado en la cuenta pero nunca aparecía como opción después; había que volver a teclearlo cada vez. Ahora la lista se arma dinámicamente con la base fija más cualquier plataforma que ya exista entre las cuentas registradas — en cuanto se usa una vez con "Otra", queda disponible para elegir directamente la próxima vez.
- **Por qué:** el usuario preguntó si al agregar "otro tipo de ERP" se iba a quedar guardado para después o siempre habría que volver a escribirlo — antes la respuesta era "siempre escribirlo", ahora se recuerda solo.

### 2026-07-03 — Aclarar que "Solo lectura" + permiso de cuentas = control total en esa página
- **Qué cambió:** el usuario preguntó si con rol "Solo lectura" sus usuarios de ERP iban a poder editar/crear/generar Responsivas, o si hacía falta un rol especial "administrador de ERP". La respuesta es que el sistema ya funciona así — el permiso de cuentas (Gmail/Plataformas/ERP) da control total sobre esa página específica sin importar el rol, y "Solo lectura" solo significa que no entra a Usuarios/Auditoría ni ve el resto de la app. Se reescribió el texto del modal de Usuarios (tarjetas de rol y sección de permisos) para que esto quede claro a simple vista, sin necesidad de preguntar.
- **Por qué:** el nombre "Solo lectura" es engañoso en este contexto — dentro de su propia página de cuentas (si tiene el permiso) el usuario tiene control total, no de solo lectura. No se necesitó ningún cambio de lógica, ya que el comportamiento deseado ("todos los permisos, pero solo de esa página") ya existía; solo faltaba explicarlo bien en la UI.

### 2026-07-03 — El "líder de ERP" veía todo el sistema porque su rol era Administrador
- **Qué pasó:** `lider.erp@selectshop.com.mx` y `analista.erp@selectshop.com.mx` quedaron dados de alta con rol **Administrador** además del permiso ERP. El rol Admin siempre tiene acceso total por diseño (así funciona `isErpOnlyUser()`, agregada el 2026-07-01: explícitamente no aplica a admins) — por eso veían todo el sistema en vez de quedar limitados a Cuentas de Plataformas ERP + Responsivas. No era un bug en la restricción; el permiso ERP ya da control total sobre esa página por sí solo, sin necesitar rol Administrador.
- **Fix de datos:** se corrigió el rol de ambos usuarios a "Solo lectura" en la base de datos, conservando su permiso `canManagePlatformAccountsErp`. Como el rol y los permisos se cargan en el JWT al iniciar sesión, cada uno necesita cerrar sesión y volver a entrar para que el cambio tome efecto.
- **Fix de UI para prevenir que se repita:** en el modal de "Nuevo usuario"/"Editar usuario" (solo visible para `sistemas.2`), ahora aparece una advertencia si se selecciona rol Administrador junto con cualquiera de los permisos de cuentas (Gmail/Plataformas/ERP), explicando que Admin ve todo sin importar esos permisos y que no hace falta para gestionarlos.

### 2026-07-03 — El botón de "cerrar sesión" ya no se pierde en pantallas más bajas
- **Qué cambió:** el menú lateral (`Layout.module.css`) tenía el `<nav>` con `flex: 1` pero sin `min-height: 0` ni scroll propio, dentro de un sidebar con `overflow: hidden`. Con la cantidad de enlaces que ya tiene el menú (Responsivas, Cuentas ERP, etc.), en pantallas con menos alto vertical (una laptop, por ejemplo) el nav empujaba el bloque de usuario/cerrar sesión fuera del área visible y quedaba recortado — invisible e inalcanzable. En un monitor externo, al haber más alto disponible, no se notaba.
- **Fix:** el `<nav>` ahora tiene scroll propio (`overflow-y: auto`, con `min-height: 0` para que el flex funcione bien) y el botón de colapsar menú + el bloque de usuario/cerrar sesión llevan `flex-shrink: 0` — quedan siempre fijos y visibles, sin importar cuántos enlaces tenga el menú ni el alto de la pantalla; si el menú no cabe completo, ahora scrollea internamente en vez de empujar todo lo de abajo fuera de vista.
- **Por qué:** el usuario reportó que en un monitor sí veía la opción de cerrar sesión, pero en su computadora (pantalla con menos alto) ya no la podía ver ni usar.

### 2026-07-01 — Un usuario solo-ERP ya no ve el resto de la aplicación
- **Qué cambió:** Dashboard, Empleados, Activos, Asignaciones, Accesorios y Disponibilidad nunca tuvieron ningún control de acceso — cualquier usuario autenticado los veía, sin importar su permiso, porque hasta ahora todos los usuarios eran administradores o vieron esas páginas a propósito. Con el nuevo permiso `canManagePlatformAccountsErp` eso dejó de ser cierto: un usuario cuyo **único** permiso es ese debe ver nada más "Cuentas Plataformas ERP" y "Responsivas". Se agregó `isErpOnlyUser()` (en `Layout.jsx`, exportada) que detecta este caso (no admin, sin Gmail, sin Plataformas generales, con ERP) y: (1) en el menú lateral, oculta todo lo demás y solo deja esas dos opciones; (2) en `App.jsx`, un nuevo `NotErpOnlyRoute` bloquea también el acceso directo por URL a esas páginas y redirige a Cuentas Plataformas ERP.
- **Por qué:** el usuario reportó que aunque le puso el permiso ERP a alguien, esa persona seguía viendo toda la aplicación (Dashboard, Empleados, etc.) — solo debía ver su cuenta ERP y sus propias Responsivas, sin motivo para ver el resto.
- **Alcance:** esta restricción solo aplica cuando ERP es el único permiso — un usuario con Gmail y/o Plataformas generales (o admin) sigue viendo todo como antes; no se tocó el comportamiento de esos casos.

### 2026-07-01 — Otorgar permisos de cuentas (Gmail/Plataformas/ERP) desde el alta de usuario
- **Qué cambió:** el modal de "Nuevo usuario"/"Editar usuario" ahora incluye, solo cuando quien lo abre es `sistemas.2`, tres checkboxes ("Cuentas Gmail", "Cuentas de Plataformas", "Cuentas de Plataformas ERP") para otorgar esos permisos directo en el alta — antes solo se podían activar después, con los toggles de la tabla. `POST /api/users` ahora acepta esos mismos tres campos con la misma validación que ya tenía `PUT /:id` (solo `sistemas.2` puede mandarlos; cualquier otro admin recibe 403 si lo intenta).
- **Por qué:** el usuario reportó que al crear un usuario nuevo solo veía los roles "Administrador"/"Solo lectura" y no encontraba dónde asignar el permiso ERP — el rol y estos permisos son independientes a propósito, pero antes obligaban a un paso extra (crear y luego editar) que no era obvio.
- **Verificación:** contra el router real — `sistemas.2` crea un usuario con `canManagePlatformAccountsErp: true` directo en el `POST` y queda con el permiso activo; un admin distinto a `sistemas.2` que intenta lo mismo recibe 403, igual que ya pasaba al editar.

### 2026-06-30 — Importar cuentas ERP existentes desde Excel (masivo, sin contraseña)
- **Qué cambió:** en Cuentas de Plataformas ERP, nuevo botón "📥 Importar Excel" que sube un `.xlsx`/`.xls`/`.csv` con una columna de nombre de empleado y otra de correo/usuario (encabezados flexibles: detecta "nombre"/"empleado" y "correo"/"email"/"usuario", o cae a las dos primeras columnas si no encuentra ninguno). Se elige una sola plataforma para todo el lote. Cada fila se empareja automáticamente contra los empleados activos (exacto, insensible a acentos/mayúsculas, y también si el orden del nombre viene invertido) y se muestra en una tabla de revisión donde se puede **corroborar o corregir** el empleado detectado antes de confirmar, con casillas para incluir/excluir filas. Las cuentas sin coincidencia, sin correo o ya existentes (mismo usuario+plataforma) se marcan y quedan excluidas por default.
- **Sin contraseña real, nunca inventada:** las cuentas importadas se crean con contraseña vacía y un nuevo flag `passwordPending` — quedan visibles en un bloque "🔑 Pendientes de contraseña" arriba de la tabla y con una etiqueta "⏳ Pendiente" en la columna de contraseña, con un botón directo para capturarla cuando se tenga a la mano. Al guardarla (manual o regenerada), `passwordPending` se limpia solo. El modelo `PlatformAccountErp.passwordEncrypted` dejó de ser obligatorio para soportar este estado.
- **Nuevo endpoint:** `POST /api/platform-accounts-erp/bulk-import` (`{ platform, accounts: [{ employeeId, username }] }`) → `{ created: [...], skipped: [{ username, reason }] }`, mismo permiso `canManagePlatformAccountsErp`.
- **Por qué:** el usuario ya tiene usuarios activos con cuentas reales en el ERP y no quiere darlas de alta una por una — la contraseña sí es nueva información que se captura después, pero el nombre/correo ya existen y se pueden cargar en lote, verificando el emparejamiento antes de guardar.
- **Verificación:** contra el router real — import masivo con filas válidas, un empleado inexistente y una fila sin correo (cada una omitida con su razón); reintento del mismo archivo detecta los duplicados; las cuentas creadas quedan con `password: null` y `passwordPending: true` hasta capturar la contraseña real, momento en el que se limpia el flag. La lógica de emparejamiento de nombres (acentos, mayúsculas, orden de palabras) y el parseo de encabezados flexibles del Excel se probaron por separado con archivos de prueba reales.

### 2026-06-30 — La sección "Cuentas ERP" en la ficha del empleado solo aparece si tiene alguna
- **Qué cambió:** en `EmployeeDetail.jsx` ("Ver activos"), la tabla de "Cuentas ERP" ya no se muestra con un texto vacío ("Este empleado no tiene cuentas ERP asignadas") para cada empleado — ahora solo aparece, con su propio encabezado, cuando ese empleado tiene al menos una cuenta ERP asignada. El botón "+ Asignar cuenta ERP" del encabezado de la sección "Cuentas" no cambió — sigue disponible siempre para poder asignar la primera.
- **Por qué:** las cuentas ERP son un caso muy puntual (un solo usuario nuevo por ahora), así que mostrar el aviso de "no tiene" en cada ficha de empleado era ruido innecesario para el resto de administradores.

### 2026-06-30 — Cuentas de Plataformas ERP: página y permiso aislados para un usuario nuevo
- **Qué cambió:** nueva página **Cuentas de Plataformas ERP** (`/platform-accounts-erp`), copia funcional completa de Cuentas de Plataformas (alta nueva/existente, editar, regenerar/corregir contraseña una vez, eliminar, filtros, exportar Excel, generar Responsiva en PDF, reciclaje de cuentas disponibles) pero en su **propia colección de MongoDB** (`PlatformAccountErp`), sin relación con las cuentas de Microsoft/Amazon/etc. que ya gestiona Sistemas.
- **Permiso nuevo:** `canManagePlatformAccountsErp`, independiente de `canManageGmailAccounts`/`canManagePlatformAccounts`, otorgable solo por `sistemas.2@selectshop.com.mx` desde Usuarios (nueva columna "Plataformas ERP"). Un usuario con solo este permiso no ve Cuentas de Plataformas, Cuentas Gmail, Usuarios ni Auditoría — únicamente su página ERP (y Responsivas, ver abajo).
- **Reciclaje:** igual que las cuentas generales — asignar/desasignar cuentas ERP se hace desde la ficha del empleado ("Ver activos") y las disponibles también aparecen en Disponibilidad, en su propia sección "Cuentas de Plataformas ERP".
- **Responsivas con visibilidad acotada:** la página Responsivas ahora es visible para cualquier usuario con algún permiso de cuentas (Gmail, Plataformas o Plataformas ERP), no solo administradores — pero un usuario no-admin **solo ve las responsivas que él mismo generó** (nuevo campo `generatedBy` en el archivo, usado para filtrar). Los administradores siguen viendo todo. Borrar del archivo sigue reservado a administradores.
- **Por qué:** va a entrar un usuario nuevo al sistema y no debe ver todo lo que Sistemas ha estado gestionando (Gmail, cuentas de plataformas generales, usuarios, auditoría) — solo su propia página de cuentas ERP y el historial de sus propias responsivas.
- **Verificación:** contra los routers reales con un usuario ficticio que solo tiene `canManagePlatformAccountsErp`: confirmado 403 al intentar ver Cuentas de Plataformas general; ciclo completo en ERP (crear, generar responsiva archivada con el `generatedBy` correcto, desasignar/reciclar, reasignar a otro empleado); en Responsivas, el usuario ERP solo ve su propio documento (1) mientras que un admin ve todos (2); el usuario ERP recibe 403 al intentar borrar del archivo, el admin sí puede.

### 2026-06-30 — Datos de la Responsiva de Plataformas dejan de guardarse; borrar del archivo
- **Qué cambió (datos siempre en blanco):** "Tienda/Cuenta/Seller", "Jefe directo", "Rol de acceso" y "Vigencia" dejaron de guardarse en `PlatformAccount` (se quitaron esos 4 campos del modelo y de `PUT /:id`; se limpiaron de los documentos existentes en Mongo). Ahora viajan como query params directo a `GET /api/platform-accounts/:id/responsiva` y solo existen para esa descarga puntual — el modal siempre abre en blanco, sin importar qué se haya puesto la vez anterior.
- **Qué cambió (borrar del archivo):** en la página **Responsivas** cada fila tiene un botón "Eliminar" con modal de confirmación (mismo patrón que el resto de la app). Nuevo `DELETE /api/responsiva-archive/:id`, solo admin.
- **Por qué:** el usuario notó que los datos de la solicitud (tienda, jefe directo, etc.) se estaban guardando y prellenando, pero cada responsiva es para una persona/tienda distinta — nunca deben repetirse. También pidió poder borrar entradas del archivo (por ejemplo, las que generó de prueba) por si más adelante hay que corregir un error.
- **Verificación:** contra el router real, se confirmó que generar la responsiva con datos de prueba los refleja correctamente en el PDF pero el documento de `PlatformAccount` queda sin esos campos después (`{}`); se probó `DELETE /:id` end-to-end (crea, borra, confirma que ya no existe). Se dejó intacto el documento real de archivo que el usuario generó de prueba (Amazon / MIGUEL GARCIA RAMOS) para que lo borre él mismo con el nuevo botón.
- **Commit(s):** (ver commit que introduce este cambio).

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
