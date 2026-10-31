# Centro de mensajería SaaS

El administrador de plataforma abre `/admin/messaging` para crear plantillas de correo y WhatsApp, programar campañas a dueños y consultar entregas. Las plantillas marcadas **automáticas** se programan al registrar un negocio. La bienvenida operativa de WhatsApp existente se envía en el registro; el centro programa el correo de bienvenida y las recomendaciones posteriores.

## Correo saliente

El remitente elegido es `inmartagosrl@gmail.com`. Configurar en el despliegue de Hostinger `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=inmartagosrl@gmail.com` y `SMTP_FROM=inmartagosrl@gmail.com`. En `SMTP_PASSWORD` colocar **una contraseña de aplicación de Google** para ese buzón, nunca la contraseña normal de inicio de sesión. Google requiere verificación en dos pasos para crearla. El centro muestra únicamente si la configuración está completa, nunca la contraseña.

## WhatsApp

Elegir en el centro un canal Cloud API conectado y usar el nombre de una plantilla aprobada en Meta con el idioma y los parámetros en el orden aprobado. Los mensajes programados se envían como **plantilla**, no como texto libre. Si Meta rechaza un envío, queda el error en el historial.

## Programador

Configurar una variable `CRON_SECRET` aleatoria de al menos 24 caracteres en Hostinger. Crear una tarea **Personalizado** cada cinco minutos con este comando (menos de 255 caracteres, límite de Hostinger):

```sh
/opt/alt/alt-nodejs20/root/bin/node --env-file=/home/u115384107/domains/colmadom.hispaniolapay.com/hbuilds/config/.env -e 'fetch("https://colmadom.hispaniolapay.com/cron",{headers:{Authorization:"Bearer "+process.env.CRON_SECRET}}).then(console.log)'
```

La ruta `/cron` redirige internamente al procesador protegido. La clave se lee de las variables guardadas y no se escribe en el comando. El endpoint procesa hasta diez mensajes por ejecución. El centro muestra la última ejecución confirmada; también permite procesar pendientes manualmente con la sesión del administrador.

La cola usa un identificador por fecha y destinatario, reclamación transaccional y tres intentos con espera. Cuando faltan credenciales SMTP o un remitente de WhatsApp, espera una hora sin agotar los intentos. El historial incluye enviados, fallidos y omitidos. Como en cualquier envío externo, un corte de red después de que el proveedor acepte el mensaje y antes de registrar el resultado podría causar un reintento; revisar el historial si se sospecha un duplicado.

## Consentimiento

Las recomendaciones y plantillas personalizadas se envían solo a dueños que marcaron la preferencia al registrar su negocio o en Ajustes. La bienvenida de servicio puede enviarse sin esa preferencia. El proceso comprueba de nuevo el consentimiento y el estado del negocio inmediatamente antes de cada envío.
