import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { apiError, requireOwner } from '@/lib/server-auth';

export const runtime = 'nodejs';
const digits = (value: unknown) => String(value || '').replace(/\D/g, '').slice(0, 11);

async function matchesFor(cedula: string) {
  const formatted = cedula.length === 11 ? `${cedula.slice(0,3)}-${cedula.slice(3,10)}-${cedula.slice(10)}` : cedula;
  const stores = await adminDb.collection('colmados').get();
  const results = await Promise.all(stores.docs.map(async store => {
    const employees = store.ref.collection('employees');
    const [normalized, legacy] = await Promise.all([
      employees.where('cedulaNormalized', '==', cedula).get(), employees.where('cedula', 'in', [cedula, formatted]).get()
    ]);
    return [...normalized.docs, ...legacy.docs];
  }));
  return [...new Map(results.flat().map(item => [item.ref.path, item])).values()];
}

async function buildReport(cedula: string) {
  const docs = await matchesFor(cedula);
  const employments = await Promise.all(docs.map(async employeeDoc => {
    const employee = employeeDoc.data();
    const colmadoRef = employeeDoc.ref.parent.parent;
    const [colmado, incidents] = await Promise.all([
      colmadoRef?.get(), employeeDoc.ref.collection('incidents').orderBy('date', 'desc').get()
    ]);
    const start = employee.startDate ? new Date(employee.startDate) : null;
    const end = employee.exitDate ? new Date(employee.exitDate) : new Date();
    const workedDays = start && !Number.isNaN(start.getTime()) ? Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000)) : null;
    return {
      employeeId: employeeDoc.id,
      colmadoId: colmadoRef?.id || '',
      colmadoName: colmado?.data()?.name || 'Negocio registrado',
      fullName: employee.fullName || '', employeeRole: employee.employeeRole || employee.position || 'Sin rol',
      position: employee.position || '', salary: Number(employee.salary || 0),
      profitSharePercent: employee.profitSharePercent ?? null,
      startDate: employee.startDate || '', exitDate: employee.exitDate || '', exitReason: employee.exitReason || '',
      status: employee.status || (employee.isActive === false ? 'Desvinculado' : 'Activo'), workedDays,
      incidents: incidents.docs.map(item => { const value=item.data(); return { type:value.type||'', severity:value.severity||'', date:value.date||'', description:value.description||'', recordedBy:value.recordedBy||'' }; })
    };
  }));
  return { cedula, generatedAt: new Date().toISOString(), employmentCount: employments.length,
    incidentCount: employments.reduce((sum, item) => sum + item.incidents.length, 0), employments };
}

export async function POST(request: NextRequest) {
  try {
    const { identity, rootColmadoId } = await requireOwner(request);
    const body = await request.json();
    const action = String(body.action || 'check');
    const cedula = digits(body.cedula);
    if (action === 'check') {
      if (cedula.length !== 11) return NextResponse.json({ error: 'Indica una cédula válida.' }, { status: 400 });
      const matches = await matchesFor(cedula);
      return NextResponse.json({ found: matches.length > 0, employmentCount: matches.length,
        message: matches.length ? 'Esta cédula ya tiene historial laboral registrado. Puedes solicitar una depuración autorizada.' : 'No hay historial previo registrado para esta cédula.' });
    }
    if (action === 'report') {
      if (cedula.length !== 11) return NextResponse.json({ error: 'Indica una cédula válida.' }, { status: 400 });
      const report = await buildReport(cedula);
      await adminDb.collection('employeeBackgroundReports').add({ ...report, requestedBy: identity.uid, tenantId: rootColmadoId, accessType:'OWNER_FREE',paidAmount:0,currency:'DOP' });
      return NextResponse.json({ report });
    }
    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
  } catch (error) {
    const failure = apiError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
