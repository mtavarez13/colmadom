import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import type { DocumentReference } from 'firebase-admin/firestore';
import { paypalRequest } from '@/lib/paypal';
import { paymentCoverage } from '@/lib/saas-billing';

export const runtime='nodejs';
const PLAN1_ID='P-3TB64314LH169562MNLKXWQA';
type SubscriptionLink={id:string;tenantId:string;userId:string;customId:string;planId:string};

async function resolveSubscription(subscriptionId:string,resource:any):Promise<SubscriptionLink>{
 const ref=adminDb.doc('paypalSubscriptions/'+subscriptionId),saved=await ref.get();
 let detail:any=saved.exists?null:undefined;
 // Query PayPal when there is no local record, so a delayed webhook can still be linked securely.
 if(!saved.exists)detail=await paypalRequest('/v1/billing/subscriptions/'+encodeURIComponent(subscriptionId));
 const data=saved.data()||{},customId=String(data.customId||detail?.custom_id||resource?.custom_id||''),planId=String(data.planId||detail?.plan_id||resource?.plan_id||'');
 const match=customId.match(/^COLMADO:([^:]+):([^:]+)$/);
 if(!match)throw new Error('PAYPAL_SUBSCRIPTION_UNLINKED');
 const [,tenantId,userId]=match,profile=(await adminDb.doc('userProfiles/'+userId).get()).data();
 const store=(await adminDb.doc('colmados/'+tenantId).get()).data();
 if(!store||planId!==String(store.paypalPlan1PlanId||PLAN1_ID))throw new Error('PAYPAL_SUBSCRIPTION_UNLINKED');
 if(!profile||profile.isActive===false||(profile.rootColmadoId||profile.colmadoId)!==tenantId)throw new Error('PAYPAL_SUBSCRIPTION_OWNER_INVALID');
 if(data.tenantId&&data.tenantId!==tenantId)throw new Error('PAYPAL_SUBSCRIPTION_OWNER_INVALID');
 return{id:subscriptionId,tenantId,userId,customId,planId};
}

export async function POST(request:NextRequest){
 let eventRef:DocumentReference|undefined;
 try{
  const webhookId=process.env.PAYPAL_WEBHOOK_ID;
  if(!webhookId)return NextResponse.json({error:'Webhook no configurado.'},{status:503});
  const event=await request.json();
  if(!event?.id||!event?.event_type)return NextResponse.json({error:'Evento de PayPal inválido.'},{status:400});
  const verification=await paypalRequest('/v1/notifications/verify-webhook-signature',{method:'POST',body:JSON.stringify({
   auth_algo:request.headers.get('paypal-auth-algo'),cert_url:request.headers.get('paypal-cert-url'),transmission_id:request.headers.get('paypal-transmission-id'),
   transmission_sig:request.headers.get('paypal-transmission-sig'),transmission_time:request.headers.get('paypal-transmission-time'),webhook_id:webhookId,webhook_event:event
  })});
  if(verification.verification_status!=='SUCCESS')return NextResponse.json({error:'Firma inválida.'},{status:400});

  const webhookEventRef=adminDb.doc('paypalWebhookEvents/'+String(event.id));eventRef=webhookEventRef;
  const alreadyProcessed=await adminDb.runTransaction(async tx=>{
   const existing=await tx.get(webhookEventRef);
   if(existing.exists&&existing.data()?.processed===true)return true;
   if(!existing.exists)tx.create(webhookEventRef,{id:event.id,eventType:event.event_type,resourceId:event.resource?.id||'',receivedAt:new Date().toISOString(),processed:false});
   else tx.update(webhookEventRef,{attempts:Number(existing.data()?.attempts||0)+1,lastAttemptAt:new Date().toISOString()});
   return false;
  });
  if(alreadyProcessed)return NextResponse.json({received:true,duplicate:true});

  const eventType=String(event.event_type),resource=event.resource||{},now=new Date(),nowIso=now.toISOString();
  if(eventType.startsWith('BILLING.SUBSCRIPTION.')||eventType==='PAYMENT.SALE.COMPLETED'){
   const subscriptionId=eventType==='PAYMENT.SALE.COMPLETED'?String(resource.billing_agreement_id||resource.agreement_id||''):String(resource.id||'');
   if(!subscriptionId)throw new Error('PAYPAL_SUBSCRIPTION_ID_MISSING');
   const linked=await resolveSubscription(subscriptionId,resource),subscriptionRef=adminDb.doc('paypalSubscriptions/'+subscriptionId),storeRef=adminDb.doc('colmados/'+linked.tenantId);
   if(eventType==='PAYMENT.SALE.COMPLETED'){
    const paymentId=String(resource.id||'');
    if(!paymentId)throw new Error('PAYPAL_PAYMENT_ID_MISSING');
    const amount=Number(resource.amount?.total||resource.amount?.value||0),currency=String(resource.amount?.currency||resource.amount?.currency_code||'USD');
    if(!Number.isFinite(amount)||amount<=0)throw new Error('PAYPAL_PAYMENT_AMOUNT_INVALID');
    await adminDb.runTransaction(async tx=>{
     const [paymentSnap,storeSnap]=await Promise.all([tx.get(adminDb.doc('payments/'+paymentId)),tx.get(storeRef)]);
     if(!storeSnap.exists)throw new Error('COLMADO_NOT_FOUND');
     if(paymentSnap.exists){tx.set(webhookEventRef,{processed:true,processedAt:nowIso,tenantId:linked.tenantId,subscriptionId,paymentId},{merge:true});return;}
     const store=storeSnap.data()||{},coverage=paymentCoverage(store,1,now);
     tx.create(adminDb.doc('payments/'+paymentId),{id:paymentId,provider:'PAYPAL_SUBSCRIPTION',providerTransactionId:paymentId,paypalSubscriptionId:subscriptionId,userId:linked.userId,tenantId:linked.tenantId,planId:linked.planId,amount,currency,status:'COMPLETED',monthsCovered:1,coverageFromMonth:coverage.fromMonth,coverageThroughMonth:coverage.throughMonth,createdAt:String(resource.create_time||nowIso),receivedAt:nowIso});
     tx.set(storeRef,{subscriptionStatus:'Active',subscriptionStatusCode:'ACTIVO',suspensionNoticeEnabled:false,suspensionNoticeUpdatedAt:nowIso,billingPaidThroughMonth:coverage.throughMonth,billingProrationPending:false,billingLastPaymentAt:nowIso,billingLastPaymentAmount:amount,paypalPlan1SubscriptionId:subscriptionId,paypalPlan1SubscriptionStatus:'ACTIVE',paypalPlan1LastPaymentAt:nowIso,paypalPlan1LastPaymentAmount:amount,updatedAt:nowIso},{merge:true});
     tx.set(subscriptionRef,{...linked,status:'ACTIVE',lastPaymentId:paymentId,lastPaymentAmount:amount,lastPaymentCurrency:currency,lastPaymentAt:nowIso,updatedAt:nowIso},{merge:true});
     tx.set(webhookEventRef,{processed:true,processedAt:nowIso,tenantId:linked.tenantId,subscriptionId,paymentId},{merge:true});
     tx.create(adminDb.collection('auditLogs').doc(),{actorUid:'paypal-webhook',action:'PAYPAL_PLAN1_PAYMENT_COMPLETED',targetType:'payment',targetId:paymentId,tenantId:linked.tenantId,subscriptionId,amount,currency,createdAt:nowIso});
    });
   }else{
     const paymentFailed=eventType==='BILLING.SUBSCRIPTION.PAYMENT.FAILED';
    await adminDb.runTransaction(async tx=>{
     const [storeSnap,subSnap]=await Promise.all([tx.get(storeRef),tx.get(subscriptionRef)]);
     if(!storeSnap.exists)throw new Error('COLMADO_NOT_FOUND');
     const old=subSnap.data(),currentStore=storeSnap.data()||{},status=paymentFailed?String(old?.status||currentStore.paypalPlan1SubscriptionStatus||'ACTIVE').toUpperCase():String(resource.status||eventType.split('.').pop()||'UNKNOWN').toUpperCase();
     if(old?.tenantId&&old.tenantId!==linked.tenantId)throw new Error('PAYPAL_SUBSCRIPTION_OWNER_INVALID');
     tx.set(subscriptionRef,{...linked,status,updatedAt:nowIso,lastEventType:eventType,...(paymentFailed?{lastPaymentStatus:'FAILED',lastPaymentFailureAt:nowIso}:{})},{merge:true});
     tx.set(storeRef,{paypalPlan1SubscriptionId:subscriptionId,paypalPlan1SubscriptionStatus:status,paypalPlan1SubscriptionUpdatedAt:nowIso,...(paymentFailed?{paypalPlan1LastPaymentStatus:'FAILED',paypalPlan1LastPaymentFailureAt:nowIso}:{}),updatedAt:nowIso},{merge:true});
     tx.set(webhookEventRef,{processed:true,processedAt:nowIso,tenantId:linked.tenantId,subscriptionId},{merge:true});
    });
   }
  }else if(eventType==='PAYMENT.SALE.REFUNDED'||eventType==='PAYMENT.SALE.REVERSED'){
   const paymentId=String(resource.id||resource.sale_id||'');
   if(paymentId){const paymentRef=adminDb.doc('payments/'+paymentId),payment=await paymentRef.get();if(payment.exists)await paymentRef.set({status:eventType==='PAYMENT.SALE.REFUNDED'?'REFUNDED':'REVERSED',updatedAt:nowIso},{merge:true});}
   await webhookEventRef.set({processed:true,processedAt:nowIso,paymentId},{merge:true});
  }else{
   await webhookEventRef.set({processed:true,processedAt:nowIso,ignored:true},{merge:true});
  }
  return NextResponse.json({received:true});
 }catch(error){
  if(eventRef)await eventRef.set({lastError:error instanceof Error?error.message:'UNKNOWN',lastFailedAt:new Date().toISOString()},{merge:true}).catch(()=>undefined);
  const message=error instanceof Error?error.message:'';
  if(message==='PAYPAL_NOT_CONFIGURED')return NextResponse.json({error:'PayPal no está configurado en el servidor.'},{status:503});
  return NextResponse.json({error:'No se pudo procesar el evento de PayPal.'},{status:500});
 }
}
