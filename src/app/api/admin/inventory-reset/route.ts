import { NextRequest, NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { apiError, requirePlatformAdmin } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHUNK_SIZE = 200;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request);
    const colmadoId = String(request.nextUrl.searchParams.get('colmadoId') || '');
    if (!colmadoId || colmadoId.includes('/')) return fail('Selecciona un colmado válido.', 400);
    const store = await adminDb.doc(`colmados/${colmadoId}`).get();
    if (!store.exists || store.data()?.isDeleted === true) return fail('El colmado no existe.', 404);
    const [count, activeJob] = await Promise.all([
      store.ref.collection('products').count().get(),
      store.data()?.inventoryResetJobId
        ? adminDb.doc(`inventoryResetJobs/${store.data()?.inventoryResetJobId}`).get()
        : Promise.resolve(null),
    ]);
    return NextResponse.json({
      colmadoId,
      name: store.data()?.name || colmadoId,
      productCount: count.data().count,
      activeJob: activeJob?.exists && activeJob.data()?.status === 'in_progress'
        ? { id: activeJob.id, processed: Number(activeJob.data()?.processed || 0) }
        : null,
    });
  } catch (error) {
    const failure = apiError(error);
    return fail(failure.message, failure.status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requirePlatformAdmin(request);
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'start') {
      const colmadoId = String(body.colmadoId || '');
      const confirmation = String(body.confirmation || '').trim();
      if (!colmadoId || colmadoId.includes('/')) return fail('Selecciona un colmado válido.', 400);
      const storeRef = adminDb.doc(`colmados/${colmadoId}`);
      const jobRef = adminDb.collection('inventoryResetJobs').doc();
      let currentJobId = jobRef.id;
      await adminDb.runTransaction(async transaction => {
        const store = await transaction.get(storeRef);
        if (!store.exists || store.data()?.isDeleted === true) throw new Error('STORE_NOT_FOUND');
        if (confirmation !== String(store.data()?.name || '').trim()) throw new Error('CONFIRMATION_MISMATCH');
        const previousId = String(store.data()?.inventoryResetJobId || '');
        if (previousId) {
          const previous = await transaction.get(adminDb.doc(`inventoryResetJobs/${previousId}`));
          if (previous.exists && previous.data()?.status === 'in_progress') {
            currentJobId = previousId;
            return;
          }
        }
        const now = new Date().toISOString();
        transaction.create(jobRef, { colmadoId, storeName: store.data()?.name || colmadoId, actorUid: identity.uid, status: 'in_progress', processed: 0, lastProductId: '', createdAt: now, updatedAt: now });
        transaction.update(storeRef, { inventoryResetJobId: jobRef.id });
      });
      return NextResponse.json({ ok: true, jobId: currentJobId });
    }

    if (action === 'continue') {
      const jobId = String(body.jobId || '');
      if (!jobId || jobId.includes('/')) return fail('Proceso de reinicio no válido.', 400);
      const jobRef = adminDb.doc(`inventoryResetJobs/${jobId}`);
      const job = await jobRef.get();
      if (!job.exists) return fail('Proceso de reinicio no encontrado.', 404);
      if (job.data()?.status === 'completed') return NextResponse.json({ ok: true, completed: true, processed: job.data()?.processed || 0 });
      if (job.data()?.status !== 'in_progress') return fail('El reinicio no está activo.', 409);

      const colmadoId = String(job.data()?.colmadoId || '');
      const storeRef = adminDb.doc(`colmados/${colmadoId}`);
      const store = await storeRef.get();
      if (!store.exists || store.data()?.isDeleted === true || store.data()?.inventoryResetJobId !== jobId) return fail('El colmado ya no permite continuar este reinicio.', 409);

      let productsQuery = storeRef.collection('products').orderBy(FieldPath.documentId()).limit(CHUNK_SIZE);
      const lastProductId = String(job.data()?.lastProductId || '');
      if (lastProductId) productsQuery = productsQuery.startAfter(lastProductId);
      const products = await productsQuery.get();
      const now = new Date().toISOString();
      const processed = Number(job.data()?.processed || 0) + products.size;
      const completed = products.size < CHUNK_SIZE;
      const batch = adminDb.batch();

      for (const product of products.docs) {
        const data = product.data();
        const backupRef = jobRef.collection('products').doc(product.id);
        batch.set(backupRef, {
          productId: product.id, name: data.name || '', barcode: data.barcode || '',
          quantityInStock: data.quantityInStock ?? null,
          basePrice: data.basePrice ?? null,
          salePrice: data.salePrice ?? null,
          productUpdatedAt: data.updatedAt || null,
          savedAt: now,
        });
        batch.update(product.ref, { quantityInStock: 0, basePrice: 0, salePrice: 0, updatedAt: now }, { lastUpdateTime: product.updateTime });
      }
      batch.update(jobRef, {
        processed, lastProductId: products.docs.at(-1)?.id || lastProductId,
        status: completed ? 'completed' : 'in_progress', updatedAt: now,
        ...(completed ? { completedAt: now } : {}),
      }, { lastUpdateTime: job.updateTime });
      if (completed) {
        batch.update(storeRef, { inventoryResetJobId: null, inventoryLastResetAt: now, inventoryLastResetJobId: jobId });
        batch.set(adminDb.collection('auditLogs').doc(), { actorUid: identity.uid, action: 'INVENTORY_RESET_COMPLETED', targetId: colmadoId, jobId, productCount: processed, createdAt: now });
      }
      await batch.commit();
      return NextResponse.json({ ok: true, jobId, processed, completed });
    }

    return fail('Acción no reconocida.', 400);
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_NOT_FOUND') return fail('El colmado no existe.', 404);
    if (error instanceof Error && error.message === 'CONFIRMATION_MISMATCH') return fail('Escribe exactamente el nombre del colmado para confirmar.', 400);
    const failure = apiError(error);
    return fail(failure.message, failure.status);
  }
}
