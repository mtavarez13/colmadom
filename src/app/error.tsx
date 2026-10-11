"use client";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{console.error("Colmadom module error",error);},[error]);
 return <main className="min-h-[70vh] grid place-items-center p-6"><div className="max-w-md text-center space-y-4"><AlertTriangle className="mx-auto h-12 w-12 text-destructive"/><h1 className="text-2xl font-black text-primary">No pudimos abrir este módulo</h1><p className="text-muted-foreground">Actualiza la pantalla. Si continúa, cierra la sesión y vuelve a entrar.</p><div className="flex justify-center gap-2"><Button onClick={reset}><RefreshCw className="mr-2 h-4 w-4"/>Intentar otra vez</Button><Button variant="outline" onClick={()=>location.assign("/minimarket")}>Ir al inicio</Button></div></div></main>;
}
