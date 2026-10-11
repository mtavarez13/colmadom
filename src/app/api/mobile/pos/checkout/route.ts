import { NextRequest, NextResponse } from 'next/server';
import { limitedJson, mobileError, MobileError } from '@/lib/mobile-auth';
import { checkoutSchema } from '@/lib/mobile-pos-core';
import { checkoutPos } from '@/lib/mobile-pos';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const parsed = checkoutSchema.safeParse(await limitedJson(request));
    if (!parsed.success) throw new MobileError(400,'Solicitud de venta inválida; no envíes precios ni totales calculados.');
    return NextResponse.json(await checkoutPos(request,parsed.data),{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return mobileError(error); }
}
