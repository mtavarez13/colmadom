import { NextRequest,NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError,requireBillingUser } from '@/lib/server-auth';
import { billingState,paymentCoverage } from '@/lib/saas-billing';
import { paypalClientId } from '@/lib/paypal';
export const runtime='nodejs';
const PAYPAL_PLAN1_ID='P-3TB64314LH169562MNLKXWQA';
const santoDomingoDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function GET(request:NextRequest){
 try{
  const {rootColmadoId}=await requireBillingUser(request);
  const [config,store,plans,accounts,clientId]=await Promise.all([
   adminDb.doc('platformConfig/general').get(),adminDb.doc('colmados/'+rootColmadoId).get(),
   adminDb.collection('plans').where('isActive','==',true).get(),adminDb.collection('bankAccounts').where('isActive','==',true).get(),paypalClientId()
  ]);
  const storeData:any={id:store.id,...store.data()},billing=billingState(storeData),quote=paymentCoverage(storeData,1),today=santoDomingoDate(),noticeStartDate=String(storeData.paypalPlan1NoticeStartDate||''),plan1Enabled=storeData.paypalPlan1Enabled===true,configuredPending=storeData.billingPendingInstallments??storeData.paypalPlan1PendingMonths,pendingMonths=Number.isInteger(Number(configuredPending))?Number(configuredPending):billing.monthsOwed,assignedPlan=plans.docs.find(item=>item.id===storeData.planId)?.data(),effectivePaypalPlanId=storeData.paypalPlan1SubscriptionStatus==='ACTIVE'?storeData.paypalPlan1PlanId:assignedPlan?.paypalPlanId||storeData.paypalPlan1PlanId,plan1={enabled:plan1Enabled,noticeStartDate,pendingMonths:Math.max(0,Math.min(24,pendingMonths)),planId:String(effectivePaypalPlanId||PAYPAL_PLAN1_ID),subscriptionId:String(storeData.paypalPlan1SubscriptionId||''),subscriptionStatus:String(storeData.paypalPlan1SubscriptionStatus||''),visible:plan1Enabled&&/^\d{4}-\d{2}-\d{2}$/.test(noticeStartDate)&&noticeStartDate<=today};
  const publicStore={id:store.id,name:storeData.name||'',businessName:storeData.businessName||'',planId:storeData.planId||'',monthlyFee:storeData.monthlyFee||0,billingMonthlyFee:storeData.billingMonthlyFee||0,billingPaypalMonthlyPrice:storeData.billingPaypalMonthlyPrice||0,billingPaypalCurrency:storeData.billingPaypalCurrency||'USD',suspensionNoticeEnabled:storeData.suspensionNoticeEnabled===true,suspensionNoticeMessage:String(storeData.suspensionNoticeMessage||'')};
  return NextResponse.json({paymentMethods:config.data()?.paymentMethods||{bankTransfer:true,paypal:false},paypalClientId:clientId,paypalServerReady:Boolean(process.env.PAYPAL_CLIENT_SECRET),currency:config.data()?.currency||'DOP',
   store:publicStore,billing,quote,plan1,plans:plans.docs.map(d=>({id:d.id,...d.data()})),bankAccounts:accounts.docs.map(d=>({id:d.id,...d.data()}))});
 }catch(error){const f=apiError(error);return NextResponse.json({error:f.message},{status:f.status});}
}
