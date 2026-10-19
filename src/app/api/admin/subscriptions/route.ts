import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError,requirePlatformAdmin } from '@/lib/server-auth';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 try{
  await requirePlatformAdmin(request);
  const [stores,profiles,payments,receipts]=await Promise.all([adminDb.collection('colmados').get(),adminDb.collection('userProfiles').get(),adminDb.collection('payments').orderBy('createdAt','desc').limit(300).get(),adminDb.collection('transferReceipts').orderBy('createdAt','desc').limit(300).get()]);
  return NextResponse.json({stores:stores.docs.filter(d=>d.data().isDeleted!==true).map(d=>({id:d.id,...d.data()})),profiles:profiles.docs.map(d=>({id:d.id,...d.data()})),payments:payments.docs.map(d=>({id:d.id,...d.data()})),receipts:receipts.docs.map(d=>({id:d.id,...d.data()}))});
 }catch(error){const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});}
}
export async function POST(request:NextRequest){
 try{
  const admin=await requirePlatformAdmin(request),body=await request.json(),action=String(body.action||''),tenantId=String(body.tenantId||''),now=new Date().toISOString();
  if(!tenantId)return NextResponse.json({error:'Falta el cliente.'},{status:400});
  await adminDb.runTransaction(async tx=>{
   const storeRef=adminDb.doc('colmados/'+tenantId),storeSnap=await tx.get(storeRef);if(!storeSnap.exists)throw new Error('NOT_FOUND');
   const updates:any={updatedAt:now};let auditAction=action;
   if(action==='suspend')updates.subscriptionStatus='Suspended',updates.subscriptionStatusCode='SUSPENDIDO';
   else if(action==='activate')updates.subscriptionStatus='Active',updates.subscriptionStatusCode='ACTIVO';
   else if(action==='extend_trial'){const days=Math.min(90,Math.max(1,Number(body.days||7))),end=new Date(Math.max(Date.now(),Number(storeSnap.data()?.trialEndAtMillis||0))+days*86400000);updates.subscriptionStatus='Trial';updates.subscriptionStatusCode='PRUEBA';updates.trialEndDate=end.toISOString();updates.trialEndAtMillis=end.getTime();}
   else if(action==='change_plan')updates.planId=String(body.planId||'standard');
   else throw new Error('INVALID_ACTION');
   tx.update(storeRef,updates);
   tx.create(adminDb.collection('auditLogs').doc(),{actorUid:admin.uid,actorEmail:admin.email||'',action:auditAction,targetType:'tenant',targetId:tenantId,changes:updates,createdAt:now});
  });
  return NextResponse.json({ok:true});
 }catch(error){
  if(error instanceof Error&&['NOT_FOUND','INVALID_ACTION'].includes(error.message))return NextResponse.json({error:'Solicitud inválida.'},{status:400});
  const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});
 }
}
