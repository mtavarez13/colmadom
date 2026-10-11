"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { 
  Users, 
  UserPlus, 
  FileText, 
  UserMinus, 
  Search, 
  Loader2, 
  Calendar as CalendarIcon,
  ShieldCheck,
  Briefcase,
  IdCard,
  DollarSign,
  Printer,
  Trash2,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  ArrowRight,
  ChevronRight,
  Scale,
  Download,
  Heart,
  FileCheck,
  AlertOctagon,
  History,
  Plus,
  Save,
  MessageSquareWarning,
  Flag,
  Building2
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, orderBy } from "firebase/firestore";
import { setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, differenceInMonths, differenceInYears, differenceInDays, addYears, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import Image from "next/image";

const EMPLOYEE_ROLES = ['Cajero','Supervisor','Delivery','Almacén','Compras','Contabilidad','Limpieza','Seguridad','Administrador','Otro'];

export default function HRPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Modals
  const [isNewEmployeeOpen, setIsNewEmployeeOpen] = useState(false);
  const [selectedEmployeeForContract, setSelectedEmployeeForContract] = useState<any>(null);
  const [employeeToTerminate, setEmployeeToTerminate] = useState<any>(null);
  const [selectedEmployeeForLiquidationPrint, setSelectedEmployeeForLiquidationPrint] = useState<any>(null);
  const [selectedEmployeeForIncidents, setSelectedEmployeeForIncidents] = useState<any>(null);
  const [selectedIncidentForPrint, setSelectedIncidentForPrint] = useState<any>(null);

  // Registration Form
  const [fullName, setFullName] = useState("");
  const [cedula, setCedula] = useState("");
  const [salary, setSalary] = useState("");
  const [profitShare, setProfitShare] = useState("");
  const [employeeRole, setEmployeeRole] = useState("Cajero");
  const [cedulaAlert, setCedulaAlert] = useState<any>(null);
  const [employeeForShare, setEmployeeForShare] = useState<any>(null);
  const [employeeForRole, setEmployeeForRole] = useState<any>(null);
  const [position, setPosition] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [isBackgroundOpen, setIsBackgroundOpen] = useState(false);
  const [backgroundCedula, setBackgroundCedula] = useState("");
  const [backgroundReport, setBackgroundReport] = useState<any>(null);
  const [backgroundBusy, setBackgroundBusy] = useState(false);

  // Incident Form
  const [incidentType, setIncidentType] = useState("Amonestación");
  const [incidentSeverity, setIncidentSeverity] = useState("Leve");
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().split('T')[0]);
  const [incidentDescription, setIncidentDescription] = useState("");

  // Termination Form
  const [exitDate, setExitDate] = useState(new Date().toISOString().split('T')[0]);
  const [exitReason, setExitReason] = useState<"Despido" | "Renuncia">("Despido");
  const [calculatedBenefits, setCalculatedBenefits] = useState<any>(null);

  useEffect(() => { setMounted(true); }, []);

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc(profileRef);
  const isOwner = profile?.role === 'Admin';

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);
  const { data: colmado } = useDoc(colmadoRef);

  const employeesQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(collection(db, "colmados", profile.colmadoId, "employees"), orderBy("isActive", "desc"));
  }, [db, profile?.colmadoId]);
  const { data: employees, isLoading } = useCollection(employeesQuery);

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter(e => 
      e.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.cedula?.includes(searchTerm)
    );
  }, [employees, searchTerm]);

  const checkCedula = useCallback(async (value: string, background = false) => {
    if (!user || value.replace(/\D/g, '').length !== 11) return null;
    const response = await fetch('/api/hr/background-check', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`}, body:JSON.stringify({action:'check',cedula:value}) });
    const result = await response.json();
    if (response.ok) { if (!background) setCedulaAlert(result); return result; }
    return null;
  }, [user]);

  const generateBackgroundReport=async()=>{if(!user||backgroundCedula.replace(/\D/g,'').length!==11)return;setBackgroundBusy(true);try{const response=await fetch('/api/hr/background-check',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({action:'report',cedula:backgroundCedula})}),result=await response.json();if(!response.ok)throw new Error(result.error);setBackgroundReport(result.report);toast({title:'Consulta completada',description:'El informe laboral fue generado sin costo para el dueño.'})}catch(error:any){toast({variant:'destructive',title:'No se generó el informe',description:error.message})}finally{setBackgroundBusy(false)}};

  const handleRegister = () => {
    if (!profile?.colmadoId || !fullName.trim() || !cedula.trim()) return;
    const salaryAmount = salary.trim() === '' ? 0 : Number(salary);
    const shareAmount = profitShare.trim() === '' ? null : Number(profitShare);
    if (!Number.isFinite(salaryAmount) || salaryAmount < 0) {
      toast({ variant: 'destructive', title: 'Sueldo inválido', description: 'Indica cero o un monto mayor.' });
      return;
    }
    if (isOwner && shareAmount !== null && (!Number.isFinite(shareAmount) || shareAmount < 0 || shareAmount > 100)) {
      toast({ variant: 'destructive', title: 'Porcentaje inválido', description: 'Indica un valor entre 0 y 100%.' });
      return;
    }
    const assignedShare = (employees || []).filter(e => e.isActive !== false).reduce((sum, e) => sum + (Number(e.profitSharePercent) || 0), 0);
    if (isOwner && assignedShare + (shareAmount ?? 0) > 100) {
      toast({ variant: 'destructive', title: 'El reparto supera el 100%', description: `Queda disponible ${(100 - assignedShare).toFixed(2)}%.` });
      return;
    }
    setIsSaving(true);
    const empId = `emp_${Date.now()}`;
    const now = new Date().toISOString();

    const empData = {
      id: empId,
      colmadoId: profile.colmadoId,
      fullName,
      cedula,
      cedulaNormalized: cedula.replace(/\D/g, ''),
      salary: salaryAmount,
      ...(isOwner ? { profitSharePercent: shareAmount, profitShareUpdatedAt: now } : {}),
      position,
      employeeRole,
      startDate,
      emergencyContact,
      emergencyRelationship,
      isActive: true,
      status: "Activo",
      createdAt: now,
      updatedAt: now
    };

    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "employees", empId), empData, { merge: true });
    toast({ title: "Empleado Registrado", description: "Ya puedes generar su contrato." });
    
    setFullName(""); setCedula(""); setSalary(""); setProfitShare(""); setPosition(""); setEmployeeRole('Cajero'); setCedulaAlert(null);
    setEmergencyContact(""); setEmergencyRelationship("");
    setIsNewEmployeeOpen(false);
    setIsSaving(false);
  };

  const handleSaveShare = () => {
    if (!isOwner || !profile?.colmadoId || !employeeForShare) return;
    const value = profitShare.trim() === '' ? null : Number(profitShare);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      toast({ variant: 'destructive', title: 'Porcentaje inválido', description: 'Indica un valor entre 0 y 100%.' });
      return;
    }
    const otherShares = (employees || []).filter(e => e.id !== employeeForShare.id && e.isActive !== false)
      .reduce((sum, e) => sum + (Number(e.profitSharePercent) || 0), 0);
    if (otherShares + (value ?? 0) > 100) {
      toast({ variant: 'destructive', title: 'El reparto supera el 100%', description: `Queda disponible ${(100 - otherShares).toFixed(2)}%.` });
      return;
    }
    updateDocumentNonBlocking(doc(db, 'colmados', profile.colmadoId, 'employees', employeeForShare.id), {
      profitSharePercent: value,
      profitShareUpdatedAt: new Date().toISOString(),
    });
    toast({ title: 'Participación actualizada' });
    setEmployeeForShare(null);
    setProfitShare('');
  };

  const calculateDominicanBenefits = (emp: any, endDt: string, reason: string) => {
    const start = new Date(emp.startDate);
    const end = new Date(endDt);
    const dailySalary = Number(emp.salary) / 23.83;
    
    const years = differenceInYears(end, start);
    const months = differenceInMonths(end, addYears(start, years));
    const days = differenceInDays(end, addMonths(addYears(start, years), months));
    
    const totalMonths = differenceInMonths(end, start);

    let preaviso = 0;
    let cesantia = 0;
    let vacaciones = 0;
    let navidad = 0;

    const startOfCurrentYear = new Date(end.getFullYear(), 0, 1);
    const effectiveStartForNavidad = start > startOfCurrentYear ? start : startOfCurrentYear;
    
    const diffMonthsNav = differenceInMonths(end, effectiveStartForNavidad);
    const diffDaysNav = differenceInDays(end, addMonths(effectiveStartForNavidad, diffMonthsNav));
    const totalWorkedMonthsThisYear = diffMonthsNav + (diffDaysNav / 30);
    
    navidad = (Number(emp.salary) * totalWorkedMonthsThisYear) / 12;

    if (totalMonths >= 5 && totalMonths < 6) vacaciones = dailySalary * 6;
    else if (totalMonths >= 6 && totalMonths < 12) vacaciones = dailySalary * 7;
    else if (years >= 1 && years < 5) vacaciones = dailySalary * 14;
    else if (years >= 5) vacaciones = dailySalary * 18;

    if (reason === "Despido") {
      if (totalMonths >= 3 && totalMonths < 6) preaviso = dailySalary * 7;
      else if (totalMonths >= 6 && totalMonths < 12) preaviso = dailySalary * 14;
      else if (totalMonths >= 12) preaviso = dailySalary * 28;

      if (totalMonths >= 3 && totalMonths < 6) cesantia = dailySalary * 6;
      else if (totalMonths >= 6 && totalMonths < 12) cesantia = dailySalary * 13;
      else if (years >= 1 && years < 5) cesantia = (dailySalary * 21) * years;
      else if (years >= 5) cesantia = (dailySalary * 23) * years;
    }

    return {
      preaviso,
      cesantia,
      vacaciones,
      navidad,
      total: preaviso + cesantia + vacaciones + navidad,
      years, months, days
    };
  };

  const handleOpenTermination = (emp: any) => {
    const results = calculateDominicanBenefits(emp, exitDate, exitReason);
    setCalculatedBenefits(results);
    setEmployeeToTerminate(emp);
  };

  useEffect(() => {
    if (employeeToTerminate) {
      const results = calculateDominicanBenefits(employeeToTerminate, exitDate, exitReason);
      setCalculatedBenefits(results);
    }
  }, [exitDate, exitReason, employeeToTerminate]);

  const executeTermination = () => {
    if (!employeeToTerminate || !profile?.colmadoId) return;
    setIsSaving(true);
    
    const terminationData = {
      isActive: false,
      status: "Desvinculado",
      exitDate: exitDate,
      exitReason: exitReason,
      terminationBenefits: calculatedBenefits,
      updatedAt: new Date().toISOString()
    };

    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "employees", employeeToTerminate.id), terminationData);

    toast({ title: "Salida Procesada" });
    
    setSelectedEmployeeForLiquidationPrint({
      ...employeeToTerminate,
      ...terminationData,
      colmadoName: colmado?.name,
      colmadoAddress: colmado?.address,
      colmadoLogo: colmado?.logoUrl
    });

    setEmployeeToTerminate(null);
    setCalculatedBenefits(null);
    setIsSaving(false);
  };

  const handlePrintLiquidation = (emp: any) => {
    setSelectedEmployeeForLiquidationPrint({
      ...emp,
      colmadoName: colmado?.name,
      colmadoAddress: colmado?.address,
      colmadoLogo: colmado?.logoUrl
    });
    setTimeout(() => {
      window.print();
      setSelectedEmployeeForLiquidationPrint(null);
    }, 500);
  };

  const handleSaveIncident = () => {
    if (!profile?.colmadoId || !selectedEmployeeForIncidents?.id || !incidentDescription) return;
    setIsSaving(true);
    const incidentId = `inc_${Date.now()}`;
    const now = new Date().toISOString();

    const incidentData = {
      id: incidentId,
      employeeId: selectedEmployeeForIncidents.id,
      type: incidentType,
      severity: incidentSeverity,
      date: incidentDate,
      description: incidentDescription,
      createdAt: now,
      recordedBy: profile?.firstName || "Admin"
    };

    setDocumentNonBlocking(
      doc(db, "colmados", profile.colmadoId, "employees", selectedEmployeeForIncidents.id, "incidents", incidentId), 
      incidentData, 
      { merge: true }
    );

    toast({ title: "Incidencia Registrada", description: "El reporte se añadió al expediente del empleado." });
    setIncidentDescription("");
    setIsSaving(false);
  };

  const handlePrintIncident = (incident: any) => {
    setSelectedIncidentForPrint({
      ...incident,
      employeeName: selectedEmployeeForIncidents.fullName,
      employeeCedula: selectedEmployeeForIncidents.cedula,
      colmadoName: colmado?.name,
      colmadoAddress: colmado?.address,
      colmadoLogo: colmado?.logoUrl
    });
    setTimeout(() => {
      window.print();
      setSelectedIncidentForPrint(null);
    }, 500);
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 print:p-0">
      {backgroundReport && <div className="employee-background-print hidden print:block p-10 text-black bg-white">
        <h1 className="text-3xl font-black border-b-4 border-primary pb-4">INFORME DE DEPURACIÓN LABORAL</h1>
        <p className="mt-3">Cédula consultada: <b>{backgroundReport.cedula}</b></p><p>Generado: {new Date(backgroundReport.generatedAt).toLocaleString()}</p>
        <div className="my-6 grid grid-cols-2 gap-4"><p><b>Registros laborales:</b> {backgroundReport.employmentCount}</p><p><b>Amonestaciones/incidencias:</b> {backgroundReport.incidentCount}</p></div>
        {backgroundReport.employments.map((item:any,index:number)=><section key={index} className="border-2 rounded-xl p-5 mb-5 break-inside-avoid"><h2 className="text-xl font-black">{item.colmadoName}</h2><p><b>Empleado:</b> {item.fullName}</p><p><b>Rol/cargo:</b> {item.employeeRole} · {item.position}</p><p><b>Período:</b> {item.startDate||'No indicado'} — {item.exitDate||'Actual'} ({item.workedDays == null?'Sin cálculo':`${item.workedDays} días`})</p><p><b>Estado/salida:</b> {item.status}{item.exitReason?` · ${item.exitReason}`:''}</p><p><b>Sueldo:</b> RD${Number(item.salary||0).toLocaleString()} · <b>Participación:</b> {item.profitSharePercent==null?'Sin participación':`${item.profitSharePercent}%`}</p><h3 className="font-black mt-4">Incidencias y amonestaciones</h3>{item.incidents.length?item.incidents.map((incident:any,i:number)=><div key={i} className="border-t py-2"><b>{incident.date} · {incident.type} · {incident.severity}</b><p>{incident.description}</p></div>):<p>Sin incidencias registradas.</p>}</section>)}
        <p className="text-xs mt-8 border-t pt-3">Informe generado automáticamente a partir de expedientes registrados en Colmadom Cloud.</p>
      </div>}
      {/* ÁREA DE IMPRESIÓN - INCIDENCIA / AMONESTACIÓN */}
      {selectedIncidentForPrint && (
        <div className="incident-print-area hidden">
           <div className="flex items-center justify-between mb-12 border-b-8 border-destructive pb-10">
              <div className="flex items-center gap-8 text-left">
                 {selectedIncidentForPrint.colmadoLogo && (
                   <div className="h-32 w-32 relative rounded-3xl overflow-hidden border-4 border-destructive/20 shadow-xl shrink-0">
                      <Image src={selectedIncidentForPrint.colmadoLogo} alt="Logo" fill className="object-cover" unoptimized />
                   </div>
                 )}
                 <div className="flex-1 min-w-0">
                    <h1 className="text-5xl font-black uppercase text-destructive leading-[0.9] break-words">{selectedIncidentForPrint.colmadoName}</h1>
                    <p className="text-lg font-bold text-muted-foreground mt-3">{selectedIncidentForPrint.colmadoAddress}</p>
                 </div>
              </div>
              <div className="text-right shrink-0 ml-6">
                 <div className="bg-destructive text-white px-10 py-4 rounded-[2rem] shadow-2xl">
                    <h2 className="text-2xl font-black uppercase tracking-widest leading-none">REPORTE DISCIPLINARIO</h2>
                 </div>
              </div>
           </div>

           <div className="bg-red-50 p-10 rounded-[3rem] border-4 border-destructive/10 mb-10 space-y-3">
              <p className="text-3xl font-black text-destructive uppercase">{selectedIncidentForPrint.employeeName}</p>
              <p className="text-md font-bold opacity-70">Cédula: {selectedIncidentForPrint.employeeCedula}</p>
              <div className="flex justify-between items-center mt-6">
                 <p className="text-lg font-bold">Fecha del Evento: <span className="font-black uppercase">{mounted ? format(new Date(selectedIncidentForPrint.date), "PPP", { locale: es }) : selectedIncidentForPrint.date}</span></p>
                 <Badge className="bg-destructive text-white border-none h-10 px-6 text-sm font-black uppercase rounded-2xl">{selectedIncidentForPrint.type} ({selectedIncidentForPrint.severity})</Badge>
              </div>
           </div>

           <div className="space-y-8">
              <h3 className="text-xl font-black border-b-4 border-destructive/20 pb-2 uppercase text-destructive tracking-tight">Descripción de los Hechos:</h3>
              <div className="text-justify leading-relaxed text-lg whitespace-pre-wrap p-10 bg-muted/10 rounded-[2.5rem] border-2 min-h-[400px] shadow-inner">
                {selectedIncidentForPrint.description}
              </div>
           </div>

           <div className="mt-16 p-8 border-4 border-dashed border-destructive/20 rounded-[2.5rem]">
              <p className="text-justify text-sm italic font-bold text-destructive/80 leading-relaxed">
                 ADVERTENCIA: El presente reporte tiene como objetivo notificar formalmente al empleado sobre el incumplimiento de sus deberes o normas internas. 
                 Se le exhorta a corregir dicha conducta para evitar medidas disciplinarias mayores conforme al Código de Trabajo.
              </p>
           </div>

           <div className="mt-48 grid grid-cols-2 gap-32 px-10">
              <div className="border-t-4 border-black pt-6 text-center"><p className="font-black uppercase text-sm">FIRMA EMPLEADO (RECIBIDO)</p></div>
              <div className="border-t-4 border-black pt-6 text-center"><p className="font-black uppercase text-sm">FIRMA ADMINISTRADOR / TESTIGO</p></div>
           </div>
           
           <div className="mt-20 text-center opacity-30 text-[9px] uppercase tracking-[0.4em] font-black text-destructive">Control Disciplinario Digital - Colmadom Cloud</div>
        </div>
      )}

      {/* ÁREA DE IMPRESIÓN - CONTRATO LABORAL */}
      {selectedEmployeeForContract && colmado && (
        <div className="contract-print-area hidden">
           <div className="flex items-center justify-between mb-12 border-b-8 border-primary pb-10">
              <div className="flex items-center gap-8 text-left">
                 {colmado.logoUrl && (
                   <div className="h-32 w-32 relative rounded-3xl overflow-hidden border-4 border-primary/20 shadow-xl shrink-0">
                      <Image src={colmado.logoUrl} alt="Logo" fill className="object-cover" unoptimized />
                   </div>
                 )}
                 <div className="flex-1 min-w-0">
                    <h1 className="text-5xl font-black uppercase text-primary leading-[0.9] break-words">{colmado.name}</h1>
                    <p className="text-xl font-bold text-muted-foreground mt-3">{colmado.address}</p>
                 </div>
              </div>
           </div>
           
           <div className="text-center mb-12">
              <h2 className="text-3xl font-black uppercase underline text-primary tracking-tighter">CONTRATO DE TRABAJO POR TIEMPO INDEFINIDO</h2>
           </div>

           <div className="text-justify text-lg leading-relaxed indent-12 space-y-6">
             <p>
                Entre los suscritos, de una parte, el señor(a) <strong>{profile?.firstName} {profile?.lastName}</strong>, 
                en representación de la entidad comercial denominada <strong>{colmado.name}</strong>, debidamente organizada
                y existente de conformidad con las leyes de la República Dominicana, con domicilio en {colmado.address},
                quien en lo adelante se denominará <strong>EL EMPLEADOR</strong>; y de la otra parte, 
                el señor(a) <strong>{selectedEmployeeForContract.fullName}</strong>, dominicano(a), mayor de edad, 
                portador(a) de la cédula de identidad y electoral No. <strong>{selectedEmployeeForContract.cedula}</strong>, 
                con domicilio en la República Dominicana, quien en lo adelante se denominará <strong>EL TRABAJADOR</strong>;
             </p>
             <p className="font-black uppercase underline text-center py-4">SE HA CONVENIDO Y PACTADO LO SIGUIENTE:</p>
             <div className="space-y-6">
                <p><strong>PRIMERO:</strong> EL TRABAJADOR se compromete a prestar sus servicios a favor de EL EMPLEADOR en calidad de <strong> {selectedEmployeeForContract.position}</strong>.</p>
                <p><strong>SEGUNDO:</strong> La jornada de trabajo será la jornada legal establecida en el Código de Trabajo de la República Dominicana.</p>
                <p><strong>TERCERO:</strong> En contraprestación por sus servicios, EL EMPLEADOR pagará a EL TRABAJADOR la suma de <strong> RD${Number(selectedEmployeeForContract.salary).toLocaleString()}</strong> mensuales.</p>
                <p><strong>CUARTO:</strong> El presente contrato se considera vigente a partir del día <strong> {mounted ? format(new Date(selectedEmployeeForContract.startDate), "PPP", { locale: es }) : '-'}</strong>.</p>
                <p><strong>QUINTO:</strong> Para todo lo no previsto en el presente contrato, las partes se remiten a las disposiciones del Código de Trabajo.</p>
             </div>
           </div>
           <div className="mt-60 grid grid-cols-2 gap-32 px-10">
              <div className="border-t-4 border-black pt-6 text-center"><p className="font-black uppercase text-sm">POR EL EMPLEADOR</p></div>
              <div className="border-t-4 border-black pt-6 text-center"><p className="font-black uppercase text-sm">POR EL TRABAJADOR</p></div>
           </div>
        </div>
      )}

      {/* ÁREA DE IMPRESIÓN - LIQUIDACIÓN / PRESTACIONES */}
      {selectedEmployeeForLiquidationPrint && (
        <div className="liquidation-print-area hidden">
           <div className="flex items-center justify-between mb-12 border-b-8 border-emerald-600 pb-10">
              <div className="flex items-center gap-8 text-left">
                 {selectedEmployeeForLiquidationPrint.colmadoLogo && (
                   <div className="h-32 w-32 relative rounded-3xl overflow-hidden border-4 border-emerald-600/20 shadow-xl shrink-0">
                      <Image src={selectedEmployeeForLiquidationPrint.colmadoLogo} alt="Logo" fill className="object-cover" unoptimized />
                   </div>
                 )}
                 <div className="flex-1 min-w-0">
                    <h1 className="text-5xl font-black uppercase text-emerald-700 leading-[0.9] break-words">{selectedEmployeeForLiquidationPrint.colmadoName}</h1>
                    <p className="text-xl font-bold text-muted-foreground mt-3">{selectedEmployeeForLiquidationPrint.colmadoAddress}</p>
                 </div>
              </div>
              <div className="text-right shrink-0 ml-6">
                 <div className="bg-emerald-600 text-white px-10 py-4 rounded-[2rem] shadow-2xl">
                    <h2 className="text-2xl font-black uppercase tracking-widest leading-none">REPORTE DE LIQUIDACIÓN</h2>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-10 mb-12 bg-emerald-50 p-10 rounded-[3rem] border-4 border-emerald-100 shadow-inner">
              <div className="space-y-2">
                 <p className="font-black uppercase text-xs text-emerald-600 opacity-60">Empleado Liquidado:</p>
                 <p className="text-3xl font-black text-emerald-800 uppercase">{selectedEmployeeForLiquidationPrint.fullName}</p>
                 <p className="text-lg font-bold">Cédula: {selectedEmployeeForLiquidationPrint.cedula}</p>
                 <p className="font-black uppercase text-sm text-emerald-600">Cargo: {selectedEmployeeForLiquidationPrint.position}</p>
              </div>
              <div className="space-y-2 text-right flex flex-col justify-center">
                 <p className="font-black uppercase text-xs text-emerald-600 opacity-60">Periodo Laboral:</p>
                 <p className="text-lg font-bold">Ingreso: <span className="font-black">{selectedEmployeeForLiquidationPrint.startDate}</span></p>
                 <p className="text-lg font-bold">Salida: <span className="font-black">{selectedEmployeeForLiquidationPrint.exitDate}</span></p>
                 <Badge className="bg-emerald-600 text-white border-none w-fit ml-auto mt-4 font-black uppercase text-xs px-6 py-2 rounded-xl shadow-lg">Motivo: {selectedEmployeeForLiquidationPrint.exitReason}</Badge>
              </div>
           </div>

           <div className="space-y-10">
              <h3 className="text-3xl font-black text-emerald-700 border-b-4 border-emerald-100 pb-3 uppercase tracking-tighter">Liquidación de Derechos Adquiridos</h3>
              <table className="w-full border-collapse rounded-[2rem] overflow-hidden">
                 <thead>
                    <tr className="bg-emerald-600 text-white font-black uppercase text-sm">
                       <th className="p-6 text-left">CONCEPTO LEGAL</th>
                       <th className="p-6 text-right">MONTO ACUMULADO (RD$)</th>
                    </tr>
                 </thead>
                 <tbody className="text-lg font-bold bg-white">
                    <tr className="border-b-2 border-emerald-50"><td className="p-6">Preaviso (Art. 76)</td><td className="p-6 text-right">RD${Number(selectedEmployeeForLiquidationPrint.terminationBenefits?.preaviso || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
                    <tr className="border-b-2 border-emerald-50"><td className="p-6">Auxilio de Cesantía (Art. 80)</td><td className="p-6 text-right">RD${Number(selectedEmployeeForLiquidationPrint.terminationBenefits?.cesantia || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
                    <tr className="border-b-2 border-emerald-50"><td className="p-6">Vacaciones Proporcionales</td><td className="p-6 text-right">RD${Number(selectedEmployeeForLiquidationPrint.terminationBenefits?.vacaciones || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
                    <tr className="border-b-2 border-emerald-50"><td className="p-6">Salario de Navidad (Regalía)</td><td className="p-6 text-right">RD${Number(selectedEmployeeForLiquidationPrint.terminationBenefits?.navidad || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
                    <tr className="bg-emerald-700 text-white shadow-2xl scale-[1.02] transform transition-transform"><td className="p-8 text-2xl font-black uppercase">Total General a Liquidar</td><td className="p-8 text-5xl font-black text-right">RD${Number(selectedEmployeeForLiquidationPrint.terminationBenefits?.total || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>
                 </tbody>
              </table>
           </div>

           <div className="mt-20 p-10 bg-emerald-50/50 border-4 border-dashed border-emerald-200 rounded-[3rem]">
              <p className="text-justify text-sm italic font-bold text-emerald-800/80 leading-relaxed">
                 Certifico que he recibido a entera satisfacción la suma arriba indicada por concepto de liquidación final de mis prestaciones laborales,
                 conforme a lo establecido en la Ley 16-92 del Código de Trabajo de la República Dominicana, otorgando a favor de EL EMPLEADOR
                 el más amplio finiquito legal por concepto de la relación laboral que hoy se extingue.
              </p>
           </div>

           <div className="mt-48 grid grid-cols-2 gap-32 px-10">
              <div className="border-t-4 border-black pt-6 text-center"><p className="font-black uppercase text-sm">FIRMA TRABAJADOR (RECIBIDO)</p></div>
              <div className="border-t-4 border-black pt-6 text-center"><p className="font-black uppercase text-sm">AUTORIZADO POR EMPLEADOR</p></div>
           </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="p-3 bg-blue-100 rounded-2xl"><Users className="h-8 w-8 text-blue-600" /></div>
          <div>
            <h1 className="text-3xl font-black text-primary uppercase tracking-tight">Recursos Humanos</h1>
            <p className="text-sm text-muted-foreground font-bold">Gestión de personal y control disciplinario.</p>
          </div>
        </div>
        <div className="flex gap-3"><Button variant="outline" size="lg" className="font-black h-12 rounded-xl" onClick={()=>{setBackgroundReport(null);setIsBackgroundOpen(true)}}><ShieldCheck className="mr-2 h-5 w-5"/> Depuración de empleado</Button><Dialog open={isNewEmployeeOpen} onOpenChange={setIsNewEmployeeOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="gap-2 bg-primary font-black h-12 rounded-xl shadow-lg" onClick={() => setIsNewEmployeeOpen(true)}>
              <UserPlus className="h-5 w-5" /> Registrar Empleado
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
            <DialogHeader className="p-8 bg-primary text-white shrink-0">
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">Alta de Personal</DialogTitle>
              <DialogDescription className="text-white/80 font-bold uppercase text-[10px]">Ingresa los datos legales del nuevo colaborador.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh]">
              <div className="grid gap-8 p-8">
                <div className="grid gap-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b pb-2"><Briefcase className="h-4 w-4" /> Datos Laborales</h3>
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Nombre Completo</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej: Ramón Valdez" className="h-12 rounded-xl font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Cédula</Label>
                      <Input value={cedula} onChange={(e) => {setCedula(e.target.value);setCedulaAlert(null)}} onBlur={()=>void checkCedula(cedula)} placeholder="000-0000000-0" className="h-12 rounded-xl font-mono" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-black text-[10px] uppercase text-primary ml-1">Sueldo Mensual (RD$)</Label>
                      <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0.00" className="h-12 rounded-xl font-black text-primary" />
                    </div>
                  </div>
                  {cedulaAlert?.found && <Alert className="border-amber-300 bg-amber-50"><AlertTriangle className="h-4 w-4"/><AlertTitle>Esta cédula ya está registrada</AlertTitle><AlertDescription>{cedulaAlert.message} El empleado puede laborar en más de un colmado; confirma sus datos antes de continuar.</AlertDescription></Alert>}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Posición / Cargo</Label>
                      <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Cajero, Delivery..." className="h-12 rounded-xl font-bold" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Fecha de Entrada</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-12 rounded-xl font-bold" />
                    </div>
                  </div>
                  <div className="space-y-2"><Label className="font-black text-[10px] uppercase text-muted-foreground">Rol del empleado</Label><Select value={employeeRole} onValueChange={setEmployeeRole}><SelectTrigger className="h-12 rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{EMPLOYEE_ROLES.map(role=><SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select></div>
                  {isOwner && <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <Label className="font-black text-[10px] uppercase text-emerald-800">Participación en beneficios netos (%) · opcional</Label>
                    <Input type="number" min="0" max="100" step="0.01" value={profitShare} onChange={(e) => setProfitShare(e.target.value)} placeholder="Dejar en blanco: solo sueldo" className="h-12 rounded-xl bg-white" />
                    <p className="text-xs text-muted-foreground">El sueldo puede ser RD$0. La suma de participaciones de empleados activos no puede superar el 100%.</p>
                  </div>}
                </div>
                <div className="grid gap-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b pb-2"><Heart className="h-4 w-4 text-destructive" /> Contacto de Emergencia</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Nombre y Teléfono</Label>
                      <Input value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="Ej: Maria Perez - 809-555-0000" className="h-12 rounded-xl font-bold" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Parentesco</Label>
                      <Select value={emergencyRelationship} onValueChange={setEmergencyRelationship}>
                        <SelectTrigger className="h-12 rounded-xl font-bold"><SelectValue placeholder="Seleccionar relación" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Esposo(a)">Esposo(a)</SelectItem>
                          <SelectItem value="Madre">Madre</SelectItem>
                          <SelectItem value="Padre">Padre</SelectItem>
                          <SelectItem value="Hijo(a)">Hijo(a)</SelectItem>
                          <SelectItem value="Hermano(a)">Hermano(a)</SelectItem>
                          <SelectItem value="Otro">Otro / Conocido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
            <DialogFooter className="p-8 bg-muted/10 border-t">
              <Button onClick={handleRegister} className="w-full h-16 text-xl font-black bg-primary rounded-2xl shadow-xl transition-all active:scale-95" disabled={isSaving}>
                {isSaving ? <Loader2 className="animate-spin" /> : "Guardar Colaborador"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog></div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 no-print">
        <Card className="bg-white border-none shadow-lg rounded-[2rem] border-l-8 border-l-blue-600">
           <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between"><CardTitle className="text-[10px] font-black uppercase text-muted-foreground">Colaboradores</CardTitle><Users className="h-4 w-4 text-blue-600" /></CardHeader>
           <CardContent className="p-4 pt-1"><p className="text-3xl font-black text-primary">{employees?.filter(e => e.isActive).length || 0}</p><p className="text-[9px] font-bold text-muted-foreground uppercase mt-1">Personal en nómina</p></CardContent>
        </Card>
        <Card className="bg-white border-none shadow-lg rounded-[2rem] border-l-8 border-l-emerald-600">
           <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between"><CardTitle className="text-[10px] font-black uppercase text-muted-foreground">Inversión Nómina</CardTitle><DollarSign className="h-4 w-4 text-emerald-600" /></CardHeader>
           <CardContent className="p-4 pt-1"><p className="text-3xl font-black text-emerald-700">RD${employees?.filter(e => e.isActive).reduce((sum, e) => sum + Number(e.salary), 0).toLocaleString()}</p><p className="text-[9px] font-bold text-muted-foreground uppercase mt-1">Costo Fijo Mensual</p></CardContent>
        </Card>
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white no-print">
        <div className="p-6 border-b bg-muted/10">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input placeholder="Buscar empleado por nombre o cédula..." className="pl-12 h-14 bg-white rounded-2xl font-black text-lg border-none shadow-inner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 h-16">
              <TableRow>
                <TableHead className="font-black px-8 uppercase text-[10px]">Identidad / Cédula</TableHead>
                <TableHead className="font-black uppercase text-[10px]">Posición / Cargo</TableHead>
                <TableHead className="font-black uppercase text-[10px]">Antigüedad</TableHead>
                <TableHead className="text-right font-black px-8 uppercase text-[10px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-12 w-12 text-primary opacity-20" /></TableCell></TableRow>
              ) : filteredEmployees.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-32 italic opacity-30 font-black uppercase text-lg">Sin personal registrado.</TableCell></TableRow>
              ) : filteredEmployees.map((e) => (
                <TableRow key={e.id} className={cn("hover:bg-muted/20 transition-all h-24", !e.isActive && 'bg-muted/30 grayscale')}>
                  <TableCell className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner border uppercase", e.isActive ? "bg-primary/5 text-primary" : "bg-muted text-muted-foreground")}>{e.fullName[0]}</div>
                      <div>
                        <p className="font-black text-sm uppercase leading-none">{e.fullName}</p>
                        <p className="text-[10px] font-mono text-muted-foreground mt-1.5 uppercase">Cédula: {e.cedula}</p>
                        <p className="text-[10px] font-bold text-emerald-700 mt-1">Sueldo: RD${Number(e.salary || 0).toLocaleString()} · {e.profitSharePercent == null ? 'Solo sueldo' : `${Number(e.profitSharePercent).toFixed(2)}% de beneficios netos`}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-black uppercase text-[8px] h-5 px-2 bg-blue-50 text-blue-700 border-none w-fit">{e.employeeRole || e.position}</Badge><p className="text-[10px] text-muted-foreground mt-1">{e.position}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-bold text-muted-foreground">{mounted ? format(new Date(e.startDate), "MMMM yyyy", { locale: es }) : '-'}</p>
                    <p className="text-[9px] uppercase font-black text-primary opacity-40">Desde: {e.startDate}</p>
                  </TableCell>
                  <TableCell className="text-right px-8">
                    <div className="flex justify-end gap-2">
                       {isOwner && e.isActive && <Button variant="outline" size="sm" className="h-10 px-3 rounded-xl border-emerald-300 text-emerald-800 font-bold text-xs" onClick={() => { setEmployeeForShare(e); setProfitShare(e.profitSharePercent == null ? '' : String(e.profitSharePercent)); }}>Editar %</Button>}
                       {isOwner && <Button variant="outline" size="sm" className="h-10 px-3 rounded-xl font-bold text-xs" onClick={()=>setEmployeeForRole(e)}>Rol</Button>}
                       <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl border-2 font-black gap-2 text-xs" onClick={() => setSelectedEmployeeForIncidents(e)}>
                         <AlertOctagon className="h-4 w-4" /> Incidencias
                       </Button>
                       <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl border-2 font-black gap-2 text-xs" onClick={() => { setSelectedEmployeeForContract(e); setTimeout(() => { window.print(); setSelectedEmployeeForContract(null); }, 500); }}>
                         <FileText className="h-4 w-4" /> Contrato
                       </Button>
                       {e.isActive ? (
                         <Button variant="ghost" size="sm" className="h-10 px-4 rounded-xl font-black text-destructive gap-2 text-xs hover:bg-destructive/5" onClick={() => handleOpenTermination(e)}>
                           <UserMinus className="h-4 w-4" /> Desvincular
                         </Button>
                       ) : (
                         <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl font-black gap-2 text-xs border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => handlePrintLiquidation(e)}>
                           <FileCheck className="h-4 w-4" /> Reporte Salida
                         </Button>
                       )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isBackgroundOpen} onOpenChange={(open)=>{setIsBackgroundOpen(open);if(!open)setBackgroundCedula('')}}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Consulta laboral del empleado</DialogTitle><DialogDescription>Consulta gratuita para dueños de colmados. Busca historial registrado con la misma cédula.</DialogDescription></DialogHeader>
          <div className="space-y-5 py-4"><div><Label>Cédula del empleado</Label><div className="flex gap-2"><Input value={backgroundCedula} onChange={e=>{setBackgroundCedula(e.target.value);setBackgroundReport(null);}} placeholder="000-0000000-0"/><Button variant="outline" onClick={()=>void checkCedula(backgroundCedula,true).then(result=>result&&toast({title:result.found?'Historial encontrado':'Sin historial',description:result.message}))}>Comprobar</Button></div></div>
          {!backgroundReport && <><Alert><ShieldCheck className="h-4 w-4"/><AlertTitle>Consulta sin costo para el dueño</AlertTitle><AlertDescription>Mostrará historial de colmados, período trabajado, rol, sueldo, porcentaje de beneficios, salida y amonestaciones registradas.</AlertDescription></Alert><Button className="w-full" disabled={backgroundBusy||backgroundCedula.replace(/\D/g,'').length!==11} onClick={generateBackgroundReport}>{backgroundBusy?<Loader2 className="mr-2 animate-spin"/>:<Search className="mr-2"/>}Generar informe laboral gratis</Button></>}
          {backgroundReport&&<div className="space-y-4"><Alert className="border-emerald-300 bg-emerald-50"><CheckCircle2 className="h-4 w-4"/><AlertTitle>Informe generado</AlertTitle><AlertDescription>{backgroundReport.employmentCount} registros laborales y {backgroundReport.incidentCount} incidencias encontradas.</AlertDescription></Alert>{backgroundReport.employments.map((item:any,index:number)=><Card key={index}><CardHeader><CardTitle>{item.colmadoName}</CardTitle><CardDescription>{item.employeeRole} · {item.status}</CardDescription></CardHeader><CardContent className="text-sm space-y-1"><p>Período: {item.startDate||'No indicado'} — {item.exitDate||'Actual'}</p><p>Sueldo: RD${Number(item.salary||0).toLocaleString()} · Participación: {item.profitSharePercent==null?'Ninguna':`${item.profitSharePercent}%`}</p><p>Amonestaciones/incidencias: {item.incidents.length}</p></CardContent></Card>)}<Button className="w-full" onClick={()=>window.print()}><Printer className="mr-2 h-4 w-4"/> Imprimir informe</Button></div>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!employeeForRole} onOpenChange={open=>!open&&setEmployeeForRole(null)}><DialogContent><DialogHeader><DialogTitle>Rol del empleado</DialogTitle><DialogDescription>{employeeForRole?.fullName}</DialogDescription></DialogHeader><Select value={employeeForRole?.employeeRole||employeeForRole?.position||'Otro'} onValueChange={value=>setEmployeeForRole((current:any)=>({...current,employeeRole:value}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{EMPLOYEE_ROLES.map(role=><SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select><DialogFooter><Button onClick={()=>{if(employeeForRole&&profile?.colmadoId){updateDocumentNonBlocking(doc(db,'colmados',profile.colmadoId,'employees',employeeForRole.id),{employeeRole:employeeForRole.employeeRole,updatedAt:new Date().toISOString()});toast({title:'Rol actualizado'});setEmployeeForRole(null)}}}>Guardar rol</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={!!employeeForShare} onOpenChange={(open) => { if (!open) { setEmployeeForShare(null); setProfitShare(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Participación en beneficios</DialogTitle>
            <DialogDescription>{employeeForShare?.fullName}. Déjalo vacío para que cobre solo su sueldo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>Porcentaje de beneficios netos</Label>
            <Input type="number" min="0" max="100" step="0.01" value={profitShare} onChange={(e) => setProfitShare(e.target.value)} placeholder="Sin participación" />
          </div>
          <DialogFooter><Button onClick={handleSaveShare}>Guardar porcentaje</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL INCIDENCIAS Y AMONESTACIONES */}
      <Dialog open={!!selectedEmployeeForIncidents} onOpenChange={(o) => !o && setSelectedEmployeeForIncidents(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem]">
           <DialogHeader className="p-8 bg-blue-600 text-white shrink-0">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center shadow-inner">
                       <Flag className="h-8 w-8 text-white" />
                    </div>
                    <div>
                       <DialogTitle className="text-3xl font-black uppercase tracking-tight">Expediente Disciplinario</DialogTitle>
                       <DialogDescription className="text-white/80 font-bold uppercase text-[10px]">Historial de incidencias de {selectedEmployeeForIncidents?.fullName}</DialogDescription>
                    </div>
                 </div>
              </div>
           </DialogHeader>

           <div className="flex-1 overflow-hidden bg-white flex flex-col md:flex-row divide-x">
              <div className="w-full md:w-1/3 p-6 space-y-6 shrink-0 bg-muted/5">
                 <h3 className="font-black text-xs uppercase tracking-widest text-primary flex items-center gap-2 border-b pb-2">
                    <Plus className="h-4 w-4" /> Reportar Nueva
                 </h3>
                 <div className="space-y-4">
                    <div className="space-y-1.5">
                       <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Tipo de Evento</Label>
                       <Select value={incidentType} onValueChange={setIncidentType}>
                          <SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="Amonestación">Amonestación</SelectItem>
                             <SelectItem value="Tardanza">Tardanza</SelectItem>
                             <SelectItem value="Falta Injustificada">Falta Injustificada</SelectItem>
                             <SelectItem value="Falta Grave">Falta Grave</SelectItem>
                             <SelectItem value="Indisciplina">Indisciplina</SelectItem>
                             <SelectItem value="Otro">Otro Motivo</SelectItem>
                          </SelectContent>
                       </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Gravedad</Label>
                          <Select value={incidentSeverity} onValueChange={setIncidentSeverity}>
                             <SelectTrigger className={cn(
                                "h-11 rounded-xl font-bold",
                                incidentSeverity === 'Muy Grave' && "text-destructive border-destructive/30",
                                incidentSeverity === 'Grave' && "text-orange-600 border-orange-200"
                             )}>
                                <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                                <SelectItem value="Leve">Leve</SelectItem>
                                <SelectItem value="Grave">Grave</SelectItem>
                                <SelectItem value="Muy Grave">Muy Grave</SelectItem>
                             </SelectContent>
                          </Select>
                       </div>
                       <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Fecha</Label>
                          <Input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} className="h-11 rounded-xl font-bold" />
                       </div>
                    </div>
                    <div className="space-y-1.5">
                       <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Descripción de los Hechos</Label>
                       <Textarea 
                          value={incidentDescription} 
                          onChange={(e) => setIncidentDescription(e.target.value)}
                          placeholder="Describe detalladamente lo ocurrido..." 
                          className="min-h-[150px] rounded-xl font-medium"
                       />
                    </div>
                    <Button 
                       className="w-full h-14 font-black bg-blue-600 text-white rounded-xl shadow-lg gap-2"
                       onClick={handleSaveIncident}
                       disabled={isSaving || !incidentDescription}
                    >
                       {isSaving ? <Loader2 className="animate-spin h-5 w-5" /> : <Save className="h-5 w-5" />}
                       Guardar en Expediente
                    </Button>
                 </div>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                 <div className="p-6 border-b shrink-0 flex items-center gap-2">
                    <History className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-black text-xs uppercase tracking-widest text-muted-foreground">Historial Disciplinario</h3>
                 </div>
                 <ScrollArea className="flex-1">
                    <EmployeeIncidentsList 
                      employeeId={selectedEmployeeForIncidents?.id} 
                      colmadoId={profile?.colmadoId}
                      onPrint={handlePrintIncident}
                    />
                 </ScrollArea>
              </div>
           </div>
           
           <DialogFooter className="p-6 bg-muted/10 border-t shrink-0">
              <Button variant="secondary" className="font-black rounded-xl" onClick={() => setSelectedEmployeeForIncidents(null)}>Cerrar Expediente</Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL CÁLCULO PRESTACIONES */}
      <Dialog open={!!employeeToTerminate} onOpenChange={(o) => !o && setEmployeeToTerminate(null)}>
        <DialogContent className="sm:max-w-3xl rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <DialogHeader className="bg-destructive text-white p-8 shrink-0">
             <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center shadow-inner"><Scale className="h-8 w-8 text-white" /></div>
                <div>
                   <DialogTitle className="text-3xl font-black uppercase tracking-tight">Cálculo de Prestaciones</DialogTitle>
                   <DialogDescription className="text-white/80 font-bold uppercase text-[10px]">Cierre legal de relación laboral</DialogDescription>
                </div>
             </div>
          </DialogHeader>
          <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto">
             <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                   <div className="p-4 bg-muted/30 rounded-2xl border">
                      <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Empleado:</p>
                      <p className="font-black text-primary uppercase">{employeeToTerminate?.fullName}</p>
                      <p className="text-xs font-bold text-muted-foreground mt-1">Cédula: {employeeToTerminate?.cedula}</p>
                   </div>
                   <div className="space-y-4">
                      <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Fecha de Salida</Label><Input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} className="h-12 rounded-xl font-bold" /></div>
                      <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Motivo de Salida</Label><Select value={exitReason} onValueChange={(v: any) => setExitReason(v)}><SelectTrigger className="h-12 rounded-xl font-bold"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Despido">Despido Injustificado</SelectItem><SelectItem value="Renuncia">Renuncia Voluntaria</SelectItem></SelectContent></Select></div>
                   </div>
                   <Alert className="bg-blue-50 border-blue-100">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-[10px] font-bold text-blue-700 leading-tight">
                      Tiempo trabajado: {calculatedBenefits?.years} años, {calculatedBenefits?.months} meses y {calculatedBenefits?.days} días.
                    </AlertDescription>
                   </Alert>
                </div>
                <div className="space-y-4">
                   <h4 className="font-black text-[10px] uppercase tracking-widest text-primary text-center">Derechos Acumulados (Pesos RD$)</h4>
                   <div className="space-y-2 border-2 border-dashed p-4 rounded-2xl bg-primary/5">
                      <div className="flex justify-between items-center text-sm"><span className="font-bold text-muted-foreground">Preaviso:</span><span className="font-black">RD${calculatedBenefits?.preaviso.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                      <div className="flex justify-between items-center text-sm"><span className="font-bold text-muted-foreground">Cesantía:</span><span className="font-black">RD${calculatedBenefits?.cesantia.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                      <div className="flex justify-between items-center text-sm"><span className="font-bold text-muted-foreground">Vacaciones:</span><span className="font-black">RD${calculatedBenefits?.vacaciones.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                      <div className="flex justify-between items-center text-sm"><span className="font-bold text-muted-foreground">Salario Navidad:</span><span className="font-black">RD${calculatedBenefits?.navidad.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                      <Separator className="my-2" /><div className="flex justify-between items-center p-4 bg-white rounded-xl shadow-inner mt-4 border-2 border-primary/10"><span className="font-black text-primary uppercase text-xs">Total a Pagar:</span><span className="text-2xl font-black text-primary">RD${calculatedBenefits?.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                   </div>
                </div>
             </div>
          </div>
          <DialogFooter className="p-8 bg-muted/10 border-t">
             <Button className="w-full h-16 text-xl font-black bg-destructive hover:bg-destructive/90 rounded-2xl shadow-xl gap-3 transition-all active:scale-95" onClick={executeTermination} disabled={isSaving}>
                {isSaving ? <Loader2 className="animate-spin h-6 w-6" /> : <UserMinus className="h-6 w-6" />} Confirmar Salida e Imprimir Reporte
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmployeeIncidentsList({ employeeId, colmadoId, onPrint }: { employeeId: string; colmadoId: string; onPrint: (inc: any) => void }) {
  const db = useFirestore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const q = useMemoFirebase(() => {
    if (!employeeId || !colmadoId) return null;
    return query(collection(db, "colmados", colmadoId, "employees", employeeId, "incidents"), orderBy("date", "desc"));
  }, [db, employeeId, colmadoId]);

  const { data: incidents, isLoading } = useCollection(q);

  if (isLoading) return <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto h-8 w-8 text-primary opacity-20" /></div>;
  if (!incidents || incidents.length === 0) return <div className="py-24 text-center opacity-30 italic font-black uppercase text-[10px] tracking-widest">Sin incidencias registradas</div>;

  return (
    <div className="p-4 space-y-3">
       {incidents.map((inc) => (
         <div key={inc.id} className="p-4 bg-white rounded-2xl border-2 shadow-sm hover:border-blue-200 transition-colors group">
            <div className="flex justify-between items-start mb-2">
               <div className="flex items-center gap-2">
                  <Badge className={cn(
                    "text-[8px] font-black uppercase border-none",
                    inc.severity === 'Muy Grave' ? 'bg-destructive text-white' : 
                    inc.severity === 'Grave' ? 'bg-orange-500 text-white' : 
                    'bg-blue-100 text-blue-700'
                  )}>
                    {inc.severity}
                  </Badge>
                  <span className="text-[10px] font-black text-primary uppercase">{inc.type}</span>
               </div>
               <span className="text-[9px] font-bold text-muted-foreground">{mounted ? format(new Date(inc.date), "dd/MM/yyyy") : inc.date}</span>
            </div>
            <p className="text-xs font-medium text-muted-foreground line-clamp-3 mb-4 leading-relaxed">{inc.description}</p>
            <div className="flex justify-between items-center">
               <p className="text-[8px] font-black text-muted-foreground/60 uppercase">Registrado por: {inc.recordedBy}</p>
               <Button variant="ghost" size="sm" className="h-8 px-3 rounded-lg font-black text-[9px] gap-1.5 text-blue-600 hover:bg-blue-50" onClick={() => onPrint(inc)}>
                  <Printer className="h-3 w-3" /> IMPRIMIR REPORTE
               </Button>
            </div>
         </div>
       ))}
    </div>
  );
}
