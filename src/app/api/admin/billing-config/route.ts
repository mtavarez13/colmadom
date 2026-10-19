import {NextRequest,NextResponse} from 'next/server';
import {adminDb} from '@/lib/firebase-admin';
import {apiError,requirePlatformAdmin} from '@/lib/server-auth';
import {billingState} from '@/lib/saas-billing';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 try{await requirePlatformAdmin(request);const [config,accounts,plans,stores]=await Promise.all([adminDb.doc('platformConfig/general').get(),adminDb.collection('bankAccounts').get(),adminDb.collection('plans').get(),adminDb.collection('colmados').get()]);return NextResponse.json({config:config.data()||{},paypalEnvironment:config.data()?.paypalEnvironment||process.env.PAYPAL_ENVIRONMENT||'sandbox',accounts:accounts.docs.map(d=>({id:d.id,...d.data()})),plans:plans.docs.map(d=>({id:d.id,...d.data()})),stores:stores.docs.filter(d=>{const s=d.data();return s.isDeleted!==true&&(!s.rootColmadoId||s.rootColmadoId===d.id)}).map(d=>{const s=d.data(),billing=billingState(s),pending=s.billingPendingInstallments??s.paypalPlan1PendingMonths??billing.monthsOwed;return{id:d.id,name:String(s.name||s.businessName||d.id),ownerEmail:String(s.ownerEmail||''),planId:String(s.planId||''),monthlyFee:billing.fee,pendingInstallments:Number(pending),calculatedMonthsOwed:billing.monthsOwed,paypalPlan1Enabled:s.paypalPlan1Enabled===true,paypalPlan1NoticeStartDate:String(s.paypalPlan1NoticeStartDate||''),paypalPlan1SubscriptionStatus:String(s.paypalPlan1SubscriptionStatus||'')}}).sort((a,b)=>a.name.localeCompare(b.name,'es'))});}
 catch(error){const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});}
}
export async function POST(request:NextRequest){
 try{
  const admin=await requirePlatformAdmin(request),body=await request.json(),action=String(body.action||''),now=new Date().toISOString();
  if(action==='settings'){
   const trialDays=Math.min(90,Math.max(1,Number(body.trialDays||20)));
   const employeeBackgroundCheckPriceUsd=Math.max(1,Number(body.employeeBackgroundCheckPriceUsd||5));
   const allowedModuleIds=new Set(['minimarket','pos','driver','bar','orders','whatsapp','top-sellers','hr','business-market','inventory','inventory-audit','independent-audits','suppliers','customers','expenses','reconciliation','services','reports','fiscal','insights']);
   const freeModules=Array.isArray(body.freeModules)?body.freeModules.map(String).filter((id:string)=>allowedModuleIds.has(id)):['independent-audits','hr','business-market'];
   const paypalClientId=String(body.paypalClientId||'').trim();
   const paypalEnvironment=String(body.paypalEnvironment||process.env.PAYPAL_ENVIRONMENT||'sandbox');
   if(paypalClientId.length>200||paypalClientId&&!/^[A-Za-z0-9_-]+$/.test(paypalClientId)||!['sandbox','live'].includes(paypalEnvironment))return NextResponse.json({error:'Revisa el Client ID y entorno de PayPal.'},{status:400});
   await adminDb.doc('platformConfig/general').set({trialDays,employeeBackgroundCheckPriceUsd,freeModules,paypalClientId,paypalEnvironment,paymentMethods:{bankTransfer:body.bankTransfer!==false,paypal:body.paypal===true},updatedAt:now,updatedBy:admin.uid},{merge:true});
  }else if(action==='save_bank'){
   const id=String(body.id||adminDb.collection('bankAccounts').doc().id),account={bank:String(body.bank||'').trim(),accountType:String(body.accountType||'').trim(),accountNumber:String(body.accountNumber||'').trim(),holder:String(body.holder||'').trim(),isActive:body.isActive!==false,isDefault:body.isDefault===true,updatedAt:now};
   if(!account.bank||!account.accountType||!account.accountNumber||!account.holder)return NextResponse.json({error:'Completa todos los datos bancarios.'},{status:400});
   const batch=adminDb.batch();if(account.isDefault){const current=await adminDb.collection('bankAccounts').where('isDefault','==',true).get();current.docs.forEach(d=>batch.update(d.ref,{isDefault:false,updatedAt:now}));}
   batch.set(adminDb.doc('bankAccounts/'+id),body.id?{id,...account}:{id,...account,createdAt:now},{merge:true});batch.create(adminDb.collection('auditLogs').doc(),{actorUid:admin.uid,actorEmail:admin.email||'',action:'BANK_ACCOUNT_SAVED',targetType:'bankAccount',targetId:id,createdAt:now});await batch.commit();
  }else if(action==='delete_bank'){const id=String(body.id||'');await adminDb.doc('bankAccounts/'+id).delete();}
  else if(action==='save_plan'){
   const id=String(body.id||'').trim(),name=String(body.name||'').trim(),price=Number(body.price),paypalPrice=Number(body.paypalPrice),periodDays=Number(body.periodDays),paypalPlanId=String(body.paypalPlanId||'').trim();
   if(!/^[A-Za-z0-9_-]{1,50}$/.test(id)||!name||name.length>100||!Number.isFinite(price)||price<0||!Number.isFinite(paypalPrice)||paypalPrice<0||!Number.isInteger(periodDays)||periodDays<1||periodDays>366||paypalPlanId&&!/^P-[A-Za-z0-9-]{5,60}$/.test(paypalPlanId))return NextResponse.json({error:'Revisa el código, precio, duración e ID del plan PayPal.'},{status:400});
   const ref=adminDb.doc('plans/'+id),previous=await ref.get();
   await ref.set({id,name,price,paypalPrice,paypalCurrency:String(body.paypalCurrency||'USD').toUpperCase(),paypalPlanId,periodDays,isActive:body.isActive!==false,createdAt:previous.data()?.createdAt||now,updatedAt:now},{merge:true});
   await adminDb.collection('auditLogs').add({actorUid:admin.uid,action:previous.exists?'SAAS_PLAN_UPDATED':'SAAS_PLAN_CREATED',targetId:id,createdAt:now});
  }
  else if(action==='set_pending_installments'){
   const colmadoId=String(body.colmadoId||'').trim(),pending=Number(body.pendingInstallments),paypalPlan1Enabled=body.paypalPlan1Enabled===true,noticeStartDate=String(body.paypalPlan1NoticeStartDate||'').trim(),planId=String(body.planId||'').trim();
   if(!/^[A-Za-z0-9_-]{1,128}$/.test(colmadoId)||planId&&!/^[A-Za-z0-9_-]{1,50}$/.test(planId)||!Number.isInteger(pending)||pending<0||pending>24)return NextResponse.json({error:'Selecciona un colmado, un plan válido y entre 0 y 24 cuotas pendientes.'},{status:400});
   const parsedDate=new Date(noticeStartDate+'T00:00:00Z');
   if(paypalPlan1Enabled&&(!/^\d{4}-\d{2}-\d{2}$/.test(noticeStartDate)||Number.isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==noticeStartDate))return NextResponse.json({error:'Indica una fecha válida para iniciar el aviso de suscripción con tarjeta.'},{status:400});
   const storeRef=adminDb.doc('colmados/'+colmadoId),storeSnap=await storeRef.get(),store=storeSnap.data();
   if(!storeSnap.exists||store?.isDeleted===true||store?.rootColmadoId&&store.rootColmadoId!==colmadoId)return NextResponse.json({error:'Colmado no disponible.'},{status:404});
   const selectedPlan=planId?await adminDb.doc('plans/'+planId).get():null;
   if(planId&&(!selectedPlan?.exists||selectedPlan.data()?.isActive===false))return NextResponse.json({error:'Selecciona un plan activo para este colmado.'},{status:400});
   const paypalPlanId=String(selectedPlan?selectedPlan.data()?.paypalPlanId||'':store?.paypalPlan1PlanId||'P-3TB64314LH169562MNLKXWQA');
   if(paypalPlan1Enabled&&!/^P-[A-Za-z0-9-]{5,60}$/.test(paypalPlanId))return NextResponse.json({error:'Este plan no tiene un ID de suscripción PayPal válido.'},{status:400});
   if(store?.paypalPlan1SubscriptionStatus==='ACTIVE'&&paypalPlanId!==String(store.paypalPlan1PlanId||'P-3TB64314LH169562MNLKXWQA'))return NextResponse.json({error:'Este colmado ya tiene una suscripción PayPal activa. No cambies su plan hasta finalizarla en PayPal.'},{status:409});
   const previous=store?.billingPendingInstallments??store?.paypalPlan1PendingMonths??billingState(store||{}).monthsOwed;
   const batch=adminDb.batch();batch.set(storeRef,{...(planId?{planId}:{}),billingPendingInstallments:pending,paypalPlan1PendingMonths:pending,billingPendingInstallmentsUpdatedAt:now,billingPendingInstallmentsUpdatedBy:admin.uid,paypalPlan1Enabled,paypalPlan1NoticeStartDate:noticeStartDate,paypalPlan1PlanId:paypalPlanId,paypalPlan1UpdatedAt:now,updatedAt:now},{merge:true});
   batch.create(adminDb.collection('auditLogs').doc(),{actorUid:admin.uid,actorEmail:admin.email||'',action:'SAAS_PENDING_INSTALLMENTS_SET',targetType:'tenant',targetId:colmadoId,previousPendingInstallments:Number(previous),pendingInstallments:pending,previousNoticeStartDate:String(store?.paypalPlan1NoticeStartDate||''),noticeStartDate,paypalPlan1Enabled,createdAt:now});await batch.commit();
  }
  else return NextResponse.json({error:'Acción inválida.'},{status:400});
  return NextResponse.json({ok:true});
 }catch(error){const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});}
}
