"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Store, 
  Users, 
  Truck, 
  ArrowRight, 
  CheckCircle2, 
  Sparkles, 
  Globe,
  MapPin,
  MessageSquare,
  BarChart3,
  ShieldCheck,
  Zap,
  ShoppingCart,
  Calculator,
  ClipboardCheck,
  FileText
  ,Smartphone
  ,PackageCheck
  ,Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import Image from "next/image";

export default function LandingPage() {
  const { user } = useUser();
  const db = useFirestore();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const colmadosQuery = useMemoFirebase(() => collection(db, "colmados"), [db]);
  const { data: allColmados } = useCollection(colmadosQuery);

  const platformConfigRef = useMemoFirebase(() => doc(db, "platformConfig", "general"), [db]);
  const { data: platformConfig } = useDoc(platformConfigRef);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    if (!allColmados || allColmados.length <= 1) return;

    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % allColmados.length);
        setFade(true);
      }, 500);
    }, 6000);

    return () => clearInterval(interval);
  }, [allColmados]);

  const currentShowcase = allColmados && allColmados.length > 0 
    ? allColmados[currentIndex] 
    : { 
        name: "Tu Colmado Digital", 
        address: "Modernizando el barrio 🇩🇴", 
        id: "default",
        bannerUrl: null,
        logoUrl: null 
      };

  const showcaseImage = currentShowcase.bannerUrl || currentShowcase.imageUrl || `https://picsum.photos/seed/${currentShowcase.id}/1200/800`;
  const showcaseLogo = currentShowcase.logoUrl;

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-accent selection:text-white">
      <nav className="border-b border-zinc-200 bg-white/95 text-[#002d62] backdrop-blur-xl sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center shadow-xl group-hover:rotate-6 transition-transform p-1.5 relative overflow-hidden border-2 border-primary/10">
              {mounted && platformConfig?.logoUrl ? (
                <Image src={platformConfig.logoUrl} alt="Logo" width={40} height={40} className="object-contain" />
              ) : (
                <ShoppingCart className="h-6 w-6 text-primary" />
              )}
            </div>
            <div><span className="text-3xl font-black text-[#002d62] tracking-tighter">Colmadom</span><span className="block text-[9px] font-black uppercase tracking-[0.28em] text-[#ce1126]">Hecho para el colmado dominicano</span></div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-black text-[#002d62]">
            <Link href="#features" className="hover:text-[#ce1126] transition-colors">Tecnología</Link>
            <Link href="#roles" className="hover:text-[#ce1126] transition-colors">Perfiles</Link>
            <Link href="/discover" className="hover:text-[#ce1126] transition-colors flex items-center gap-1.5">
              <Globe className="h-4 w-4" /> Marketplace
            </Link>
            <Link href="/business-market" className="hover:text-[#ce1126] transition-colors">Colmados en venta</Link>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button asChild className="font-black rounded-2xl h-12 px-6 shadow-lg shadow-primary/30">
                <Link href="/login">Panel Operativo <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="font-black hidden sm:flex text-[#002d62]">
                  <Link href="/login">Entrar</Link>
                </Button>
                <Button asChild className="font-black rounded-2xl h-12 px-8 shadow-2xl shadow-primary/40 bg-primary hover:scale-105 transition-all">
                  <Link href="/login?mode=register">Prueba gratis 20 días</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white">
        Nueva actualización: igualas contables, Recursos Humanos y publicación de colmados en venta disponibles gratis. Los demás módulos se activan con tu suscripción.
      </section>

      <header className="relative py-16 lg:py-28 overflow-hidden bg-gradient-to-br from-[#002d62] via-[#064d92] to-[#001f45] text-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-white/10 rounded-full blur-[150px] animate-pulse" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-[#ce1126]/25 rounded-full blur-[150px] animate-pulse delay-1000" />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center text-center lg:text-left">
            <div className="space-y-8">
              <Badge variant="secondary" className="px-6 py-2 rounded-full bg-[#ce1126] text-white border-2 border-white/30 font-black uppercase tracking-[0.2em] text-[10px] shadow-xl">
                🇩🇴 20 días gratis para tu colmado
              </Badge>
              <h1 className="text-5xl md:text-7xl font-black tracking-tight text-white leading-[0.95]">
                Vende, controla y crece <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-[#f6d365] to-[#ff9d2f]">desde un solo lugar.</span>
              </h1>
              <p className="text-xl md:text-2xl text-zinc-300 max-w-2xl font-bold leading-relaxed">
                Punto de venta, catálogo digital, contabilidad y facturación electrónica de la DGII para colmados. Organiza igualas, auditorías y reportes de varias sucursales.
              </p>
              <div className="flex flex-wrap justify-center lg:justify-start gap-2 text-sm font-bold text-[#002d62]"><span className="rounded-full bg-white px-4 py-2 shadow-lg">Sin tarjeta para comenzar</span><span className="rounded-full bg-white px-4 py-2 shadow-lg">Dueños con Google o correo</span><span className="rounded-full bg-white px-4 py-2 shadow-lg">Contadores exclusivamente con Google</span></div>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
                <Button size="lg" className="h-20 px-10 text-xl font-black rounded-[2rem] w-full sm:w-auto bg-[#ce1126] hover:bg-[#ac0e20] shadow-2xl shadow-black/30 active:scale-95 transition-all" asChild>
                  <Link href="/login?mode=register">Comenzar 20 días gratis <ArrowRight className="ml-2" /></Link>
                </Button>
                <Button size="lg" variant="outline" className="h-20 px-10 text-xl font-black rounded-[2rem] w-full sm:w-auto border-2 border-white bg-white text-[#002d62] hover:bg-blue-50" asChild>
                  <Link href="/discover">Ver Catálogo</Link>
                </Button>
                <Button size="lg" variant="outline" className="h-20 px-8 text-lg font-black rounded-[2rem] w-full sm:w-auto border-2 border-[#25D366] bg-[#25D366] text-white hover:bg-[#1eb957]" asChild>
                  <a href="https://wa.me/18094583731?text=Quiero%20probar%20el%20sistema%20Colmadom%20Cloud" target="_blank" rel="noreferrer"><MessageSquare className="mr-2" /> Contactar con ventas</a>
                </Button>
              </div>
              <p className="text-sm text-blue-100">Regístrate, agrega tu negocio y comienza a probar. La prueba inicia al crear el colmado.</p>
            </div>
            
            <div className={`relative group animate-colmadom-float transition-all duration-500 ease-in-out ${fade ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="absolute -inset-4 bg-gradient-to-tr from-[#ce1126] via-white to-[#39a852] rounded-[4rem] blur-2xl opacity-30 group-hover:opacity-40 transition-opacity" />
              <div className="relative aspect-square md:aspect-video rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl shadow-black/30 bg-muted/20">
                <Image 
                  src={showcaseImage} 
                  alt={currentShowcase.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                  priority
                  data-ai-hint="dominican mini market"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between">
                  <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 text-white max-w-[70%] flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-xl border-2 border-white relative overflow-hidden shrink-0 p-1">
                      {mounted && showcaseLogo ? (
                        <Image src={showcaseLogo} alt="logo" fill className="object-cover" />
                      ) : (
                        <ShoppingCart className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="truncate">
                      <p className="font-black text-lg truncate leading-tight">{currentShowcase.name}</p>
                      <p className="text-[10px] font-bold opacity-80 flex items-center gap-1 truncate uppercase tracking-tighter">
                        <MapPin className="h-2.5 w-2.5 shrink-0" /> {currentShowcase.address}
                      </p>
                    </div>
                  </div>
                  <div className="h-16 w-16 bg-[#ce1126] rounded-2xl flex items-center justify-center text-white shadow-2xl animate-bounce shrink-0">
                    <Truck className="h-8 w-8" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#fff9ee] py-12 border-b border-orange-200"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,157,47,.22),transparent_45%)] animate-colmadom-glow"/><div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-between gap-6"><div><Badge className="bg-[#002d62] text-white">DGII · REPÚBLICA DOMINICANA</Badge><h2 className="text-3xl md:text-5xl font-black mt-3 text-[#002d62]">Facturación electrónica integrada.</h2><p className="text-zinc-600 mt-3 text-lg max-w-3xl">Emite e-CF, detalla ITBIS, genera QR, consulta el estado de la DGII y prepara los formularios fiscales desde el mismo sistema.</p></div><div className="shrink-0 rounded-[2rem] bg-[#ce1126] text-white p-6 shadow-2xl shadow-red-900/20 animate-colmadom-float"><FileText className="h-12 w-12"/><p className="font-black mt-2">e-CF + QR + ITBIS</p></div></div></section>

      <section id="features" className="py-20 bg-[linear-gradient(180deg,#ffffff_0%,#f4f8fc_100%)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="max-w-3xl"><Badge className="bg-primary/10 text-primary hover:bg-primary/10">Todo conectado</Badge><h2 className="text-4xl md:text-5xl font-black text-primary mt-4">Lo que pasa en tu negocio, claro y en orden.</h2><p className="text-lg text-muted-foreground mt-4">Cada sucursal trabaja con sus propios datos. El dueño puede cambiar de local y revisar sus resultados.</p></div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: ShoppingCart, title: 'Punto de venta', text: 'Registra ventas y consulta lo vendido en cada caja.' },
              { icon: Store, title: 'Inventario', text: 'Organiza productos, precios y existencias por sucursal.' },
              { icon: Globe, title: 'Catálogo digital', text: 'Publica los productos del colmado para recibir pedidos digitales.' },
              { icon: Users, title: 'Clientes y fiados', text: 'Lleva las cuentas pendientes y el historial de tus clientes.' },
              { icon: BarChart3, title: 'Resultados', text: 'Consulta contabilidad, cierres y reportes de cada local.' },
              { icon: MessageSquare, title: 'WhatsApp Cloud API', text: 'Da seguimiento a tus clientes por WhatsApp, automatiza respuestas y conserva el historial de cada colmado.' },
              { icon: Calculator, title: 'Igualas contables', text: 'Asigna un contador a uno o varios colmados con acceso seguro a reportes y auditorías.' }
              ,{ icon: Building2, title: 'Mercado de colmados', text: 'Publica colmados en venta o alquiler con fotos, inmueble, precios y contacto directo.' }
              ,{ icon: FileText, title: 'Facturación electrónica DGII', text: 'Prepara e-CF, impuestos, estados fiscales, QR y formularios de envío desde cada negocio habilitado.' }
            ].map((feature, index) => <Card key={feature.title} className="rounded-3xl border-blue-100 shadow-sm hover:-translate-y-1 hover:shadow-xl transition-all overflow-hidden"><div className={`h-2 ${index % 3 === 0 ? 'bg-[#ce1126]' : index % 3 === 1 ? 'bg-[#002d62]' : 'bg-[#ff9d2f]'}`} /><CardHeader><div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3"><feature.icon className="w-6 h-6 text-[#002d62]" /></div><CardTitle className="text-xl text-[#002d62]">{feature.title}</CardTitle></CardHeader><CardContent className="text-muted-foreground">{feature.text}</CardContent></Card>)}
          </div>
        </div>
      </section>

      <section className="py-24 bg-gradient-to-br from-zinc-950 via-purple-950 to-black text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6"><Badge className="bg-purple-500 text-white px-4 py-2">ESPACIO EXCLUSIVO PARA CONTADORES</Badge><h2 className="text-4xl md:text-6xl font-black text-white leading-tight">Convierte las igualas de colmados en un servicio organizado y rentable.</h2><p className="text-lg text-purple-100">Regístrate exclusivamente con Google, crea perfiles para colmados independientes o trabaja con los negocios que te asignen. Audita inventarios, registra facturas y entrega reportes claros a cada dueño.</p><div className="flex flex-wrap gap-3"><Button asChild size="lg" className="h-16 px-8 text-lg font-black bg-purple-500 hover:bg-purple-400"><Link href="/login?mode=accountant">Registrarme como contador <ArrowRight className="ml-2" /></Link></Button><Badge variant="outline" className="border-purple-300 text-purple-100 px-4">Acceso seguro con Google</Badge></div></div>
          <div className="relative min-h-[360px] lg:min-h-[520px] overflow-hidden rounded-[2.5rem] border border-purple-400/30 shadow-2xl shadow-purple-950/70"><Image src="/contador-inventario-colmado.png" alt="Contadora realizando una auditoría de inventario en un colmado" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw"/><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"/><div className="absolute bottom-0 p-7"><p className="text-2xl font-black">Inventarios con evidencia y trazabilidad</p><p className="text-purple-100">Conteo físico, diferencias, márgenes y reportes por colmado.</p></div></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:col-span-2">{[
            {icon:BarChart3,title:'Contabilidad precisa',text:'Ventas, costos, gastos, beneficios y capital actual en inventario.'},
            {icon:ClipboardCheck,title:'Auditoría de inventario',text:'Conteo físico, diferencias encontradas y trazabilidad del responsable.'},
            {icon:FileText,title:'Reportes PDF',text:'Documentos organizados para entregar al dueño de cada colmado.'},
            {icon:ShieldCheck,title:'Acceso por sucursal',text:'El dueño decide exactamente cuáles negocios puede consultar cada contador.'}
          ].map(item=><Card key={item.title} className="rounded-3xl border-purple-500/30 bg-white/10 backdrop-blur shadow-xl text-white"><CardHeader><item.icon className="h-8 w-8 text-purple-300"/><CardTitle className="text-lg">{item.title}</CardTitle><CardDescription className="text-sm leading-relaxed text-purple-100">{item.text}</CardDescription></CardHeader></Card>)}</div>
        </div>
      </section>

      <section className="py-24 bg-gradient-to-br from-[#fff7ed] via-white to-[#eff6ff] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div className="relative min-h-[360px] lg:min-h-[520px] rounded-[2.5rem] overflow-hidden shadow-2xl border-8 border-white"><Image src="/app-delivery-colmadom.png" alt="Aplicación móvil de delivery de Colmadom Cloud" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw"/></div>
          <div className="space-y-6"><Badge className="bg-orange-500 text-white px-4 py-2">APP PARA DELIVERY</Badge><h2 className="text-4xl md:text-6xl font-black text-[#002d62] leading-tight">Entregas, cobros y rutas desde el celular.</h2><p className="text-lg text-zinc-600">Cada repartidor recibe sus órdenes asignadas, marca las entregas, registra el cobro y desembolsa el dinero a la caja del turno. El cajero recibe el aviso y confirma el desembolso.</p><div className="grid sm:grid-cols-2 gap-3">{[{icon:Truck,text:'Órdenes y rutas asignadas'},{icon:PackageCheck,text:'Confirmación de entregas'},{icon:Calculator,text:'Cobro y desembolso a caja'},{icon:ShieldCheck,text:'Acceso exclusivo del repartidor'}].map(item=><div key={item.text} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm border"><item.icon className="h-6 w-6 text-orange-500"/><b className="text-[#002d62]">{item.text}</b></div>)}</div><div><p className="font-black text-[#002d62] mb-3">Disponible para Android y iPhone</p><div className="flex flex-wrap gap-3"><div className="rounded-xl bg-black text-white px-5 py-3 flex items-center gap-3 shadow-lg"><Smartphone/><span><small className="block text-[10px]">Disponible en</small><b>App Store</b></span></div><div className="rounded-xl bg-black text-white px-5 py-3 flex items-center gap-3 shadow-lg"><Zap/><span><small className="block text-[10px]">Disponible en</small><b>Google Play</b></span></div></div></div></div>
        </div>
      </section>

      <section id="roles" className="py-24 bg-gradient-to-r from-orange-500 via-orange-600 to-[#002d62] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div><Badge className="bg-white text-orange-600 px-5 py-2 text-base">PRUEBA GRATIS · SIN TARJETA</Badge><p className="text-7xl md:text-8xl font-black mt-5 leading-none">20 DÍAS</p><h2 className="text-3xl md:text-5xl font-black mt-3">para poner tu colmado en orden.</h2><p className="text-white/90 text-lg mt-5">Crea tu cuenta con Google o teléfono, registra tu colmado y comienza a operar. Después de la prueba, el administrador te indicará el plan para continuar.</p></div>
          <div className="bg-white text-primary rounded-[2rem] p-8 shadow-2xl space-y-5"><h3 className="text-2xl font-black">Así de sencillo</h3><p><strong>1.</strong> Crea tu cuenta con Google o teléfono.</p><p><strong>2.</strong> Agrega los datos de tu colmado.</p><p><strong>3.</strong> Abre el punto de venta y prueba tus módulos.</p><Button asChild className="w-full h-14 text-lg font-black"><Link href="/login?mode=register">Crear mi cuenta gratis <ArrowRight className="ml-2" /></Link></Button></div>
        </div>
      </section>

      <footer className="mt-auto py-20 bg-[#001f45] border-t-8 border-[#ce1126] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 bg-white rounded-[1.5rem] flex items-center justify-center shadow-2xl p-2 relative overflow-hidden border-2 border-primary/10">
              {mounted && platformConfig?.logoUrl ? (
                <Image src={platformConfig.logoUrl} alt="Logo" width={48} height={48} className="object-contain" />
              ) : (
                <ShoppingCart className="h-8 w-8 text-primary" />
              )}
            </div>
            <div>
              <p className="text-3xl font-black text-white tracking-tighter">Colmadom Cloud</p>
              <p className="text-sm font-black text-zinc-300 uppercase tracking-[0.4em] mt-1">Orgullo Dominicano 🇩🇴</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground/40 font-bold max-w-sm mx-auto leading-relaxed">
            Hecho con pasión en República Dominicana para el mundo. <br />
            © 2026 Colmadom Cloud Services. Todos los derechos reservados.
          </p>
          <a className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-black text-white shadow-xl hover:scale-105 transition-transform" href="https://wa.me/18094583731?text=Quiero%20probar%20el%20sistema%20Colmadom%20Cloud" target="_blank" rel="noreferrer"><MessageSquare className="h-5 w-5" /> Contactar con ventas · 809-458-3731</a>
          <div className="flex flex-wrap justify-center gap-5 text-sm font-bold text-zinc-300"><Link href="/terminos" className="hover:text-white underline underline-offset-4">Términos y condiciones</Link><Link href="/terminos#privacidad" className="hover:text-white underline underline-offset-4">Privacidad y datos</Link></div>
        </div>
      </footer>
      <a href="https://wa.me/18094583731?text=Quiero%20probar%20el%20sistema%20Colmadom%20Cloud" target="_blank" rel="noreferrer" aria-label="Contactar con ventas por WhatsApp" className="fixed bottom-5 right-5 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl ring-4 ring-white hover:scale-110 transition-transform md:hidden"><MessageSquare className="h-8 w-8" /></a>
    </div>
  );
}
