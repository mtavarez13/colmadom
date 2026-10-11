import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { authenticatedMobile, mobileIdentity, mobileError, MobileError, limitedJson } from '@/lib/mobile-auth';
export const runtime = 'nodejs';
function tokenRef(token:unknown) {
  if(typeof token !== 'string' || token.length < 20 || token.length > 4096 || /\s/.test(token)) throw new MobileError(400,'Token inválido.');
  return adminDb.doc(`mobileDevices/${createHash('sha256').update(token).digest('hex')}`);
}
export async function POST(request:NextRequest) {
  try {
    const {identity,stores} = await mobileIdentity(request), body = await limitedJson(request), ref=tokenRef(body.token);
    if(body.platform !== 'android') throw new MobileError(400,'Plataforma inválida.');
    if(!stores.length) throw new MobileError(403,'No hay sucursales activas.');
    await adminDb.runTransaction(async tx=>{const previous=await tx.get(ref);tx.set(ref,{uid:identity.uid,token:body.token,platform:'android',colmadoIds:stores.map(s=>s.id),updatedAtMillis:Math.max(Date.now(),Number(previous.data()?.updatedAtMillis||0)+1)});});
    return NextResponse.json({ok:true});
  } catch(e) {return mobileError(e);}
}
export async function DELETE(request:NextRequest) {
  try {
    // Removal remains possible after the staff profile has been disabled.
    const identity=await authenticatedMobile(request), body=await limitedJson(request), ref=tokenRef(body.token);
    await adminDb.runTransaction(async tx=>{const doc=await tx.get(ref);if(doc.data()?.uid===identity.uid) tx.delete(ref);});
    return NextResponse.json({ok:true});
  } catch(e) {return mobileError(e);}
}
