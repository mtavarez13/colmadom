# Recargas Dominicanas

La integración usa una sola cuenta del proveedor, configurada exclusivamente en **Admin SaaS → colmado → Recargas**. Aunque el panel se abra desde un colmado, las credenciales y comisiones son globales para la plataforma. No se asignan claves del proveedor a los dueños.

## Cuenta central y ambientes

Admin configura la cuenta central, selecciona el ambiente activo y establece comisiones fijas por recarga móvil, paqueticos, PIN, pagos de facturas y servicios. Producción usa `https://api.recargasdominicanas.do/api`. El ambiente de pruebas requiere la URL sandbox que el proveedor asigne; la documentación pública consultada solo declara producción, por lo que el sistema no redirige silenciosamente a producción.

Las credenciales se guardan en `privateRecargasPlatformConfig/general`, solo desde rutas del servidor autorizadas para el administrador SaaS. No se exponen al navegador.

## Saldo prepago de cada colmado

El colmado paga o acuerda una recarga con Admin. Admin registra el monto recibido y la referencia en la pestaña Recargas del perfil del colmado; ese abono se suma al saldo prepago y se guarda en `colmados/{colmadoId}/recargasWalletLedger`. Cada servicio descuenta el valor enviado al proveedor más la comisión fijada por Admin.

Antes de enviar la operación, el servidor reserva el saldo mediante una transacción de Firestore para evitar gastar por encima del disponible. Si el proveedor rechaza la solicitud, el sistema reintegra automáticamente el monto reservado. Si la operación se completa, se confirma el débito y se agrega la venta al historial local del colmado. El historial consultado desde el módulo es el de ese colmado; el saldo y las transacciones de la cuenta central del proveedor no se muestran a los demás negocios.

## Flujo con el proveedor

El servidor inicia sesión con `POST /business-user/login`, conserva la cookie `recargasdominicanas` solo durante la solicitud y cierra sesión al terminar. El módulo consulta productos y datos requeridos; procesa recargas móviles, paqueticos, PIN, facturas y recargas de servicios. El PIN solo se devuelve al usuario que completó la compra y no se guarda en el libro de transacciones.
