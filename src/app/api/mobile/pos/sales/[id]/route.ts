import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { mobileError, validId, MobileError } from '@/lib/mobile-auth';
import { requirePos } from '@/lib/mobile-pos';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: {params:Promise<{id:string}>}) {
  try {
    const {id} = await context.params;
    const storeId = request.nextUrl.searchParams.get('storeId') || '';
    const {identity,profile} = await requirePos(request,storeId);
    if (!validId(id)) throw new MobileError(400,'Comprobante inválido.');
    const receipt = (await adminDb.doc(`colmados/${storeId}/mobilePosReceipts/${id}`).get()).data();
    if (!receipt || (receipt.userId !== identity.uid && !['Admin','Supervisor'].includes(profile.role))) throw new MobileError(404,'Comprobante no disponible.');
    return NextResponse.json({sale:receipt.sale},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return mobileError(error); }
}
