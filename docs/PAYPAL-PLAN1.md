# PayPal Plan 1 mensual

La página `/billing/plan1` usa el plan recurrente `P-3TB64314LH169562MNLKXWQA`. El ID del plan debe pertenecer al mismo entorno y cuenta PayPal que el `client-id` del SDK.

## Variables de servidor

Configurar en Hostinger (o en el entorno local) sin guardar estos secretos en Git:

- `PAYPAL_CLIENT_ID`: client ID asociado al plan.
- `PAYPAL_CLIENT_SECRET`: secreto del mismo entorno y cuenta.
- `PAYPAL_ENVIRONMENT`: `live` para producción o `sandbox` para pruebas.
- `PAYPAL_WEBHOOK_ID`: ID del webhook registrado en esa misma aplicación PayPal.
- `NEXT_PUBLIC_PAYPAL_PLAN1_CLIENT_ID`: client ID público de Plan 1. Si se omite, se usa el client ID que acompañó al plan en la solicitud.
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID`: puede seguir usándose para los pagos únicos existentes; no debe sustituir el client ID asociado a Plan 1.

El botón de suscripción valida el ID, el negocio, el usuario y el plan en el servidor. Los cobros recurrentes se reflejan cuando llega un evento PayPal validado criptográficamente.

## Webhook

Configurar en la aplicación de PayPal la URL pública:

`https://<dominio-del-sistema>/api/billing/paypal/webhook`

Suscribir estos eventos para el ciclo recurrente:

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`
- `PAYMENT.SALE.REFUNDED`
- `PAYMENT.SALE.REVERSED`

La ruta verifica la firma del webhook, procesa los eventos repetidos de forma idempotente y registra los pagos recurrentes confirmados.

## Mensualidad y meses atrasados

El Plan 1 aplica un cobro recurrente mensual. Los meses vencidos configurados por el administrador se conservan como balance atrasado y se pagan aparte desde `/billing`, con los medios de pago habilitados para el comercio. El precio recurrente lo determina el plan PayPal de la cuenta; debe coincidir con el precio acordado para los comercios asignados a Plan 1.

En **Admin → Planes y módulos gratuitos → Cuotas pendientes por colmado**, el administrador selecciona el negocio e indica entre 0 y 24 cuotas pendientes. El negocio ve esa cantidad y el saldo estimado en `/billing`; al aprobar un pago de varios meses, la cantidad pendiente disminuye. Cada ajuste queda en el historial de auditoría.

En la misma sección, el administrador activa la **suscripción con tarjeta** para ese colmado y selecciona el día en que comenzará el aviso. La fecha se evalúa con la hora de República Dominicana. Desde ese día, el dueño ve el recordatorio con acceso al Plan 1; antes de la fecha no se muestra el botón de suscripción. El aviso deja de aparecer cuando PayPal confirma que la suscripción está activa. La frecuencia del recordatorio sigue la configuración de avisos del colmado.
