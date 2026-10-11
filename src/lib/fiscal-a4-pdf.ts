import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import QRCode from 'qrcode';

const TYPES:Record<string,string>={
  '31':'FACTURA DE CRÉDITO FISCAL ELECTRÓNICA','32':'FACTURA DE CONSUMO ELECTRÓNICA',
  '33':'NOTA DE DÉBITO ELECTRÓNICA','34':'NOTA DE CRÉDITO ELECTRÓNICA','41':'COMPROBANTE ELECTRÓNICO DE COMPRAS',
  '43':'COMPROBANTE ELECTRÓNICO PARA GASTOS MENORES','44':'COMPROBANTE ELECTRÓNICO PARA REGÍMENES ESPECIALES',
  '45':'COMPROBANTE ELECTRÓNICO GUBERNAMENTAL','46':'COMPROBANTE ELECTRÓNICO PARA EXPORTACIONES',
  '47':'COMPROBANTE ELECTRÓNICO PARA PAGOS AL EXTERIOR'
};
const STATUS:Record<string,string>={Accepted:'ACEPTADO',AcceptedConditional:'ACEPTADO CONDICIONAL',PendingDGII:'PENDIENTE DGII',PendingSignature:'PENDIENTE DE FIRMA',ProviderError:'ERROR DEL PROVEEDOR',Rejected:'RECHAZADO',RejectedByProvider:'RECHAZADO POR PROVEEDOR'};
const clean=(value:unknown)=>String(value??'').replace(/[\r\n]+/g,' ').replace(/[^\x20-\x7E\xA0-\xFF]/g,' ').trim();
const money=(value:unknown)=>`RD$ ${Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const dateDO=(value:unknown,withTime=false)=>{const date=new Date(String(value||''));if(Number.isNaN(date.getTime()))return'';return date.toLocaleString('es-DO',withTime?{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}:{day:'2-digit',month:'2-digit',year:'numeric'})};
const qrDate=(value:unknown)=>{const date=new Date(String(value||''));if(Number.isNaN(date.getTime()))return'';return `${String(date.getDate()).padStart(2,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${date.getFullYear()}`};
const trim=(value:unknown,length:number)=>{const text=clean(value);return text.length>length?text.slice(0,Math.max(0,length-1))+'…':text};

function verificationUrl(store:any,sale:any){
  if(sale.dgiiVerificationUrl||sale.qrUrl)return String(sale.dgiiVerificationUrl||sale.qrUrl);
  const params=new URLSearchParams({RncEmisor:String(store.rnc||sale.issuerRnc||'').replace(/\D/g,''),RncComprador:String(sale.buyerRnc||'').replace(/\D/g,''),ENCF:String(sale.eNcf||sale.ncf||''),FechaEmision:qrDate(sale.createdAt),MontoTotal:Number(sale.totalAmount||0).toFixed(2),FechaFirma:dateDO(sale.signedDate||sale.updatedAt||sale.createdAt,true),CodigoSeguridad:String(sale.securityCode||'').slice(0,6)});
  return `https://ecf.dgii.gov.do/ecf/ConsultaTimbre?${params.toString()}`;
}

export async function createFiscalA4Pdf(store:any,sale:any,customer:any){
  const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),blue=rgb(.04,.22,.45),gray=rgb(.35,.39,.45),line=rgb(.78,.82,.87),green=rgb(.05,.48,.3);
  const draw=(text:string,x:number,y:number,size=9,strong=false,color=rgb(0,0,0))=>page.drawText(clean(text),{x,y,size,font:strong?bold:font,color});
  const box=(x:number,y:number,w:number,h:number)=>page.drawRectangle({x,y,width:w,height:h,borderColor:line,borderWidth:1});
  const type=String(sale.ecfType||'32'),items=Array.isArray(sale.items)?sale.items:[],buyerName=sale.buyerLegalName||customer?.legalName||sale.customerName||`${customer?.firstName||''} ${customer?.lastName||''}`.trim()||'CONSUMIDOR FINAL',buyerRnc=String(sale.buyerRnc||customer?.rnc||'').replace(/\D/g,''),eNcf=sale.eNcf||sale.ncf||'PENDIENTE',status=STATUS[String(sale.fiscalStatus||'')]||clean(sale.fiscalStatus||'PENDIENTE DGII'),url=verificationUrl(store,{...sale,buyerRnc});

  draw(clean(store.legalName||store.name||'COLMADOM CLOUD').toUpperCase(),38,795,17,true,blue);
  draw(`RNC: ${store.rnc||sale.issuerRnc||'NO CONFIGURADO'}`,38,777,9,true);
  draw(trim(store.address||'',75),38,762,8);
  draw(`Teléfono: ${store.phoneNumber||store.phone||''}`,38,748,8);
  draw(TYPES[type]||`COMPROBANTE ELECTRÓNICO ${type}`,315,798,10,true,blue);
  draw(`e-NCF: ${eNcf}`,315,779,11,true);
  draw(`Fecha emisión: ${dateDO(sale.createdAt)}`,315,763,8);
  draw(`Fecha firma: ${dateDO(sale.signedDate||sale.updatedAt||sale.createdAt,true)}`,315,749,8);
  draw(`Estado DGII: ${status}`,315,733,8,true,status.includes('ACEPTADO')?green:rgb(.75,.32,.02));
  page.drawLine({start:{x:38,y:720},end:{x:557,y:720},thickness:1.5,color:blue});

  box(38,650,519,58);draw('DATOS DEL COMPRADOR',48,691,9,true,blue);draw(`Razón social / Nombre: ${trim(buyerName,72)}`,48,674,9,true);draw(`RNC / Cédula: ${buyerRnc||'NO INDICADO'}`,48,658,9);draw(`Condición de pago: ${sale.paymentMethod||'CRÉDITO'}`,365,658,8);

  const tableTop=630,tableBottom=290,rowHeight=Math.min(15,Math.max(5.4,(tableTop-tableBottom-23)/Math.max(items.length,1))),fontSize=Math.min(8,Math.max(4.5,rowHeight-2));
  page.drawRectangle({x:38,y:tableTop-18,width:519,height:18,color:blue});
  draw('Cant.',44,tableTop-13,7,true,rgb(1,1,1));draw('Descripción',85,tableTop-13,7,true,rgb(1,1,1));draw('Precio',350,tableTop-13,7,true,rgb(1,1,1));draw('ITBIS',419,tableTop-13,7,true,rgb(1,1,1));draw('Importe',489,tableTop-13,7,true,rgb(1,1,1));
  let y=tableTop-18-rowHeight;
  items.forEach((item:any,index:number)=>{const qty=Number(item.quantity||1),price=Number(item.salePrice??item.price??item.unitPrice??0),amount=Number(item.lineTotal??qty*price),rate=Number(item.itbisRate??item.taxRate??0);if(index%2===1)page.drawRectangle({x:38,y:y-2,width:519,height:rowHeight,color:rgb(.96,.97,.98)});draw(String(qty),44,y,fontSize);draw(trim(item.name||item.productName||'Artículo',Math.max(28,Math.floor(50*(8/fontSize)))),85,y,fontSize);draw(money(price),350,y,fontSize);draw(rate?`${rate}%`:'EXENTO',419,y,fontSize);draw(money(amount),489,y,fontSize);y-=rowHeight;});
  box(38,tableBottom,519,tableTop-tableBottom);

  const taxable18=Number(sale.taxableAmount18||0),taxable16=Number(sale.taxableAmount16||0),exempt=Number(sale.exemptAmount||0),itbis18=Number(sale.itbis18||0),itbis16=Number(sale.itbis16||0),totalItbis=Number(sale.totalItbis||itbis18+itbis16);
  box(340,150,217,125);draw('RESUMEN FISCAL',350,257,9,true,blue);draw(`Subtotal: ${money(sale.subtotalBeforeDiscount||sale.totalAmount)}`,350,239,8);draw(`Descuento: ${money(sale.discountAmount)}`,350,223,8);draw(`Gravado 18%: ${money(taxable18)}`,350,207,8);draw(`Gravado 16%: ${money(taxable16)}`,350,191,8);draw(`Exento: ${money(exempt)}`,350,175,8);draw(`Total ITBIS: ${money(totalItbis)}`,350,159,8,true);page.drawRectangle({x:340,y:114,width:217,height:30,color:blue});draw(`TOTAL: ${money(sale.totalAmount)}`,350,124,12,true,rgb(1,1,1));

  const qr=QRCode.create(url,{errorCorrectionLevel:'M'}),modules=qr.modules,size=modules.size,qrSize=112,cell=qrSize/size,qx=48,qy=135;
  page.drawRectangle({x:qx-5,y:qy-5,width:qrSize+10,height:qrSize+10,color:rgb(1,1,1)});
  for(let row=0;row<size;row++)for(let col=0;col<size;col++)if(modules.get(row,col))page.drawRectangle({x:qx+col*cell,y:qy+(size-row-1)*cell,width:cell+.15,height:cell+.15,color:rgb(0,0,0)});
  draw('Escanee para consultar en DGII',38,119,7,true);draw(`Código de seguridad: ${sale.securityCode||'PENDIENTE'}`,38,105,8,true);draw(trim(url,90),38,92,5, false, gray);
  page.drawLine({start:{x:38,y:78},end:{x:557,y:78},thickness:1,color:line});
  draw('REPRESENTACIÓN IMPRESA DEL e-CF',38,62,8,true,blue);draw('Este documento debe conservarse. Su validez fiscal depende del estado registrado por la DGII.',38,47,7);draw(`Página 1 de 1 · ID interno: ${sale.id||''}`,420,47,7,false,gray);
  return Buffer.from(await pdf.save());
}
