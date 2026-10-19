import { adminDb } from '@/lib/firebase-admin';

async function paypalBase(){
 const config=await adminDb.doc('platformConfig/general').get();
 const chosen=config.data()?.paypalEnvironment;
 const environment=chosen==='live'||chosen==='sandbox'?chosen:process.env.PAYPAL_ENVIRONMENT==='live'?'live':'sandbox';
 return environment==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
}
export async function paypalClientId(){
 const config=await adminDb.doc('platformConfig/general').get();
 return String(config.data()?.paypalClientId||process.env.PAYPAL_CLIENT_ID||process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID||process.env.NEXT_PUBLIC_PAYPAL_PLAN1_CLIENT_ID||'');
}
export async function paypalToken(){
 const id=await paypalClientId(),secret=process.env.PAYPAL_CLIENT_SECRET;
 if(!id||!secret)throw new Error('PAYPAL_NOT_CONFIGURED');
 const response=await fetch((await paypalBase())+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',cache:'no-store'});
 if(!response.ok)throw new Error('PAYPAL_AUTH_FAILED');return (await response.json()).access_token as string;
}
export async function paypalRequest(path:string,init:RequestInit={}){
 const response=await fetch((await paypalBase())+path,{...init,headers:{Authorization:'Bearer '+await paypalToken(),'Content-Type':'application/json',...(init.headers||{})},cache:'no-store'});
 const result=await response.json();if(!response.ok)throw new Error(result?.message||'PAYPAL_REQUEST_FAILED');return result;
}
