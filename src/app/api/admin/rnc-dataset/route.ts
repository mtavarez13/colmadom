import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminBucket, adminDb } from '@/lib/firebase-admin';
import { apiError, requirePlatformAdmin } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AdmZip = require('adm-zip');
const OFFICIAL_URL = 'https://dgii.gov.do/app/WebApps/Consultas/RNC/DGII_RNC.zip';
const STORAGE_PATH = 'system/dgii/rnc-dataset';
const UPLOAD_PATH = 'system/dgii/uploads';
const MAX_SIZE = 140 * 1024 * 1024;
const MAX_CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_CHUNKS = 64;

function countRecords(buffer: Buffer) {
  let lines = 0;
  for (let i = 0; i < buffer.length; i++) if (buffer[i] === 10) lines++;
  return lines + (buffer.length && buffer[buffer.length - 1] !== 10 ? 1 : 0);
}

function safeName(value: unknown) {
  return String(value || 'DGII_RNC.TXT').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function detectFormat(buffer: Buffer, name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip')) {
    const archive = new AdmZip(buffer);
    const entry = archive.getEntries().find((item: any) => !item.isDirectory && /\.(txt|csv)$/i.test(item.entryName));
    if (!entry) throw new Error('INVALID_DATASET');
    return { format: entry.entryName.toLowerCase().endsWith('.csv') ? 'CSV' : 'TXT', entryName: entry.entryName, records: countRecords(entry.getData()) };
  }
  if (lower.endsWith('.txt') || lower.endsWith('.csv')) return { format: lower.endsWith('.csv') ? 'CSV' : 'TXT', entryName: name, records: countRecords(buffer) };
  throw new Error('INVALID_DATASET');
}

async function saveMetadata(identity: { uid: string }, values: Record<string, unknown>) {
  const metadata = { ...values, updatedAt: new Date().toISOString(), updatedBy: identity.uid };
  await adminDb.doc('platformConfig/dgiiRncDataset').set(metadata);
  return metadata;
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request);
    const data = (await adminDb.doc('platformConfig/dgiiRncDataset').get()).data();
    return NextResponse.json({ configured: !!data?.storagePath || Array.isArray(data?.storageChunks), ...data });
  } catch (error) {
    const failure = apiError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requirePlatformAdmin(request);
    const action = request.nextUrl.searchParams.get('action');

    if (action === 'start') {
      const body = await request.json();
      const name = safeName(body.name);
      const size = Number(body.size || 0);
      const chunks = Number(body.chunks || 0);
      const format = name.toLowerCase().endsWith('.csv') ? 'CSV' : name.toLowerCase().endsWith('.txt') ? 'TXT' : '';
      if (!format) return NextResponse.json({ error: 'Para carga grande selecciona un archivo TXT o CSV.' }, { status: 400 });
      if (!Number.isFinite(size) || size <= 0 || size > MAX_SIZE || !Number.isInteger(chunks) || chunks < 1 || chunks > MAX_CHUNKS) return NextResponse.json({ error: 'El archivo está vacío, supera 140 MB o requiere demasiados bloques.' }, { status: 400 });
      const sessionId = randomUUID();
      await adminDb.doc(`rncDatasetUploads/${sessionId}`).set({ owner: identity.uid, name, size, chunks, format, createdAt: new Date().toISOString() });
      return NextResponse.json({ ok: true, sessionId });
    }

    if (action === 'chunk') {
      const sessionId = request.nextUrl.searchParams.get('session') || '';
      const index = Number(request.nextUrl.searchParams.get('index'));
      if (!/^[a-f0-9-]{36}$/.test(sessionId) || !Number.isInteger(index)) return NextResponse.json({ error: 'Bloque de carga inválido.' }, { status: 400 });
      const ref = adminDb.doc(`rncDatasetUploads/${sessionId}`);
      const session = (await ref.get()).data();
      if (!session || session.owner !== identity.uid || index < 0 || index >= session.chunks) return NextResponse.json({ error: 'La sesión de carga no es válida.' }, { status: 400 });
      const buffer = Buffer.from(await request.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_CHUNK_SIZE) return NextResponse.json({ error: 'El bloque está vacío o es demasiado grande.' }, { status: 400 });
      await adminBucket.file(`${UPLOAD_PATH}/${sessionId}/${String(index).padStart(3, '0')}.part`).save(buffer, { resumable: false, contentType: 'application/octet-stream' });
      return NextResponse.json({ ok: true, index });
    }

    if (action === 'complete') {
      const body = await request.json();
      const sessionId = String(body.sessionId || '');
      const ref = adminDb.doc(`rncDatasetUploads/${sessionId}`);
      const session = (await ref.get()).data();
      if (!session || session.owner !== identity.uid) return NextResponse.json({ error: 'La sesión de carga no es válida.' }, { status: 400 });
      const parts = Array.from({ length: session.chunks }, (_, index) => adminBucket.file(`${UPLOAD_PATH}/${sessionId}/${String(index).padStart(3, '0')}.part`));
      const existence = await Promise.all(parts.map(file => file.exists()));
      if (existence.some(([exists]) => !exists)) return NextResponse.json({ error: 'Faltan bloques del archivo. Vuelve a intentar la carga.' }, { status: 400 });
      await ref.delete();
      const metadata = await saveMetadata(identity, { storagePath: '', storageChunks: parts.map(file=>file.name), fileName: session.name, size: session.size, format: session.format, entryName: session.name, records: Number(body.records || 0), source: 'ADMIN_CHUNKED_UPLOAD_V2' });
      return NextResponse.json({ ok: true, ...metadata });
    }

    const contentType = request.headers.get('content-type') || '';
    let buffer: Buffer, name: string, source: string;
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'Selecciona un archivo ZIP, TXT o CSV.' }, { status: 400 });
      if (file.size <= 0 || file.size > MAX_SIZE) return NextResponse.json({ error: 'El archivo está vacío o supera 140 MB.' }, { status: 400 });
      name = safeName(file.name); buffer = Buffer.from(await file.arrayBuffer()); source = 'ADMIN_UPLOAD';
    } else {
      const body = await request.json();
      if (body.action !== 'sync') return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
      const response = await fetch(OFFICIAL_URL, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
      if (!response.ok) return NextResponse.json({ error: `DGII respondió ${response.status}.` }, { status: 502 });
      buffer = Buffer.from(await response.arrayBuffer()); name = 'DGII_RNC.zip'; source = 'DGII_DOWNLOAD';
    }
    const details = detectFormat(buffer, name);
    const objectPath = `${STORAGE_PATH}.${name.toLowerCase().endsWith('.zip') ? 'zip' : details.format.toLowerCase()}`;
    await adminBucket.file(objectPath).save(buffer, { resumable: false, contentType: name.toLowerCase().endsWith('.zip') ? 'application/zip' : details.format === 'CSV' ? 'text/csv' : 'text/plain', metadata: { cacheControl: 'private,max-age=0' } });
    const metadata = await saveMetadata(identity, { storagePath: objectPath, fileName: name, size: buffer.length, format: details.format, entryName: details.entryName, records: details.records, source });
    return NextResponse.json({ ok: true, ...metadata });
  } catch (error) {
    console.error('RNC dataset operation failed', error);
    const message = error instanceof Error ? error.message : '';
    if (message === 'INVALID_DATASET') return NextResponse.json({ error: 'El archivo no contiene un listado RNC TXT o CSV válido.' }, { status: 400 });
    const failure = apiError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
