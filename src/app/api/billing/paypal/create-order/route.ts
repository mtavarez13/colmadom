import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError,requireBillingUser } from '@/lib/server-auth';
import { paypalRequest } from '@/lib/paypal';
import { paymentCoverage } from '@/lib/saas-billing';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  const {identity,rootColmadoId}=await requireBillingUser(request),body=await request.json(),planId=String(body.planId||''),months=Math.max(1,Math.min(24,Math.floor(Number(body.months||1))));
  const plan=await adminDb.doc('plans/'+planId).get();if(!plan.exists||plan.data()?.isActive===false)return NextResponse.json({error:'Plan no disponible.'},{status:400});
  const storeSnapshot=await adminDb.doc('colmados/'+rootColmadoId).get(),store=storeSnapshot.data()||{},coverage=paymentCoverage(store,months),monthlyPaypal=Number(store.billingPaypalMonthlyPrice||plan.data()?.paypalPrice||plan.data()?.price),monthlyDop=Number(store.billingMonthlyFee||store.monthlyFee||0),prorationRatio=monthlyDop>0?coverage.proration/monthlyDop:0,amount=monthlyPaypal*months+monthlyPaypal*prorationRatio,currency=String(store.billingPaypalCurrency||plan.data()?.paypalCurrency||'USD');
  if(!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:'El plan no tiene precio PayPal configurado.'},{status:409});
  const order=await paypalRequest('/v2/checkout/orders',{method:'POST',headers:{'PayPal-Request-Id':'create-'+identity.uid+'-'+Date.now()},body:JSON.stringify({intent:'CAPTURE',purchase_units:[{reference_id:rootColmadoId,custom_id:JSON.stringify({tenantId:rootColmadoId,userId:identity.uid,planId,months}),amount:{currency_code:currency,value:amount.toFixed(2)}}]})});
  await adminDb.doc('paypalOrders/'+order.id).set({id:order.id,userId:identity.uid,tenantId:rootColmadoId,planId,monthsCovered:coverage.months,coverageFromMonth:coverage.fromMonth,coverageThroughMonth:coverage.throughMonth,prorationAmount:coverage.proration,amount,currency,status:order.status,createdAt:new Date().toISOString()});
  return NextResponse.json({id:order.id});
 }catch(error){const f=apiError(error);return NextResponse.json({error:error instanceof Error&&error.message==='PAYPAL_NOT_CONFIGURED'?'PayPal aún no está configurado.':f.message},{status:error instanceof Error&&error.message==='PAYPAL_NOT_CONFIGURED'?503:f.status});}
}
