import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireMobileStore, mobileError, MobileError, validId, limitedJson } from '@/lib/mobile-auth';
import { publicOrder } from '@/lib/mobile-orders';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
async function orderRef(request:NextRequest,context:Context) {
  const {id}=await context.params,store=request.nextUrl.searchParams.get('colmadoId') || '';
  await requireMobileStore(request,store);if(!validId(id)) throw new MobileError(400,'Pedido inválido.');
  return adminDb.doc(`colmados/${store}/orders/${id}`);
}
export async function GET(request:NextRequest,context:Context) {
  try {
    const ref=await orderRef(request,context),snap=await ref.get();if(!snap.exists)throw new MobileError(404,'Pedido no encontrado.');
    const items=await ref.collection('items').get();
    return NextResponse.json({order:{...publicOrder(snap.id,snap.data()!),items:items.docs.map(d=>({id:d.id,productName:d.data().productName,quantity:d.data().quantity,unitPrice:d.data().unitPrice,lineTotal:d.data().lineTotal,isBreakdown:d.data().isBreakdown || false}))}},{headers:{'Cache-Control':'no-store'}});
  } catch(e){return mobileError(e);}
}
export async function PATCH(request:NextRequest,context:Context) {
  try {
    const ref=await orderRef(request,context),body=await limitedJson(request);
    const transitions:Record<string,string>={Pending:'Preparing',Preparing:'Dispatched'};
    if(transitions[body.expectedStatus]!==body.status) throw new MobileError(400,'Transición no permitida; entrega y cobro se realizan en el sistema de ventas.');
    await adminDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw new MobileError(404,'Pedido no encontrado.');if(snap.data()?.status!==body.expectedStatus)throw new MobileError(409,'El pedido cambió. Actualiza la lista.');tx.update(ref,{status:body.status,updatedAt:new Date().toISOString()});});
    return NextResponse.json({ok:true});
  } catch(e){return mobileError(e);}
}
