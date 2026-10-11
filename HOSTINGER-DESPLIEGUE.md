# Despliegue en Hostinger como Next.js

Este ZIP contiene una aplicación Next.js 15 estándar. `package.json` está directamente en la raíz.

En hPanel selecciona **Añadir sitio web > Deploy Web App > Upload your website files**. No uses el creador de sitios, WordPress, migración PHP ni sitio estático.

Configuración:

- Framework: Next.js
- Node.js: 20.x
- Install command: `npm ci`
- Build command: `npm run build`
- Start command: `npm run start`
- Output directory: `.next`
- Root directory: `.`

Agrega las variables privadas desde Environment variables. No incluyas secretos dentro del ZIP.
