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
- El movimiento se vaya a hacer "solo en local" — no hay ambiente de
  staging, `MONGO_URI` en local (incluso por el túnel SSH de desarrollo)
  apunta a la misma base de datos real de producción, sin excepción.

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

## ⚠️ REGLA FIJA — Avisar ANTES de crear algo que después haya que borrar

Pedido explícito del usuario (2026-08-26), después de enterarse de un
incidente viejo (2026-07-10: un `deleteMany` sin acotar, al limpiar datos de
prueba propios, se llevó también 2 entradas reales de auditoría de otra
persona — ver `CHANGELOG.md` de esa fecha).

**Si para verificar o probar algo hace falta crear un dato, registro,
archivo o cualquier otra cosa que después vas a tener que borrar o
deshacer, avisa ANTES de crearlo — no después.** El aviso debe decir:

1. **Qué exactamente vas a crear/hacer.**
2. **Dónde** (qué colección/tabla, qué entorno — recuerda que no hay
   staging, así que "en local" casi siempre significa producción real).
3. **Cómo lo vas a limpiar/borrar después**, y cuándo.

Espera confirmación antes de proceder, igual que con cualquier escritura en
producción (ver regla de arriba). Si terminas necesitando borrar algo y no
avisaste antes de crearlo, no lo borres por tu cuenta — repórtalo y que el
usuario decida.

## Matriz de pruebas de Felipe (SharePoint)

Felipe (`sistemas.4@selectshop.com.mx`) es el tester formal de Assets
Manager — lleva un registro de bugs/sugerencias que va encontrando en un
Excel de SharePoint:

```
https://marcovichbeer-my.sharepoint.com/:x:/g/personal/sistemas_4_selectshop_com_mx/IQDLFZaD9cjlQ5IqtIz0GT3VAdpmsrM3eFScRDKpE47ZKvI?rtime=e6GpRccD30g
```

**Cuando el usuario diga "corrige lo de la matriz" (esa frase exacta o
equivalente cercana), significa:** abrir ese link, leer todo lo que Felipe
haya agregado desde la última revisión, y corregir cada bug/sugerencia real
que encuentres ahí — mismo patrón ya usado varias veces en el CHANGELOG (ej.
"FIX: 4 bugs del Calendario (matriz de pruebas de Felipe)", 2026-08-19).
Documentar en el `CHANGELOG.md` qué puntos de la matriz se corrigieron, con
el mismo detalle que cualquier otro fix.
