import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError, requireIdentity } from '@/lib/server-auth';
import { sendWhatsAppTemplate,sendWhatsAppText } from '@/lib/whatsapp-cloud';
export const runtime='nodejs';
const clean=(value:unknown,max=120)=>String(value||'').trim().slice(0,max);
const slugify=(value:string)=>value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export async function POST(request:NextRequest){
 try{
  const identity=await requireIdentity(request);
  if(!identity.email_verified)return NextResponse.json({error:'Verifica tu correo antes de registrar el negocio.'},{status:403});
  const body=await request.json(),name=clean(body.name),businessPhone=clean(body.businessPhone||body.phone,20).replace(/\D/g,''),ownerPhone=clean(body.ownerPhone,20).replace(/\D/g,''),province=clean(body.province),municipality=clean(body.municipality);
  if(name.length<2||businessPhone.length<10||ownerPhone.length<10||!province||!municipality)return NextResponse.json({error:'Completa negocio, teléfono del negocio, teléfono del dueño, provincia y municipio.'},{status:400});
  const profileRef=adminDb.doc('userProfiles/'+identity.uid),configRef=adminDb.doc('platformConfig/general');
  const result=await adminDb.runTransaction(async tx=>{
   const [profileSnap,configSnap]=await Promise.all([tx.get(profileRef),tx.get(configRef)]),profile=profileSnap.data();
   if(!profile)throw new Error('PROFILE_REQUIRED');if(profile.colmadoId)return {colmadoId:profile.colmadoId,existing:true};
   const trialDays=Math.min(90,Math.max(1,Number(configSnap.data()?.trialDays||20))),now=new Date(),trialEnd=new Date(now.getTime()+trialDays*86400000),colmadoRef=adminDb.collection('colmados').doc();
   tx.create(colmadoRef,{id:colmadoRef.id,code:'CLM-'+Math.floor(1000+Math.random()*9000),ownerId:identity.uid,name,slug:slugify(name)+'-'+colmadoRef.id.slice(-4),
    address:clean(body.address,250),phoneNumber:businessPhone,businessPhone,ownerPhone,province,municipality,ownerEmail:identity.email?.toLowerCase()||'',ownerFullName:clean(body.ownerFullName)||profile.firstName||'Dueño',
    ownerCedula:clean(body.ownerCedula,30),businessType:body.businessType==='Consignacion'?'Consignacion':'Standard',rootColmadoId:colmadoRef.id,branchLimit:1,
    additionalBranchFee:0,printerPaperWidth:'80mm',monthlyFee:Number(configSnap.data()?.defaultMonthlyFee||1500),subscriptionStatus:'Trial',subscriptionStatusCode:'PRUEBA',
    planId:String(configSnap.data()?.defaultPlanId||'standard'),trialDays,trialStartDate:now.toISOString(),trialEndDate:trialEnd.toISOString(),trialEndAtMillis:trialEnd.getTime(),
    fiscalEnabled:false,fiscalMode:'disabled',rnc:'',legalName:'',integrationsManagedBy:'SAAS_ADMIN',
    defaultEcfType:'32',electronicIssuerAuthorized:false,
    createdAt:now.toISOString(),updatedAt:now.toISOString(),serviceBalance:0});
   tx.set(profileRef,{colmadoId:colmadoRef.id,rootColmadoId:colmadoRef.id,role:'Admin',roleCode:'OWNER',subscriptionStatus:'PRUEBA',phoneNumber:ownerPhone,province,municipality,
    businessName:name,trialStartDate:now.toISOString(),trialEndDate:trialEnd.toISOString(),allowedModules:['pos','minimarket','inventory','customers','reports','expenses','insights','reconciliation','orders','whatsapp','top-sellers'],updatedAt:now.toISOString()},{merge:true});
   return {colmadoId:colmadoRef.id,trialDays,existing:false};
  });
  let welcomeWhatsapp={status:'pending',message:'No hay canal emisor configurado.'};
  if(!result.existing){
   try{
    const configured=process.env.WHATSAPP_WELCOME_CONNECTION_ID?.trim();
    let senderId=configured||'';
    if(!senderId){const connected=await adminDb.collection('whatsappConnections').where('status','==','Connected').limit(1).get();senderId=connected.docs[0]?.id||'';}
    if(senderId){
      const template=process.env.WHATSAPP_WELCOME_TEMPLATE?.trim()||'colmadom_bienvenida',language=process.env.WHATSAPP_WELCOME_LANGUAGE?.trim()||'es';
      try{const sent=await sendWhatsAppTemplate(senderId,ownerPhone,template,language,[clean(body.ownerFullName)||'Propietario',name,String(result.trialDays||20)]);welcomeWhatsapp={status:'sent',message:sent.messageId};}
      catch(templateError){const sent=await sendWhatsAppText(senderId,ownerPhone,`¡Bienvenido a Colmadom Cloud! ${name} ya está registrado. Tu prueba de ${result.trialDays||20} días está activa. Ingresa, configura tu inventario, usuarios y caja. Soporte: 809-458-3731.`);welcomeWhatsapp={status:'sent',message:sent.messageId};}
    }
   }catch(error){welcomeWhatsapp={status:'pending',message:error instanceof Error?error.message:'Envío pendiente'};}
   await adminDb.doc('colmados/'+result.colmadoId).set({welcomeWhatsappStatus:welcomeWhatsapp.status,welcomeWhatsappDetail:welcomeWhatsapp.message,welcomeWhatsappUpdatedAt:new Date().toISOString()},{merge:true});
  }
  return NextResponse.json({...result,welcomeWhatsapp});
 }catch(error){
  if(error instanceof Error&&error.message==='PROFILE_REQUIRED')return NextResponse.json({error:'No encontramos el perfil de registro.'},{status:409});
  const failure=apiError(error);return NextResponse.json({error:failure.message},{status:failure.status});
 }
}
