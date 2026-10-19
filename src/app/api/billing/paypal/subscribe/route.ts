import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError,requireBillingUser } from '@/lib/server-auth';
import { paypalRequest } from '@/lib/paypal';

export const runtime='nodejs';
const PLAN_ID='P-3TB64314LH169562MNLKXWQA';
const santoDomingoDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export async function POST(request:NextRequest){
 try{
  const {identity,rootColmadoId}=await requireBillingUser(request),body=await request.json(),subscriptionId=String(body.subscriptionId||'').trim();
  if(!/^[A-Z0-9-]{8,40}$/i.test(subscriptionId))return NextResponse.json({error:'Identificador de suscripción inválido.'},{status:400});
  const storeRef=adminDb.doc('colmados/'+rootColmadoId),storeSnap=await storeRef.get();
  if(!storeSnap.exists)return NextResponse.json({error:'No se encontró el negocio asociado.'},{status:404});
  const store=storeSnap.data()!,today=santoDomingoDate(),noticeStart=String(store.paypalPlan1NoticeStartDate||'');
  if(store.paypalPlan1Enabled!==true||!/^\d{4}-\d{2}-\d{2}$/.test(noticeStart)||noticeStart>today)return NextResponse.json({error:'La suscripción PayPal todavía no está habilitada para este comercio.'},{status:403});
  const expectedCustomId=`COLMADO:${rootColmadoId}:${identity.uid}`;
  const detail=await paypalRequest('/v1/billing/subscriptions/'+encodeURIComponent(subscriptionId));
  if(detail.id!==subscriptionId||detail.plan_id!==PLAN_ID||detail.custom_id!==expectedCustomId)return NextResponse.json({error:'PayPal devolvió una suscripción que no corresponde a este comercio o al Plan 1.'},{status:400});
  if(!['APPROVAL_PENDING','APPROVED','ACTIVE'].includes(String(detail.status||'')))return NextResponse.json({error:'PayPal no confirmó la aprobación de la suscripción.'},{status:409});
  const now=new Date().toISOString(),subscriptionRef=adminDb.doc('paypalSubscriptions/'+subscriptionId);
  await adminDb.runTransaction(async tx=>{
   const [currentStore,existing]=await Promise.all([tx.get(storeRef),tx.get(subscriptionRef)]);
   if(!currentStore.exists)throw new Error('NOT_FOUND');
   const current=currentStore.data()||{},old=existing.data();
   if(old&&(old.tenantId!==rootColmadoId||old.userId!==identity.uid))throw new Error('SUBSCRIPTION_ALREADY_LINKED');
   const currentId=String(current.paypalPlan1SubscriptionId||'');
   if(currentId&&currentId!==subscriptionId&&current.paypalPlan1SubscriptionStatus==='ACTIVE')throw new Error('ACTIVE_SUBSCRIPTION_EXISTS');
   tx.set(subscriptionRef,{id:subscriptionId,tenantId:rootColmadoId,userId:identity.uid,ownerEmail:identity.email||'',planId:PLAN_ID,customId:expectedCustomId,status:detail.status,createdAt:old?.createdAt||now,updatedAt:now},{merge:true});
   tx.set(storeRef,{paypalPlan1SubscriptionId:subscriptionId,paypalPlan1SubscriptionStatus:detail.status,paypalPlan1PlanId:PLAN_ID,paypalPlan1SubscriptionUpdatedAt:now,updatedAt:now},{merge:true});
  });
  await adminDb.collection('auditLogs').add({actorUid:identity.uid,actorEmail:identity.email||'',action:'PAYPAL_PLAN1_SUBSCRIPTION_LINKED',targetType:'colmado',targetId:rootColmadoId,subscriptionId,planId:PLAN_ID,status:detail.status,createdAt:now});
  return NextResponse.json({ok:true,status:detail.status,subscriptionId});
 }catch(error){
  if(error instanceof Error&&error.message==='NOT_FOUND')return NextResponse.json({error:'No se encontró el negocio.'},{status:404});
  if(error instanceof Error&&error.message==='SUBSCRIPTION_ALREADY_LINKED')return NextResponse.json({error:'Esta suscripción ya está vinculada a otro comercio.'},{status:409});
  if(error instanceof Error&&error.message==='ACTIVE_SUBSCRIPTION_EXISTS')return NextResponse.json({error:'El comercio ya tiene una suscripción PayPal activa.'},{status:409});
  if(error instanceof Error&&error.message==='PAYPAL_NOT_CONFIGURED')return NextResponse.json({error:'PayPal no está configurado en el servidor. Configura PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET.'},{status:503});
  const failure=apiError(error);return NextResponse.json({error:failure.message},{status:failure.status});
 }
}
