import {NextRequest,NextResponse} from 'next/server';
import {adminAuth,adminDb} from '@/lib/firebase-admin';
import {assertStoreNotSuspended} from '@/lib/server-auth';

export const runtime='nodejs';

export async function GET(request:NextRequest){
  try{
    const token=request.headers.get('authorization')?.replace(/^Bearer /i,'');
    if(!token)return NextResponse.json({error:'Inicia sesión.'},{status:401});
    const identity=await adminAuth.verifyIdToken(token),profile=(await adminDb.doc(`userProfiles/${identity.uid}`).get()).data();
    if(!profile||profile.isActive===false||!profile.colmadoId||profile.role==='Driver')return NextResponse.json({error:'Usuario no autorizado.'},{status:403});
    const colmadoId=String(profile.activeColmadoId||profile.colmadoId),connection=(await adminDb.doc(`whatsappConnections/${colmadoId}`).get()).data()||{};
    await assertStoreNotSuspended(colmadoId);
    if(connection.posNotificationsEnabled!==true)return NextResponse.json({enabled:false,messages:[]});
    const snap=await adminDb.collection(`whatsappConnections/${colmadoId}/inbox`).orderBy('lastMessageAt','desc').limit(10).get();
    return NextResponse.json({enabled:true,connectionId:colmadoId,messages:snap.docs.map(doc=>({phoneNumber:doc.id,displayName:doc.data().displayName||`WhatsApp ${doc.id.slice(-4)}`,body:doc.data().lastMessage||'',createdAt:doc.data().lastMessageAt||''}))});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'No se pudieron consultar las notificaciones.'},{status:500})}
}
