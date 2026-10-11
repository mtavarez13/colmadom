
"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  MapPin, 
  Store, 
  Star, 
  ChevronRight, 
  Navigation, 
  Clock, 
  Loader2, 
  Package, 
  Truck, 
  Zap, 
  ShoppingCart, 
  Locate 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import Link from "next/link";
import Image from "next/image";
import { isSubscriptionBlocked } from '@/lib/subscription';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Calculates distance between two points in KM using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return null;
  const R = 6371; // Earth's radius in KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function DiscoverPage() {
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [province, setProvince] = useState("all");
  const [municipality, setMunicipality] = useState("all");
  const [category, setCategory] = useState("all");
  const [mounted, setMounted] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => console.warn("GPS Access denied:", err),
          { enableHighAccuracy: false, timeout: 10000 }
        );
      } catch (e) {
        console.warn("Geolocation API unavailable");
      }
    }
  }, []);

  const colmadosQuery = useMemoFirebase(() => {
    return collection(db, "colmados");
  }, [db]);

  const { data: allColmados, isLoading } = useCollection(colmadosQuery);

  const platformConfigRef = useMemoFirebase(() => doc(db, "platformConfig", "general"), [db]);
  const { data: platformConfig } = useDoc(platformConfigRef);

  const filtered = useMemo(() => {
    let list = allColmados?.filter(c => !isSubscriptionBlocked(c) && (
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.address?.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (province === "all" || c.province === province) &&
      (municipality === "all" || c.municipality === municipality) &&
      (category === "all" || c.businessType === category)
    ) || [];

    if (userCoords) {
      list = list.map(c => {
        const colLat = Number(c.latitude);
        const colLng = Number(c.longitude);
        const distance = (!isNaN(colLat) && !isNaN(colLng)) 
          ? calculateDistance(userCoords.lat, userCoords.lng, colLat, colLng)
          : null;
        return { ...c, calculatedDistance: distance };
      }).sort((a, b) => {
        if (a.calculatedDistance === null || a.calculatedDistance === undefined) return 1;
        if (b.calculatedDistance === null || b.calculatedDistance === undefined) return -1;
        return (Number(a.calculatedDistance) || 0) - (Number(b.calculatedDistance) || 0);
      });
    }

    return list;
  }, [allColmados, searchTerm, userCoords, province, municipality, category]);

  const provinces = useMemo(() => Array.from(new Set((allColmados || []).map(c => c.province).filter(Boolean))).sort(), [allColmados]);
  const municipalities = useMemo(() => Array.from(new Set((allColmados || []).filter(c => province === "all" || c.province === province).map(c => c.municipality).filter(Boolean))).sort(), [allColmados, province]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-muted/30 pb-20">
      <header className="bg-primary text-white p-8 md:p-16 shadow-2xl relative overflow-hidden">
        <div className="absolute right-[-50px] top-[-50px] opacity-10 rotate-12">
          <Store className="h-80 w-80" />
        </div>
        <div className="max-w-6xl mx-auto relative z-10 space-y-8">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 bg-white rounded-3xl flex items-center justify-center shadow-2xl p-2 relative overflow-hidden border-2 border-primary/10">
              {platformConfig?.logoUrl && platformConfig.logoUrl.length > 5 ? (
                <Image src={platformConfig.logoUrl} alt="Logo" width={48} height={48} className="object-contain" />
              ) : (
                <ShoppingCart className="h-8 w-8 text-primary" />
              )}
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter">Marketplace Colmadom</h1>
              <p className="text-lg md:text-xl opacity-90 font-bold text-primary-foreground/80 mt-1">Encuentra los colmados más cercanos.</p>
            </div>
          </div>
          
          <div className="relative max-w-2xl">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-7 w-7 text-primary" />
            <Input 
              placeholder="¿Qué buscas hoy?" 
              className="h-20 pl-16 text-xl font-bold rounded-3xl border-none shadow-2xl text-black"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-3 max-w-3xl text-primary">
            <Select value={province} onValueChange={value=>{setProvince(value);setMunicipality("all");}}><SelectTrigger className="bg-white h-11"><SelectValue placeholder="Provincia" /></SelectTrigger><SelectContent><SelectItem value="all">Todas las provincias</SelectItem>{provinces.map(item=><SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
            <Select value={municipality} onValueChange={setMunicipality}><SelectTrigger className="bg-white h-11"><SelectValue placeholder="Municipio" /></SelectTrigger><SelectContent><SelectItem value="all">Todos los municipios</SelectItem>{municipalities.map(item=><SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
            <Select value={category} onValueChange={setCategory}><SelectTrigger className="bg-white h-11"><SelectValue placeholder="Categoría" /></SelectTrigger><SelectContent><SelectItem value="all">Todas las categorías</SelectItem><SelectItem value="Standard">Colmado / minimarket</SelectItem><SelectItem value="Consignacion">Consignación</SelectItem></SelectContent></Select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8 -mt-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-3xl font-black text-primary flex items-center gap-3">
                <MapPin className="h-8 w-8 text-accent" />
                {userCoords ? "Cerca de ti" : "Explorar Negocios"}
              </h2>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-muted-foreground">{filtered.length} colmados encontrados</p>
                {userCoords ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 flex gap-1 items-center px-3 py-1 rounded-full font-black text-[10px]">
                    <Locate className="h-3 w-3" /> UBICACIÓN ACTIVA
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] font-black uppercase opacity-50">GPS Desactivado</Badge>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <Loader2 className="animate-spin h-12 w-12 text-primary" />
                <p className="font-black text-primary">Localizando negocios...</p>
              </div>
            ) : filtered.length === 0 ? (
              <Card className="border-dashed border-4 py-24 text-center bg-white/50 rounded-3xl">
                <CardContent className="space-y-6">
                  <Store className="h-24 w-24 text-muted-foreground mx-auto opacity-10" />
                  <p className="text-muted-foreground font-black text-2xl italic">No hay colmados en tu zona todavía.</p>
                  <Button asChild className="bg-primary font-black rounded-xl h-12 px-8">
                    <Link href="/login">Registrar mi Colmado</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filtered.map((colmado) => (
                  <Link key={colmado.id} href={`/catalog/${colmado.slug || colmado.id}`}>
                    <Card className="overflow-hidden hover:shadow-2xl transition-all group rounded-[2.5rem] border-none shadow-xl bg-white h-full relative">
                      <div className="h-32 relative overflow-hidden bg-muted">
                        {colmado.bannerUrl && colmado.bannerUrl.length > 5 ? (
                          <Image src={colmado.bannerUrl} alt={colmado.name} fill className="object-cover group-hover:scale-110 transition-transform duration-700" />
                        ) : (
                          <div className="h-full w-full" style={{ backgroundColor: colmado.primaryColor || '#2563eb' }} />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                        
                        {colmado.calculatedDistance !== undefined && colmado.calculatedDistance !== null && (
                          <div className="absolute top-4 right-4 z-20">
                            <Badge className="bg-white text-primary font-black border-none shadow-2xl scale-110 px-3 py-1 rounded-xl flex gap-1.5 items-center">
                              <Navigation className="h-3 w-3 text-accent fill-current" />
                              {colmado.calculatedDistance < 1 
                                ? `${(Number(colmado.calculatedDistance) * 1000).toFixed(0)} m` 
                                : `${Number(colmado.calculatedDistance).toFixed(1)} km`}
                            </Badge>
                          </div>
                        )}
                      </div>
                      
                      <CardHeader className="p-6 pb-2 -mt-12 relative z-10">
                        <div className="flex justify-between items-end">
                          <div className="h-20 w-20 rounded-2xl bg-white flex items-center justify-center shadow-xl border-4 border-white relative overflow-hidden p-1">
                            {colmado.logoUrl && colmado.logoUrl.length > 5 ? (
                              <Image src={colmado.logoUrl} alt={colmado.name} fill className="object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center bg-primary/5 text-primary font-black text-3xl">
                                {colmado.name ? colmado.name[0] : "C"}
                              </div>
                            )}
                          </div>
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full uppercase mb-2">ABIERTOS</Badge>
                        </div>
                        <div className="mt-4 space-y-1">
                          <CardTitle className="text-xl font-black truncate text-primary">{colmado.name}</CardTitle>
                          <CardDescription className="text-xs font-bold flex items-center gap-1.5 truncate">
                            <MapPin className="h-3.5 w-3.5 text-accent" /> {colmado.address || "República Dominicana"}
                          </CardDescription>
                        </div>
                      </CardHeader>
                      <CardContent className="p-6 pt-0 space-y-5">
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-1.5 text-sm font-black text-orange-500">
                              <Star className="h-4 w-4 fill-current" /> 4.9
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                              <Clock className="h-4 w-4" /> 10-20 min
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
          
          <div className="hidden lg:block space-y-6">
            <Card className="rounded-3xl border-none shadow-xl bg-accent text-white overflow-hidden relative">
              <div className="absolute right-[-20px] top-[-20px] opacity-10 rotate-12">
                <Zap className="h-32 w-32" />
              </div>
              <CardHeader>
                <CardTitle className="text-lg font-black uppercase tracking-widest">Express</CardTitle>
                <CardDescription className="text-white/80 font-bold">Pedidos en tiempo récord.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" className="w-full font-black rounded-xl h-10">Filtro Rápido</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
