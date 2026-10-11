"use client";

import { QRCodeSVG } from "qrcode.react";
import { ECF_TYPES, fiscalTotals } from "@/lib/dominican-fiscal";

const STATUS: Record<string, string> = {
  PendingSignature: "Pendiente de firma",
  PendingSubmission: "Pendiente de envío",
  Sent: "Enviado a DGII",
  Accepted: "Aceptado por DGII",
  AcceptedConditional: "Aceptado condicional",
  Rejected: "Rechazado por DGII",
  Contingency: "Contingencia sin conexión",
  Voided: "Anulado",
  Recorded: "Registrado con NCF",
  PendingDGII: "Pendiente de respuesta DGII",
  ProviderError: "Pendiente por error de conexión",
  RejectedByProvider: "Rechazado por el proveedor",
};

export function FiscalReceiptFooter({ sale }: { sale: any }) {
  if (!sale?.fiscalEnabled) return null;
  const status = STATUS[sale.fiscalStatus] || sale.fiscalStatus || "Pendiente";
  const accepted = ["Accepted", "AcceptedConditional"].includes(sale.fiscalStatus);
  const identity = sale.eNcf || sale.ncf || sale.id;
  const calculated = fiscalTotals(sale.items || [], sale.discountAmount || 0);
  const subtotalWithoutTax = calculated.taxableAmount18 + calculated.taxableAmount16 + calculated.exemptAmount;
  const totalItbis = calculated.totalItbis;
  const fiscalTotal = Number(sale.totalAmount || calculated.fiscalTotal);
  const qrValue = sale.dgiiVerificationUrl || sale.qrUrl || [
    "COLMADOM-E-CF",
    sale.issuerRnc,
    identity,
    sale.createdAt,
    Number(sale.totalAmount || 0).toFixed(2),
    status,
  ].join("|");

  return <div className="mt-5 border-t-2 border-dashed border-black pt-3 text-[10px] text-center">
    {sale.buyerRnc && <div className="mb-3 text-left border border-black p-2 break-words"><p className="font-black">CLIENTE FISCAL: {sale.buyerLegalName}</p><p>RNC/CÉDULA: {sale.buyerRnc}</p>{sale.buyerDgiiStatus&&<p>ESTADO DGII: {sale.buyerDgiiStatus}</p>}</div>}
    <div className="mb-3 text-left border-y border-dashed border-black py-2 space-y-1 text-[11px]">
      <div className="flex justify-between"><span>SUBTOTAL:</span><b>RD${subtotalWithoutTax.toFixed(2)}</b></div>
      <div className="flex justify-between"><span>ITBIS:</span><b>RD${totalItbis.toFixed(2)}</b></div>
      <div className="flex justify-between text-[13px] font-black"><span>TOTAL:</span><span>RD${fiscalTotal.toFixed(2)}</span></div>
    </div>
    <p className="font-black">RNC: {sale.issuerRnc || "PENDIENTE"}</p>
    <p className="font-black">{sale.issuerLegalName}</p>
    <p>{sale.eNcf ? "e-NCF" : "NCF"}: {identity || "SECUENCIA PENDIENTE"}</p>
    {sale.ecfType && <p>{ECF_TYPES[sale.ecfType as keyof typeof ECF_TYPES] || `Tipo ${sale.ecfType}`}</p>}
    <p className="font-black mt-1">ESTATUS DGII: {status.toUpperCase()}</p>
    {sale.fiscalError && <p className="font-bold mt-1">DETALLE: {sale.fiscalError}</p>}
    <div className="flex justify-center my-2"><QRCodeSVG value={qrValue} size={96} level="M" marginSize={1} /></div>
    <p>{accepted ? "Escanee para consultar el comprobante." : "QR local. Pendiente de validación y respuesta de la DGII."}</p>
  </div>;
}
