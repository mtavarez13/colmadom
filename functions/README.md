# Avisos Android de pedidos

Código preparado, **sin desplegar**. Node.js 20, Firebase Functions v2, Admin SDK y FCM. No contiene credenciales. La identidad de ejecución debe tener acceso mínimo a Firestore y envío FCM. Publicar Functions/Scheduler puede requerir plan Blaze, APIs y cargos; revisar y autorizar eso antes de desplegar.

## Contrato

El servidor crea `mobileOrderOutbox/{eventId}` en la **misma transacción** que el pedido: `{colmadoId, orderId, source: 'catalog' | 'whatsapp-bot', createdAt, status: 'pending'}`. Usar ID determinista por pedido para evitar eventos duplicados. Los pedidos manuales no crean eventos; el worker además rechaza cualquier otro origen. `createdAt` admite Timestamp de Firestore o fecha ISO. El outbox, sus entregas y dispositivos deben ser de escritura exclusiva del servidor.

Dispositivos: `mobileDevices/{sha256(token)}` con `uid`, `token`, `platform: 'android'`, `colmadoIds` y `updatedAtMillis`. La API debe verificar usuario/sucursales; no aceptar permisos aportados por el cliente. Cada registro o cambio de propietario debe actualizar la versión `updatedAtMillis` (monótona por dispositivo). El worker consulta perfiles actuales, sucursal y suscripción del `rootColmadoId`: Active, o Trial con `trialEndAtMillis` (o `trialEndDate`) futura válida. Perfil inactivo, Driver y roles contables no reciben avisos. Admin/Supervisor o permiso `orders` pueden recibir según sucursal propia; solo Admin extiende a `allowedColmadoIds`.

Se vuelve a leer autorización/propiedad inmediatamente antes de FCM. Una revocación después de esa lectura no puede retirar una solicitud ya enviada; el cliente debe comprobar sesión/sucursal antes de mostrar y el API al abrir el pedido.

FCM recibe únicamente `data: {type:'new_order', colmadoId, orderId, eventId}` (sin nombres, dirección ni detalle de compra), prioridad Android alta y TTL de 20 horas. El cliente crea la notificación y deduplica persistentemente por `eventId`. Confirmación FCM significa aceptación por FCM, no entrega al teléfono.

## Concurrencia, reintentos y recuperación

- `mobileOrderPush`: trigger de creación con `retry: true`, timeout 60 segundos
- `deliveries/{deviceId}`: transacción por dispositivo, claim único, lease de 120 segundos y finalización condicionada al claim
- Fallos: hasta 12 intentos, backoff de 10 segundos a 10 minutos; errores de token no registrado/inválido son terminales
- Solo se borra token inválido si propietario, token y versión siguen iguales; nunca borrar por un error genérico de argumento/configuración
- `recoverMobileOrderPush`: cada 5 minutos revisa pendientes por páginas y recupera leases vencidos; no depende exclusivamente de la ventana Eventarc
- Eventos mayores de 20 horas pasan a `expired`; intentos agotados quedan `failed`; permisos revocados quedan `skipped`. `completed` significa procesamiento terminal: revisar las entregas individuales para distinguir enviado, omitido y fallido
- Un crash entre aceptación FCM y guardar `sent` puede duplicar un aviso. Es entrega con reintentos, no exactamente una vez; deduplicación del cliente obligatoria

Monitorizar `pending` viejos, `expired`, entregas `failed`, errores de Function/Scheduler y cuotas. El barrido limita páginas a 100, pero requiere dimensionar timeout/capacidad para el volumen real; se debe alertar si su duración se acerca a 540 segundos. Retención/limpieza de outbox y subcolecciones se configura separadamente tras acordar el plazo; borrar el padre no borra entregas.

## Verificación local

Desde `functions`: `npm ci`, `npm test`, `npm run check`. Las pruebas usan un Firestore simulado serializable y FCM simulado; cubren roles/sucursales, suscripción, duplicados concurrentes, payload, reintentos, leases y limpieza condicionada. No equivalen a integración real ni envían notificaciones.

Antes de producción: probar con proyecto/emulador de pruebas, verificar IAM, región (actualmente `us-central1`), reglas, registro/logout/rotación de token, permisos revocados, caída de proceso, app en segundo plano/cerrada y notificaciones Android concedidas/denegadas. Scheduler requiere validación en proyecto de pruebas. No se ha hecho despliegue ni prueba FCM real desde este paquete.

Documentación oficial consultada:
- [Triggers Firestore y entrega al menos una vez](https://firebase.google.com/docs/functions/firestore-events)
- [Reintentos de Functions](https://firebase.google.com/docs/functions/retries)
- [Envío FCM con Admin SDK](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk)
