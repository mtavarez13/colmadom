import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError, assertStoreNotSuspended, requireIdentity } from '@/lib/server-auth';
import { fiscalLine, fiscalTotals, validateEcfDraft } from '@/lib/dominican-fiscal';
import { msellerEnvironment, msellerRequest } from '@/lib/mseller-client';

export const runtime='nodejs';
const dateDMY=(date:Date)=>`${String(date.getDate()).padStart(2,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${date.getFullYear()}`;
const providerStatus=(value:unknown)=>{const text=JSON.stringify(value||'').toLowerCase();if(text.includes('aceptado condicional'))return'AcceptedConditional';if(text.includes('aceptado')||text.includes('aprobado'))return'Accepted';if(text.includes('rechazado')||text.includes('rejected'))return'Rejected';return'PendingDGII';};
const readJson=async(response:Response)=>response.json().catch(()=>({}));
const providerError=(result:any,status:number)=>result?.message||result?.error||`mSeller respondió ${status}`;

export async function POST(request:NextRequest){
 try{
  const identity=await requireIdentity(request),body=await request.json(),profile=(await adminDb.doc(`userProfiles/${identity.uid}`).get()).data();
  if(!profile?.colmadoId||profile.isActive===false||profile.role==='Driver')return NextResponse.json({error:'Sin permiso para gestionar e-CF.'},{status:403});
  const colmadoId=String(body.colmadoId||profile.colmadoId);
  if(colmadoId!==profile.colmadoId&&!profile.allowedColmadoIds?.includes(colmadoId))return NextResponse.json({error:'Sucursal no autorizada.'},{status:403});
  await assertStoreNotSuspended(colmadoId);
  const storeRef=adminDb.doc(`colmados/${colmadoId}`),store=(await storeRef.get()).data();
  if(!store?.fiscalEnabled||!String(store.fiscalMode||'').startsWith('ecf-'))return NextResponse.json({error:'Activa e-CF para este negocio.'},{status:409});
  const environment=msellerEnvironment(store.msellerEnvironment||process.env.MSELLER_ENVIRONMENT);
  const privateConnection=(await adminDb.doc(`privateMsellerConnections/${colmadoId}`).get()).data();
  const credentials=privateConnection?{email:privateConnection.email,password:privateConnection.password,apiKey:privateConnection.apiKey,cacheId:colmadoId}:undefined;
  if(body.action==='status'){
   const transactionId=String(body.transactionId||''),transactionRef=adminDb.doc(`colmados/${colmadoId}/transactions/${transactionId}`),transaction=(await transactionRef.get()).data();
   if(!transactionId||!transaction?.eNcf)return NextResponse.json({error:'La venta todavía no tiene e-NCF.'},{status:409});
   const response=await msellerRequest(environment,`/documentos-ecf?ecf=${encodeURIComponent(transaction.eNcf)}`,{},true,credentials),result=await readJson(response);
   if(!response.ok)return NextResponse.json({error:providerError(result,response.status),details:result},{status:response.status});
   const record=Array.isArray(result)?result[0]:result?.data?.[0]||result?.data||result,update={fiscalStatus:providerStatus(record),msellerStatusResponse:record,securityCode:record?.securityCode||transaction.securityCode||'',dgiiVerificationUrl:record?.qr_url||record?.qrUrl||transaction.dgiiVerificationUrl||'',qrUrl:record?.qr_url||record?.qrUrl||transaction.qrUrl||'',msellerStatusCheckedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
   await transactionRef.set(update,{merge:true});return NextResponse.json(update);
  }
  if(body.action==='void'){
   if(profile.role!=='Admin')return NextResponse.json({error:'Solo el dueño o administrador puede anular secuencias.'},{status:403});
   if(body.confirmation!=='ANULAR')return NextResponse.json({error:'Escribe ANULAR para confirmar esta acción irreversible.'},{status:400});
   const ranges=Array.isArray(body.ranges)?body.ranges:[],valid=/^E(31|32|33|34|41|43|44|45|46|47)\d{10}$/;
   if(!ranges.length||ranges.length>10000||ranges.some((range:any)=>!valid.test(String(range.secuenciaDesde))||!valid.test(String(range.secuenciaHasta))||String(range.secuenciaDesde).slice(0,3)!==String(range.secuenciaHasta).slice(0,3)||String(range.secuenciaDesde)>String(range.secuenciaHasta)))return NextResponse.json({error:'El rango e-NCF no es válido.'},{status:400});
   const response=await msellerRequest(environment,'/customer/void-ncf',{method:'POST',body:JSON.stringify({ranges})},false,credentials),result=await readJson(response);
   await adminDb.collection(`colmados/${colmadoId}/ecfVoidHistory`).add({ranges,result,status:response.ok?'Accepted':'Rejected',environment,requestedBy:identity.uid,createdAt:new Date().toISOString()});
   if(!response.ok)return NextResponse.json({error:providerError(result,response.status),details:result},{status:response.status});return NextResponse.json(result);
  }
  const sale=body.sale||{},items=Array.isArray(sale.items)?sale.items:[],type=String(sale.ecfType||'32');
  if(!sale.id||!items.length)return NextResponse.json({error:'La venta no contiene artículos.'},{status:400});
  const validationErrors=validateEcfDraft(type,sale);if(validationErrors.length)return NextResponse.json({error:validationErrors.join(' ')},{status:400});
  const buyerValid=/^\d{9}$|^\d{11}$/.test(String(sale.buyerRnc||''))&&!!String(sale.buyerLegalName||'').trim();
  const sequenceField=`ecf${type}NextSequence`,endField=`ecf${type}SequenceEnd`;
  const sequence=await adminDb.runTransaction(async tx=>{const fresh=(await tx.get(storeRef)).data()||{};if(fresh[sequenceField]===undefined||fresh[endField]===undefined)throw new Error('ECF_SEQUENCE_NOT_CONFIGURED');const current=Math.max(1,Number(fresh[sequenceField])),end=Number(fresh[endField]);if(current>end)throw new Error('ECF_SEQUENCE_EXHAUSTED');tx.update(storeRef,{[sequenceField]:current+1,updatedAt:new Date().toISOString()});return current;});
  const eNcf=`E${type}${String(sequence).padStart(10,'0')}`,totals=fiscalTotals(items,sale.discountAmount||0),issuedAt=new Date();
  const msellerItems=items.map((item:any,index:number)=>{const line=fiscalLine(item),quantity=Number(item.quantity||1);return{NumeroLinea:index+1,IndicadorFacturacion:line.rate===18?1:line.rate===16?2:4,NombreItem:String(item.name||'Artículo').slice(0,80),IndicadorBienoServicio:1,CantidadItem:quantity,UnidadMedida:String(item.unitType||'43').slice(0,2),PrecioUnitarioItem:quantity?Number((line.taxableBase||line.exemptAmount)/quantity):0,MontoItem:Number(line.taxableBase||line.exemptAmount)};});
  const needsBuyer=buyerValid;
  const idDoc:any={TipoeCF:Number(type),eNCF:eNcf,...(store[`ecf${type}SequenceExpiry`]||store.ecfSequenceExpiry?{FechaVencimientoSecuencia:store[`ecf${type}SequenceExpiry`]||store.ecfSequenceExpiry}:{}),IndicadorEnvioDiferido:1,IndicadorMontoGravado:0,TipoPago:sale.paymentMethod==='Credit'?2:sale.paymentMethod==='Free'?3:1};if(!['41','43','47'].includes(type))idDoc.TipoIngresos=String(sale.incomeType||'01');if(idDoc.TipoPago===2&&sale.paymentDueDate)idDoc.FechaLimitePago=dateDMY(new Date(sale.paymentDueDate));
  const document:any={ECF:{Encabezado:{Version:'1.0',IdDoc:idDoc,Emisor:{RNCEmisor:String(store.rnc||''),RazonSocialEmisor:String(store.legalName||store.name||''),DireccionEmisor:String(store.address||''),FechaEmision:dateDMY(issuedAt)},...(needsBuyer?{Comprador:{RNCComprador:String(sale.buyerRnc).replace(/\D/g,''),RazonSocialComprador:String(sale.buyerLegalName).slice(0,150)}}:{}),Totales:{MontoGravadoTotal:Number(totals.taxableAmount18+totals.taxableAmount16),MontoGravadoI1:totals.taxableAmount18,MontoGravadoI2:totals.taxableAmount16,MontoExento:totals.exemptAmount,ITBIS1:18,ITBIS2:16,TotalITBIS:totals.totalItbis,TotalITBIS1:totals.itbis18,TotalITBIS2:totals.itbis16,MontoTotal:Number(sale.totalAmount||totals.fiscalTotal),MontoNoFacturable:0}},DetallesItems:{Item:msellerItems}}};
  if(['33','34'].includes(type))document.ECF.InformacionReferencia={NCFModificado:String(sale.modifiedNcf).trim().toUpperCase(),...(sale.modifiedNcfDate?{FechaNCFModificado:dateDMY(new Date(sale.modifiedNcfDate))}:{}),CodigoModificacion:Number(sale.modificationCode),RazonModificacion:String(sale.modificationReason).trim().slice(0,90)};
  const response=await msellerRequest(environment,'/documentos-ecf',{method:'POST',body:JSON.stringify(document)},true,credentials),result=await readJson(response),transactionRef=adminDb.doc(`colmados/${colmadoId}/transactions/${sale.id}`);
  if(!response.ok){await transactionRef.set({eNcf,fiscalStatus:'RejectedByProvider',msellerEnvironment:environment,msellerError:result,msellerRequest:document,updatedAt:new Date().toISOString()},{merge:true});return NextResponse.json({error:providerError(result,response.status),details:result,eNcf},{status:response.status});}
  const fiscalUpdate={transactionType:sale.transactionType||'FiscalDocument',createdAt:sale.createdAt||new Date().toISOString(),totalAmount:Number(sale.totalAmount||totals.fiscalTotal),items,issuerRnc:String(store.rnc||''),buyerRnc:sale.buyerRnc||'',buyerLegalName:sale.buyerLegalName||'',fiscalEnabled:true,fiscalMode:store.fiscalMode,eNcf:result.ecf||eNcf,ncf:result.ecf||eNcf,ecfType:type,fiscalStatus:'PendingDGII',msellerEnvironment:environment,msellerTrackId:result.internalTrackId||'',securityCode:result.securityCode||'',dgiiVerificationUrl:result.qr_url||'',qrUrl:result.qr_url||'',signedDate:result.signedDate||'',modifiedNcf:sale.modifiedNcf||'',modificationCode:sale.modificationCode||'',modificationReason:sale.modificationReason||'',msellerRequest:document,msellerSubmittedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await transactionRef.set(fiscalUpdate,{merge:true});return NextResponse.json(fiscalUpdate);
 }catch(error){
  if(error instanceof Error&&error.message==='ECF_SEQUENCE_EXHAUSTED')return NextResponse.json({error:'Se agotó el rango e-NCF configurado para este tipo.'},{status:409});
  if(error instanceof Error&&error.message==='ECF_SEQUENCE_NOT_CONFIGURED')return NextResponse.json({error:'El administrador SaaS debe configurar el rango autorizado para este tipo e-CF.'},{status:409});
  if(error instanceof Error&&['MSELLER_CREDENTIALS_MISSING','MSELLER_API_KEY_MISSING'].includes(error.message))return NextResponse.json({error:'El administrador SaaS debe configurar mSeller para este colmado.'},{status:503});
  if(error instanceof Error&&error.message==='MSELLER_AUTH_FAILED')return NextResponse.json({error:'mSeller rechazó las credenciales asignadas. Contacta al administrador SaaS.'},{status:502});
  const failure=apiError(error);return NextResponse.json({error:failure.message},{status:failure.status});
 }
}
