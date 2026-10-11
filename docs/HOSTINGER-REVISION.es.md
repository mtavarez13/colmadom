# Colmadom móvil: revisión de publicación — 2 octubre 2026

## Estado

Paquete de código para revisión; NO publicado. Preparar/subir un paquete no equivale a autorizar activar una versión. No se han cambiado reglas, IAM, facturación, datos ni credenciales en producción. Se requiere aprobación independiente para publicar.

## Qué cambia

- Añade siete rutas móviles: sesión, dispositivos, listado/detalle de pedidos y productos/checkout/comprobante POS
- Modifica catálogo público: pedido confirmado mediante API transaccional, precio calculado en servidor y outbox de notificación
- Modifica webhook WhatsApp: autenticación reforzada (firma o token secreto), deduplicación/transacción y outbox
- Añade worker Functions/FCM y recuperación programada, además de reglas locales que deben revisarse/publicarse separadamente
- Login móvil requiere correo verificado, perfil UID autorizado, sucursal/plan activos y módulo/rol adecuado. Registrar Firebase Auth por sí solo no crea membresía
- POS emite recibos NO FISCALES; bloquea negocios fiscalizados. Tarjeta registra un pago externo, no procesa cargos

## Hostinger: variables y configuración

Root `.`; Next.js; Node 20.x; instalar `npm ci`; construir `npm run build`; iniciar `npm run start`; salida `.next`. No activar COLMADOM_DESKTOP_BUILD.

Obligatorio para nuevos pedidos del catálogo: `PUBLIC_APP_ORIGIN` con origen HTTPS exacto del catálogo, sin ruta/slash final; faltante devuelve 503 y origen distinto 403. Confirmar dominio real en hPanel. Si se necesita más de un dominio, el código actual admite solo uno.

Admin SDK necesita UNA vía de credenciales válida en el gestor privado del hosting:
1. `FIREBASE_SERVICE_ACCOUNT_BASE64` (prioritaria), o
2. `FIREBASE_SERVICE_ACCOUNT_JSON`, o
3. `FIREBASE_ADMIN_PROJECT_ID`/`NEXT_PUBLIC_FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`, o
4. Application Default Credentials si el entorno las proporciona realmente

No crear/exportar una nueva clave ni ampliar permisos sin aprobación. Nunca poner estas claves en ZIP/APK, capturas o chat. No se verificó su presencia ni validez en Hostinger.

`NEXT_PUBLIC_FIREBASE_PROJECT_ID` determina explícitamente el proyecto Admin; si falta, el código conserva el proyecto Colmadom existente como fallback. `FIREBASE_STORAGE_BUCKET` admite bucket explícito; si falta usa el bucket Colmadom existente. La configuración Firebase web está fija en `src/firebase/config.ts`: cambiar únicamente una variable NO convierte todo el paquete en staging. Para staging hay que alinear web, Admin, Android y Functions a un proyecto de prueba antes de conectar.

Conservar todas las variables actuales para las funciones existentes. Entre ellas Meta (`META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` y demás configuración actual), pagos PayPal, MSeller, IA, Bencash y `CRON_SECRET` cuando se utilicen. Parte de Meta también puede venir de configuración guardada. No sobrescribir secretos existentes con ejemplos. `NEXT_PUBLIC_APP_URL` se usa por Meta y no sustituye `PUBLIC_APP_ORIGIN`.

## Dependencias y bloqueos antes de producción

- Hostinger publica web/API; no publica automáticamente Functions ni Firestore Rules
- FCM necesita Functions v2, Scheduler/Eventarc, permisos mínimos, región revisada (actual us-central1), APIs/plan/costos aprobados y una prueba de entrega real
- Revisar reglas completas en emulador: conservan privilegios amplios heredados de administrador. Un deny local no anula otro allow global. Catálogo nuevo y reglas nuevas deben coordinarse; clientes antiguos abiertos necesitan recargar
- Probar asignación UID/roles entre dos sucursales; cuentas verificadas/no verificadas, revocación y planes inactivos
- Probar transacciones concurrentes, pérdida de respuesta y reintentos/idempotencia POS/catálogo, recibos cruzados y entrega FCM con app abierta/cerrada
- Configurar/validar WAF y límite de cuerpo HTTP en proxy; el límite por sucursal no sustituye anti-bot/rate limit por IP confiable
- Confirmar proveedor WhatsApp: relay por solo IDs públicos ya no es válido
- Repetir build/tests en Node 20.x real. Esta validación corrió con Node 24.19.0
- Riesgos heredados fuera de alcance: autenticación telefónica con contraseña en texto plano, reglas amplias y escrituras POS web no transaccionales. La protección del POS móvil no garantiza consistencia global contra clientes web antiguos
- La revalidación POS dentro de transacción revisa estado de sucursal, permisos y suscripción; la inactividad del plan raíz se comprueba antes de la transacción, no nuevamente dentro. Cubrir revocación concurrente en staging antes de afirmar bloqueo atómico completo

## Evidencia local

TypeScript completo aprobado (`tsconfig.check.json`); 17 pruebas catálogo/auth + 9 POS + 11 FCM aprobadas; sintaxis Functions aprobada. Build Next aprobado y registra los endpoints nuevos. Build omite TypeScript/lint por configuración heredada; TypeScript se validó aparte. ESLint no tiene configuración y `npm run lint` solicita configuración interactiva, así que no se declara lint aprobado.

Warnings de build: instrumentación OpenTelemetry/Genkit usa dependencia dinámica; `/wa/[channel]` reexporta runtime no reconocido estáticamente, por lo que Next utiliza Node por defecto. No fueron errores de compilación.

Smoke test local del build final: las siete rutas móviles devolvieron 401 sin token; catálogo sin PUBLIC_APP_ORIGIN devolvió 503 como se espera. No se enviaron tokens ni se alcanzaron consultas a Firestore. hPanel no fue accesible en esta revisión: variables, plan, configuración y restauración reales quedan sin verificar.

No equivalen a prueba Firebase/emulador ni a FCM real, login real, ventas reales o impresión Bluetooth. No se hicieron llamadas a datos productivos.

## Secuencia propuesta, sujeta a aprobación

1. Guardar versión y configuración actuales (sin incluir secretos en el paquete); identificar procedimiento real de restauración en hPanel
2. Validar en entorno de prueba aislado, incluyendo seguridad y concurrencia; confirmar Node20
3. Revisar autorización para cambios de hosting, reglas, Functions, Scheduler/IAM y costos por separado
4. Preparar una ventana coordinada y comunicar recarga del catálogo; publicar versión web/API y reglas compatibles, activar worker autorizado y probar con cuentas/datos de prueba
5. Verificar `/api/mobile/session` sin token devuelve 401, y acceso autorizado devuelve solo sucursales permitidas; registrar dispositivo y recibir un pedido digital de prueba
6. Vigilar errores/latencia HTTP, rechazos de webhook, cuotas catálogo y outbox pendiente/failed/expired

## Rollback

No suponer que hPanel tiene un botón de rollback: verificar su mecanismo real antes de publicar y conservar paquete anterior. Restaurar web/API y reglas como una pareja compatible. No volver a hacer públicos los items para arreglar accesos. Si hay errores, pausar entrada de pedidos/checkout durante la decisión, conservar outbox/comprobantes y resolver pedidos confirmados antes de reintentar. Un rollback de código NO deshace ventas/inventario ya confirmado; no borrar ledgers ni reenviar pedidos indiscriminadamente. Controlar Functions/Scheduler por separado; desactivar entrega no elimina eventos y su posterior reactivación puede enviar pendientes aún vigentes.
