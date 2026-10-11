'use server';
import {ai} from '@/ai/genkit';
import {z} from 'genkit';
const Input=z.object({audioDataUri:z.string()});
const Output=z.object({text:z.string()});
const prompt=ai.definePrompt({name:'transcribeWhatsAppOrderAudio',input:{schema:Input},output:{schema:Output},prompt:'Transcribe exactamente esta nota de voz en español dominicano. Devuelve solamente el texto hablado, conservando productos y cantidades. Audio: {{media url=audioDataUri}}'});
export async function transcribeOrderAudio(audioDataUri:string){const{output}=await prompt({audioDataUri});return output?.text?.trim()||'';}
