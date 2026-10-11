"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Sparkles, 
  TrendingUp, 
  Package, 
  UserX, 
  Lightbulb, 
  RefreshCw, 
  Loader2, 
  FileText, 
  Printer, 
  PieChart as PieChartIcon,
  DollarSign,
  ArrowRightCircle,
  ChevronRight,
  Target,
  Calendar,
  Wallet
} from "lucide-react";
import { getBusinessInsights, AiPoweredBusinessInsightsOutput } from "@/ai/flows/ai-powered-business-insights";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, getDocs } from "firebase/firestore";
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent,
  ChartConfig
} from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import Image from "next/image";

export const dynamic = 'force-dynamic';

export default function InsightsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [insights, setInsights] = useState<AiPoweredBusinessInsightsOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Date Range States
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Financial Stats for Period
  const [financials, setFinancials] = useState({
    sales: 0,
    cogs: 0,
    expenses: 0,
    stockInvestment: 0,
    grossProfit: 0,
    grossMargin: 0,
    netMargin: 0
  });

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    setStartDate(lastWeek.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);

  const { data: profile } = useDoc(profileRef);

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);

  const { data: colmado } = useDoc(colmadoRef);

  const fetchInsights = async () => {
    if (!profile?.colmadoId || !startDate || !endDate) {
      toast({ variant: "destructive", title: "Acceso Requerido", description: "Por favor selecciona un rango de fechas válido." });
      return;
    }

    setLoading(true);
    try {
      const colmadoId = profile.colmadoId;
      const isAutonomous = !!colmado?.isAutonomous;

      const txSnap = await getDocs(query(
        collection(db, "colmados", colmadoId, "transactions"),
        where("createdAt", ">=", startDate + "T00:00:00Z"),
        where("createdAt", "<=", endDate + "T23:59:59Z")
      ));
      
      let totalSales = 0;
      let totalCogs = 0;
      const productCounts: Record<string, number> = {};
      
      txSnap.forEach(docSnap => {
        const tx = docSnap.data();
        if (tx.isAnnulled) return;
        totalSales += Number(tx.totalAmount) || 0;
        
        if (tx.totalCost) {
          totalCogs += Number(tx.totalCost);
        } else if (tx.items) {
          tx.items.forEach((item: any) => {
            totalCogs += (Number(item.costPrice || 0) * Number(item.quantity || 0));
          });
        }

        tx.items?.forEach((item: any) => {
          const name = item.productName || item.name;
          productCounts[name] = (productCounts[name] || 0) + (Number(item.quantity) || 0);
        });
      });

      const entrySnap = await getDocs(query(
        collection(db, "colmados", colmadoId, "bookkeepingEntries"),
        where("createdAt", ">=", startDate + "T00:00:00Z"),
        where("createdAt", "<=", endDate + "T23:59:59Z")
      ));
      
      let totalExpenses = 0;
      let totalStockInvestment = 0;
      entrySnap.forEach(docSnap => {
        const entry = docSnap.data();
        if (isAutonomous && entry.excludeFromAccounting) return;
        if (entry.entryType === 'ProductExpense') {
          totalStockInvestment += Math.abs(Number(entry.amount) || 0);
        } else if (entry.entryType?.includes('Expense')) {
          totalExpenses += Math.abs(Number(entry.amount) || 0);
        }
      });

      const topProducts = Object.entries(productCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([name, qty]) => `${name} (${qty.toFixed(1)} uds)`)
        .join(", ");

      const salesSummary = `En el periodo del ${startDate} al ${endDate} el colmado facturó RD$${totalSales.toLocaleString()}. Los artículos con mayor rotación fueron: ${topProducts || "ninguno registrado aún"}. El costo de la mercancía vendida (COGS) fue de RD$${totalCogs.toLocaleString()}. Los gastos operativos (Luz, alquiler, nómina) fueron de RD$${totalExpenses.toLocaleString()} y se invirtieron RD$${totalStockInvestment.toLocaleString()} en reabastecimiento de stock (Activos).`;

      const prodSnap = await getDocs(collection(db, "colmados", colmadoId, "products"));
      const lowStock: string[] = [];
      let totalItems = 0;
      prodSnap.forEach(docSnap => {
        const p = docSnap.data();
        if (p.isCombo) return;
        totalItems++;
        if (Number(p.quantityInStock) <= Number(p.minStockLevel || 5)) {
          lowStock.push(`${p.name} (${p.quantityInStock} ${p.unitType})`);
        }
      });

      const inventorySummary = `El catálogo cuenta con ${totalItems} productos físicos. Actualmente hay ${lowStock.length} artículos en nivel crítico de stock, incluyendo: ${lowStock.slice(0, 5).join(", ") || "ninguno"}.`;

      const custSnap = await getDocs(collection(db, "colmados", colmadoId, "customers"));
      let totalDebt = 0;
      const debtors: { name: string, debt: number }[] = [];
      custSnap.forEach(docSnap => {
        const c = docSnap.data();
        const debt = Number(c.currentDebt) || 0;
        totalDebt += debt;
        if (debt > 0) {
          debtors.push({ name: `${c.firstName} ${c.lastName}`, debt });
        }
      });

      const topDebtors = debtors
        .sort((a, b) => b.debt - a.debt)
        .slice(0, 3)
        .map(d => `${d.name} (RD$${d.debt.toLocaleString()})`)
        .join(", ");

      const fiadoSummary = `La cartera de fiados asciende a RD$${totalDebt.toLocaleString()} pendientes de cobro. Los clientes con mayores balances son: ${topDebtors || "ninguno con deuda activa"}.`;

      setFinancials({
        sales: totalSales,
        cogs: totalCogs,
        expenses: totalExpenses,
        stockInvestment: totalStockInvestment,
        grossProfit: totalSales - totalCogs,
        grossMargin: totalSales - totalCogs,
        netMargin: totalSales - totalCogs - totalExpenses
      });

      const result = await getBusinessInsights({
        salesSummary,
        inventorySummary,
        fiadoSummary,
      });

      setInsights(result);
      toast({ title: "Análisis Completado", description: "La IA ha procesado los datos de tu negocio para el periodo seleccionado." });
    } catch (error) {
      console.error("AI Insights Error:", error);
      toast({ title: "Error", description: "No se pudieron procesar los datos de tu colmado.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPDF = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const chartData = useMemo(() => {
    return [
      { name: "Costo Mercancía", value: financials.cogs, color: "#2563eb" },
      { name: "Gastos Op.", value: financials.expenses, color: "#f97316" },
      { name: "Utilidad Neta", value: Math.max(0, financials.netMargin), color: "#10b981" },
    ];
  }, [financials]);

  const chartConfig = {
    value: {
      label: "Monto RD$",
    },
    cogs: {
      label: "Costo Mercancía",
      color: "#2563eb",
    },
    expenses: {
      label: "Gastos Op.",
      color: "#f97316",
    },
    netProfit: {
      label: "Utilidad Neta",
      color: "#10b981",
    },
  } satisfies ChartConfig;

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 print:p-0">
      <style jsx global>{`
        @media print {
          @page { size: portrait; margin: 15mm; }
          body * { visibility: hidden !important; background: none !important; }
          .print-only, .print-only * { display: block !important; visibility: visible !important; }
          .print-only {
            position: relative !important; width: 100% !important; padding: 10mm !important;
            background: white !important; color: black !important; overflow: visible !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* HEADER DE IMPRESION A4 MEJORADO */}
      <div className="print-only hidden">
         <div className="flex items-center justify-between mb-12 border-b-8 border-primary pb-10">
            <div className="flex items-center gap-8 text-left">
               {colmado?.logoUrl && (
                 <div className="h-32 w-32 relative rounded-3xl overflow-hidden border-4 border-primary/20 shadow-xl shrink-0">
                    <Image src={colmado.logoUrl} alt="Logo" fill className="object-cover" unoptimized />
                 </div>
               )}
               <div className="flex-1 min-w-0">
                  <h1 className="text-5xl font-black uppercase text-primary leading-[0.9] break-words">{colmado?.name || "COLMADOM"}</h1>
                  <p className="text-xl font-bold text-muted-foreground mt-3">{colmado?.address}</p>
               </div>
            </div>
            <div className="text-right shrink-0 ml-6">
               <div className="bg-accent text-white px-10 py-4 rounded-[2rem] shadow-2xl">
                  <h2 className="text-2xl font-black uppercase tracking-widest leading-none">Reporte IA Insights</h2>
               </div>
               <p className="text-xs text-muted-foreground mt-4 uppercase font-black tracking-widest">Periodo: {startDate} - {endDate}</p>
            </div>
         </div>

         {insights && financials.sales > 0 && (
           <div className="space-y-12">
              <div className="grid grid-cols-3 gap-8">
                 <div className="p-8 bg-primary/5 border-2 border-primary/20 rounded-[2.5rem] text-center">
                    <p className="text-xs font-black uppercase text-primary/60 tracking-widest mb-1">Ventas Brutas</p>
                    <p className="text-4xl font-black text-primary">RD${financials.sales.toLocaleString()}</p>
                 </div>
                 <div className="p-8 bg-emerald-50 border-4 border-emerald-500 rounded-[2.5rem] text-center shadow-xl">
                    <p className="text-xs font-black uppercase text-emerald-600 tracking-widest mb-1">Utilidad Neta</p>
                    <p className="text-4xl font-black text-emerald-700">RD${financials.netMargin.toLocaleString()}</p>
                 </div>
                 <div className="p-8 bg-purple-50 border-2 border-purple-200 rounded-[2.5rem] text-center">
                    <p className="text-xs font-black uppercase text-purple-600 tracking-widest mb-1">Inversión Stock</p>
                    <p className="text-4xl font-black text-purple-700">RD${financials.stockInvestment.toLocaleString()}</p>
                 </div>
              </div>

              <div className="space-y-8">
                 <h3 className="text-2xl font-black text-primary border-b-4 border-primary/10 pb-2 uppercase tracking-tighter">Análisis Estratégico</h3>
                 <div className="p-10 bg-muted/5 rounded-[3rem] border-2 space-y-6">
                    <div><p className="text-sm font-black uppercase text-primary mb-2">Resumen Rendimiento:</p><p className="text-lg italic font-bold">"{insights.salesPerformanceSummary}"</p></div>
                    <div><p className="text-sm font-black uppercase text-orange-600 mb-2">Recomendación Stock:</p><p className="text-lg">{insights.stockOptimizationRecommendations}</p></div>
                    <div><p className="text-sm font-black uppercase text-emerald-600 mb-2">Visión General IA:</p><p className="text-lg font-black">"{insights.overallActionableInsights}"</p></div>
                 </div>
              </div>

              <div className="mt-60 grid grid-cols-2 gap-32 px-10">
                 <div className="border-t-4 border-primary/30 pt-6 text-center font-black uppercase text-xs">FIRMA ANALISTA</div>
                 <div className="border-t-4 border-primary/30 pt-6 text-center font-black uppercase text-xs">VALIDADO POR DUEÑO</div>
              </div>
           </div>
         )}
      </div>

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-accent/10 rounded-2xl">
            <Sparkles className="h-8 w-8 text-accent animate-pulse" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-primary">IA Insights</h1>
            <p className="text-muted-foreground mt-1 font-bold">Análisis estratégico por rango de fecha.</p>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {insights && (
            <Button variant="outline" onClick={handlePrintPDF} className="flex-1 md:flex-none h-14 px-6 font-black gap-2 border-primary text-primary">
              <Printer className="h-5 w-5" /> Exportar PDF
            </Button>
          )}
          <Button onClick={fetchInsights} disabled={loading} size="lg" className="flex-1 md:flex-none bg-accent hover:bg-accent/90 gap-2 h-14 px-8 text-lg font-black shadow-xl">
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6" />}
            {insights ? "Actualizar Análisis" : "Generar Análisis"}
          </Button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-2xl border shadow-sm no-print">
        <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-widest"><Calendar className="h-4 w-4" /> Periodo a Analizar:</div>
        <div className="flex gap-2 bg-muted/30 p-1 rounded-xl w-full md:w-auto">
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
            className="bg-transparent text-sm font-bold p-2 outline-none" 
          />
          <span className="flex items-center text-muted-foreground font-black px-1">-</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
            className="bg-transparent text-sm font-bold p-2 outline-none" 
          />
        </div>
      </div>

      {insights && financials.sales > 0 && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700 no-print">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="border-none shadow-xl rounded-[2rem] bg-white border-l-8 border-l-primary group hover:scale-[1.02] transition-all">
              <CardHeader className="pb-1">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Ventas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-primary">RD${financials.sales.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl rounded-[2rem] bg-white border-l-8 border-l-orange-500 group hover:scale-[1.02] transition-all">
              <CardHeader className="pb-1">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600 flex items-center gap-2">
                  <Target className="h-4 w-4" /> Margen Bruto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-orange-600">RD${financials.grossMargin.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl rounded-[2rem] bg-white border-l-8 border-l-purple-500 group hover:scale-[1.02] transition-all">
              <CardHeader className="pb-1">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-purple-600 flex items-center gap-2">
                  <Package className="h-4 w-4" /> Reinversión
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-purple-600">RD${financials.stockInvestment.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl rounded-[2rem] bg-white border-l-8 border-l-emerald-500 group hover:scale-[1.02] transition-all">
              <CardHeader className="pb-1">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Margen Neto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-emerald-600">RD${financials.netMargin.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl rounded-[2rem] bg-white border-l-8 border-l-accent group hover:scale-[1.02] transition-all">
              <CardHeader className="pb-1">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4" /> Eficiencia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-accent">{((financials.netMargin / (financials.sales || 1)) * 100).toFixed(1)}%</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-5 shadow-xl border-none rounded-[2.5rem] bg-white overflow-hidden flex flex-col">
              <CardHeader className="bg-muted/30 pb-0">
                <CardTitle className="text-lg font-black text-primary">Distribución de Ingresos</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 pt-6 flex flex-col items-center justify-center">
                <div className="h-[250px] w-full">
                  <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                        {chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    </PieChart>
                  </ChartContainer>
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-7 space-y-4">
              <Card className="bg-primary/5 border-2 border-primary/10 shadow-2xl rounded-[2.5rem] overflow-hidden">
                <CardHeader className="p-6">
                  <CardTitle className="flex items-center gap-2 text-xl font-black text-primary">
                    <Lightbulb className="h-6 w-6 text-accent" /> Recomendaciones Estratégicas
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                   <div className="bg-white/80 backdrop-blur p-4 rounded-2xl border shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-primary mb-1">Optimización Stock</h4>
                      <p className="text-xs font-bold text-muted-foreground">{insights.stockOptimizationRecommendations}</p>
                   </div>
                   <div className="bg-white/80 backdrop-blur p-4 rounded-2xl border shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-orange-600 mb-1">Visión General</h4>
                      <p className="text-xs font-bold text-muted-foreground">{insights.overallActionableInsights}</p>
                   </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
