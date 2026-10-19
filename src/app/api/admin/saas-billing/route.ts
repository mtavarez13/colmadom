import { NextRequest,NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { apiError,requirePlatformAdmin } from '@/lib/server-auth';
import { billingState,paymentCoverage,pendingMonthsAfterPayment,prorate } from '@/lib/saas-billing';
export const runtime='nodejs';

export async function GET(request:NextRequest){
 try{
  await requirePlatformAdmin(request);
  const [storesSnap,profilesSnap,paymentsSnap,receiptsSnap]=await Promise.all([
   adminDb.collection('colmados').get(),adminDb.collection('userProfiles').get(),
   adminDb.collection('payments').orderBy('createdAt','desc').limit(1000).get(),
   adminDb.collection('transferReceipts').orderBy('createdAt','desc').limit(100).get(),
  ]);
  const stores=storesSnap.docs.map(doc=>({id:doc.id,...doc.data()} as any));
  const byId=new Map(stores.map(store=>[store.id,store]));
  const roots=stores.filter(store=>(!store.rootColmadoId||store.rootColmadoId===store.id)&&store.isDeleted!==true);
  const usersByRoot=new Map<string,Array<{uid:string;name:string;email:string;role:string;colmadoId:string;branchName:string}>>();
  for(const doc of profilesSnap.docs){
   const profile=doc.data(),branch=byId.get(String(profile.colmadoId||''));
   if(!branch||profile.isActive===false||branch.isDeleted===true||branch.isActive===false)continue;
   const rootId=String(branch.rootColmadoId||branch.id),root=byId.get(rootId);
   if(!root||root.isDeleted===true||root.isActive===false)continue;
   const entry={uid:doc.id,name:[profile.firstName,profile.lastName].filter(Boolean).join(' ').trim()||String(profile.email||profile.phoneNumber||doc.id),email:String(profile.email||''),role:String(profile.role||''),colmadoId:branch.id,branchName:String(branch.name||branch.businessName||branch.id)};
   usersByRoot.set(rootId,[...(usersByRoot.get(rootId)||[]),entry]);
  }
  const payments=paymentsSnap.docs.map(doc=>({id:doc.id,...doc.data()} as any));
  const receipts=receiptsSnap.docs.map(doc=>({id:doc.id,...doc.data()} as any));
  const currentMonth=new Date().toISOString().slice(0,7);
  const rows=roots.map(store=>{
   const eligibleBillingUsers=(usersByRoot.get(store.id)||[]).sort((a,b)=>a.name.localeCompare(b.name,'es'));
   const billingUserIds=Array.isArray(store.billingUserIds)?store.billingUserIds:eligibleBillingUsers.filter(user=>['Admin','Supervisor'].includes(user.role)).map(user=>user.uid);
   return {...store,billingUserIds,eligibleBillingUsers,billing:billingState(store)};
  });
  const configured=rows.filter(store=>Number(store.billing?.fee||0)>0);
  const mrr=configured.reduce((sum,store)=>sum+Number(store.billing.fee||0),0);
  const collected=payments.filter(payment=>payment.status==='COMPLETED'&&String(payment.createdAt||'').startsWith(currentMonth)).reduce((sum,payment)=>sum+Number(payment.amount||0),0);
  const outstanding=configured.reduce((sum,store)=>sum+Number(store.billing.amountDue||0),0);
  return NextResponse.json({rows,payments,receipts,mrr,collected,outstanding,activeAccounts:configured.length,overdueAccounts:configured.filter(store=>store.billing.overdue).length,noticeAccounts:configured.filter(store=>store.billing.showNotice).length,currentMonth});
 }catch(error){const failure=apiError(error);return NextResponse.json({error:failure.message},{status:failure.status});}
}

export async function POST(request:NextRequest){try{const admin=await requirePlatformAdmin(request),body=await request.json(),action=String(body.action||''),colmadoId=String(body.colmadoId||''),ref=adminDb.doc(`colmados/${colmadoId}`),snapshot=await ref.get();if(!snapshot.exists)return NextResponse.json({error:'Colmado no encontrado.'},{status:404});const store=snapshot.data()!,now=new Date(),nowIso=now.toISOString();if(action==='delete_business')return archiveBusiness(admin.uid,String(admin.email||''),colmadoId,store,nowIso);if(action==='configure'){ const fee=Number(body.monthlyFee),activation=new Date(String(body.activationDate||nowIso));if(!Number.isFinite(fee)||fee<0||Number.isNaN(activation.getTime()))return NextResponse.json({error:'Revisa la cuota y la fecha de activación.'},{status:400});const proration=prorate(fee,activation);await ref.set({monthlyFee:fee,billingMonthlyFee:fee,billingActivationDate:activation.toISOString(),billingDueDay:25,billingGraceDays:5,billingProrationAmount:proration,billingProrationPending:proration>0,billingConfigured:true,updatedAt:nowIso},{merge:true});await adminDb.collection('auditLogs').add({actorUid:admin.uid,action:'SAAS_BILLING_CONFIGURED',targetId:colmadoId,monthlyFee:fee,proration,createdAt:nowIso});return NextResponse.json({ok:true,monthlyFee:fee,proration});}if(action==='record_payment'){const months=Math.max(1,Math.min(24,Math.floor(Number(body.months||1)))),coverage=paymentCoverage(store,months,now),pendingAfter=pendingMonthsAfterPayment(store,coverage.months),amount=Number(body.amount||coverage.amount),paymentRef=adminDb.collection('payments').doc();if(!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:'Monto inválido.'},{status:400});await adminDb.runTransaction(async tx=>{tx.create(paymentRef,{id:paymentRef.id,provider:String(body.method||'ADMIN'),providerTransactionId:String(body.reference||paymentRef.id),tenantId:colmadoId,amount,currency:'DOP',status:'COMPLETED',monthsCovered:coverage.months,coverageFromMonth:coverage.fromMonth,coverageThroughMonth:coverage.throughMonth,prorationAmount:coverage.proration,createdAt:nowIso,recordedBy:admin.uid});tx.set(ref,{subscriptionStatus:'Active',subscriptionStatusCode:'ACTIVO',suspensionNoticeEnabled:false,suspensionNoticeUpdatedAt:nowIso,billingPaidThroughMonth:coverage.throughMonth,billingProrationPending:false,billingLastPaymentAt:nowIso,billingLastPaymentAmount:amount,...(pendingAfter===undefined?{}:{billingPendingInstallments:pendingAfter,paypalPlan1PendingMonths:pendingAfter}),updatedAt:nowIso},{merge:true})});return NextResponse.json({ok:true,coverage,amount});}if(action==='notices'){
 if(store.isDeleted===true||(store.rootColmadoId&&store.rootColmadoId!==colmadoId))return NextResponse.json({error:'Selecciona un colmado principal activo.'},{status:400});
 const requestedIds=body.billingUserIds;
 if(!Array.isArray(requestedIds)||requestedIds.length>200||requestedIds.some((uid:unknown)=>typeof uid!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)))return NextResponse.json({error:'Selecciona usuarios válidos para los avisos y pagos.'},{status:400});
 const billingUserIds=[...new Set(requestedIds)] as string[];
 const selectedProfiles=billingUserIds.length?await adminDb.getAll(...billingUserIds.map(uid=>adminDb.doc(`userProfiles/${uid}`))):[];
 const branchIds=[...new Set(selectedProfiles.map(doc=>String(doc.data()?.colmadoId||'')))];
 const branchDocs=branchIds.length?await adminDb.getAll(...branchIds.map(id=>adminDb.doc(`colmados/${id}`))):[];
 const branches=new Map(branchDocs.map(doc=>[doc.id,doc.data()]));
 if(selectedProfiles.some(doc=>{
  const profile=doc.data(),branch=branches.get(String(profile?.colmadoId||''));
  return !profile||profile.isActive===false||!branch||branch.isDeleted===true||branch.isActive===false||String(branch.rootColmadoId||doc.data()?.colmadoId)!==colmadoId;
 }))return NextResponse.json({error:'Uno de los usuarios no pertenece a este colmado o está inactivo.'},{status:400});
 const reminderEnabled=body.paymentReminderEnabled===true,frequency=Math.floor(Number(body.paymentReminderFrequencyMinutes||60)),reminderMessage=String(body.paymentReminderMessage||'').trim().slice(0,500),suspensionEnabled=body.suspensionNoticeEnabled===true,suspensionMessage=String(body.suspensionNoticeMessage||'').trim().slice(0,500),paypalPlan1Enabled=body.paypalPlan1Enabled===true,paypalPlan1NoticeStartDate=String(body.paypalPlan1NoticeStartDate||'').trim(),paypalPlan1PendingMonths=Number(body.paypalPlan1PendingMonths??0),parsedPlan1Date=new Date(paypalPlan1NoticeStartDate+'T00:00:00Z');if(!Number.isFinite(frequency)||frequency<1||frequency>10080)return NextResponse.json({error:'La frecuencia debe estar entre 1 y 10,080 minutos.'},{status:400});if(reminderEnabled&&!reminderMessage)return NextResponse.json({error:'Escribe el mensaje del recordatorio.'},{status:400});if(suspensionEnabled&&!suspensionMessage)return NextResponse.json({error:'Escribe el aviso de suspensión.'},{status:400});if(!Number.isInteger(paypalPlan1PendingMonths)||paypalPlan1PendingMonths<0||paypalPlan1PendingMonths>24)return NextResponse.json({error:'Los meses pendientes deben estar entre 0 y 24.'},{status:400});if(paypalPlan1Enabled&&(!/^\d{4}-\d{2}-\d{2}$/.test(paypalPlan1NoticeStartDate)||Number.isNaN(parsedPlan1Date.getTime())||parsedPlan1Date.toISOString().slice(0,10)!==paypalPlan1NoticeStartDate))return NextResponse.json({error:'Indica desde qué fecha aparecerá el aviso de suscripción.'},{status:400});const selectedPaypalPlan=store.planId?await adminDb.doc('plans/'+String(store.planId)).get():null,paypalPlanCode=String(selectedPaypalPlan?selectedPaypalPlan.data()?.paypalPlanId||'':store.paypalPlan1PlanId||'P-3TB64314LH169562MNLKXWQA');if(paypalPlan1Enabled&&(selectedPaypalPlan?.data()?.isActive===false||!/^P-[A-Za-z0-9-]{5,60}$/.test(paypalPlanCode)))return NextResponse.json({error:'El plan asignado necesita un ID PayPal válido y activo.'},{status:400});await ref.set({billingUserIds,paymentReminderEnabled:reminderEnabled,paymentReminderMessage:reminderMessage,paymentReminderFrequencyMinutes:frequency,paymentReminderUpdatedAt:nowIso,suspensionNoticeEnabled:suspensionEnabled,suspensionNoticeMessage:suspensionMessage,suspensionNoticeUpdatedAt:nowIso,...(store.suspensionNoticeEnabled===true&&!suspensionEnabled?{subscriptionStatus:'Active',subscriptionStatusCode:'ACTIVO'}:{}),paypalPlan1Enabled,paypalPlan1NoticeStartDate:paypalPlan1Enabled?paypalPlan1NoticeStartDate:'',paypalPlan1PendingMonths,billingPendingInstallments:paypalPlan1PendingMonths,paypalPlan1PlanId:paypalPlanCode,paypalPlan1UpdatedAt:nowIso,updatedAt:nowIso},{merge:true});await adminDb.collection('auditLogs').add({actorUid:admin.uid,action:'SAAS_NOTICES_CONFIGURED',targetId:colmadoId,billingUserIds,paymentReminderEnabled:reminderEnabled,paymentReminderFrequencyMinutes:frequency,suspensionNoticeEnabled:suspensionEnabled,paypalPlan1Enabled,paypalPlan1NoticeStartDate,paypalPlan1PendingMonths,createdAt:nowIso});return NextResponse.json({ok:true});}if(action==='suspend'){await ref.set({subscriptionStatus:'Suspended',subscriptionStatusCode:'SUSPENDIDO',suspensionNoticeEnabled:true,suspensionNoticeMessage:String(store.suspensionNoticeMessage||'Tu servicio está suspendido hasta confirmar el pago.'),suspensionNoticeUpdatedAt:nowIso,updatedAt:nowIso},{merge:true});return NextResponse.json({ok:true});}return NextResponse.json({error:'Acción inválida.'},{status:400});}catch(error){const failure=apiError(error);return NextResponse.json({error:failure.message},{status:failure.status});}}

async function archiveBusiness(adminUid:string,adminEmail:string,colmadoId:string,store:any,nowIso:string){
 if(store.isDeleted===true)return NextResponse.json({error:'Este colmado ya fue eliminado.'},{status:409});
 const childStores=await adminDb.collection('colmados').where('rootColmadoId','==',colmadoId).get();
 const deletedIds=new Set([colmadoId,...childStores.docs.map(doc=>doc.id)]);
 const profileDocs=(await adminDb.collection('userProfiles').get()).docs.filter(doc=>{const p=doc.data();return deletedIds.has(String(p.colmadoId||''))||deletedIds.has(String(p.rootColmadoId||''))||(Array.isArray(p.allowedColmadoIds)&&p.allowedColmadoIds.some((id:string)=>deletedIds.has(String(id))))});
 const remainingIds=[...new Set(profileDocs.flatMap(doc=>{const p=doc.data();return[...(Array.isArray(p.allowedColmadoIds)?p.allowedColmadoIds.map(String):[]),String(p.colmadoId||'')].filter(id=>id&&!deletedIds.has(id))}))];
 const remainingStores=new Map<string,any>();await Promise.all(remainingIds.map(async id=>{const d=(await adminDb.doc(`colmados/${id}`).get()).data();if(d&&!d.isDeleted)remainingStores.set(id,d)}));
 for(let i=0;i<deletedIds.size;i+=400){const ids=[...deletedIds].slice(i,i+400),batch=adminDb.batch();ids.forEach(id=>batch.set(adminDb.doc(`colmados/${id}`),{isDeleted:true,isActive:false,deletedAt:nowIso,deletedBy:adminUid,subscriptionStatus:'Suspended',subscriptionStatusCode:'SUSPENDIDO',updatedAt:nowIso},{merge:true}));await batch.commit()}
 let disabledProfiles=0,preservedProfiles=0;
 for(let i=0;i<profileDocs.length;i+=350){const batch=adminDb.batch(),disableUids:string[]=[];for(const doc of profileDocs.slice(i,i+350)){const p=doc.data(),remaining=Array.isArray(p.allowedColmadoIds)?p.allowedColmadoIds.map(String).filter((id:string)=>!deletedIds.has(id)&&remainingStores.has(id)):[],assigned=String(p.colmadoId||''),hasOther=remaining.length>0||(!deletedIds.has(assigned)&&remainingStores.has(assigned)),updates:any={allowedColmadoIds:remaining,updatedAt:nowIso,updatedBy:adminUid};if(hasOther){if(deletedIds.has(assigned)){const nextId=remaining[0];updates.colmadoId=nextId;updates.rootColmadoId=remainingStores.get(nextId)?.rootColmadoId||nextId}preservedProfiles++}else{updates.isActive=false;updates.colmadoId='';updates.rootColmadoId='';disableUids.push(doc.id);disabledProfiles++}batch.set(doc.ref,updates,{merge:true})}await batch.commit();await Promise.all(disableUids.map(uid=>adminAuth.updateUser(uid,{disabled:true}).catch(()=>undefined)))}
 await adminDb.collection('auditLogs').add({actorUid:adminUid,actorEmail:adminEmail,action:'SAAS_BUSINESS_DELETED',targetType:'tenant',targetId:colmadoId,deletedStoreIds:[...deletedIds],disabledProfiles,preservedProfiles,preservedHistory:true,createdAt:nowIso});return NextResponse.json({ok:true,disabledProfiles,preservedProfiles,preservedHistory:true});
}
