# Configurar WhatsApp Cloud API de Meta

## Variables del servidor

Agrega estas variables en `.env.local` para uso local o en **Variables de entorno** de Hostinger:

```env
NEXT_PUBLIC_APP_URL=https://colmadom.hispaniolapay.com
META_APP_ID=
META_APP_SECRET=
META_EMBEDDED_SIGNUP_CONFIG_ID=
META_WEBHOOK_VERIFY_TOKEN=elige_un_valor_secreto_largo
META_GRAPH_VERSION=v23.0
```

Reinicia la aplicación después de guardar.

## Webhook en Meta

- URL de devolución: `https://colmadom.hispaniolapay.com/api/whatsapp/webhook`
- Token de verificación: el mismo valor de `META_WEBHOOK_VERIFY_TOKEN`
- Campo que debe suscribirse: `messages`

## Conectar un colmado

1. Entra como dueño.
2. Abre **WhatsApp Hub CRM**.
3. Pulsa **Conectar con Meta**.
4. Selecciona la cuenta de WhatsApp Business y el número.
5. Registra el número con un PIN de seis dígitos.

El App Secret y los tokens permanecen en el servidor y no se muestran en el navegador.

## WhatsApp Cloud API por dueño

Cada dueño entra a **WhatsApp Hub CRM** y elige uno de estos métodos:

- **Conectar con Meta**: onboarding guiado con la aplicación central de Colmadom Cloud.
- **Configurar Cloud API manual**: registra el WABA ID, Phone Number ID y token permanente de su propio negocio.

La conexión se guarda por `colmadoId`; un número no puede pertenecer a dos colmados. El servidor valida el número directamente con Meta y suscribe el WABA al webhook antes de activarlo.
