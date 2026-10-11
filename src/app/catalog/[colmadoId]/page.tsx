"use client";

import { useState, use, useEffect, useMemo, useRef } from "react";
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Send, 
  Loader2, 
  Store,
  MapPin,
  Package,
  User,
  Truck,
  Navigation,
  Info,
  Locate,
  ImageIcon,
  Star,
  Zap,
  Scissors,
  DollarSign,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
  Filter,
  Beer,
  Apple,
  Coffee,
  HeartPulse,
  WashingMachine,
  Milk,
  Utensils,
  Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, getDocs, limit } from "firebase/firestore";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { sharedProductImage } from '@/lib/shared-catalog';
import { isSubscriptionBlocked } from '@/lib/subscription';

interface CatalogPageProps {
  params: Promise<{ colmadoId: string }>;
}

const CATEGORY_ICONS: Record<string, any> = {
  "Todos": Filter,
  "Alimentos Básicos": Utensils,
  "Víveres y Agrícola": Apple,
  "Embutidos y Lácteos": Milk,
  "Bebidas con Alcohol": Beer,
  "Bebidas sin Alcohol": Coffee,
  "Desayuno y Merienda": Coffee,
  "Enlatados y Conservas": Package,
  "Higiene Personal": HeartPulse,
  "Limpieza del Hogar": WashingMachine,
  "Varios y Misceláneos": Zap,
  "Combos": Star
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return isNaN(distance) ? null : distance;
}

function hexToHsl(hex: string) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return "225 70% 45%";
  
  let r = 0, g = 0, b = 0;
  try {
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
      r = parseInt(cleanHex[0] + cleanHex[0], 16);
      g = parseInt(cleanHex[1] + cleanHex[1], 16);
      b = parseInt(cleanHex[2] + cleanHex[2], 16);
    } else if (cleanHex.length === 6) {
      r = parseInt(cleanHex.substring(0, 2), 16);
      g = parseInt(cleanHex.substring(2, 4), 16);
      b = parseInt(cleanHex.substring(4, 6), 16);
    } else {
      return "225 70% 45%";
    }
  } catch (e) {
    return "225 70% 45%";
  }

  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function CatalogPage({ params }: CatalogPageProps) {
  const { colmadoId: paramId } = use(params);
  const db = useFirestore();
  const { toast } = useToast();
  
  const [mounted, setMounted] = useState(false);
  const [isResolving, setIsResolving] = useState(true);
  const [resolvedColmadoId, setResolvedColmadoId] = useState<string | null>(null);
  const [cart, setCart] = useState<{ id: string; productId?: string; name: string; price: number; quantity: number; amountInDop?: number; isBreakdown?: boolean; unitType?: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(0);

  const [selectedProductForBreakdown, setSelectedProductForBreakdown] = useState<any>(null);
  const [breakdownAmount, setBreakdownAmount] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && navigator.geolocation) {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => setCustomerCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => console.warn("GPS Access Denied or Error:", err),
          { enableHighAccuracy: false, timeout: 5000 }
        );
      } catch (e) {
        console.warn("Geolocation API unavailable");
      }
    }
  }, []);

  useEffect(() => {
    if (!mounted || !paramId) return;
    let isMounted = true;
    
    const resolveColmado = async () => {
      try {
        const idCheckSnapshot = await getDocs(query(collection(db, "colmados"), where("id", "==", paramId), limit(1)));
        if (!idCheckSnapshot.empty) {
          if (isMounted) {
            setResolvedColmadoId(paramId);
            setIsResolving(false);
          }
          return;
        }

        const slugSnapshot = await getDocs(query(collection(db, "colmados"), where("slug", "==", paramId), limit(1)));
        if (!slugSnapshot.empty && isMounted) {
          setResolvedColmadoId(slugSnapshot.docs[0].id);
        }
      } catch (error) {
        console.error("Error resolving colmado:", error);
      } finally {
        if (isMounted) setIsResolving(false);
      }
    };
    resolveColmado();
    return () => { isMounted = false; };
  }, [db, paramId, mounted]);

  const colmadoRef = useMemoFirebase(() => {
    return resolvedColmadoId ? doc(db, "colmados", resolvedColmadoId) : null;
  }, [db, resolvedColmadoId]);

  const { data: colmado, isLoading: isColmadoLoading } = useDoc(colmadoRef);

  useEffect(() => {
    if (customerCoords && colmado && colmado.latitude != null && colmado.longitude != null) {
      const d = calculateDistance(
        customerCoords.lat, 
        customerCoords.lng, 
        Number(colmado.latitude), 
        Number(colmado.longitude)
      );
      if (d !== null) {
        const perKm = Number(colmado.deliveryFeePerKm) || 0;
        const min = Number(colmado.minDeliveryFee) || 0;
        setDeliveryFee(Math.max(min, Math.round(d * perKm)));
      }
    }
  }, [customerCoords, colmado]);

  const productsQuery = useMemoFirebase(() => {
    return resolvedColmadoId ? collection(db, "colmados", resolvedColmadoId, "products") : null;
  }, [db, resolvedColmadoId]);

  const { data: products, isLoading: isProductsLoading } = useCollection(productsQuery);
  const sharedImagesQuery = useMemoFirebase(() => collection(db, 'sharedCatalogImages'), [db]);
  const { data: sharedImages } = useCollection(sharedImagesQuery, { permissionErrorIsLocal: true });
  const imageByBarcode = useMemo(() => Object.fromEntries((sharedImages || []).map(item => [item.id, item.imageUrl])), [sharedImages]);

  const categories = useMemo(() => {
    if (!products) return ["Todos"];
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ["Todos", ...Array.from(cats)];
  }, [products]);

  const displayProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => {
      const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.category?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "Todos" || p.category === selectedCategory;
      const isVisible = p.isCombo || (Number(p.quantityInStock) || 0) > 0;
      return isVisible && matchesSearch && matchesCategory;
    }).sort((a, b) => (b.isOffer ? 1 : 0) - (a.isOffer ? 1 : 0));
  }, [products, searchTerm, selectedCategory]);

  const themeStyles = useMemo(() => {
    if (!mounted || !colmado) return {};
    return {
      "--primary": colmado.primaryColor ? hexToHsl(colmado.primaryColor) : "225 70% 45%",
      "--accent": colmado.accentColor ? hexToHsl(colmado.accentColor) : "255 75% 60%",
    } as React.CSSProperties;
  }, [mounted, colmado]);

  const addToCart = (product: any, amountInDop?: number) => {
    setCart((prev) => {
      if (amountInDop) {
        const quantity = amountInDop / (Number(product.salePrice) || 1);
        return [{ 
          id: `${product.id}_${Date.now()}`, productId: product.id, 
          name: product.name, 
          price: Number(product.salePrice) || 0, 
          quantity, 
          amountInDop, 
          isBreakdown: true,
          unitType: product.unitType
        }, ...prev];
      } else {
        const existing = prev.find((item) => item.id === product.id && !item.isBreakdown);
        if (existing) {
          return prev.map((item) =>
            (item.id === product.id && !item.isBreakdown) ? { ...item, quantity: item.quantity + 1 } : item
          );
        }
        return [{ id: product.id, productId: product.id, name: product.name, price: Number(product.salePrice) || 0, quantity: 1, unitType: product.unitType }, ...prev];
      }
    });
    
    if (amountInDop) {
      setSelectedProductForBreakdown(null);
      setBreakdownAmount("");
    }
    toast({ title: "Agregado", description: `${product.name} al carrito.` });
  };

  const handleAddBreakdown = () => {
    if (!selectedProductForBreakdown || !breakdownAmount) return;
    addToCart(selectedProductForBreakdown, Number(breakdownAmount));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter(item => item.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => {
    const amount = Number(item.amountInDop) || (Number(item.price) * Number(item.quantity));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const total = subtotal + (Number(deliveryFee) || 0);

  const pendingOrder = useRef<{ key: string; payload: string } | null>(null);
  const handlePlaceOrder = async () => {
    if (isOrdering) return;
    if (cart.length === 0 || !resolvedColmadoId || !colmado || !customerName || !customerAddress) {
      toast({ title: "Datos incompletos", description: "Por favor llena tu nombre y dirección.", variant: "destructive" });
      return;
    }

    setIsOrdering(true);

    try {
      const payload = {
        colmadoId: resolvedColmadoId, customerName, customerAddress, customerPhone,
        customerLatitude: customerCoords?.lat ?? null, customerLongitude: customerCoords?.lng ?? null,
        expectedTotal: total,
        items: cart.map(item => ({productId: item.productId || item.id, quantity:item.quantity, ...(item.isBreakdown ? {amountInDop:item.amountInDop} : {})}))
      };
      const serialized = JSON.stringify(payload);
      if (!pendingOrder.current || pendingOrder.current.payload !== serialized) pendingOrder.current = {key:crypto.randomUUID(),payload:serialized};
      const response = await fetch('/api/catalog/orders', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,requestId:pendingOrder.current.key})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el pedido.');
      pendingOrder.current = null;

      const phoneNumber = colmado.phoneNumber || colmado.accessPhone;
      if (phoneNumber) {
        const orderList = cart.map(i => i.isBreakdown ? `- ${i.name} (RD$${i.amountInDop})` : `- ${i.name} (${i.quantity}x)`).join("\n");
        const mapsLink = customerCoords ? `\n📍 Ubicación: https://www.google.com/maps?q=${customerCoords.lat},${customerCoords.lng}` : "";
        const message = encodeURIComponent(`*NUEVO PEDIDO*\n\nCliente: ${customerName}\nDir: ${customerAddress}${mapsLink}\n\n*Pedido:*\n${orderList}\n\n*Total: RD$${total.toLocaleString()}*`);
        window.open(`https://wa.me/${String(phoneNumber).replace(/\D/g, "")}?text=${message}`, "_blank");
      }

      setCart([]); setOrderComplete(true);
      toast({ title: "Pedido enviado" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar el pedido.", variant: "destructive" });
    } finally { setIsOrdering(false); }
  };

  if (!mounted) return null;

  if (isResolving || (resolvedColmadoId && isColmadoLoading)) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="font-bold text-primary animate-pulse">Conectando con el colmado...</p>
      </div>
    );
  }

  if (!resolvedColmadoId) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-background">
        <div className="h-24 w-24 bg-muted/20 rounded-full flex items-center justify-center">
          <Store className="h-12 w-12 text-muted-foreground opacity-20" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black">Colmado no encontrado</h2>
          <p className="text-muted-foreground font-medium">El enlace que has seguido parece ser incorrecto o el colmado ya no está en la red.</p>
        </div>
        <Button variant="outline" onClick={() => window.location.href = "/discover"} className="h-12 rounded-xl px-8 font-black border-2">Explorar otros negocios</Button>
      </div>
    );
  }

  if (orderComplete) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-8 text-center gap-8 bg-background" style={themeStyles}>
        <div className="relative">
          <div className="h-32 w-32 bg-emerald-50 rounded-full flex items-center justify-center shadow-inner">
            <CheckCircle2 className="h-16 w-16 text-emerald-600 animate-in zoom-in-50 duration-500" />
          </div>
          <Badge className="absolute -top-2 -right-2 bg-emerald-500 text-white h-10 w-10 border-4 border-white rounded-full flex items-center justify-center">
             <Zap className="h-5 w-5" />
          </Badge>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-primary uppercase">¡Pedido Enviado!</h1>
          <p className="text-muted-foreground font-bold">Estamos preparando tu orden en <strong>{colmado?.name}</strong>. Te contactaremos vía WhatsApp.</p>
        </div>
        <Button onClick={() => setOrderComplete(false)} variant="outline" className="h-14 px-10 rounded-2xl font-black border-2">Seguir comprando</Button>
      </div>
    );
  }

  if (isSubscriptionBlocked(colmado)) {
    return <div className="h-screen flex flex-col items-center justify-center gap-5 p-8 text-center">
      <Store className="h-14 w-14 text-muted-foreground" />
      <h1 className="text-2xl font-black">Catálogo temporalmente no disponible</h1>
      <p className="text-muted-foreground">Este colmado volverá a recibir pedidos cuando reactive su suscripción.</p>
      <Button variant="outline" onClick={() => window.location.href = '/discover'}>Explorar otros colmados</Button>
    </div>;
  }

  if (colmado?.isMaintenanceMode) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-8 text-center bg-background gap-8" style={themeStyles}>
        <div className="relative">
          <div className="h-32 w-32 bg-primary/10 rounded-full flex items-center justify-center border-4 border-white shadow-2xl">
            <Zap className="h-16 w-16 text-primary animate-pulse" />
          </div>
          <Badge className="absolute -top-2 -right-2 bg-destructive text-white border-4 border-white h-10 w-10 flex items-center justify-center rounded-full">
            <AlertTriangle className="h-5 w-5" />
          </Badge>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-black text-primary tracking-tight uppercase leading-none">{colmado?.name}</h1>
          <div className="p-6 bg-primary/5 rounded-[2rem] border-2 border-dashed border-primary/20">
             <p className="text-xl font-bold text-muted-foreground leading-relaxed italic">
               "{colmado.maintenanceMessage || 'Estamos realizando inventario para servirle mejor. Volveremos pronto.'}"
             </p>
          </div>
        </div>
        <div className="space-y-6 w-full max-w-xs">
           <div className="flex items-center justify-center gap-2 text-muted-foreground font-black uppercase text-[10px] tracking-[0.2em]">
              <Clock className="h-4 w-4" /> Catálogo en Pausa
           </div>
           <Button variant="outline" className="w-full h-14 rounded-2xl font-black border-2" onClick={() => window.location.href = "/discover"}>
             Ver Otros Negocios
           </Button>
        </div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] opacity-30">COLMADOM CLOUD</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col pb-24 transition-colors" style={themeStyles}>
      
      {/* MOBILE HEADER */}
      <header className="bg-primary text-white p-4 md:p-6 sticky top-0 z-30 shadow-xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center text-primary font-black text-2xl shadow-lg relative overflow-hidden shrink-0 border-2 border-white/20">
              {colmado?.logoUrl && colmado.logoUrl.length > 10 ? (
                <Image src={colmado.logoUrl} alt="Logo" fill className="object-cover" unoptimized />
              ) : (
                <span>{colmado?.name ? colmado.name[0] : "C"}</span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black truncate leading-none mb-1">{colmado?.name}</h1>
              <p className="text-[10px] font-bold opacity-80 flex items-center gap-1 truncate uppercase tracking-tighter">
                <MapPin className="h-2.5 w-2.5" /> {colmado?.address}
              </p>
            </div>
          </div>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" className="relative h-12 w-12 rounded-2xl shadow-xl p-0 flex items-center justify-center shrink-0">
                <ShoppingCart className="h-6 w-6" />
                {cart.length > 0 && (
                  <Badge className="absolute -top-1.5 -right-1.5 bg-accent text-white border-2 border-primary h-6 w-6 flex items-center justify-center rounded-full font-black text-[10px] p-0 shadow-lg">
                    {cart.length}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 border-none">
              <SheetHeader className="p-6 bg-primary text-white shrink-0">
                <div className="flex items-center justify-between">
                   <SheetTitle className="text-2xl font-black text-white flex items-center gap-3">
                    <ShoppingCart className="h-7 w-7" /> Tu Pedido
                  </SheetTitle>
                </div>
              </SheetHeader>
              
              <ScrollArea className="flex-1 p-4 bg-muted/10">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[60vh] opacity-20 space-y-4">
                    <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center">
                      <Package className="h-10 w-10" />
                    </div>
                    <p className="font-black text-xl">CARRITO VACÍO</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <Card className="rounded-[1.5rem] border-none shadow-md overflow-hidden bg-white">
                      <CardHeader className="p-4 bg-primary/5 border-b">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                           <User className="h-3 w-3" /> Datos de Entrega
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Tu Nombre</Label>
                          <Input placeholder="Ej: Juan Pérez" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-12 rounded-xl bg-muted/30 border-none" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Dirección Exacta</Label>
                          <Input placeholder="Ej: Calle 2, Casa #4, Sector..." value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="h-12 rounded-xl bg-muted/30 border-none" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Teléfono (WhatsApp)</Label>
                          <Input placeholder="Ej: 8095551234" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-12 rounded-xl bg-muted/30 border-none" />
                        </div>
                      </CardContent>
                    </Card>

                    <div className="space-y-3">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Resumen de Productos</h3>
                      {cart.map(i => (
                        <div key={i.id} className="flex items-center justify-between p-4 bg-white border-2 rounded-[1.25rem] shadow-sm animate-in fade-in slide-in-from-right-4 duration-300">
                          <div className="min-w-0 flex-1 mr-4">
                            <p className="font-black text-sm uppercase truncate">{i.name}</p>
                            <p className="text-xs text-primary font-bold">RD${(i.amountInDop || (i.price * i.quantity)).toLocaleString()}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!i.isBreakdown ? (
                              <div className="flex items-center bg-muted/50 rounded-lg overflow-hidden border">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => updateQuantity(i.id, -1)}><Minus className="h-4 w-4" /></Button>
                                <span className="w-8 text-center text-xs font-black">{i.quantity}</span>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => updateQuantity(i.id, 1)}><Plus className="h-4 w-4" /></Button>
                              </div>
                            ) : (
                               <Badge variant="outline" className="text-[8px] font-black uppercase">Por monto</Badge>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => removeFromCart(i.id)} className="text-destructive h-8 w-8 hover:bg-destructive/5"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ScrollArea>
              
              <SheetFooter className="p-6 bg-white border-t-2 shrink-0">
                <div className="w-full space-y-4">
                  <div className="flex justify-between items-end bg-primary/5 p-4 rounded-2xl border-2 border-dashed">
                    <span className="font-black text-[10px] uppercase text-muted-foreground tracking-widest mb-1">Total Orden</span>
                    <span className="text-3xl font-black text-primary leading-none">RD${total.toLocaleString()}</span>
                  </div>
                  <Button 
                    className="w-full h-16 bg-[#25D366] hover:bg-[#128C7E] text-white font-black rounded-2xl text-xl shadow-xl shadow-emerald-200 active:scale-95 transition-all gap-3" 
                    onClick={handlePlaceOrder} 
                    disabled={cart.length === 0 || isOrdering || !customerName || !customerAddress}
                  >
                    {isOrdering ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
                    Confirmar WhatsApp
                  </Button>
                  <p className="text-[8px] text-center font-bold text-muted-foreground uppercase tracking-widest">Se abrirá WhatsApp para completar el envío.</p>
                </div>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* CATEGORY NAV - HORIZONTAL SCROLL */}
      <nav className="bg-white border-b sticky top-[72px] md:top-[88px] z-20 shadow-sm no-print">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex p-3 gap-2 max-w-4xl mx-auto">
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat] || Package;
              const isActive = selectedCategory === cat;
              return (
                <Button
                  key={cat}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "rounded-full h-10 px-4 gap-2 font-black text-xs uppercase tracking-tighter transition-all shrink-0",
                    isActive ? "shadow-md bg-primary text-white" : "text-muted-foreground hover:bg-primary/5"
                  )}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <Icon className={cn("h-3.5 w-3.5", isActive ? "text-white" : "text-primary")} />
                  {cat}
                </Button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </nav>

      <main className="max-w-4xl mx-auto w-full p-4 md:p-6 space-y-6 flex-1">
        
        {/* SEARCH BAR */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-primary/40 group-focus-within:text-primary transition-colors" />
          </div>
          <Input 
            placeholder="¿Qué necesitas hoy?" 
            className="pl-12 h-14 bg-white rounded-2xl font-bold border-2 border-transparent focus:border-primary shadow-lg shadow-primary/5 transition-all text-lg" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>

        {/* PROMO BANNER (IF ANY) */}
        {colmado?.bannerUrl && (
          <div className="relative h-32 md:h-48 rounded-[2rem] overflow-hidden shadow-xl mb-8 group">
            <Image src={colmado.bannerUrl} alt="Promo" fill className="object-cover group-hover:scale-105 transition-transform duration-700" unoptimized />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-center p-8">
               <div className="space-y-1">
                  <Badge className="bg-accent text-white border-none text-[8px] font-black uppercase tracking-widest">ABIERTOS AHORA</Badge>
                  <h2 className="text-white text-xl md:text-2xl font-black uppercase tracking-tighter">¡Precios del Barrio!</h2>
               </div>
            </div>
          </div>
        )}

        {/* PRODUCTS GRID */}
        {isProductsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Cargando anaqueles...</p>
          </div>
        ) : displayProducts.length === 0 ? (
          <div className="py-24 text-center space-y-4 animate-in fade-in duration-500">
            <div className="h-20 w-20 bg-muted/20 rounded-full flex items-center justify-center mx-auto opacity-10">
              <Package className="h-10 w-10" />
            </div>
            <div className="space-y-1">
              <p className="font-black text-lg text-muted-foreground uppercase">Sin resultados</p>
              <p className="text-xs font-bold text-muted-foreground/60 px-8">Intenta con otro nombre o revisa otra categoría.</p>
            </div>
            <Button variant="ghost" className="font-black text-xs text-primary" onClick={() => { setSearchTerm(""); setSelectedCategory("Todos"); }}>Limpiar filtros</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {displayProducts.map((p: any) => (
              <Card key={p.id} className="overflow-hidden border-none shadow-lg rounded-[1.75rem] bg-white flex flex-col group hover:shadow-2xl transition-all duration-300 relative">
                <div className="h-36 md:h-44 relative bg-muted/10 overflow-hidden">
                  {sharedProductImage(p, imageByBarcode).length > 10 ? (
                    <Image src={sharedProductImage(p, imageByBarcode)} alt={p.name} fill className="object-cover group-hover:scale-110 transition-transform duration-500" unoptimized />
                  ) : (
                    <div className="flex h-full items-center justify-center opacity-5"><ImageIcon className="h-10 w-10" /></div>
                  )}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {p.isOffer && <Badge className="bg-amber-500 text-white font-black text-[8px] border-none shadow-md px-2 py-0.5">OFERTA</Badge>}
                    {p.isCombo && <Badge className="bg-primary text-white font-black text-[8px] border-none shadow-md px-2 py-0.5">COMBO</Badge>}
                  </div>
                </div>
                <div className="p-3 md:p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <h3 className="font-black text-xs md:text-sm line-clamp-2 uppercase leading-tight min-h-[2.5rem]">{p.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <p className="text-lg md:text-xl font-black text-primary tracking-tighter">RD${p.salePrice}</p>
                      <span className="text-[8px] font-bold text-muted-foreground uppercase">x {p.unitType || 'ud'}</span>
                    </div>
                  </div>
                  <Button 
                    className="w-full h-11 rounded-xl font-black text-[10px] uppercase shadow-md active:scale-95 transition-all gap-2" 
                    onClick={() => p.isBreakdownAllowed ? setSelectedProductForBreakdown(p) : addToCart(p)}
                  >
                    {p.isBreakdownAllowed ? <Scale className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {p.isBreakdownAllowed ? "Por Monto" : "Añadir"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* FOOTER INFO */}
      <footer className="max-w-4xl mx-auto w-full p-8 text-center space-y-4 no-print">
         <div className="flex flex-col items-center gap-2 opacity-30">
            <Store className="h-6 w-6 text-primary" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em]">{colmado?.name}</p>
         </div>
         <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Desarrollado por Colmadom Cloud &copy; 2026</p>
      </footer>

      {/* BREAKDOWN DIALOG */}
      <Dialog open={!!selectedProductForBreakdown} onOpenChange={(open) => !open && setSelectedProductForBreakdown(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white shrink-0">
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Compra Fraccionada</DialogTitle>
            <DialogDescription className="text-white/80 font-bold">
              ¿Cuánto de <strong>{selectedProductForBreakdown?.name}</strong> deseas llevar?
            </DialogDescription>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="p-4 bg-primary/5 rounded-2xl text-center border-2 border-dashed border-primary/20">
              <p className="text-[10px] font-black uppercase text-primary/60 tracking-widest">Precio por {selectedProductForBreakdown?.unitType}</p>
              <p className="text-2xl font-black text-primary">RD${selectedProductForBreakdown?.salePrice}</p>
            </div>
            <div className="space-y-2">
              <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground ml-1">Monto en Pesos (RD$)</Label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-3xl font-black text-primary opacity-20">RD$</span>
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="h-20 pl-16 text-4xl font-black text-center rounded-3xl border-4 focus:border-primary transition-all shadow-inner" 
                  value={breakdownAmount} 
                  onChange={(e) => setBreakdownAmount(e.target.value)} 
                  autoFocus 
                />
              </div>
            </div>
          </div>
          <DialogFooter className="p-8 bg-muted/5 border-t">
            <Button className="w-full h-16 font-black text-xl rounded-2xl shadow-xl active:scale-95 transition-all" onClick={handleAddBreakdown} disabled={!breakdownAmount}>
              Confirmar y Añadir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
