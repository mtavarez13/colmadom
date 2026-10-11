# Configuración de mSeller en Colmadom Cloud

## Uso local

1. Duplica `.env.local.example`.
2. Renombra la copia como `.env.local`.
3. Coloca el correo, contraseña y API Key entregados por mSeller.
4. Para comenzar usa `MSELLER_ENVIRONMENT=TesteCF`.
5. Reinicia la aplicación con `npm run dev`.

```env
MSELLER_EMAIL=correo_de_la_cuenta
MSELLER_PASSWORD=contrasena_de_la_cuenta
MSELLER_ENVIRONMENT=TesteCF
MSELLER_API_KEY_TESTECF=api_key_de_pruebas
MSELLER_API_KEY_CERTECF=api_key_de_certificacion
MSELLER_API_KEY_ECF=api_key_de_produccion
```

## Hostinger

Registra esas mismas variables en **Variables de entorno** del proyecto Node.js y reinicia la aplicación. No coloques credenciales en archivos públicos, GitHub, Firebase ni en variables que comiencen con `NEXT_PUBLIC_`.

## Configuración por negocio

En Colmadom Cloud entra a **Configuración > DGII / e-CF**. Selecciona Pruebas, Certificación o Producción y registra los rangos autorizados E31 y E32.
