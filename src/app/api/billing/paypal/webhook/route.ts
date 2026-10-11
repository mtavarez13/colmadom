import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { paypalRequest } from '@/lib/paypal';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  const webhookId=process.env.PAYPAL_WEBHOOK_ID;if(!webhookId)return NextResponse.json({error:'Webhook no configurado.'},{status:503});
  const event=await request.json(),verification=await paypalRequest('/v1/notifications/verify-webhook-signature',{method:'POST',body:JSON.stringify({
   auth_algo:request.headers.get('paypal-auth-algo'),cert_url:request.headers.get('paypal-cert-url'),transmission_id:request.headers.get('paypal-transmission-id'),
   transmission_sig:request.headers.get('paypal-transmission-sig'),transmission_time:request.headers.get('paypal-transmission-time'),webhook_id:webhookId,webhook_event:event
  })});
  if(verification.verification_status!=='SUCCESS')return NextResponse.json({error:'Firma inválida.'},{status:400});
  await adminDb.doc('paypalWebhookEvents/'+event.id).create({id:event.id,eventType:event.event_type,resourceId:event.resource?.id||'',receivedAt:new Date().toISOString(),processed:false}).catch(()=>undefined);
  return NextResponse.json({received:true});
 }catch{return NextResponse.json({error:'No se pudo verificar el webhook.'},{status:500});}
}
