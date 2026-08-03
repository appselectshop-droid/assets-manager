# Instrucciones para Claude en este repositorio

## ⚠️ REGLA FIJA — Base de datos de producción (MongoDB self-hosted en AWS,
## antes MongoDB Atlas — migrado 2026-08-02, ver `ops/MIGRACION-AWS.md`)

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

1. Toma un respaldo fresco (`mongodump` contra el Mongo self-hosted, ver
   abajo, o el más reciente ya subido a
   `s3://eup-assets-manager-backups/mongo/` por el cron diario) — sin
   excepción, cada vez.
2. Verifica el estado exacto de lo que vas a cambiar antes de escribir (no
   asumas que sigue como cuando lo investigaste).
3. Verifica el resultado después de escribir, y confirma que no quedó
   ningún efecto colateral no buscado.

### Si algo sale mal — cómo restaurar un respaldo

La base vive en el contenedor `mongo` del EC2 (`i-0a9ebde3eaf58b188`), sin
puerto expuesto al host — solo se accede vía `docker compose exec mongo
...` por SSH. Restaurar desde el respaldo más reciente en S3 (esto
**sobreescribe** lo que haya en producción — avisar y confirmar con el
usuario antes de correrlo, igual que cualquier otra escritura):

```bash
ssh -i ~/.ssh/assets-manager-ec2.pem ubuntu@<IP-actual-del-EC2>
cd ~/assets-manager && set -a && source .env && set +a
aws s3 cp s3://eup-assets-manager-backups/mongo/<archivo>.archive.gz /tmp/
docker compose exec -T mongo mongorestore \
  --username "$MONGO_ROOT_USER" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --drop --archive --gzip < /tmp/<archivo>.archive.gz
```

`--drop` borra cada colección justo antes de restaurarla desde el
respaldo (si no, mezclaría datos viejos del respaldo con lo que haya
cambiado después en producción).

Respaldo automático diario a las 12:00 vía `ops/backup-to-s3.sh` (cron de
root en el EC2), con 90 días de retención en S3. Ver
`ops/MIGRACION-AWS.md` para el detalle completo de la arquitectura.

### Contexto por qué esto importa tanto aquí

Este repo se conecta DIRECTO a la base de datos real de producción (Mongo
self-hosted en el EC2, `MONGO_URI` apuntando al contenedor `mongo`) — no
existe un ambiente de "staging" ni una base de datos de prueba separada.
Cualquier lectura o escritura hecha desde una sesión de Claude Code toca
datos reales de la operación de SelectShop MB (activos, empleados,
tickets, asignaciones, etc.).

La credencial (`MONGO_ROOT_USER`, en el Secret `assets-manager/backend-env`
de AWS Secrets Manager) es la raíz de esa base de Mongo — el más alto
privilegio que existe ahí. **No hay ninguna barrera técnica que impida
escribir** — la única barrera real es esta regla de avisar siempre primero.
Pendiente (mismo criterio que ya existía con Atlas): crear un usuario de
solo lectura en el Mongo self-hosted para que las investigaciones futuras
se conecten con ese por default, reservando el usuario root solo para
cambios ya confirmados explícitamente.

**Cuidado con `backend/.env` local**: no asumas que refleja los valores
reales de producción sin verificar — en la migración de agosto 2026 se
encontró que `FRONTEND_URL` ahí decía `http://localhost:3000` (valor de
desarrollo) mientras que el backend real (entonces en Render) tenía otro
valor. El único campo de ese archivo que sí era fiable era `MONGO_URI`,
precisamente porque no hay ambiente de staging separado.
