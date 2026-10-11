"use client";

import {useEffect,useRef} from 'react';
import {useUser} from '@/firebase';
import {useToast} from '@/hooks/use-toast';

export function useWhatsAppPosNotifications(){
  const{user}=useUser();const{toast}=useToast();const baseline=useRef('');
  useEffect(()=>{if(!user)return;let active=true;
    const poll=async()=>{try{const response=await fetch('/api/whatsapp/pos-notifications',{headers:{Authorization:`Bearer ${await user.getIdToken()}`},cache:'no-store'}),data=await response.json();if(!active||!response.ok||!data.enabled)return;const newest=data.messages?.[0];if(!newest?.createdAt)return;if(!baseline.current){baseline.current=newest.createdAt;return;}if(newest.createdAt>baseline.current){baseline.current=newest.createdAt;toast({title:`Nuevo WhatsApp · ${newest.displayName}`,description:String(newest.body||'Mensaje recibido').slice(0,180)});}}catch{/* El CRM muestra el diagnóstico completo. */}};
    void poll();const timer=setInterval(()=>void poll(),5000);return()=>{active=false;clearInterval(timer)};
  },[user?.uid,toast]);
}
