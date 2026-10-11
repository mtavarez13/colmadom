import { adminDb } from '@/lib/firebase-admin';
import { getMetaConfig,metaGraphBase } from '@/lib/meta-config';

export function normalizeWhatsAppPhone(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? '1' + digits : digits;
}

export function connectionRef(colmadoId: string) {
  return adminDb.doc('whatsappConnections/' + colmadoId);
}

export async function sendWhatsAppText(colmadoId: string, to: string, body: string) {
  const meta=await getMetaConfig(),graphBase=metaGraphBase(meta.graphVersion);
  const connection = (await connectionRef(colmadoId).get()).data();
  if (connection?.status !== 'Connected' || !connection.accessToken || !connection.phoneNumberId)
    throw new Error('Este colmado no tiene un número de WhatsApp conectado.');
  const phone = normalizeWhatsAppPhone(to);
  if (!/^\d{10,15}$/.test(phone)) throw new Error('El teléfono del cliente no es válido.');
  const response = await fetch(graphBase + '/' + connection.phoneNumberId + '/messages', {
    method: 'POST', headers: { Authorization: 'Bearer ' + connection.accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone,
      type: 'text', text: { preview_url: false, body: body.slice(0, 4096) } }), cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || 'Meta rechazó el mensaje.');
  return { messageId: String(result?.messages?.[0]?.id || ''), phone };
}

export async function sendWhatsAppTemplate(colmadoId:string,to:string,templateName:string,language='es',parameters:string[]=[]){
  const meta=await getMetaConfig(),graphBase=metaGraphBase(meta.graphVersion),connection=(await connectionRef(colmadoId).get()).data();
  if(connection?.status!=='Connected'||!connection.accessToken||!connection.phoneNumberId)throw new Error('El canal de WhatsApp de bienvenida no está conectado.');
  const phone=normalizeWhatsAppPhone(to);if(!/^\d{10,15}$/.test(phone))throw new Error('El teléfono del dueño no es válido.');
  const components=parameters.length?[{type:'body',parameters:parameters.map(text=>({type:'text',text:String(text).slice(0,1024)}))}]:undefined;
  const response=await fetch(`${graphBase}/${connection.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${connection.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:phone,type:'template',template:{name:templateName,language:{code:language},...(components?{components}:{})}}),cache:'no-store'}),result=await response.json();
  if(!response.ok)throw new Error(result?.error?.message||'Meta rechazó la plantilla de bienvenida.');
  return{messageId:String(result?.messages?.[0]?.id||''),phone};
}

export async function sendWhatsAppDocument(colmadoId: string, to: string, file: Buffer, filename: string, caption: string) {
  const meta=await getMetaConfig(),graphBase=metaGraphBase(meta.graphVersion);
  const connection=(await connectionRef(colmadoId).get()).data();
  if(connection?.status!=='Connected'||!connection.accessToken||!connection.phoneNumberId)throw new Error('Este colmado no tiene un número de WhatsApp conectado.');
  const phone=normalizeWhatsAppPhone(to);
  if(!/^\d{10,15}$/.test(phone))throw new Error('El teléfono no es válido.');
  const form=new FormData();form.set('messaging_product','whatsapp');form.set('type','application/pdf');form.set('file',new Blob([new Uint8Array(file)],{type:'application/pdf'}),filename);
  const upload=await fetch(`${graphBase}/${connection.phoneNumberId}/media`,{method:'POST',headers:{Authorization:`Bearer ${connection.accessToken}`},body:form,cache:'no-store'}),uploadResult=await upload.json();
  if(!upload.ok||!uploadResult?.id)throw new Error(uploadResult?.error?.message||'Meta rechazó el PDF.');
  const response=await fetch(`${graphBase}/${connection.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${connection.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:phone,type:'document',document:{id:uploadResult.id,filename,caption:caption.slice(0,1024)}}),cache:'no-store'}),result=await response.json();
  if(!response.ok)throw new Error(result?.error?.message||'Meta rechazó el envío del documento.');
  return{messageId:String(result?.messages?.[0]?.id||''),phone};
}

export async function sendWhatsAppAudio(colmadoId:string,to:string,file:Buffer,mimeType:string,filename:string){
  const meta=await getMetaConfig(),graphBase=metaGraphBase(meta.graphVersion),connection=(await connectionRef(colmadoId).get()).data();
  if(connection?.status!=='Connected'||!connection.accessToken||!connection.phoneNumberId)throw new Error('Este colmado no tiene un número de WhatsApp conectado.');
  const phone=normalizeWhatsAppPhone(to);if(!/^\d{10,15}$/.test(phone))throw new Error('El teléfono no es válido.');
  const form=new FormData();form.set('messaging_product','whatsapp');form.set('type',mimeType);form.set('file',new Blob([new Uint8Array(file)],{type:mimeType}),filename);
  const upload=await fetch(`${graphBase}/${connection.phoneNumberId}/media`,{method:'POST',headers:{Authorization:`Bearer ${connection.accessToken}`},body:form,cache:'no-store'}),uploadResult=await upload.json();
  if(!upload.ok||!uploadResult?.id)throw new Error(uploadResult?.error?.message||'Meta rechazó el audio.');
  const response=await fetch(`${graphBase}/${connection.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${connection.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:phone,type:'audio',audio:{id:uploadResult.id}}),cache:'no-store'}),result=await response.json();
  if(!response.ok)throw new Error(result?.error?.message||'Meta rechazó la nota de voz.');
  return{messageId:String(result?.messages?.[0]?.id||''),phone};
}
