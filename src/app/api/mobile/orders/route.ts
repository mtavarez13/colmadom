import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireMobileStore, mobileError } from '@/lib/mobile-auth';
import { publicOrder } from '@/lib/mobile-orders';
export const runtime='nodejs';
export async function GET(request:NextRequest) {
  try {
    const id=request.nextUrl.searchParams.get('colmadoId') || '';await requireMobileStore(request,id);
    const rows=await adminDb.collection(`colmados/${id}/orders`).orderBy('createdAt','desc').limit(100).get();
    return NextResponse.json({orders:rows.docs.map(d=>publicOrder(d.id,d.data()))},{headers:{'Cache-Control':'no-store'}});
  } catch(e){return mobileError(e);}
}
