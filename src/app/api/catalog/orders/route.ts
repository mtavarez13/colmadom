import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { MobileError, mobileError, limitedJson, validId } from '@/lib/mobile-auth';
import { catalogOrderSchema, deliveryCost } from '@/lib/catalog-order-validation';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
  try {
    // Browser-only same-origin endpoint. Deploy behind host/WAF request rate limits too.
    const origin=request.headers.get('origin');
    if(process.env.NODE_ENV==='production' && !process.env.PUBLIC_APP_ORIGIN)throw new MobileError(503,'Catálogo pendiente de configuración.');
    const expected=process.env.PUBLIC_APP_ORIGIN || request.nextUrl.origin;
    if(origin!==expected)throw new MobileError(403,'Origen no permitido.');
    const parsed=catalogOrderSchema.safeParse(await limitedJson(request));
    if(!parsed.success)throw new MobileError(400,'Datos de pedido inválidos.');
    const body=parsed.data, fingerprint=createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const ref=adminDb.doc(`colmados/${body.colmadoId}/orders/catalog_${body.requestId}`);
    const result=await adminDb.runTransaction(async tx=>{
      const existing=await tx.get(ref);
      if(existing.exists){if(existing.data()?.requestFingerprint!==fingerprint)throw new MobileError(409,'La solicitud ya fue utilizada.');return {orderId:ref.id,totalAmount:existing.data()!.totalAmount};}
      const storeRef=adminDb.doc(`colmados/${body.colmadoId}`),store=(await tx.get(storeRef)).data();
      if(!store)throw new MobileError(404,'Sucursal no encontrada.');
      const rootId=store.rootColmadoId || body.colmadoId;
      if(!validId(rootId))throw new MobileError(403,'Sucursal inválida.');
      const plan=rootId===body.colmadoId?store:(await tx.get(adminDb.doc(`colmados/${rootId}`))).data();
      const expiry=Number(plan?.trialEndAtMillis)||Date.parse(plan?.trialEndDate||'');
      if(!plan || plan.suspensionNoticeEnabled===true || (plan.subscriptionStatus!=='Active' && !(plan.subscriptionStatus==='Trial'&&Number.isFinite(expiry)&&expiry>Date.now())))throw new MobileError(403,'La sucursal no recibe pedidos mientras el servicio está suspendido.');
      const rateRef=adminDb.doc(`catalogRateLimits/${body.colmadoId}`),rate=(await tx.get(rateRef)).data(),window=Math.floor(Date.now()/60000);
      if(rate?.window===window && rate.count>=30)throw new MobileError(429,'Demasiados pedidos. Intenta en un minuto.');
      const ids=[...new Set(body.items.map(i=>i.productId))];
      const products=new Map((await Promise.all(ids.map(id=>tx.get(storeRef.collection('products').doc(id))))).map(s=>[s.id,s.data()]));
      const demand=new Map<string,number>();
      const addDemand=(id:string,quantity:number)=>demand.set(id,(demand.get(id)||0)+quantity);
      const items=body.items.map((item,index)=>{
        const p=products.get(item.productId),price=Number(p?.salePrice);
        if(!p || !Number.isFinite(price)||price<=0)throw new MobileError(409,'Un producto ya no está disponible.');
        if(item.amountInDop!==undefined && !p.isBreakdownAllowed)throw new MobileError(400,'Producto no admite venta por monto.');
        const quantity=item.amountInDop===undefined?item.quantity:item.amountInDop/price;
        if(item.amountInDop===undefined && !Number.isInteger(quantity))throw new MobileError(400,'Cantidad inválida.');
        if(p.isCombo){
          if(!Array.isArray(p.comboItems)||!p.comboItems.length)throw new MobileError(409,'Combo sin componentes.');
          for(const part of p.comboItems){if(!validId(part.id)||!(Number(part.quantity)>0))throw new MobileError(409,'Combo inválido.');addDemand(part.id,quantity*Number(part.quantity));}
        } else addDemand(item.productId,quantity);
        return {id:`item_${index}`,orderId:ref.id,productId:item.productId,productName:String(p.name||''),quantity,unitPrice:price,lineTotal:item.amountInDop ?? quantity*price,isBreakdown:item.amountInDop!==undefined};
      });
      const missing=[...demand.keys()].filter(id=>!products.has(id));
      for(const snap of await Promise.all(missing.map(id=>tx.get(storeRef.collection('products').doc(id))))) products.set(snap.id,snap.data());
      for(const [id,quantity] of demand){if(Number(products.get(id)?.quantityInStock||0)+1e-8<quantity)throw new MobileError(409,'Inventario insuficiente. Actualiza el carrito.');}
      const subtotalAmount=items.reduce((sum,i)=>sum+i.lineTotal,0),deliveryFee=deliveryCost(store,body.customerLatitude,body.customerLongitude),totalAmount=subtotalAmount+deliveryFee;
      if(!Number.isFinite(totalAmount)||Math.abs(totalAmount-body.expectedTotal)>0.01)throw new MobileError(409,'El precio o envío cambió. Actualiza el catálogo y confirma nuevamente.');
      const now=new Date().toISOString();
      tx.create(ref,{id:ref.id,colmadoId:body.colmadoId,source:'catalog',customerName:body.customerName,customerAddress:body.customerAddress,customerPhone:body.customerPhone,customerLatitude:body.customerLatitude,customerLongitude:body.customerLongitude,subtotalAmount,deliveryFee,totalAmount,status:'Pending',createdAt:now,updatedAt:now,requestFingerprint:fingerprint});
      for(const item of items)tx.create(ref.collection('items').doc(item.id),item);
      tx.create(adminDb.doc(`mobileOrderOutbox/${ref.id}`),{colmadoId:body.colmadoId,orderId:ref.id,source:'catalog',createdAt:now,status:'pending'});
      tx.set(rateRef,{window,count:rate?.window===window?rate.count+1:1});
      return {orderId:ref.id,totalAmount};
    });
    return NextResponse.json(result,{status:201});
  }catch(e){return mobileError(e);}
}
