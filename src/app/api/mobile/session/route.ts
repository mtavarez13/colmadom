import { NextRequest, NextResponse } from 'next/server';
import { mobileIdentity, mobileError } from '@/lib/mobile-auth';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const {identity, profile, stores} = await mobileIdentity(request, 'session');
    return NextResponse.json({profile:{uid:identity.uid, name:[profile.firstName,profile.lastName].filter(Boolean).join(' '),email:identity.email || '',role:profile.role,allowedModules:profile.allowedModules || []}, stores}, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return mobileError(e); }
}
