# WhatsApp Cloud por colmado

Cada colmado recibe una URL corta y exclusiva desde **SaaS > Integraciones > WhatsApp Cloud API por colmado** después de guardar y validar sus credenciales. El formato es `https://colmadom.hispaniolapay.com/wa/ID_DEL_COLMADO`.

1. Copie la URL completa mostrada en SaaS.
2. En Meta Developers, abra WhatsApp > Configuración > Webhook.
3. Pegue la URL exclusiva y use, en el campo separado de Meta, el token de verificación configurado para ese colmado. El token nunca forma parte de la URL.
4. Suscriba el campo `messages`.

El endpoint acepta mensajes entrantes, estados de entrega y lectura, y los eventos intermediarios `smb_message_echoes`. Los eventos de eco se confirman con HTTP 200 y no se insertan como mensajes entrantes duplicados.

El bot de pedidos solo selecciona productos con inventario mayor que cero, limita la cantidad solicitada a la existencia disponible y vuelve a verificar el inventario antes de crear la orden.

La bandeja reconoce los mensajes del proveedor y autoriza también eventos legítimos como `status_update` y `account_update` cuando su WABA ID y Phone Number ID coinciden con el canal. Los contactos registrados y no registrados se muestran desde la misma bandeja del servidor. El panel indica la última recepción, si el bot está activo y cualquier error de procesamiento.

Desde el CRM, el dueño puede activar **Mostrar mensajes entrantes en POS y Minimarket**. Con esta opción, los cajeros reciben avisos emergentes de las conversaciones nuevas sin salir del módulo de ventas.

La automatización de ventas fiadas genera una representación impresa A4 (21 x 29.7 cm) del e-CF. Incluye emisor, comprador, RNC, tipo de comprobante, e-NCF, fechas, estado DGII, artículos, desglose de ITBIS, total, código de seguridad y QR de consulta DGII. La venta completa y el resultado inmediato de mSeller se entregan al generador para evitar que una escritura asíncrona omita el QR.

El historial del CRM se obtiene en páginas de 250 mensajes y se carga completo automáticamente. El bot normaliza acentos, signos y nombres compuestos antes de comparar el texto con productos que tengan existencia.

El dueño puede activar respuestas de pedidos mediante nota de voz y escoger un estilo femenino. El servidor usa Gemini TTS y envía el audio por la API de medios de WhatsApp. Se requiere `GEMINI_API_KEY` (también se reconocen `GOOGLE_API_KEY` y `GOOGLE_GENAI_API_KEY`) en Hostinger. Si la síntesis o el envío del audio falla, el mismo mensaje se envía como texto y el error queda visible en el CRM. Las respuestas automáticas de texto y audio se guardan en el historial.
