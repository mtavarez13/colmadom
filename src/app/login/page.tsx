"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { browserLocalPersistence, createUserWithEmailAndPassword, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithCustomToken, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Chrome, Loader2, Lock, Mail, ShoppingCart, User } from "lucide-react";
import { useAuth, useFirestore, useUser } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const SUPER_ADMINS = new Set(["admin@colmadom.com","martin.tavarez.gomez@gmail.com","tavarezgomezmartin@gmail.com"]);

export default function LoginPage() {
  const auth=useAuth(), db=useFirestore(), { user,isUserLoading }=useUser();
  const router=useRouter(), { toast }=useToast();
  const [register,setRegister]=useState(false), [name,setName]=useState(""), [email,setEmail]=useState(""), [password,setPassword]=useState(""), [busy,setBusy]=useState(false);
  const [accountantMode,setAccountantMode]=useState(false),[acceptedTerms,setAcceptedTerms]=useState(false);
  useEffect(()=>{const mode=new URLSearchParams(window.location.search).get("mode");setRegister(mode==="register");setAccountantMode(mode==="accountant");},[]);
  useEffect(()=>{ void setPersistence(auth,browserLocalPersistence); },[auth]);
  useEffect(()=>{
    if(!isUserLoading&&user){
      void redirectUser(user.uid,user.email).catch(error=>{
        console.error('No se pudo completar la redirección de acceso:',error);
        toast({variant:'destructive',title:'No se pudo abrir tu cuenta',description:'Actualiza la página e inténtalo nuevamente.'});
      });
    }
  },[isUserLoading,user?.uid]);

  async function bootstrap(currentUser: typeof auth.currentUser, displayName?: string, accountType?:string) {
    if(!currentUser) throw new Error("No se pudo identificar la cuenta.");
    const response=await fetch("/api/auth/bootstrap",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+await currentUser.getIdToken()},body:JSON.stringify({name:displayName||currentUser.displayName||"",accountType})});
    const result=await response.json();
    if(!response.ok){
      if(accountType==='independent-accountant')throw new Error(result.error||'No se pudo registrar el contador con Google.');
      if(response.status<500)throw new Error(result.error||"No se pudo preparar tu cuenta.");
      const ref=doc(db,"userProfiles",currentUser.uid),existing=await getDoc(ref),now=new Date().toISOString();
      if(!existing.exists())await setDoc(ref,{id:currentUser.uid,firstName:(displayName||currentUser.displayName||currentUser.email?.split("@")[0]||"Dueño").split(" ")[0],lastName:"",email:currentUser.email?.toLowerCase()||"",role:"Admin",roleCode:"OWNER",isActive:true,registrationMethod:currentUser.providerData.some(p=>p.providerId==="google.com")?"Google":"Email",subscriptionStatus:"PRUEBA",createdAt:now,updatedAt:now,lastLoginAt:now});
      else await setDoc(ref,{lastLoginAt:now,updatedAt:now},{merge:true});
    }
  }
  async function redirectUser(uid:string,currentEmail:string|null) {
    if(currentEmail&&SUPER_ADMINS.has(currentEmail.toLowerCase())){router.replace("/admin");return;}
    const profile=await getDoc(doc(db,"userProfiles",uid)); if(!profile.exists())return;
    const data=profile.data();
    if(data.role==="Driver")router.replace("/driver"); else if(data.role==="Cajero")router.replace("/pos"); else if(data.role==="ContableIndependiente")router.replace("/independent-audits"); else if(!data.colmadoId)router.replace("/onboarding");
    else if(["Admin","Contable"].includes(data.role)&&data.allowedColmadoIds?.length>1)router.replace("/select-branch"); else if(data.role==="Contable")router.replace("/reports"); else router.replace("/minimarket");
  }
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);
    try {
      const identifier=email.trim();
      const isEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      if(!register&&!isEmail){
        const response=await fetch('/api/phone-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',phone:identifier,password})});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||'No se pudo iniciar sesión.');
        const credential=await signInWithCustomToken(auth,result.token);
        await redirectUser(credential.user.uid,credential.user.email);
        return;
      }
      if(register){
        if(!isEmail)throw new Error("Escribe un correo electrónico válido para crear tu cuenta.");
        if(!acceptedTerms)throw new Error("Debes aceptar los términos y condiciones.");
        if(name.trim().length<2)throw new Error("Escribe tu nombre.");
        if(password.length<8)throw new Error("La contraseña debe tener al menos 8 caracteres.");
        const credential=await createUserWithEmailAndPassword(auth,email.trim().toLowerCase(),password);
        await sendEmailVerification(credential.user);await signOut(auth);
        toast({title:"Revisa tu correo",description:"Enviamos el enlace de verificación. Después podrás iniciar sesión."});setRegister(false);setPassword("");
      }else{
        const credential=await signInWithEmailAndPassword(auth,identifier.toLowerCase(),password);
        const existingProfile=await getDoc(doc(db,"userProfiles",credential.user.uid));
        if(!existingProfile.exists())await bootstrap(credential.user);
        await redirectUser(credential.user.uid,credential.user.email);
      }
    }catch(error:any){
      const code=String(error?.code||"");
      const friendly=code.includes("email-already-in-use")?"Este correo ya tiene una cuenta.":code.includes("invalid-credential")?"Correo o contraseña incorrectos.":code.includes("invalid-email")?"Escribe un correo válido.":code.includes("too-many-requests")?"Demasiados intentos. Inténtalo más tarde.":error?.message||"No se pudo completar el acceso.";
      toast({variant:"destructive",title:"No se pudo continuar",description:friendly});
    }finally{setBusy(false);}
  }
  async function google(){
    if((accountantMode||register)&&!acceptedTerms){toast({variant:"destructive",title:"Aceptación requerida",description:"Debes aceptar los términos y condiciones."});return;}setBusy(true);try{const credential=await signInWithPopup(auth,new GoogleAuthProvider());await bootstrap(credential.user,credential.user.displayName||undefined,accountantMode?'independent-accountant':undefined);await redirectUser(credential.user.uid,credential.user.email);}
    catch(error:any){toast({variant:"destructive",title:"Acceso con Google",description:error?.message||"No se pudo continuar."});}finally{setBusy(false);}
  }
  async function resetPassword(){
    if(!email.trim()){toast({title:"Escribe tu correo",description:"Lo usaremos para enviarte el enlace."});return;}
    try{await sendPasswordResetEmail(auth,email.trim().toLowerCase());toast({title:"Correo enviado",description:"Revisa tu bandeja para cambiar la contraseña."});}
    catch{toast({variant:"destructive",title:"No se pudo enviar",description:"Comprueba el correo e inténtalo otra vez."});}
  }
  if(isUserLoading)return <div className="min-h-svh grid place-items-center"><Loader2 className="animate-spin text-primary"/></div>;
  return <main className="min-h-svh overflow-y-auto grid place-items-center bg-gradient-to-br from-black via-zinc-950 to-purple-950 p-4"><div className="w-full max-w-sm space-y-3">
    <div className="text-center"><div className="mx-auto h-12 w-12 rounded-xl bg-primary text-white grid place-items-center shadow-lg"><ShoppingCart/></div><h1 className="mt-2 text-2xl font-black text-primary">COLMADOM CLOUD</h1><p className="text-xs font-bold text-muted-foreground">Gestión para tu negocio</p></div>
    <Card className="rounded-2xl border border-purple-400/30 shadow-2xl shadow-purple-900/40"><CardHeader className="px-5 pt-5 pb-2"><CardTitle>{accountantMode?'Registro exclusivo para contadores':register?"Crear una cuenta":"Iniciar sesión"}</CardTitle><CardDescription>{accountantMode?'Accede únicamente con tu cuenta de Google. El administrador habilitará el módulo de inventarios independientes.':register?"Comienza tu período de prueba.":"Accede a tu panel."}</CardDescription></CardHeader>
      <CardContent className="p-5 pt-3 space-y-3">{!accountantMode&&<form onSubmit={submit} className="space-y-3">
        {register&&<div><Label>Nombre</Label><div className="relative"><User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="h-10 pl-10" value={name} onChange={e=>setName(e.target.value)} required/></div></div>}
        <div><Label>{register?'Correo electrónico':'Correo electrónico o teléfono'}</Label><div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input type={register?'email':'text'} inputMode={register?'email':'text'} autoComplete={register?'email':'username'} placeholder={register?'nombre@correo.com':'nombre@correo.com o 8095551234'} className="h-10 pl-10" value={email} onChange={e=>setEmail(e.target.value)} required/></div></div>
        <div><Label>Contraseña</Label><div className="relative"><Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input type="password" autoComplete={register?"new-password":"current-password"} className="h-10 pl-10" value={password} onChange={e=>setPassword(e.target.value)} required/></div></div>
        {!register&&(!email.trim()||email.includes('@'))&&<button type="button" onClick={resetPassword} className="text-xs font-bold text-primary hover:underline">¿Olvidaste tu contraseña?</button>}
        {register&&<label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" className="mt-1" checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)}/><span>Acepto los <Link href="/terminos" target="_blank" className="font-bold text-primary underline">términos y condiciones</Link> y el tratamiento de datos descrito.</span></label>}
        <Button className="w-full h-11 font-black" disabled={busy||(register&&!acceptedTerms)}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{register?"CREAR CUENTA":"INICIAR SESIÓN"}</Button>
      </form>}
      {accountantMode&&<label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" className="mt-1" checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)}/><span>Acepto los <Link href="/terminos" target="_blank" className="font-bold text-purple-700 underline">términos y condiciones</Link>.</span></label>}
      <Button type="button" variant={accountantMode?'default':'outline'} className="w-full h-12 font-bold bg-purple-600 hover:bg-purple-500 text-white border-purple-400" onClick={google} disabled={busy||(accountantMode&&!acceptedTerms)}><Chrome className="mr-2 h-4 w-4"/>{accountantMode?'Registrarme como contador con Google':'Continuar con Google'}</Button>
      {!accountantMode&&<button onClick={()=>{setRegister(v=>!v);setPassword("");setEmail("");}} className="w-full text-center text-sm font-bold text-primary hover:underline">{register?"Ya tengo una cuenta":"Crear una cuenta"}</button>}
      {accountantMode&&<button onClick={()=>{setAccountantMode(false);router.replace('/login');}} className="w-full text-center text-sm font-bold text-purple-700 hover:underline">Volver al acceso general</button>}
      {!register&&!accountantMode&&<p className="text-center text-[10px] text-muted-foreground">Puedes entrar con tu correo o teléfono registrado. Al utilizar Colmadom Cloud aceptas nuestros <Link href="/terminos" className="underline">términos y condiciones</Link>.</p>}
      </CardContent></Card>
  </div></main>;
}

