import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError,requireOwner } from '@/lib/server-auth';
import { paypalRequest } from '@/lib/paypal';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  const {identity,rootColmadoId}=await requireOwner(request),orderId=String((await request.json()).orderId||''),orderRef=adminDb.doc('paypalOrders/'+orderId),saved=await orderRef.get();
  if(!saved.exists||saved.data()?.tenantId!==rootColmadoId||saved.data()?.userId!==identity.uid)return NextResponse.json({error:'Orden de pago inválida.'},{status:400});
  const capture=await paypalRequest('/v2/checkout/orders/'+encodeURIComponent(orderId)+'/capture',{method:'POST',headers:{'PayPal-Request-Id':'capture-'+orderId}});
  const detail=capture.purchase_units?.[0]?.payments?.captures?.[0];if(capture.status!=='COMPLETED'||detail?.status!=='COMPLETED')return NextResponse.json({error:'PayPal todavía no confirmó el pago.'},{status:409});
  const now=new Date().toISOString(),paymentId=String(detail.id);
  await adminDb.runTransaction(async tx=>{
   const paymentRef=adminDb.doc('payments/'+paymentId),payment=await tx.get(paymentRef);if(payment.exists)return;
   const data=saved.data()!,storeRef=adminDb.doc('colmados/'+rootColmadoId);await tx.get(storeRef);
   tx.create(paymentRef,{id:paymentId,provider:'PAYPAL',providerTransactionId:paymentId,paypalOrderId:orderId,userId:identity.uid,tenantId:rootColmadoId,planId:data.planId,amount:Number(detail.amount.value),currency:detail.amount.currency_code,status:'COMPLETED',monthsCovered:Number(data.monthsCovered||1),coverageFromMonth:data.coverageFromMonth,coverageThroughMonth:data.coverageThroughMonth,prorationAmount:Number(data.prorationAmount||0),createdAt:now});
   tx.update(storeRef,{subscriptionStatus:'Active',subscriptionStatusCode:'ACTIVO',planId:data.planId,billingPaidThroughMonth:data.coverageThroughMonth,billingProrationPending:false,billingLastPaymentAt:now,billingLastPaymentAmount:Number(detail.amount.value),updatedAt:now});
   tx.update(orderRef,{status:'COMPLETED',captureId:paymentId,completedAt:now});
   tx.create(adminDb.collection('auditLogs').doc(),{actorUid:identity.uid,actorEmail:identity.email||'',action:'PAYPAL_PAYMENT_COMPLETED',targetType:'payment',targetId:paymentId,tenantId:rootColmadoId,createdAt:now});
  });
  return NextResponse.json({ok:true,status:'COMPLETED'});
 }catch(error){const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});}
}
