import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError,requirePlatformAdmin } from '@/lib/server-auth';
import { pendingMonthsAfterPayment } from '@/lib/saas-billing';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  const admin=await requirePlatformAdmin(request),body=await request.json(),receiptId=String(body.receiptId||''),decision=String(body.decision||'');
  if(!receiptId||!['approve','reject'].includes(decision))return NextResponse.json({error:'Solicitud inválida.'},{status:400});
  const result=await adminDb.runTransaction(async tx=>{
   const receiptRef=adminDb.doc('transferReceipts/'+receiptId),receiptSnap=await tx.get(receiptRef);if(!receiptSnap.exists)throw new Error('NOT_FOUND');
   const receipt=receiptSnap.data()!;if(receipt.status!=='Pending')return {alreadyProcessed:true,status:receipt.status};
   const now=new Date().toISOString(),status=decision==='approve'?'Approved':'Rejected';
   tx.update(receiptRef,{status,reviewedAt:now,reviewedBy:admin.uid,reviewedByEmail:admin.email||'',updatedAt:now});
   if(decision==='approve'){
    const storeRef=adminDb.doc('colmados/'+receipt.tenantId),storeSnap=await tx.get(storeRef),store=storeSnap.data()||{},monthsCovered=Number(receipt.monthsCovered||1),pendingAfter=pendingMonthsAfterPayment(store,monthsCovered);
    tx.set(adminDb.doc('payments/'+receiptId),{id:receiptId,provider:'BANK_TRANSFER',providerTransactionId:receiptId,userId:receipt.userId,tenantId:receipt.tenantId,planId:receipt.planId,amount:receipt.amount,currency:receipt.currency||'DOP',status:'COMPLETED',receiptId,monthsCovered,coverageFromMonth:receipt.coverageFromMonth,coverageThroughMonth:receipt.coverageThroughMonth,prorationAmount:Number(receipt.prorationAmount||0),createdAt:now,approvedBy:admin.uid});
    tx.update(storeRef,{subscriptionStatus:'Active',subscriptionStatusCode:'ACTIVO',planId:receipt.planId,billingPaidThroughMonth:receipt.coverageThroughMonth||new Date().toISOString().slice(0,7),billingProrationPending:false,billingLastPaymentAt:now,billingLastPaymentAmount:receipt.amount,...(pendingAfter===undefined?{}:{billingPendingInstallments:pendingAfter,paypalPlan1PendingMonths:pendingAfter}),updatedAt:now});
   }
   tx.create(adminDb.collection('auditLogs').doc(),{actorUid:admin.uid,actorEmail:admin.email||'',action:decision==='approve'?'TRANSFER_APPROVED':'TRANSFER_REJECTED',targetType:'transferReceipt',targetId:receiptId,tenantId:receipt.tenantId,createdAt:now});
   return {alreadyProcessed:false,status};
  });
  return NextResponse.json(result);
 }catch(error){
  if(error instanceof Error&&error.message==='NOT_FOUND')return NextResponse.json({error:'Comprobante no encontrado.'},{status:404});
  const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});
 }
}
