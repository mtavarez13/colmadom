type SynthesizedAudio={buffer:Buffer;mimeType:string;filename:string};

export async function synthesizeSpanishVoice(text:string,voice='Aoede'):Promise<SynthesizedAudio>{
  const apiKey=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||process.env.GOOGLE_GENAI_API_KEY||'';
  if(!apiKey)throw new Error('Configura GEMINI_API_KEY en las variables de entorno de Hostinger.');
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},cache:'no-store',
    body:JSON.stringify({model:'gemini-3.8-flash-lite-tts',input:[{type:'user_input',content:[{type:'text',text:text.slice(0,1800),annotations:[{type:'speech_metadata',style:'Voz femenina, cálida y profesional, español dominicano natural, ritmo claro y amable.'}]}]}],response_format:{type:'audio',mime_type:'audio/mpeg'},generation_config:{speech_config:[{voice}]}})
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result?.error?.message||'Gemini no pudo generar la nota de voz.');
  const blocks=(result?.steps||[]).flatMap((step:any)=>Array.isArray(step?.content)?step.content:[]),audio=[...blocks].reverse().find((item:any)=>item?.type==='audio'&&item?.data),data=audio?.data||result?.output_audio?.data,mimeType=String(audio?.mime_type||result?.output_audio?.mime_type||'audio/mpeg');
  if(!data)throw new Error('Gemini no devolvió contenido de audio.');
  return{buffer:Buffer.from(data,'base64'),mimeType,filename:mimeType.includes('wav')?'respuesta.wav':mimeType.includes('ogg')?'respuesta.ogg':'respuesta.mp3'};
}
