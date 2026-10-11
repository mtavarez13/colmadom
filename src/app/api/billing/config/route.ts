import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError,requireOwner } from '@/lib/server-auth';
import { billingState,paymentCoverage } from '@/lib/saas-billing';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 try{
  const {rootColmadoId}=await requireOwner(request);
  const [config,store,plans,accounts]=await Promise.all([
   adminDb.doc('platformConfig/general').get(),adminDb.doc('colmados/'+rootColmadoId).get(),
   adminDb.collection('plans').where('isActive','==',true).get(),adminDb.collection('bankAccounts').where('isActive','==',true).get()
  ]);
  const storeData:any={id:store.id,...store.data()},billing=billingState(storeData),quote=paymentCoverage(storeData,1);
  return NextResponse.json({paymentMethods:config.data()?.paymentMethods||{bankTransfer:true,paypal:false},currency:config.data()?.currency||'DOP',
   store:storeData,billing,quote,plans:plans.docs.map(d=>({id:d.id,...d.data()})),bankAccounts:accounts.docs.map(d=>({id:d.id,...d.data()}))});
 }catch(error){const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});}
}
