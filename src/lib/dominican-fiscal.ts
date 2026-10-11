export type FiscalMode = 'disabled' | 'traditional' | 'ecf-test' | 'ecf-production';

export const ECF_TYPES = {
  '31': 'Factura de Crédito Fiscal Electrónica',
  '32': 'Factura de Consumo Electrónica',
  '33': 'Nota de Débito Electrónica',
  '34': 'Nota de Crédito Electrónica',
  '41': 'Comprobante de Compras Electrónico',
  '43': 'Comprobante de Gastos Menores Electrónico',
  '44': 'Comprobante para Regímenes Especiales Electrónico',
  '45': 'Comprobante Gubernamental Electrónico',
  '46': 'Comprobante para Exportaciones Electrónico',
  '47': 'Comprobante para Pagos al Exterior Electrónico',
} as const;

export type EcfType = keyof typeof ECF_TYPES;
export const ECF_TYPE_RULES: Record<EcfType,{use:string;requiresBuyer:boolean;requiresReference:boolean}> = {
  '31':{use:'Ventas con derecho a crédito fiscal o sustento de costos y gastos.',requiresBuyer:true,requiresReference:false},
  '32':{use:'Ventas a consumidores finales.',requiresBuyer:false,requiresReference:false},
  '33':{use:'Débitos posteriores por mora, flete u otros cargos.',requiresBuyer:true,requiresReference:true},
  '34':{use:'Anulación, devolución, descuento, bonificación o corrección.',requiresBuyer:true,requiresReference:true},
  '41':{use:'Compras a personas no registradas como contribuyentes.',requiresBuyer:true,requiresReference:false},
  '43':{use:'Gastos menores vinculados al trabajo.',requiresBuyer:false,requiresReference:false},
  '44':{use:'Ventas exentas a beneficiarios de regímenes especiales.',requiresBuyer:true,requiresReference:false},
  '45':{use:'Ventas de bienes o servicios a entidades gubernamentales.',requiresBuyer:true,requiresReference:false},
  '46':{use:'Exportaciones de bienes fuera de República Dominicana.',requiresBuyer:true,requiresReference:false},
  '47':{use:'Pagos al exterior sujetos a retención de ISR.',requiresBuyer:true,requiresReference:false},
};
export const ECF_MODIFICATION_CODES={'1':'Anulación total','2':'Corrección de texto','3':'Corrección de montos','4':'Reemplazo de NCF emitido en contingencia','5':'Referencia a factura de consumo electrónica'} as const;

export function validateEcfDraft(type:string,sale:any){const errors:string[]=[];if(!(type in ECF_TYPE_RULES))errors.push('Tipo e-CF no reconocido.');const rule=ECF_TYPE_RULES[type as EcfType];const buyerId=String(sale.buyerRnc||'').replace(/\D/g,'');if(rule?.requiresBuyer&&(!/^\d{9}$|^\d{11}$/.test(buyerId)||!String(sale.buyerLegalName||'').trim()))errors.push('Este tipo requiere identificación y nombre o razón social del receptor.');if(type==='32'&&Number(sale.totalAmount||0)>=250000&&(!/^\d{9}$|^\d{11}$/.test(buyerId)||!String(sale.buyerLegalName||'').trim()))errors.push('La factura de consumo de RD$250,000 o más requiere identificar al comprador.');if(rule?.requiresReference){if(!/^[A-Z0-9]{11,19}$/.test(String(sale.modifiedNcf||'').trim().toUpperCase()))errors.push('Indica el NCF o e-NCF modificado.');if(!['1','2','3'].includes(String(sale.modificationCode||'')))errors.push('Selecciona el código de modificación 1, 2 o 3 para la nota.');if(!String(sale.modificationReason||'').trim())errors.push('Indica la razón de la modificación.');}return errors;}

const rate = (value: unknown) => {
  const numeric = Number(value) || 0;
  return numeric > 1 ? numeric / 100 : numeric;
};

export function fiscalLine(item:any){
  const gross=Number(item.lineTotal ?? item.amountInDop ?? (Number(item.price ?? item.salePrice)*Number(item.quantity||1)))||0;
  const itemRate=rate(item.itbisRate);
  const taxableBase=itemRate>0?gross/(1+itemRate):0;
  const tax=itemRate>0?gross-taxableBase:0;
  return { gross:round2(gross), taxableBase:round2(taxableBase), exemptAmount:itemRate>0?0:round2(gross), tax:round2(tax), rate:round2(itemRate*100) };
}

export function fiscalTotals(items: any[], discountAmount = 0) {
  let taxable18 = 0, taxable16 = 0, exempt = 0;
  for (const item of items || []) {
    const gross = Number(item.lineTotal ?? item.amountInDop ?? (Number(item.price ?? item.salePrice) * Number(item.quantity || 1))) || 0;
    const itemRate = rate(item.itbisRate);
    const base = itemRate > 0 ? gross / (1 + itemRate) : gross;
    if (Math.abs(itemRate - .18) < .001) taxable18 += base;
    else if (Math.abs(itemRate - .16) < .001) taxable16 += base;
    else exempt += gross;
  }
  const subtotal = taxable18 + taxable16 + exempt;
  const factor = subtotal > 0 ? Math.max(0, (subtotal - Number(discountAmount || 0)) / subtotal) : 1;
  taxable18 *= factor; taxable16 *= factor; exempt *= factor;
  const itbis18 = taxable18 * .18, itbis16 = taxable16 * .16;
  return {
    taxableAmount18: round2(taxable18), taxableAmount16: round2(taxable16), exemptAmount: round2(exempt),
    itbis18: round2(itbis18), itbis16: round2(itbis16), totalItbis: round2(itbis18 + itbis16),
    fiscalTotal: round2(taxable18 + taxable16 + exempt + itbis18 + itbis16),
  };
}

export function fiscalSnapshot(colmado: any, sale: any) {
  const totals = fiscalTotals(sale.items || [], sale.discountAmount || 0);
  const enabled = !!colmado?.fiscalEnabled;
  const mode: FiscalMode = colmado?.fiscalMode || 'disabled';
  return {
    fiscalEnabled: enabled,
    fiscalMode: mode,
    fiscalStatus: enabled ? (mode.startsWith('ecf-') ? 'PendingSignature' : 'Recorded') : 'NotApplicable',
    issuerRnc: String(colmado?.rnc || '').replace(/\D/g, ''),
    issuerLegalName: colmado?.legalName || colmado?.name || '',
    ecfType: sale.ecfType || colmado?.defaultEcfType || '32',
    ncf: sale.ncf || '', eNcf: sale.eNcf || '',
    ...totals,
  };
}

export function validateFiscalConfiguration(colmado: any): string[] {
  if (!colmado?.fiscalEnabled) return [];
  const errors: string[] = [];
  if (!/^\d{9,11}$/.test(String(colmado.rnc || '').replace(/\D/g, ''))) errors.push('Indica un RNC o cédula fiscal válido.');
  if (!String(colmado.legalName || '').trim()) errors.push('Indica la razón social registrada en DGII.');
  if ((colmado.fiscalMode || '').startsWith('ecf-') && !colmado.electronicIssuerAuthorized) errors.push('Confirma que DGII autorizó al negocio como emisor electrónico.');
  return errors;
}

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
