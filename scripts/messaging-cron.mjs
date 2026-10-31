const secret = process.env.CRON_SECRET;
if (!secret || secret.length < 24) {
  console.error('CRON_SECRET no está configurado.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch('https://colmadom.hispaniolapay.com/api/admin/messaging/dispatch', {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new Error(`HTTP ${response.status}: ${result.error || 'No se pudo procesar la cola.'}`);
    console.log(`Mensajes procesados: ${result.processed}; enviados: ${result.sent}; fallidos: ${result.failed}; omitidos: ${result.skipped}.`);
  } catch (error) {
    console.error('Error del programador de mensajes:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
