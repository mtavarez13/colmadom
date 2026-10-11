"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Plus, 
  Search, 
  Package, 
  Loader2, 
  ImageIcon, 
  Edit, 
  Trash2, 
  PlusCircle, 
  Barcode, 
  CheckCircle2, 
  Layers,
  Camera,
  History,
  ArrowDownCircle,
  UserCircle,
  Tag,
  Hash,
  Lock,
  AlertTriangle,
  X,
  Link as LinkIcon,
  Scale,
  Printer,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Upload,
  Check,
  Save,
  Download,
  Scissors
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, increment, query, where, orderBy, limit, getDoc, setDoc } from "firebase/firestore";
import { setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Image from "next/image";
import * as XLSX from 'xlsx';
import { processInvoice, type ProcessInvoiceOutput } from "@/ai/flows/process-invoice-flow";
import { productBarcodes, sharedProductImage } from '@/lib/shared-catalog';

export const dynamic = 'force-dynamic';

const PRODUCT_CATEGORIES = [
  "Alimentos Básicos",
  "Víveres y Agrícola",
  "Embutidos y Lácteos",
  "Bebidas con Alcohol",
  "Bebidas sin Alcohol",
  "Desayuno y Merienda",
  "Enlatados y Conservas",
  "Higiene Personal",
  "Limpieza del Hogar",
  "Varios y Misceláneos",
  "Combos"
];

const UNIT_TYPES = ["un", "lb", "fardo", "galón", "onza", "caja", "litro", "botella"];

export default function InventoryPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Modal control states
  const [isNewProductDialogOpen, setIsNewProductDialogOpen] = useState(false);
  const [isRestockDialogOpen, setIsRestockDialogOpen] = useState(false);
  const [isAiInvoiceDialogOpen, setIsAiInvoiceDialogOpen] = useState(false);
  const [isDeleteAuthDialogOpen, setIsDeleteAuthDialogOpen] = useState(false);
  
  // Barcode expansion state
  const [showExtraBarcodes, setShowExtraBarcodes] = useState(false);

  // Form states
  const [newBarcode, setNewBarcode] = useState("");
  const [newBarcode2, setNewBarcode2] = useState("");
  const [newBarcode3, setNewBarcode3] = useState("");
  const [newBarcode4, setNewBarcode4] = useState("");
  const [newBarcode5, setNewBarcode5] = useState("");
  const [newCodigoBalanza, setNewCodigoBalanza] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("un");
  const [newStock, setNewStock] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newItbisRate, setNewItbisRate] = useState("0");
  const [newCategory, setNewCategory] = useState("Alimentos Básicos");
  const [newIsBreakdownAllowed, setNewIsBreakdownAllowed] = useState(false);
  const [newMinStockLevel, setNewMinStockLevel] = useState("5");
  const [newImageUrl, setNewImageUrl] = useState("");
  
  // Combo/Extra States
  const [isCombo, setIsCombo] = useState(false);
  const [comboItems, setComboItems] = useState<{ id: string; name: string; quantity: number }[]>([]);
  const [isExtra, setIsExtra] = useState(false);
  const [sourceProductId, setSourceProductId] = useState("");
  const [unitsToDiscount, setUnitsToDiscount] = useState("1");

  // Restock states
  const [restockProduct, setRestockProduct] = useState<any>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockCost, setRestockCost] = useState("");

  // Deletion states
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [masterKeyInput, setMasterKeyInput] = useState("");

  const [editingProduct, setEditingProduct] = useState<any>(null);

  // Excel & IA States
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [invoiceResults, setInvoiceResults] = useState<ProcessInvoiceOutput | null>(null);

  const excelInputRef = useRef<HTMLInputElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc(profileRef);

  const colmadoRef = useMemoFirebase(() => {
    if (!db || !profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);
  const { data: colmado } = useDoc(colmadoRef);

  const productsQuery = useMemoFirebase(() => {
    if (!db || !profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "products");
  }, [db, profile?.colmadoId]);
  const { data: products, isLoading } = useCollection(productsQuery);
  const sharedImagesQuery = useMemoFirebase(() => collection(db, 'sharedCatalogImages'), [db]);
  const { data: sharedImages, error: sharedImagesError } = useCollection(sharedImagesQuery, { permissionErrorIsLocal: true });
  const imageByBarcode = useMemo(() => Object.fromEntries((sharedImages || []).map(item => [item.id, item.imageUrl])), [sharedImages]);

  useEffect(() => {
    if (!products || !sharedImages || !profile?.colmadoId) return;
    for (const product of products) {
      if (!product.imageUrl) continue;
      for (const barcode of productBarcodes(product)) {
        if (imageByBarcode[barcode]) continue;
        const ref = doc(db, 'sharedCatalogImages', barcode);
        getDoc(ref).then(snapshot => {
          if (!snapshot.exists()) return setDoc(ref, { barcode, imageUrl: product.imageUrl, updatedAt: new Date().toISOString() });
        }).catch(() => undefined);
      }
    }
  }, [db, products, sharedImages, imageByBarcode, profile?.colmadoId]);

  const filtered = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => 
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (p.barcode && p.barcode.includes(searchTerm)) ||
      (p.barcode2 && p.barcode2.includes(searchTerm)) ||
      (p.barcode3 && p.barcode3.includes(searchTerm)) ||
      (p.barcode4 && p.barcode4.includes(searchTerm)) ||
      (p.barcode5 && p.barcode5.includes(searchTerm)) ||
      (p.codigoBalanza?.toString() === searchTerm) ||
      (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [products, searchTerm]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingImage(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      setNewImageUrl(event.target?.result as string);
      setIsProcessingImage(false);
    };
  };

  const executeSaveProduct = async () => {
    if (!db || !profile?.colmadoId || !newName || !newPrice) return;
    setIsSaving(true);
    const productId = editingProduct?.id || `p_${Date.now()}`;
    const now = new Date().toISOString();
    
    const productData = {
      id: productId,
      barcode: newBarcode || "",
      barcode2: newBarcode2 || "",
      barcode3: newBarcode3 || "",
      barcode4: newBarcode4 || "",
      barcode5: newBarcode5 || "",
      codigoBalanza: newCodigoBalanza ? Number(newCodigoBalanza) : null,
      name: newName,
      unitType: newUnit,
      quantityInStock: isCombo || isExtra ? 0 : Number(newStock) || 0,
      basePrice: Number(newCost) || 0,
      salePrice: Number(newPrice) || 0,
      itbisRate: Number(newItbisRate) || 0,
      category: isCombo ? "Combos" : newCategory,
      isBreakdownAllowed: newIsBreakdownAllowed,
      minStockLevel: Number(newMinStockLevel) || 5,
      imageUrl: newImageUrl || "",
      isCombo,
      comboItems: isCombo ? comboItems : [],
      isExtra,
      sourceProductId: isExtra ? sourceProductId : "",
      unitsToDiscount: isExtra ? (Number(unitsToDiscount) || 1) : 1,
      updatedAt: now,
      createdAt: editingProduct?.createdAt || now,
    };

    try {
      if (newImageUrl && (!editingProduct || newImageUrl !== editingProduct.imageUrl)) {
        await Promise.all(productBarcodes(productData).map(barcode =>
          setDoc(doc(db, 'sharedCatalogImages', barcode), { barcode, imageUrl: newImageUrl, updatedAt: now }, { merge: true })
        ));
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo compartir la imagen', description: 'Revisa los permisos o el tamaño de la imagen.' });
      setIsSaving(false);
      return;
    }
    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "products", productId), productData, { merge: true });
    toast({ title: editingProduct ? "Producto Actualizado" : "Producto Registrado" });
    setIsNewProductDialogOpen(false);
    resetForm();
    setIsSaving(false);
  };

  const handleOpenEdit = (product: any) => {
    setEditingProduct(product);
    setNewBarcode(product.barcode || "");
    setNewBarcode2(product.barcode2 || "");
    setNewBarcode3(product.barcode3 || "");
    setNewBarcode4(product.barcode4 || "");
    setNewBarcode5(product.barcode5 || "");
    setNewCodigoBalanza(product.codigoBalanza?.toString() || "");
    setNewName(product.name || "");
    setNewUnit(product.unitType || "un");
    setNewStock(product.quantityInStock?.toString() || "");
    setNewCost(product.basePrice?.toString() || "");
    setNewPrice(product.salePrice?.toString() || "");
    setNewItbisRate(String(product.itbisRate ?? 0));
    setNewCategory(product.category || "Alimentos Básicos");
    setNewIsBreakdownAllowed(!!product.isBreakdownAllowed);
    setNewMinStockLevel(product.minStockLevel?.toString() || "5");
    setNewImageUrl(product.imageUrl || "");
    setIsCombo(!!product.isCombo);
    setComboItems(product.comboItems || []);
    setIsExtra(!!product.isExtra);
    setSourceProductId(product.sourceProductId || "");
    setUnitsToDiscount(product.unitsToDiscount?.toString() || "1");
    
    if (product.barcode2 || product.barcode3 || product.barcode4 || product.barcode5) {
      setShowExtraBarcodes(true);
    }

    setIsNewProductDialogOpen(true);
  };

  const handleRestock = () => {
    if (!profile?.colmadoId || !restockProduct || !restockQuantity) return;
    const qty = Number(restockQuantity);
    const cost = restockCost ? Number(restockCost) : Number(restockProduct.basePrice);

    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "products", restockProduct.id), {
      quantityInStock: increment(qty),
      basePrice: cost,
      updatedAt: new Date().toISOString()
    });

    toast({ title: "Entrada Registrada" });
    setIsRestockDialogOpen(false);
    setRestockProduct(null);
    setRestockQuantity("");
  };

  const handleDeleteRequest = (product: any) => {
    setProductToDelete(product);
    setMasterKeyInput("");
    setIsDeleteAuthDialogOpen(true);
  };

  const handleVerifyDeleteMasterKey = () => {
    if (masterKeyInput === colmado?.masterKey) {
      if (productToDelete && profile?.colmadoId) {
        deleteDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "products", productToDelete.id));
        toast({ variant: "destructive", title: "Producto Eliminado", description: `${productToDelete.name} ha sido borrado.` });
      }
      setIsDeleteAuthDialogOpen(false);
      setMasterKeyInput("");
      setProductToDelete(null);
    } else {
      toast({ variant: "destructive", title: "Llave Incorrecta", description: "Acceso denegado." });
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setNewBarcode(""); setNewBarcode2(""); setNewBarcode3(""); setNewBarcode4(""); setNewBarcode5(""); 
    setNewCodigoBalanza("");
    setNewName(""); setNewUnit("un"); setNewStock(""); setNewCost(""); setNewPrice(""); setNewItbisRate("0");
    setNewCategory("Alimentos Básicos"); setNewIsBreakdownAllowed(false);
    setNewMinStockLevel("5"); setNewImageUrl("");
    setIsCombo(false); setComboItems([]); setIsExtra(false); setSourceProductId("");
    setShowExtraBarcodes(false);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        processExcelData(data);
      } catch (error) {
        toast({ variant: "destructive", title: "Error Excel" });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const processExcelData = (data: any[]) => {
    if (!profile?.colmadoId || !products) return;
    let updatedCount = 0;
    let createdCount = 0;

    data.forEach((row: any) => {
      // Mapear encabezados dinámicos
      const name = row.Nombre || row.nombre || row.producto;
      const barcode = String(row.Código || row.codigo || row.barcode || "");
      const category = row.Categoría || row.categoria || "Alimentos Básicos";
      const unit = row.Unidad || row.unidad || "un";
      const stock = Number(row.Stock || row.stock || row.cantidad || 0);
      const cost = Number(row["Precio Costo (RD$)"] || row.costo || 0);
      const sale = Number(row["Precio Venta (RD$)"] || row.venta || 0);
      const itbis = Number(row["ITBIS (%)"] || row.itbis || 0);
      const minStock = Number(row["Mínimo Stock"] || row.minimo || 5);
      const breakdown = String(row["Venta Fraccionada"] || "").toLowerCase() === "si" || row.fraccionado === true;
      const plu = row["Producto Balanza"] || row.plu || null;

      if (!name) return;

      const match = products.find(p => 
        (barcode && p.barcode === barcode) || 
        (name && p.name.toLowerCase() === name.toString().toLowerCase())
      );

      const now = new Date().toISOString();
      const productData = {
        name,
        barcode,
        category,
        unitType: unit,
        basePrice: cost,
        salePrice: sale,
        itbisRate: itbis,
        minStockLevel: minStock,
        isBreakdownAllowed: breakdown,
        codigoBalanza: plu ? Number(plu) : null,
        updatedAt: now
      };

      if (match) {
        // Actualizar stock e info
        updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "products", match.id), {
          ...productData,
          quantityInStock: increment(stock)
        });
        updatedCount++;
      } else {
        // Crear nuevo
        const newId = `p_xl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "products", newId), {
          ...productData,
          id: newId,
          colmadoId: profile.colmadoId,
          quantityInStock: stock,
          createdAt: now,
          imageUrl: ""
        }, { merge: true });
        createdCount++;
      }
    });

    toast({ 
      title: "Carga Finalizada", 
      description: `Se crearon ${createdCount} items y se actualizaron ${updatedCount}.` 
    });
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Nombre", 
      "Código", 
      "Categoría", 
      "Unidad", 
      "Stock", 
      "Precio Costo (RD$)", 
      "ITBIS (%)", 
      "Precio Venta (RD$)", 
      "Mínimo Stock", 
      "Venta Fraccionada", 
      "Producto Balanza"
    ];

    const sampleData = [
      {
        "Nombre": "Arroz Selecto 1lb",
        "Código": "7460100001234",
        "Categoría": "Alimentos Básicos",
        "Unidad": "lb",
        "Stock": 100,
        "Precio Costo (RD$)": 25.50,
        "ITBIS (%)": 0,
        "Precio Venta (RD$)": 35.00,
        "Mínimo Stock": 20,
        "Venta Fraccionada": "Si",
        "Producto Balanza": ""
      },
      {
        "Nombre": "Aceite Crisol 1L",
        "Código": "7460100005678",
        "Categoría": "Alimentos Básicos",
        "Unidad": "un",
        "Stock": 24,
        "Precio Costo (RD$)": 180.00,
        "ITBIS (%)": 18,
        "Precio Venta (RD$)": 225.00,
        "Mínimo Stock": 6,
        "Venta Fraccionada": "No",
        "Producto Balanza": ""
      },
      {
        "Nombre": "Salami Induveca lb",
        "Código": "",
        "Categoría": "Embutidos y Lácteos",
        "Unidad": "lb",
        "Stock": 50,
        "Precio Costo (RD$)": 120.00,
        "ITBIS (%)": 0,
        "Precio Venta (RD$)": 165.00,
        "Mínimo Stock": 10,
        "Venta Fraccionada": "Si",
        "Producto Balanza": "104"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    
    XLSX.writeFile(wb, "Plantilla_Carga_Masiva_Colmadom.xlsx");
    toast({ title: "Plantilla Descargada", description: "Completa el archivo con tus productos." });
  };

  const handleExportExcel = () => {
    if (!filtered || filtered.length === 0) {
      toast({ variant: "destructive", title: "Sin datos", description: "No hay productos para exportar." });
      return;
    }

    const headers = [
      "Nombre", 
      "Código", 
      "Categoría", 
      "Unidad", 
      "Stock", 
      "Precio Costo (RD$)", 
      "ITBIS (%)", 
      "Precio Venta (RD$)", 
      "Mínimo Stock", 
      "Venta Fraccionada", 
      "Producto Balanza"
    ];

    const exportData = filtered.map(p => ({
      "Nombre": p.name || "",
      "Código": p.barcode || "",
      "Categoría": p.category || "",
      "Unidad": p.unitType || "un",
      "Stock": p.quantityInStock || 0,
      "Precio Costo (RD$)": p.basePrice || 0,
      "ITBIS (%)": p.itbisRate || 0,
      "Precio Venta (RD$)": p.salePrice || 0,
      "Mínimo Stock": p.minStockLevel || 5,
      "Venta Fraccionada": p.isBreakdownAllowed ? "Si" : "No",
      "Producto Balanza": p.codigoBalanza || ""
    }));

    const ws = XLSX.utils.json_to_sheet(exportData, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    
    const fileName = `Inventario_${colmado?.name || 'Colmadom'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast({ title: "Exportación Exitosa", description: "El inventario ha sido descargado en formato Excel." });
  };

  const handleExportPdf = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingAi(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async (evt) => {
      const dataUri = evt.target?.result as string;
      try {
        const result = await processInvoice({ photoDataUri: dataUri });
        setInvoiceResults(result);
        setIsAiInvoiceDialogOpen(true);
      } catch (error) {
        toast({ variant: "destructive", title: "Error IA" });
      } finally {
        setIsProcessingAi(false);
      }
    };
    e.target.value = "";
  };

  if (!mounted) return <div className="p-8 text-sm text-muted-foreground">Cargando inventario…</div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 no-print">
      <style jsx global>{`
        @media print {
          @page { size: portrait; margin: 15mm; }
          body * { visibility: hidden !important; background: none !important; }
          .inventory-print-list, .inventory-print-list * { visibility: visible !important; }
          .inventory-print-list {
            display: block !important;
            position: relative !important;
            width: 100% !important; padding: 10mm !important;
            background: white !important; color: black !important;
            z-index: 9999 !important; font-family: 'PT Sans', sans-serif !important;
            overflow: visible !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      {sharedImagesError && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">El catálogo de imágenes compartidas aún no tiene permiso en Firebase. Puedes seguir usando el inventario; las imágenes comunes aparecerán cuando se publiquen las reglas de Firestore.</div>}

      {/* ÁREA DE IMPRESIÓN PDF A4 */}
      <div className="inventory-print-list hidden">
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
               <div className="bg-primary text-white px-10 py-4 rounded-[2rem] shadow-2xl">
                  <h2 className="text-2xl font-black uppercase tracking-widest leading-none">Inventario</h2>
               </div>
               <p className="text-xs text-muted-foreground mt-4 uppercase font-black tracking-widest">Emisión: {mounted ? new Date().toLocaleString() : ''}</p>
            </div>
         </div>

         <div className="grid grid-cols-3 gap-8 mb-12">
            <div className="p-8 bg-primary/5 border-2 border-primary/20 rounded-[2.5rem] text-center">
               <p className="text-[10px] font-black uppercase text-primary/60 tracking-widest mb-1">Items Totales</p>
               <p className="text-5xl font-black text-primary">{filtered.length}</p>
            </div>
            <div className="p-8 bg-emerald-50 border-2 border-emerald-200 rounded-[2.5rem] text-center">
               <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-1">Valoración Costo</p>
               <p className="text-4xl font-black text-emerald-700">RD${filtered.reduce((sum, p) => sum + (Number(p.quantityInStock) * Number(p.basePrice)), 0).toLocaleString()}</p>
            </div>
            <div className="p-8 bg-blue-50 border-2 border-blue-200 rounded-[2.5rem] text-center">
               <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-1">Ingreso Venta</p>
               <p className="text-4xl font-black text-blue-700">RD${filtered.reduce((sum, p) => sum + (Number(p.quantityInStock) * Number(p.salePrice)), 0).toLocaleString()}</p>
            </div>
         </div>

         <table className="w-full border-collapse border border-primary/10 text-[12px]">
            <thead>
               <tr className="bg-primary text-white font-black uppercase">
                  <th className="border border-primary/20 p-4 text-left">PRODUCTO / CATEGORÍA</th>
                  <th className="border border-primary/20 p-4 text-center">STOCK</th>
                  <th className="border border-primary/20 p-4 text-right">COSTO</th>
                  <th className="border border-primary/20 p-4 text-right">VENTA</th>
               </tr>
            </thead>
            <tbody>
               {filtered.map(p => (
                 <tr key={p.id} className="border-b border-primary/5 hover:bg-primary/5">
                    <td className="p-4 font-black uppercase text-primary">
                      {p.name} <br/>
                      <span className="text-[9px] opacity-40">{p.category}</span>
                    </td>
                    <td className="p-4 text-center font-black text-primary bg-primary/5">
                      {Number(p.quantityInStock).toFixed(1)} <span className="text-[9px] opacity-50 uppercase">{p.unitType}</span>
                    </td>
                    <td className="p-4 text-right text-muted-foreground">RD${Number(p.basePrice).toLocaleString()}</td>
                    <td className="p-4 text-right font-black text-primary text-lg">RD${Number(p.salePrice).toLocaleString()}</td>
                 </tr>
               ))}
            </tbody>
         </table>

         <div className="mt-60 grid grid-cols-2 gap-32 px-10">
            <div className="border-t-4 border-primary/30 pt-6 text-center">
               <p className="font-black text-xs uppercase text-primary">FIRMA ENCARGADO</p>
            </div>
            <div className="border-t-4 border-primary/30 pt-6 text-center">
               <p className="font-black text-xs uppercase text-primary">VALIDACIÓN GERENCIAL</p>
            </div>
         </div>
      </div>

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="p-3 bg-primary/10 rounded-2xl"><Package className="h-8 w-8 text-primary" /></div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-primary uppercase">Inventario</h1>
            <p className="text-muted-foreground mt-1 font-bold">Gestión de stock y suministros.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-12 font-black gap-2 border-emerald-500 text-emerald-600 rounded-2xl shadow-sm" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4" /> Plantilla
          </Button>
          <Button variant="outline" className="h-12 font-black gap-2 border-primary text-primary rounded-2xl shadow-sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
          </Button>
          <Button variant="outline" className="h-12 font-black gap-2 border-primary/40 text-primary rounded-2xl shadow-sm" onClick={() => excelInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Importar Excel
          </Button>
          <input type="file" ref={excelInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
          <Button variant="outline" className="h-12 font-black gap-2 border-primary text-primary rounded-2xl shadow-sm" onClick={handleExportPdf}>
            <FileText className="h-4 w-4" /> Exportar PDF
          </Button>
          <Button variant="outline" className="h-12 font-black gap-2 border-accent text-accent rounded-2xl shadow-sm" onClick={() => invoiceInputRef.current?.click()} disabled={isProcessingAi}>
            {isProcessingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Factura IA
          </Button>
          <input type="file" ref={invoiceInputRef} className="hidden" accept="image/*" onChange={handleInvoiceUpload} />
          
          <Dialog open={isNewProductDialogOpen} onOpenChange={(open) => { setIsNewProductDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2 bg-primary font-black h-12 px-8 rounded-2xl shadow-xl">
                <Plus className="h-5 w-5" /> Nuevo Producto
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
              <DialogHeader className="p-8 bg-primary text-white shrink-0">
                <DialogTitle className="text-3xl font-black uppercase tracking-tight">{editingProduct ? 'Editar Producto' : 'Nuevo Registro'}</DialogTitle>
                <DialogDescription className="text-white/80 font-bold">Completa los datos para actualizar tus estanterías digitales.</DialogDescription>
              </DialogHeader>
              
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-8 space-y-8 pb-20">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
                      <div className="md:col-span-4 space-y-4">
                        <Label className="font-black text-xs uppercase tracking-widest text-primary">Imagen del Artículo</Label>
                        <div className="aspect-square w-full border-4 border-dashed rounded-[2rem] bg-muted/20 flex flex-col items-center justify-center overflow-hidden relative group transition-all hover:bg-muted/30 shadow-inner">
                          {newImageUrl ? <Image src={newImageUrl} alt="Preview" fill className="object-cover" unoptimized /> : <Camera className="h-10 w-10 text-muted-foreground/30" />}
                          <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} />
                          {!newImageUrl && <p className="text-[10px] font-black text-muted-foreground/50 uppercase mt-2">Subir Foto</p>}
                        </div>
                      </div>
                      <div className="md:col-span-8 space-y-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1 text-primary">Nombre Comercial</Label>
                          <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-14 rounded-2xl font-black text-xl border-2 shadow-sm focus:border-primary transition-all" placeholder="Ej: Arroz Selecto 1lb" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="font-black text-[10px] uppercase text-primary ml-1">Precio Venta (RD$)</Label>
                            <Input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className="h-14 rounded-2xl font-black text-primary text-2xl border-2 border-primary/20 shadow-md" />
                          </div>
                          <div className="space-y-2">
                            <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Precio Costo (RD$)</Label>
                            <Input type="number" value={newCost} onChange={(e) => setNewCost(e.target.value)} className="h-14 rounded-2xl font-bold border-2 shadow-sm" />
                          </div>
                        </div>
                        <div className="space-y-2"><Label className="font-black text-[10px] uppercase text-primary">ITBIS aplicable</Label><Select value={newItbisRate} onValueChange={setNewItbisRate}><SelectTrigger className="h-12 rounded-xl border-2"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">Exento (0%)</SelectItem><SelectItem value="16">ITBIS 16%</SelectItem><SelectItem value="18">ITBIS 18%</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">La factura fiscal separará automáticamente la base imponible y el ITBIS incluido en el precio de venta.</p></div>
                      </div>
                    </div>

                    <Separator className="opacity-10" />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Categoría</Label>
                        <Select value={newCategory} onValueChange={setNewCategory}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold focus:border-primary"><SelectValue /></SelectTrigger>
                          <SelectContent>{PRODUCT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-black text-[10px] uppercase text-primary ml-1">Stock Físico Inicial</Label>
                        <Input type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} className="h-12 rounded-xl font-black border-2 border-primary/10 shadow-inner" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Unidad de Medida</Label>
                        <Select value={newUnit} onValueChange={setNewUnit}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold focus:border-primary"><SelectValue /></SelectTrigger>
                          <SelectContent>{UNIT_TYPES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="font-black text-[10px] uppercase tracking-widest text-primary">Identificación (EAN / PLU)</Label>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-primary hover:bg-primary/10" onClick={() => setShowExtraBarcodes(!showExtraBarcodes)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-3">
                          <div className="relative">
                            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Código de Barras Principal" value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} className="pl-9 h-11 rounded-xl font-mono shadow-sm" />
                          </div>
                          
                          {showExtraBarcodes && (
                            <div className="space-y-3 animate-in slide-in-from-top-2">
                              <Input placeholder="Código Secundario 1" value={newBarcode2} onChange={(e) => setNewBarcode2(e.target.value)} className="h-11 rounded-xl font-mono shadow-sm" />
                              <Input placeholder="Código Secundario 2" value={newBarcode3} onChange={(e) => setNewBarcode3(e.target.value)} className="h-11 rounded-xl font-mono shadow-sm" />
                              <Input placeholder="Código Secundario 3" value={newBarcode4} onChange={(e) => setNewBarcode4(e.target.value)} className="h-11 rounded-xl font-mono shadow-sm" />
                              <Input placeholder="Código Secundario 4" value={newBarcode5} onChange={(e) => setNewBarcode5(e.target.value)} className="h-11 rounded-xl font-mono shadow-sm" />
                            </div>
                          )}

                          <div className="relative border-t pt-4">
                            <Hash className="absolute left-3 bottom-3 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Código de Balanza (PLU)" value={newCodigoBalanza} onChange={(e) => setNewCodigoBalanza(e.target.value)} className="pl-9 h-11 rounded-xl font-mono bg-blue-50/50 border-blue-100" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-5 bg-primary/5 rounded-[1.5rem] border-2 border-dashed border-primary/20 shadow-inner">
                          <div className="flex items-center gap-3">
                            <Scale className="h-6 w-6 text-primary" />
                            <div className="flex flex-col">
                               <Label htmlFor="breakdown" className="font-black text-xs uppercase text-primary">Venta Fraccionada</Label>
                               <span className="text-[8px] font-bold opacity-50 uppercase leading-none">Permite vender por monto (RD$)</span>
                            </div>
                          </div>
                          <Checkbox id="breakdown" checked={newIsBreakdownAllowed} onCheckedChange={(val) => setNewIsBreakdownAllowed(!!val)} className="h-8 w-8 rounded-xl border-2" />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-black text-[10px] uppercase text-destructive ml-1">Alerta de Reorden (Mínimo)</Label>
                          <Input type="number" value={newMinStockLevel} onChange={(e) => setNewMinStockLevel(e.target.value)} className="h-12 rounded-xl font-black border-destructive/20 text-destructive bg-destructive/5" />
                        </div>
                      </div>
                    </div>

                    <Separator className="opacity-10" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-10">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Layers className="h-5 w-5 text-primary" />
                          <Label className="font-black text-xs uppercase text-primary tracking-widest">Configuración de Combos</Label>
                        </div>
                        <div className="p-4 bg-muted/10 rounded-2xl flex items-center space-x-3 border-2 border-transparent hover:border-primary/20 transition-all cursor-pointer" onClick={() => setIsCombo(!isCombo)}>
                          <Checkbox id="isCombo" checked={isCombo} onCheckedChange={(val) => setIsCombo(!!val)} className="h-6 w-6 rounded-lg" />
                          <div className="flex flex-col">
                             <label htmlFor="isCombo" className="text-sm font-black uppercase text-primary cursor-pointer">Este producto es un Combo</label>
                             <span className="text-[8px] font-bold text-muted-foreground uppercase leading-none">Descuenta stock de múltiples artículos.</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Scissors className="h-5 w-5 text-primary" />
                          <Label className="font-black text-xs uppercase text-primary tracking-widest">Configuración de Extras</Label>
                        </div>
                        <div className="p-4 bg-muted/10 rounded-2xl flex items-center space-x-3 border-2 border-transparent hover:border-primary/20 transition-all cursor-pointer" onClick={() => setIsExtra(!isExtra)}>
                          <Checkbox id="isExtra" checked={isExtra} onCheckedChange={(val) => setIsExtra(!!val)} className="h-6 w-6 rounded-lg" />
                          <div className="flex flex-col">
                             <label htmlFor="isExtra" className="text-sm font-black uppercase text-primary cursor-pointer">Es un Extra (Derivado)</label>
                             <span className="text-[8px] font-bold text-muted-foreground uppercase leading-none">Afecta el stock de un producto base (ej: frío-frío).</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <ScrollBar orientation="vertical" />
                </ScrollArea>
              </div>
              
              <DialogFooter className="p-6 bg-muted/10 border-t shrink-0">
                <Button onClick={executeSaveProduct} className="w-full h-16 text-xl font-black rounded-2xl shadow-2xl bg-primary text-white gap-3 active:scale-95 transition-all hover:scale-[1.01]" disabled={isSaving}>
                  {isSaving ? <Loader2 className="animate-spin h-6 w-6" /> : <Save className="h-6 w-6" />}
                  Guardar Producto en Anaquel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
        <div className="p-8 border-b bg-muted/10">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
            <Input placeholder="Buscar en anaqueles por nombre, código o categoría..." className="pl-14 h-16 bg-white rounded-2xl font-black text-lg border-none shadow-inner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 h-20">
              <TableRow>
                <TableHead className="font-black px-8 text-primary uppercase text-[10px]">Producto / Categoría</TableHead>
                <TableHead className="font-black text-center text-primary uppercase text-[10px]">Stock Disponible</TableHead>
                <TableHead className="font-black text-right text-primary uppercase text-[10px]">Precio Venta</TableHead>
                <TableHead className="text-right font-black px-8 text-primary uppercase text-[10px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-8 w-8 text-primary opacity-20" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-32 italic font-black opacity-10 text-2xl uppercase tracking-[0.2em]">Inventario Vacío</TableCell></TableRow>
              ) : filtered.map((product) => (
                <TableRow key={product.id} className="hover:bg-muted/30 transition-colors h-24">
                  <TableCell className="px-8 py-5">
                    <div className="flex items-center gap-5">
                      <div className="h-14 w-14 rounded-2xl bg-muted/20 flex items-center justify-center relative overflow-hidden border shadow-sm">
                        {sharedProductImage(product, imageByBarcode) ? <Image src={sharedProductImage(product, imageByBarcode)} alt="" fill className="object-cover" unoptimized /> : <Package className="h-6 w-6 opacity-10" />}
                      </div>
                      <div>
                        <p className="font-black text-primary text-md uppercase leading-none">{product.name}</p>
                        <Badge variant="outline" className="text-[8px] font-black uppercase opacity-50 border-primary/20 mt-2">{product.category}</Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                       <span className={`text-2xl font-black ${Number(product.quantityInStock) <= (product.minStockLevel || 5) ? 'text-destructive animate-pulse' : 'text-primary'}`}>
                         {Number(product.quantityInStock).toFixed(1)}
                       </span>
                       <span className="text-[9px] font-bold text-muted-foreground uppercase">{product.unitType}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-black text-primary text-lg">
                     RD${Number(product.salePrice).toLocaleString()}
                     <p className="text-[8px] text-muted-foreground font-black italic uppercase">Costo: RD${Number(product.basePrice).toLocaleString()}</p>
                  </TableCell>
                  <TableCell className="text-right px-8">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-2 hover:bg-primary hover:text-white transition-all shadow-sm" onClick={() => { setRestockProduct(product); setIsRestockDialogOpen(true); }} title="Entrada"><PlusCircle className="h-5 w-5" /></Button>
                      <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl text-primary hover:bg-primary/10 border-2 border-transparent" onClick={() => handleOpenEdit(product)} title="Editar"><Edit className="h-5 w-5" /></Button>
                      <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl text-destructive hover:bg-destructive/5 border-2 border-transparent hover:border-destructive/20 transition-all" onClick={() => handleDeleteRequest(product)} title="Eliminar"><Trash2 className="h-5 w-5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isRestockDialogOpen} onOpenChange={(open) => !open && setRestockProduct(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader><DialogTitle className="text-2xl font-black uppercase tracking-tight">Entrada de Mercancía</DialogTitle></DialogHeader>
          <div className="py-6 space-y-6">
             <div className="bg-primary/5 p-4 rounded-2xl border text-center border-dashed border-primary/20">
                <p className="text-[10px] font-black uppercase text-primary/60 mb-1 tracking-widest">Actualizando Stock para:</p>
                <p className="text-xl font-black uppercase text-primary underline underline-offset-4">{restockProduct?.name}</p>
             </div>
             <div className="space-y-2 text-center">
                <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground">Cantidad que Ingresa</Label>
                <Input type="number" className="h-20 text-5xl font-black text-center border-4 border-primary rounded-3xl shadow-inner focus:scale-105 transition-all" value={restockQuantity} onChange={(e) => setRestockQuantity(e.target.value)} autoFocus />
             </div>
          </div>
          <DialogFooter><Button className="w-full h-16 text-xl font-black rounded-2xl bg-primary text-white shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all" onClick={handleRestock} disabled={!restockQuantity}>Confirmar Entrada</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth Dialog for Product Deletion */}
      <Dialog open={isDeleteAuthDialogOpen} onOpenChange={(open) => { setIsDeleteAuthDialogOpen(open); if(!open) setMasterKeyInput(""); }}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <div className="h-16 w-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-destructive" />
            </div>
            <DialogTitle className="text-2xl font-black text-center text-primary uppercase">Eliminar Producto</DialogTitle>
            <DialogDescription className="text-center font-bold">
              ¿Deseas borrar permanentemente <strong>{productToDelete?.name}</strong> de los anaqueles?
              <br/><br/>
              <span className="text-destructive font-black uppercase text-[10px] tracking-widest px-4 py-2 bg-destructive/5 rounded-xl border border-destructive/20 inline-block mt-2">Esta acción no se puede deshacer.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4 text-center">
             <div className="space-y-2 max-w-[280px] mx-auto">
               <Label className="font-black text-xs uppercase tracking-widest text-primary block">Ingresa Llave Maestra</Label>
               <Input 
                type="password" 
                placeholder="••••••••" 
                className="h-16 text-3xl font-black text-center border-4 border-destructive/20 focus:border-destructive rounded-2xl shadow-inner" 
                value={masterKeyInput}
                onChange={(e) => setMasterKeyInput(e.target.value)}
                autoFocus
               />
             </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-16 text-xl font-black bg-destructive rounded-2xl shadow-xl transition-all active:scale-95" onClick={handleVerifyDeleteMasterKey} disabled={!masterKeyInput}>Confirmar Borrado</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
