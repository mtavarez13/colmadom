import { NextRequest,NextResponse } from 'next/server';
import { adminBucket,adminDb } from '@/lib/firebase-admin';
import { apiError,requireBillingUser } from '@/lib/server-auth';
import { paymentCoverage } from '@/lib/saas-billing';
export const runtime='nodejs';
const TYPES=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
export async function POST(request:NextRequest){
 try{
  const {identity,profile,rootColmadoId}=await requireBillingUser(request),form=await request.formData(),file=form.get('file');
  if(!(file instanceof File)||!TYPES.has(file.type)||file.size>5*1024*1024)return NextResponse.json({error:'Adjunta una imagen o PDF de hasta 5 MB.'},{status:400});
  const months=Math.max(1,Math.min(24,Math.floor(Number(form.get('months')||1)))),store=(await adminDb.doc('colmados/'+rootColmadoId).get()).data()||{},coverage=paymentCoverage(store,months),amount=Number(form.get('amount')),planId=String(form.get('planId')||'mrr-custom'),bankAccountId=String(form.get('bankAccountId')||'');
  if(!Number.isFinite(amount)||amount<=0||!bankAccountId)return NextResponse.json({error:'Revisa el monto y la cuenta bancaria.'},{status:400});
  const receiptRef=adminDb.collection('transferReceipts').doc(),extension=file.type==='application/pdf'?'pdf':file.type.split('/')[1].replace('jpeg','jpg');
  const objectPath='transfer-receipts/'+rootColmadoId+'/'+receiptRef.id+'.'+extension;
  await adminBucket.file(objectPath).save(Buffer.from(await file.arrayBuffer()),{resumable:false,contentType:file.type,metadata:{metadata:{receiptId:receiptRef.id,ownerUid:identity.uid}}});
  const now=new Date().toISOString();
  await receiptRef.create({id:receiptRef.id,userId:identity.uid,tenantId:rootColmadoId,colmadoId:profile.colmadoId,planId,amount,currency:'DOP',bankAccountId,monthsCovered:coverage.months,coverageFromMonth:coverage.fromMonth,coverageThroughMonth:coverage.throughMonth,prorationAmount:coverage.proration,
   storagePath:objectPath,originalFileName:file.name.slice(0,120),contentType:file.type,status:'Pending',createdAt:now,updatedAt:now});
  await adminDb.collection('auditLogs').add({actorUid:identity.uid,actorEmail:identity.email||'',action:'TRANSFER_RECEIPT_SUBMITTED',targetType:'transferReceipt',targetId:receiptRef.id,tenantId:rootColmadoId,createdAt:now});
  return NextResponse.json({id:receiptRef.id,status:'Pending'});
 }catch(error){const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});}
}
