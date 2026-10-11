import {NextRequest,NextResponse} from 'next/server';
import {adminDb} from '@/lib/firebase-admin';
import {apiError,requirePlatformAdmin} from '@/lib/server-auth';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 try{await requirePlatformAdmin(request);const [config,accounts,plans]=await Promise.all([adminDb.doc('platformConfig/general').get(),adminDb.collection('bankAccounts').get(),adminDb.collection('plans').get()]);return NextResponse.json({config:config.data()||{},accounts:accounts.docs.map(d=>({id:d.id,...d.data()})),plans:plans.docs.map(d=>({id:d.id,...d.data()}))});}
 catch(error){const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});}
}
export async function POST(request:NextRequest){
 try{
  const admin=await requirePlatformAdmin(request),body=await request.json(),action=String(body.action||''),now=new Date().toISOString();
  if(action==='settings'){
   const trialDays=Math.min(90,Math.max(1,Number(body.trialDays||20)));
   const employeeBackgroundCheckPriceUsd=Math.max(1,Number(body.employeeBackgroundCheckPriceUsd||5));
   const allowedModuleIds=new Set(['minimarket','pos','driver','bar','orders','whatsapp','top-sellers','hr','business-market','inventory','inventory-audit','independent-audits','suppliers','customers','expenses','reconciliation','services','reports','fiscal','insights']);
   const freeModules=Array.isArray(body.freeModules)?body.freeModules.map(String).filter((id:string)=>allowedModuleIds.has(id)):['independent-audits','hr','business-market'];
   await adminDb.doc('platformConfig/general').set({trialDays,employeeBackgroundCheckPriceUsd,freeModules,paymentMethods:{bankTransfer:body.bankTransfer!==false,paypal:body.paypal===true},updatedAt:now,updatedBy:admin.uid},{merge:true});
  }else if(action==='save_bank'){
   const id=String(body.id||adminDb.collection('bankAccounts').doc().id),account={bank:String(body.bank||'').trim(),accountType:String(body.accountType||'').trim(),accountNumber:String(body.accountNumber||'').trim(),holder:String(body.holder||'').trim(),isActive:body.isActive!==false,isDefault:body.isDefault===true,updatedAt:now};
   if(!account.bank||!account.accountType||!account.accountNumber||!account.holder)return NextResponse.json({error:'Completa todos los datos bancarios.'},{status:400});
   const batch=adminDb.batch();if(account.isDefault){const current=await adminDb.collection('bankAccounts').where('isDefault','==',true).get();current.docs.forEach(d=>batch.update(d.ref,{isDefault:false,updatedAt:now}));}
   batch.set(adminDb.doc('bankAccounts/'+id),body.id?{id,...account}:{id,...account,createdAt:now},{merge:true});batch.create(adminDb.collection('auditLogs').doc(),{actorUid:admin.uid,actorEmail:admin.email||'',action:'BANK_ACCOUNT_SAVED',targetType:'bankAccount',targetId:id,createdAt:now});await batch.commit();
  }else if(action==='delete_bank'){const id=String(body.id||'');await adminDb.doc('bankAccounts/'+id).delete();}
  else if(action==='save_plan'){const id=String(body.id||'').trim().replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50),name=String(body.name||'').trim(),price=Number(body.price),paypalPrice=Number(body.paypalPrice),periodDays=Math.min(366,Math.max(1,Number(body.periodDays||30)));if(!id||!name||!Number.isFinite(price)||price<0)return NextResponse.json({error:'Revisa los datos del plan.'},{status:400});await adminDb.doc('plans/'+id).set({id,name,price,paypalPrice:Number.isFinite(paypalPrice)?paypalPrice:0,paypalCurrency:String(body.paypalCurrency||'USD'),periodDays,isActive:body.isActive!==false,updatedAt:now},{merge:true});}
  else return NextResponse.json({error:'Acción inválida.'},{status:400});
  return NextResponse.json({ok:true});
 }catch(error){const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});}
}
