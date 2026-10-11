# Backend móvil, fase 1 — revisión antes de desplegar

Esta carpeta es una copia modificada; el original permanece separado. No se desplegó, no se modificaron reglas activas, facturación ni credenciales. Un APK por sí solo no activa estas rutas ni notificaciones.

## Contrato

Todas las rutas `/api/mobile/*` requieren `Authorization: Bearer <Firebase ID token>`; se verifica revocación y se exige correo verificado (email_verified=true). Los inicios con Email/Google usan Firebase Authentication; el servidor **no crea perfiles, colmados ni propietarios**. El administrador debe asociar el UID correcto a un perfil existente autorizado. Un email coincidente no concede membresía.

- GET `/api/mobile/session`: `{profile:{uid,name,email,role,allowedModules},stores:[{id,name}]}`. Perfiles activos de pedidos o POS. Sucursales con suscripción Active o Trial vigente; Admin puede usar `allowedColmadoIds`, demás su sucursal propia.
- GET `/api/mobile/orders?colmadoId=...`: `{orders:[...]}`, últimas 100 por `createdAt`, sin paginación en esta fase.
- GET `/api/mobile/orders/{id}?colmadoId=...`: `{order:{...,items:[...]}}`.
- PATCH misma ruta: `{status,expectedStatus}`. Solo Pending → Preparing → Dispatched. Conflicto devuelve 409. La entrega, cobro y contabilidad de pedidos siguen en web; cambiar solo a Delivered sería incorrecto.
- POST `/api/mobile/devices`: `{token,platform:"android"}`; registra sucursales autorizadas a pedidos, no topics públicos. Repetir tras renovar token/perfil; DELETE `{token}` antes de cerrar sesión. No registrar tokens en logs. Renovación asigna token exclusivamente al usuario actual, revisión monotónica para limpieza segura.
- FCM: solo `type:new_order`, `colmadoId`, `orderId`, `eventId`. Consultar detalle autenticado. Deduplicar `eventId` en Android. No se promete entrega exactamente una vez.
- POS: ver documentación `MOBILE-POS*` del mismo paquete.

## Pedidos digitales

El catálogo ahora espera confirmación del servidor antes de limpiar carrito o abrir WhatsApp. POST `/api/catalog/orders` valida tamaño/campos/IDs/cantidades, consulta productos de la sucursal, calcula precio y envío, valida demanda agregada e inventario de combos, exige `expectedTotal`, y escribe cabecera, items y outbox en una transacción. El navegador no manda precios autoritativos. Diferencias de precio/envío devuelven 409 y requieren reconfirmar. Guarda el UUID de intento mientras la página permanece abierta para reintentar respuestas perdidas; recargar la página crea un nuevo intento.

Se conserva venta por monto: cantidad=monto/precio, total=monto; se corrige la antigua pérdida de IDs con `_`. Se conserva envío cero sin coordenadas; con coordenadas usa máximo(mínimo, distancia Haversine × tarifa/km redondeada). No se añade impuesto nuevo. No se descuenta/reserva inventario al recibir pedido: el flujo existente descuenta al entregar. Pedidos simultáneos pueden superar existencias; validar nuevamente al cumplirlos.

Protección básica: origen exacto obligatorio y límite transaccional de 30 nuevos pedidos/minuto/sucursal, hasta 80 líneas y JSON 32 KB. No sustituye protección anti-bot: configurar WAF/rate limiting por IP fiable y límite de cuerpo HTTP en el proxy antes de producción. Los encabezados Origin pueden falsificarse fuera del navegador. El límite por sucursal evita usar IP suministrada por el cliente pero un atacante aún puede agotar la cuota; monitorizar y ajustar. No se incorporó CAPTCHA/App Check sin configuración aprobada.

WhatsApp mantiene el flujo de confirmación y pago existente. El ID del pedido depende del mensaje Meta, la sesión se verifica/consume dentro de la transacción y el outbox se crea junto con los items. Se verifica precio/stock/suscripción. Evento duplicado usa claim temporal; un fallo provoca HTTP 500 para reintento. Si cambia un precio confirmado, no se crea el pedido y queda registrado un error; el operador deberá pedir un nuevo pedido. Mensajes automáticos pueden perderse/duplicarse ante una caída después de crear el pedido; la identidad del pedido permanece única.

Cambio de seguridad necesario: un relay ya no se acepta por conocer IDs públicos del canal/WABA. Debe mandar firma válida o el token secreto de webhook existente. Revisar proveedor intermediario antes del despliegue. Los pedidos manuales no crean outbox ni notifican.

## Despliegue controlado

1. Revisar diferencias y respaldos. Usar Node 20 según `engines`; `npm ci`, `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.check.json`, `node --test tests/*.cjs`.
2. Configurar `PUBLIC_APP_ORIGIN` como origen HTTPS exacto del catálogo, sin ruta ni slash final. Configurar credenciales Admin únicamente mediante el gestor de secretos del hosting. Nunca empaquetar claves privadas en APK ni ZIP.
3. Habilitar Email/Password y Google en Firebase Auth; registrar Android package y SHA de certificado; aportar configuración Google/Firebase al APK. Provisionar perfil UID autorizado explícitamente.
4. Probar en proyecto de staging/emulador con dos sucursales, usuario sin perfil, desactivado, módulo negado y administrador multitienda. Confirmar 401/403 y ausencia de escritura de perfiles desde móvil.
5. Desplegar backend/catalog y reglas en ventana coordinada: reglas nuevas bloquean antiguos catálogos que escriben directamente. Los clientes antiguos abiertos deberán recargar. Validar items legibles por repartidor asignado y staff, inaccesibles al público. No desplegar reglas sin pruebas del resto de web.
6. Seguir `functions/README.md` para Functions/FCM, plan Blaze, Scheduler/Eventarc, permisos y costos. Revisar región antes de desplegar. Mantener credenciales con mínimo privilegio.
7. Pruebas obligatorias: catálogo/WhatsApp simultáneo y duplicado; precios alterados; combinación de productos de otra sucursal; cantidades/fraccionados/combos; timeout tras commit; expiración de lease; renovación de token; cierre de sesión; desactivación antes de envío; notificación con app abierta/cerrada/sin permiso; tocar aviso de otra cuenta sin revelar datos.
8. Rollback coordinado de web/API/reglas. No reabrir items públicos como solución silenciosa. Vigilar outbox terminal fallido/expirado y cuota del catálogo.

## Límites de validación

Las pruebas unitarias locales y TypeScript no demuestran reglas/emulador, entrega FCM, autenticación real ni funcionamiento de impresoras. No hubo llamadas a Firebase de producción. La base conserva otros riesgos ajenos a este cambio, incluyendo autenticación telefónica con contraseñas en texto plano y reglas amplias existentes; requieren auditoría separada.

Referencias oficiales consultadas: https://firebase.google.com/docs/functions/firestore-events ; https://firebase.google.com/docs/functions/retries ; https://firebase.google.com/docs/cloud-messaging/manage-tokens

Verificación actualizada 2026-10-02: Node v24.19.0, TypeScript completo `tsconfig.check.json` sin errores, 17 pruebas catálogo/autorización, 9 POS y 11 del worker FCM aprobadas. `next build` aprobó; configuración existente omite tipos/lint en build, por eso TypeScript se ejecutó aparte. ESLint no está configurado y solicita configuración interactiva. Falta repetir en Node 20.x del hosting y ejecutar pruebas integrales de Firebase/emulador. Ver HOSTINGER-REVISION.es.md para estado y bloqueos de publicación. Las reglas heredadas conservan privilegios amplios del administrador de plataforma; un deny específico no reduce un allow global. El ledger POS no tiene concesión de escritura a clientes ordinarios, pero debe revisarse junto con la política completa antes de publicar.
