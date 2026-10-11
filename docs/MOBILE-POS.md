# POS Android — fase 1

Implementación local; sin despliegue ni cambios en datos reales.

## Acceso y contrato

Firebase ID token en Authorization Bearer, con comprobación de revocación. Perfil activo Admin/Supervisor o allowedModules pos; excluye Driver/Contable/ContableIndependiente. Sucursal propia o adicional autorizada para Admin y plan activo/prueba vigente. Revalidación de perfil/sucursal/plan dentro de la transacción.

GET /api/mobile/pos/products?storeId=ID[&cursor=ID]

Devuelve products, nextCursor (null al finalizar), checkoutEnabled y checkoutDisabledReason. Máximo 200 productos por página; cargar todas las páginas. Producto: id, name, salePrice, quantityInStock, unitType, isFractionalOnly, isBreakdownAllowed, barcode, supported, unsupportedReason. Catálogo orientativo, siempre se valida precio/stock en servidor.

POST /api/mobile/pos/checkout

```json
{"storeId":"s1","requestId":"d433ebc1-1594-453d-aa88-d6c1ee32a3b2","items":[{"productId":"p1","quantity":"2"}],"expectedTotal":"100.00","paymentMethod":"Efectivo","cashReceived":"150.00"}
```

requestId es UUID por intención. Persistir cuerpo inmutable antes de enviar; reintentar exactamente ese cuerpo tras fallo de red. expectedTotal solo verifica precio mostrado, nunca establece el precio. Cantidad string decimal positiva con hasta 6 decimales; entera salvo producto fraccionable. Alternativa amountInDop con hasta 2 decimales para fraccionables; conserva importe exacto y cantidad=importe/precio servidor. Nunca ambas. Máximo 80 líneas, 200 documentos de producto, RD$1,000,000 total.

Efectivo exige cashReceived suficiente. Tarjeta exige paymentRef; registra un pago externo, NO procesa cargos. Respuesta {sale,replayed}. sale: id/storeId/storeName/storeAddress/storePhone/createdAt/items/totalAmount/paymentMethod/paidAmount/changeGiven/totalItbis/receiptNotice más campos compatibles web. items: productId/name/quantity/price/lineTotal/unitType. Precios finales de catálogo, no se añade ITBIS encima. Líneas redondeadas a centavos antes de sumar. Desglose fiscal existente con descuento cero; no se emiten NCF/e-CF.

GET /api/mobile/pos/sales/SALE_ID?storeId=ID recupera comprobante. Cajero solo sus ventas; Admin/Supervisor ventas de su sucursal autorizada. Imprimir únicamente venta confirmada; nunca repetir el cobro por fallo de impresión.

## Reintentos y consistencia

- 400/422: validación definitiva sin commit, permite corregir y crear nueva intención
- 409: UUID usado con otro cuerpo; conservar original y recuperar
- 401/403: restaurar acceso y reintentar; NO suponer que una venta anterior no existió
- Timeout/5xx: resultado incierto, conservar cuerpo/UUID y reintentar

El comprobante anterior se lee antes de precio/stock. Venta, stock agregado (incluye líneas duplicadas y componentes de combos) y comprobante se crean en una transacción Firestore. Colección mobilePosReceipts mantiene comprobante estable independiente del cierre web; no autorizar escrituras SDK cliente. Venta compatible con transactions y cashRegisterSessionId active_session.

## Límites explícitos

- Checkout BLOQUEADO para sucursales fiscalEnabled o fiscalMode distinto de disabled; finalizar en POS web. No constituye certificación DGII ni implementación e-CF. Recibo marcado NO FISCAL
- No incluye fiado, mixtos, descuentos, extras, genéricos, devoluciones, anulaciones, apertura/cierre/conciliación de caja, escáner de balanza ni automatización WhatsApp
- Combos con componentes simples activos; no anidados. Stock mostrado del combo puede no reflejar componentes, servidor comprueba al finalizar
- POS web legado conserva escrituras de venta/stock no transaccionales y cierre no atómico. Esta API protege entre operaciones de ESTA API, no garantiza integridad global frente a escrituras heredadas. Migrar web/rules antes de afirmar protección global contra sobreventa

## Verificación

```sh
node --import ./node_modules/tsx/dist/loader.mjs --test tests/mobile-pos-core.test.ts
node node_modules/typescript/bin/tsc -p tsconfig.check.json --noEmit
```

9 pruebas unitarias pasan: totales/cambio, campos inventados, cantidades inválidas, stock agregado, fraccionamiento, cambio de precio, efectivo insuficiente, referencia tarjeta, combos y roles/sucursal. Typecheck global final pasa (los errores iniciales en api/whatsapp/webhook fueron corregidos por el trabajo paralelo).

Pendiente en emulador/proyecto de prueba: concurrencia sobre última unidad (solo una venta), mismo UUID concurrente (una venta), pérdida de respuesta después de commit/reintento (mismo comprobante), revocación permiso/plan, stock cambiado durante transacción, acceso cruzado a recibo, bloqueo fiscal, Android reinicio/reimpresión. No se ejecutaron estas integraciones contra Firebase.
