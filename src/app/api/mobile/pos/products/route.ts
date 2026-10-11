import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { mobileError, validId, MobileError } from '@/lib/mobile-auth';
import { requirePos, fiscalBlock } from '@/lib/mobile-pos';
import { unsupportedProduct } from '@/lib/mobile-pos-core';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get('storeId') || '';
    const {store} = await requirePos(request,storeId);
    const cursor = request.nextUrl.searchParams.get('cursor');
    if (cursor && !validId(cursor)) throw new MobileError(400,'Cursor inválido.');
    let query = adminDb.collection(`colmados/${storeId}/products`).orderBy('__name__').limit(201);
    if (cursor) query = query.startAfter(cursor);
    const docs = (await query.get()).docs;
    const products = docs.slice(0,200).map(doc=>{
      const p = doc.data(), reason = unsupportedProduct(p);
      return {id:doc.id,name:String(p.name||''),salePrice:Number(p.salePrice)||0,quantityInStock:Number(p.quantityInStock)||0,unitType:String(p.unitType||'ud'),isFractionalOnly:!!p.isFractionalOnly,isBreakdownAllowed:!!p.isBreakdownAllowed,barcode:String(p.barcode||''),supported:!reason,unsupportedReason:reason};
    });
    return NextResponse.json({products,nextCursor:docs.length>200?docs[199].id:null,checkoutEnabled:!fiscalBlock(store),checkoutDisabledReason:fiscalBlock(store)?'La facturación fiscal requiere finalizar en el POS web.':null},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return mobileError(error); }
}
