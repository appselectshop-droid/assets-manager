# Instrucciones para Claude en este repositorio

## ⚠️ REGLA FIJA — Base de datos de producción (MongoDB Atlas)

**Nunca hagas ningún movimiento en la base de datos de producción —
escrituras, actualizaciones, eliminaciones, scripts de corrección de datos,
migraciones, lo que sea — sin avisar primero al usuario exactamente qué vas
a hacer y qué puede salir mal, y esperar su confirmación explícita antes de
ejecutar.** Pedido explícito del usuario (2026-07-27), después de que se
corrigieran 3 registros reales en producción para arreglar un bug — el
usuario dejó claro que quiere enterarse SIEMPRE, sin excepción, antes de
que se toque la base de datos.

Esto aplica sin excepción, incluso si:
- El cambio parece pequeño, obvio o "seguro".
- Ya se investigó el problema y la causa está clara y confirmada.
- Es "solo" corregir 1-2 documentos.
- El usuario ya aprobó un cambio similar antes en la misma conversación.

### Cómo señalar un cambio relevante a la BD

Antes de escribir cualquier cosa en Mongo, preséntalo destacado (usar
**negritas** y la marca **⚠️ RIESGO** para que resalte del resto del texto),
con estas 4 partes:

1. **Qué exactamente vas a cambiar** — colecciones, documentos, campos,
   cuántos registros.
2. **Por qué** — la causa raíz, con evidencia real (no especulación).
3. **Qué puede salir mal** — honesto: riesgo de pérdida de datos, efectos
   secundarios en otras partes de la app, si es reversible o no.
4. Espera la confirmación explícita del usuario antes de tocar nada. No
   asumas que un "sí" a una pregunta cubre la siguiente.

### Antes de escribir en producción, siempre

1. Toma un respaldo fresco con `mongodump` (ver carpeta
   `assets-manager-db-backups/` junto a este repo en OneDrive) — sin
   excepción, cada vez.
2. Verifica el estado exacto de lo que vas a cambiar antes de escribir (no
   asumas que sigue como cuando lo investigaste).
3. Verifica el resultado después de escribir, y confirma que no quedó
   ningún efecto colateral no buscado.

### Contexto por qué esto importa tanto aquí

Este repo se conecta DIRECTO a la base de datos real de producción
(MongoDB Atlas, `MONGO_URI` en `backend/.env`) — no existe un ambiente de
"staging" ni una base de datos de prueba separada. Cualquier lectura o
escritura hecha desde una sesión de Claude Code toca datos reales de la
operación de SelectShop MB (activos, empleados, tickets, asignaciones,
etc.).

La credencial actual (`assets-admin`) tiene rol `atlasAdmin` — el más alto
que existe en un proyecto de Atlas. **No hay ninguna barrera técnica que
impida escribir** — la única barrera real es esta regla de avisar siempre
primero. Pendiente (aprobado por el usuario, 2026-07-27): crear un usuario
de solo lectura en Atlas (Database Access → Add New Database User → rol
`read` sobre `assets-manager`) para que las investigaciones futuras se
conecten con ese por default, reservando el usuario de escritura solo para
cambios ya confirmados explícitamente.
