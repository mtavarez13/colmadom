import type { DocumentReference } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { normalizeWhatsAppPhone, sendWhatsAppAudio, sendWhatsAppText } from '@/lib/whatsapp-cloud';
import {synthesizeSpanishVoice} from '@/lib/gemini-tts';
import { getMetaConfig,metaGraphBase } from '@/lib/meta-config';
import { transcribeOrderAudio } from '@/ai/flows/transcribe-order-audio';

export const runtime = 'nodejs';

function channelFromRequest(request:NextRequest){
  const queryChannel=String(request.nextUrl.searchParams.get('channel')||'').trim();
  if(queryChannel)return queryChannel;
  const match=request.nextUrl.pathname.match(/^\/wa\/([^/]+)\/?$/);
  return match?decodeURIComponent(match[1]):'';
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams;
  const requestedToken=url.get('hub.verify_token')||'',channel=channelFromRequest(request),globalToken=(await getMetaConfig()).verifyToken;
  let valid=false;
  if(channel&&requestedToken){const selected=await adminDb.doc(`whatsappConnections/${channel}`).get();valid=selected.exists&&requestedToken===String(selected.data()?.webhookVerifyToken||'');}
  if(!channel)valid=!!globalToken&&requestedToken===globalToken;
  if(!valid&&requestedToken){const matches=await adminDb.collection('whatsappConnections').where('webhookVerifyToken','==',requestedToken).limit(1).get();valid=!matches.empty;}
  if (valid && url.get('hub.mode') === 'subscribe')
    return new NextResponse(url.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  return new NextResponse('Verificación inválida', { status: 403 });
}

const normalizeOrderText=(value:unknown)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

async function sendBotReply(colmadoId:string,connectionDoc:any,connection:any,to:string,body:string){
  let sent:any=null,mediaType='text',voiceError='';
  if(connection.voiceRepliesEnabled===true){try{const audio=await synthesizeSpanishVoice(body,String(connection.voiceName||'Aoede'));sent=await sendWhatsAppAudio(colmadoId,to,audio.buffer,audio.mimeType,audio.filename);mediaType='audio';}catch(error){voiceError=error instanceof Error?error.message:'No se pudo generar la voz.';await connectionDoc.ref.set({lastVoiceError:voiceError,lastVoiceErrorAt:new Date().toISOString()},{merge:true});}}
  if(!sent)sent=await sendWhatsAppText(colmadoId,to,body);
  const now=new Date().toISOString(),messageId=sent.messageId||`bot_${Date.now()}`,contact=connectionDoc.ref.collection('inbox').doc(to);
  await Promise.all([contact.set({phoneNumber:to,lastMessage:mediaType==='audio'?'🎤 '+body:body,lastMessageAt:now},{merge:true}),contact.collection('messages').doc(messageId).set({id:messageId,metaMessageId:sent.messageId,body,direction:'Outbound',status:'Sent',automatic:true,mediaType,voiceFallbackError:voiceError,createdAt:now},{merge:true})]);
  return sent;
}

async function orderBot(colmadoId:string,connectionDoc:any,connection:any,from:string,text:string,metaMessageId:string){if(connection.orderBotEnabled!==true||!text)return;const stableOrderId='wa_'+createHash('sha256').update(colmadoId+':'+metaMessageId).digest('hex');if((await adminDb.doc(`colmados/${colmadoId}/orders/${stableOrderId}`).get()).exists)return;const sessionRef=connectionDoc.ref.collection('botSessions').doc(from),session=(await sessionRef.get()).data()||{},normalized=text.trim(),reply=(body:string)=>sendBotReply(colmadoId,connectionDoc,connection,from,body);if(session.state==='AwaitingDetails'){const parts=normalized.split('|').map((part:string)=>part.trim()),paid=Number((parts[0]||'').replace(/[^0-9.]/g,'')),address=parts[1]||'',name=parts[2]||'';if(!Number.isFinite(paid)||paid<=0||paid>1000000||!address||address.length>500||!name||name.length>120){await reply('Para completar responde así: PAGAS 1000 | Calle y sector | Nombre del cliente');return;}const stockChecks=await Promise.all((session.items||[]).map(async(item:any)=>({item,snapshot:await adminDb.doc(`colmados/${colmadoId}/products/${item.productId}`).get()}))),unavailable=stockChecks.filter(({item,snapshot}:any)=>!snapshot.exists||Number(snapshot.data()?.quantityInStock||0)<Number(item.quantity||0));if(unavailable.length){await sessionRef.delete();await reply(`El inventario cambió y ya no hay cantidad suficiente de: ${unavailable.map(({item}:any)=>item.productName).join(', ')}. Envíame el pedido nuevamente.`);return;}const total=Number(session.total||0),orderRef=adminDb.collection(`colmados/${colmadoId}/orders`).doc(stableOrderId),now=new Date().toISOString();
await adminDb.runTransaction(async tx=>{
  const existing=await tx.get(orderRef);if(existing.exists)return;
  const current=(await tx.get(sessionRef as DocumentReference)).data();
  if(!current || current.state!=='AwaitingDetails' || current.updatedAt!==session.updatedAt)throw new Error('La sesión del pedido cambió. Inténtalo nuevamente.');
  const store=(await tx.get(adminDb.doc(`colmados/${colmadoId}`))).data();
  if(!store)throw new Error('Sucursal inexistente');
  const plan=store.rootColmadoId&&store.rootColmadoId!==colmadoId?(await tx.get(adminDb.doc(`colmados/${store.rootColmadoId}`))).data():store;
  const expiry=Number(plan?.trialEndAtMillis)||Date.parse(plan?.trialEndDate||'');
  if(!plan || (plan.subscriptionStatus!=='Active' && !(plan.subscriptionStatus==='Trial'&&Number.isFinite(expiry)&&expiry>Date.now())))throw new Error('Sucursal sin suscripción activa');
  if(!Array.isArray(current.items)||!current.items.length||current.items.length>80)throw new Error('Pedido inválido');
  const products=await Promise.all(current.items.map((item:any)=>tx.get(adminDb.doc(`colmados/${colmadoId}/products/${item.productId}`))));
  let serverTotal=0;
  for(let i=0;i<products.length;i++){const item=current.items[i],product=products[i].data();
    if(!product || !(Number(item.quantity)>0) || Number(product.quantityInStock||0)<Number(item.quantity) || Number(product.salePrice)!==Number(item.unitPrice))throw new Error('El precio o inventario cambió. Envía el pedido nuevamente.');
    serverTotal+=Number(item.quantity)*Number(product.salePrice);
  }
  if(Math.abs(serverTotal-total)>0.01 || !Number.isFinite(serverTotal))throw new Error('Total inválido');
  tx.create(orderRef,{id:orderRef.id,colmadoId,source:'whatsapp-bot',customerName:name,customerPhone:from,customerAddress:address,customerNotes:'Pedido confirmado por WhatsApp',subtotalAmount:total,deliveryFee:0,totalAmount:total,paymentExpected:paid,changeDue:Math.max(0,paid-total),status:'Pending',createdAt:now,updatedAt:now});
  for(let i=0;i<current.items.length;i++){const item=current.items[i],ref=orderRef.collection('items').doc('item_'+i);tx.create(ref,{id:ref.id,orderId:orderRef.id,productId:item.productId,productName:item.productName,quantity:item.quantity,unitPrice:item.unitPrice,lineTotal:Number(item.quantity)*Number(item.unitPrice),isBreakdown:false});}
  tx.create(adminDb.doc(`mobileOrderOutbox/${stableOrderId}`),{colmadoId,orderId:orderRef.id,source:'whatsapp-bot',createdAt:now,status:'pending'});
  tx.delete(sessionRef);
});await reply(`Pedido ${orderRef.id.slice(-6)} creado. Total RD$${total.toLocaleString('es-DO')}. Pagarás RD$${paid.toLocaleString('es-DO')} y tu devuelta será RD$${Math.max(0,paid-total).toLocaleString('es-DO')}. Dirección: ${address}. Nombre: ${name}.`);return;}if(session.state==='AwaitingConfirmation'){if(!/^(confirmar|confirmo|si|sí|correcto)$/i.test(normalized)){await sessionRef.delete();await reply('Pedido cancelado. Envíame nuevamente los productos cuando quieras.');return;}await sessionRef.set({state:'AwaitingDetails',updatedAt:new Date().toISOString()},{merge:true});await reply(`Pedido confirmado por RD$${Number(session.total||0).toLocaleString('es-DO')}. Responde: PAGAS 1000 | Dirección completa | Nombre del cliente`);return;}const products=(await adminDb.collection(`colmados/${colmadoId}/products`).where('quantityInStock','>',0).limit(500).get()).docs.map(doc=>({id:doc.id,...doc.data()} as any)),lower=normalizeOrderText(normalized),items=products.filter(product=>{const name=normalizeOrderText(product.name),barcode=String(product.barcode||'').trim(),tokens=name.split(' ').filter((token:string)=>token.length>2);return name.length>2&&(lower.includes(name)||(tokens.length>0&&tokens.every((token:string)=>lower.includes(token)))||(barcode.length>5&&lower.includes(barcode)))}).slice(0,20).map(product=>{const productName=normalizeOrderText(product.name),firstToken=productName.split(' ')[0]||productName,index=Math.max(lower.indexOf(productName),lower.indexOf(firstToken)),prefix=lower.slice(Math.max(0,index-12),Math.max(0,index)),match=prefix.match(/(\d+(?:\.\d+)?)\s*(?:x|de)?\s*$/),requested=Math.max(1,Number(match?.[1]||1)),quantity=Math.min(requested,Number(product.quantityInStock||0)),unitPrice=Number(product.salePrice||0);return{productId:product.id,productName:product.name,quantity,availableStock:Number(product.quantityInStock||0),unitPrice,lineTotal:quantity*unitPrice}}).filter(item=>item.quantity>0);if(!items.length){const suggestions=products.slice(0,8).map(product=>String(product.name||'')).filter(Boolean).join(', ');await reply(suggestions?`No pude identificar productos disponibles en tu mensaje. Puedes pedir, por ejemplo: ${suggestions}.`:'En este momento no encuentro productos disponibles en el inventario.');return;}const total=items.reduce((sum,item)=>sum+item.lineTotal,0),summary=items.map(item=>`${item.quantity} x ${item.productName}: RD$${item.lineTotal.toLocaleString('es-DO')}`).join('\n');await sessionRef.set({state:'AwaitingConfirmation',items,total,originalText:normalized,updatedAt:new Date().toISOString()});await reply(`Preparé este pedido con el inventario disponible:\n${summary}\nTOTAL: RD$${total.toLocaleString('es-DO')}\nResponde CONFIRMAR para continuar o cualquier otra cosa para cancelar.`)}

async function messageBody(message:any,connection:any){if(message?.type==='text')return String(message?.text?.body||'');if(message?.type==='audio'&&message?.audio?.id&&connection?.accessToken){try{const meta=await getMetaConfig(),base=metaGraphBase(meta.graphVersion),infoResponse=await fetch(`${base}/${message.audio.id}`,{headers:{Authorization:`Bearer ${connection.accessToken}`}}),info=await infoResponse.json();if(!infoResponse.ok||!info.url)return'[Nota de voz no disponible]';const audioResponse=await fetch(info.url,{headers:{Authorization:`Bearer ${connection.accessToken}`}}),buffer=Buffer.from(await audioResponse.arrayBuffer()),mime=audioResponse.headers.get('content-type')||message.audio.mime_type||'audio/ogg',text=await transcribeOrderAudio(`data:${mime};base64,${buffer.toString('base64')}`);return text||'[Nota de voz sin texto]';}catch(error){console.error('WhatsApp audio transcription failed',error);return'[No se pudo transcribir la nota de voz]'}}return message?.type==='image'?'[Imagen]':`[Mensaje ${String(message?.type||'recibido')}]`}

async function receiveMessage(value: any, message: any, allowAutoReply = true, resolvedConnectionDoc?:any) {
  const phoneNumberId = String(value?.metadata?.phone_number_id || '');
  const from = normalizeWhatsAppPhone(message?.from || '');
  const metaMessageId = String(message?.id || '');
  if (!/^\d+$/.test(phoneNumberId) || !/^\d{10,15}$/.test(from) || !metaMessageId) return;
  const connections = resolvedConnectionDoc?null:await adminDb.collection('whatsappConnections').where('phoneNumberId', '==', phoneNumberId).limit(1).get();
  if (!resolvedConnectionDoc&&connections!.empty) return;
  const connectionDoc = resolvedConnectionDoc||connections!.docs[0];
  const connection = connectionDoc.data();
  if (connection.status !== 'Connected' || phoneNumberId !== String(connection.phoneNumberId || '')) return;
  const colmadoId = connectionDoc.id;
  const eventRef = connectionDoc.ref.collection('inboundEvents').doc(metaMessageId);
  const claimed=await adminDb.runTransaction(async tx=>{
    const previous=await tx.get(eventRef as DocumentReference),data=previous.data();
    if(data?.processed===true)return false;
    if(Number(data?.leaseUntil)>Date.now())throw new Error('Evento en procesamiento; reintentar.');
    tx.set(eventRef,{from,type:String(message.type||''),receivedAt:data?.receivedAt||new Date().toISOString(),leaseUntil:Date.now()+120000,processed:false},{merge:true});return true;
  });
  if(!claimed)return;
  const body = await messageBody(message,connection);
  const inboxContactRef=connectionDoc.ref.collection('inbox').doc(from);
  const inboundAt=new Date().toISOString();
  await Promise.all([inboxContactRef.set({phoneNumber:from,displayName:String(value?.contacts?.[0]?.profile?.name||('WhatsApp '+from.slice(-4))),lastMessage:body,lastMessageAt:inboundAt,unreadCount:1},{merge:true}),connectionDoc.ref.set({lastInboundAt:inboundAt,lastInboundPhone:from,lastInboundMessageId:metaMessageId,lastBotError:''},{merge:true})]);
  await inboxContactRef.collection('messages').doc(metaMessageId).set({id:metaMessageId,metaMessageId,body,direction:'Inbound',senderPhone:from,status:'Received',createdAt:new Date().toISOString()},{merge:true});
  const candidates = Array.from(new Set([from, from.startsWith('1') ? from.slice(1) : from, '+' + from]));
  let customers = await adminDb.collection('colmados/' + colmadoId + '/customers').where('phoneNumber', 'in', candidates).limit(1).get();
  if (customers.empty) {
    const customerRef = adminDb.collection('colmados/' + colmadoId + '/customers').doc('wa_' + from);
    await customerRef.set({id:customerRef.id,firstName:'WhatsApp',lastName:from.slice(-4),phoneNumber:from,currentDebt:0,source:'WhatsApp',isActive:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{merge:true});
    customers = await adminDb.collection('colmados/' + colmadoId + '/customers').where('phoneNumber', '==', from).limit(1).get();
  }
  if (!customers.empty) {
    await customers.docs[0].ref.collection('messages').doc(metaMessageId).set({
      id: metaMessageId, metaMessageId, body, direction: 'Inbound', senderPhone: from,
      status: 'Received', createdAt: new Date().toISOString()
    }, { merge: true });
  }
  try{await orderBot(colmadoId,connectionDoc,connection,from,body,metaMessageId)}catch(error){console.error('WhatsApp order bot failed',error);await connectionDoc.ref.set({lastBotError:error instanceof Error?error.message:'No se pudo procesar el pedido.',lastBotErrorAt:new Date().toISOString()},{merge:true});await eventRef.set({leaseUntil:0},{merge:true});throw error;}
  await eventRef.set({processed:true,processedAt:new Date().toISOString()},{merge:true});
  if (!allowAutoReply || !connection.autoReplyEnabled || !connection.welcomeMessage) return;
  const contactRef = connectionDoc.ref.collection('contacts').doc(from);
  const shouldReply = await adminDb.runTransaction(async transaction => {
    const contact = await transaction.get(contactRef as DocumentReference);
    const last = Number(contact.data()?.lastAutoReplyMillis || 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) return false;
    transaction.set(contactRef, { lastAutoReplyMillis: Date.now() }, { merge: true });
    return true;
  });
  if (!shouldReply) return;
  try {
    const sent = await sendWhatsAppText(colmadoId, from, connection.welcomeMessage);
    if (!customers.empty) {
      await customers.docs[0].ref.collection('messages').doc(sent.messageId || 'auto_' + metaMessageId).set({
        id: sent.messageId || 'auto_' + metaMessageId, metaMessageId: sent.messageId,
        body: connection.welcomeMessage, direction: 'Outbound', status: 'Sent', automatic: true,
        createdAt: new Date().toISOString()
      });
    }
  } catch (error) { console.error('WhatsApp auto reply failed', error); }
}

async function receiveStatus(value:any,status:any,resolvedConnectionDoc?:any){const phoneNumberId=String(value?.metadata?.phone_number_id||''),metaMessageId=String(status?.id||''),recipient=normalizeWhatsAppPhone(status?.recipient_id||'');if(!metaMessageId)return;const connections=resolvedConnectionDoc?null:phoneNumberId?await adminDb.collection('whatsappConnections').where('phoneNumberId','==',phoneNumberId).limit(1).get():null,connectionDoc=resolvedConnectionDoc||connections?.docs[0];if(!connectionDoc)return;const mapped=String(status?.status||'').toLowerCase()==='read'?'Read':String(status?.status||'').toLowerCase()==='delivered'?'Delivered':String(status?.status||'').toLowerCase()==='failed'?'Failed':'Sent',update={status:mapped,statusUpdatedAt:new Date().toISOString(),error:status?.errors?.[0]?.title||''};if(recipient)await connectionDoc.ref.collection('inbox').doc(recipient).collection('messages').doc(metaMessageId).set(update,{merge:true});try{const matches=await adminDb.collectionGroup('messages').where('metaMessageId','==',metaMessageId).limit(20).get();await Promise.all(matches.docs.map(doc=>doc.ref.set(update,{merge:true})));}catch(error){console.error('WhatsApp status sync failed',error)}}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-hub-signature-256') || '';
  const raw = await request.text();
  let received:any;
  try{received=JSON.parse(raw);}catch{return new NextResponse('JSON inválido',{status:400});}
  const payload=received?.meta_payload?.object==='whatsapp_business_account'?received.meta_payload:received;
  const phoneNumberId=String(received?.phone_number_id||payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id||'');
  const channel=channelFromRequest(request);
  const selected=channel?await adminDb.doc(`whatsappConnections/${channel}`).get():null;
  const wabaId=String(received?.data?.whatsapp_business_account_id||payload?.entry?.[0]?.id||'');
  const queryToken=request.nextUrl.searchParams.get('token')||'';
  const queried=!selected?.exists&&phoneNumberId?(await adminDb.collection('whatsappConnections').where('phoneNumberId','==',phoneNumberId).limit(1).get()):null;
  const queriedWaba=!selected?.exists&&queried?.empty&&wabaId?(await adminDb.collection('whatsappConnections').where('wabaId','==',wabaId).limit(1).get()):null;
  const queriedToken=!selected?.exists&&queried?.empty&&queriedWaba?.empty&&queryToken?(await adminDb.collection('whatsappConnections').where('webhookVerifyToken','==',queryToken).limit(1).get()):null;
  const connectionDoc=selected?.exists?selected:(!queried?.empty?queried!.docs[0]:(!queriedWaba?.empty?queriedWaba!.docs[0]:(!queriedToken?.empty?queriedToken!.docs[0]:null)));
  const connectionData=connectionDoc?.data()||null;
  const secret=connectionData?String(connectionData.appSecret||''):(await getMetaConfig()).appSecret;
  const tokenAuthorized=!!connectionData?.webhookVerifyToken&&queryToken===String(connectionData.webhookVerifyToken);
  const eventType=String(received?.event_type||'').toLowerCase();
  const relayWaba=wabaId;
  const phoneMatches=!!connectionData&&!!phoneNumberId&&phoneNumberId===String(connectionData.phoneNumberId||'');
  const wabaMatches=!!connectionData&&!!relayWaba&&relayWaba===String(connectionData.wabaId||'');
  // Proveedores intermediarios agregan nombres como status_update o smb_message.
  // La autorización depende de los identificadores del canal, no de una lista frágil de eventos.
  const relayAuthorized=!!eventType&&(phoneMatches||wabaMatches)&&received?.meta_payload?.object==='whatsapp_business_account';
  let signatureAuthorized=false;
  if(secret&&/^sha256=[0-9a-f]{64}$/.test(signature)){
    const expected=createHmac('sha256',secret).update(raw).digest('hex');
    signatureAuthorized=timingSafeEqual(Buffer.from(signature.slice(7),'hex'),Buffer.from(expected,'hex'));
  }
  const relayEventId=String(received?.id||received?.event_id||'').slice(0,180),eventRef=connectionDoc?connectionDoc.ref.collection('webhookEvents').doc(relayEventId||adminDb.collection('_').doc().id):null;
  if(!signatureAuthorized&&!tokenAuthorized){
    if(eventRef)await eventRef.set({eventType:eventType||'unknown',phoneNumberId,receivedAt:new Date().toISOString(),processed:false,status:'Rejected',error:'No coincidió la firma, el token ni los identificadores del canal.'},{merge:true}).catch(()=>undefined);
    return new NextResponse('Firma o token inválido',{status:403});
  }
  if(eventRef)await eventRef.set({eventType:eventType||'meta_webhook',phoneNumberId,receivedAt:new Date().toISOString(),processed:false,status:'Received',wabaId:relayWaba,hasMessages:Array.isArray(payload?.entry?.[0]?.changes?.[0]?.value?.messages),hasStatuses:Array.isArray(payload?.entry?.[0]?.changes?.[0]?.value?.statuses)},{merge:true});
  try {
    if(connectionDoc){const webhookAt=new Date().toISOString();await connectionDoc.ref.set({lastWebhookAt:webhookAt,lastWebhookEventType:eventType||'meta_webhook',lastWebhookPhoneNumberId:phoneNumberId,lastWebhookError:''},{merge:true});}
    if(eventType.includes('echo')||eventType==='http_error'){if(eventRef)await eventRef.set({processed:true,status:'Ignored',reason:eventType,processedAt:new Date().toISOString()},{merge:true});return NextResponse.json({ok:true,ignored:eventType});}
    if (payload?.object !== 'whatsapp_business_account') {if(eventRef)await eventRef.set({processed:true,status:'Ignored',reason:'Evento sin objeto WhatsApp Business Account',processedAt:new Date().toISOString()},{merge:true});return NextResponse.json({ ok: true });}
    for (const entry of payload.entry || [])
      for (const change of entry.changes || [])
        {for (const message of change.value?.messages || []) await receiveMessage(change.value, message, signatureAuthorized||tokenAuthorized,connectionDoc);for(const status of change.value?.statuses||[])await receiveStatus(change.value,status,connectionDoc);}
    if(eventRef)await eventRef.set({processed:true,status:'Processed',processedAt:new Date().toISOString()},{merge:true});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('WhatsApp webhook processing failed', error);
    const detail=error instanceof Error?error.message:'Error desconocido';
    if(eventRef)await eventRef.set({processed:false,status:'Failed',error:detail.slice(0,500),failedAt:new Date().toISOString()},{merge:true}).catch(()=>undefined);
    if(connectionDoc)await connectionDoc.ref.set({lastWebhookError:detail.slice(0,500),lastWebhookFailedAt:new Date().toISOString()},{merge:true}).catch(()=>undefined);
    return NextResponse.json({ error: 'No se pudo procesar el webhook.', detail }, { status: 500 });
  }
}

