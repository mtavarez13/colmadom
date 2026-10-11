type Line = { id: string; date: string; description: string; charge: number; payment: number; items: { name: string; quantity: number; unitPrice: number; total: number }[] };
type Statement = { businessName: string; businessAddress: string; customerName: string; customerPhone: string; customerAddress: string; balance: number; issuedAt: string; movements: Line[]; logo?: { hex: string; width: number; height: number } };

const bytes = (value: string) => Uint8Array.from(value, character => character.charCodeAt(0) & 255);
const clean = (value: string) => value.replace(/[^\x20-\xFF]/g, '?').replace(/[\\()]/g, '\\$&');
const money = (value: number) => `RD$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function createCustomerStatementPdf(statement: Statement): Blob {
  const pages: string[][] = [[]];
  let y = 800;
  const draw = (command: string) => pages[pages.length - 1].push(command);
  const ensure = (height: number) => { if (y - height < 52) { pages.push([]); y = 800; } };
  const label = (value: string, x = 40, size = 9, bold = false, color = '0 0 0') =>
    draw(`${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${clean(value)}) Tj ET`);
  const rule = () => draw(`0.8 0.84 0.9 RG 0.6 w 40 ${y} m 555 ${y} l S`);
  const wrap = (value: string) => {
    let current = '';
    for (const word of value.split(/\s+/)) {
      if (`${current} ${word}`.trim().length > 86 && current) {
        ensure(16); label(current, 53); y -= 14; current = word;
      } else current = `${current} ${word}`.trim();
    }
    if (current) { ensure(16); label(current, 53); y -= 14; }
  };

  label(statement.businessName.toUpperCase().slice(0, 42), 40, 17, true, '0.09 0.25 0.48'); y -= 21;
  label(statement.businessAddress.slice(0, 78)); y -= 24;
  if (statement.logo) {
    const ratio = statement.logo.width / statement.logo.height;
    const width = Math.min(72, 72 * ratio);
    const height = Math.min(72, 72 / ratio);
    draw(`q ${width} 0 0 ${height} ${555 - width} ${808 - height} cm /Logo Do Q`);
    y = Math.min(y, 728);
  }
  rule(); y -= 24;
  label('ESTADO DE CUENTA DE FIADO', 40, 15, true, '0.09 0.25 0.48'); y -= 20;
  label(`Emisión: ${statement.issuedAt}`); y -= 24;
  label(`CLIENTE: ${statement.customerName}`, 40, 11, true); y -= 17;
  label(`Teléfono: ${statement.customerPhone || '-'}    Dirección: ${statement.customerAddress || '-'}`.slice(0, 100)); y -= 25;
  const charges = statement.movements.reduce((sum, movement) => sum + movement.charge, 0);
  const payments = statement.movements.reduce((sum, movement) => sum + movement.payment, 0);
  draw(`0.94 0.96 0.99 rg 40 ${y - 53} 515 59 re f`);
  label(`COMPRAS: ${money(charges)}`, 51, 10, true, '0.09 0.25 0.48');
  label(`ABONOS: ${money(payments)}`, 285, 10, true, '0.09 0.25 0.48'); y -= 29;
  label(`DEUDA TOTAL: ${money(statement.balance)}`, 51, 13, true, '0.09 0.25 0.48'); y -= 48;
  label('DETALLE POR FACTURA Y ABONOS', 40, 11, true, '0.09 0.25 0.48'); y -= 23;

  const cardWidth = 250;
  const cardText = (value: string, x: number, positionY: number, size = 8, bold = false, color = '0 0 0') =>
    draw(color + ' rg BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + x + ' ' + positionY + ' Td (' + clean(value) + ') Tj ET');
  const itemLines = (value: string) => {
    const lines: string[] = [];
    let current = '';
    for (const word of value.split(/\s+/)) {
      if ((current + ' ' + word).trim().length > 39 && current) { lines.push(current); current = word; }
      else current = (current + ' ' + word).trim();
    }
    if (current) lines.push(current);
    return lines;
  };
  const cards: { movement: Line; number: number; continuation: number; lines: string[] }[] = [];
  statement.movements.forEach((movement, index) => {
    const lines = movement.items.flatMap(item => itemLines(item.quantity + ' x ' + item.name + ' | ' + money(item.unitPrice) + ' c/u | ' + money(item.total)));
    for (let offset = 0; offset < Math.max(1, lines.length); offset += 22)
      cards.push({ movement, number: index + 1, continuation: offset / 22, lines: lines.slice(offset, offset + 22) });
  });
  const cardHeight = (card: typeof cards[number]) => 83 + card.lines.length * 12;
  const drawCard = (card: typeof cards[number], x: number, top: number) => {
    const height = cardHeight(card);
    draw('0.77 0.82 0.89 RG 0.8 w ' + x + ' ' + (top - height) + ' ' + cardWidth + ' ' + height + ' re S');
    draw((card.movement.payment ? '0.92 0.98 0.94' : '0.94 0.96 0.99') + ' rg ' + x + ' ' + (top - 23) + ' ' + cardWidth + ' 23 re f');
    cardText(card.number + '. ' + (card.movement.payment ? 'ABONO' : 'FACTURA') + (card.continuation ? ' (CONT.)' : ''), x + 8, top - 15, 9, true, '0.09 0.25 0.48');
    cardText(card.movement.date, x + 176, top - 15, 7, true);
    cardText('Ref: ' + card.movement.id.slice(0, 39), x + 8, top - 37, 8);
    card.lines.forEach((item, index) => cardText(item, x + 8, top - 51 - index * 12, 8));
    draw('0.82 0.86 0.9 RG 0.6 w ' + (x + 7) + ' ' + (top - height + 29) + ' m ' + (x + cardWidth - 7) + ' ' + (top - height + 29) + ' l S');
    cardText((card.movement.payment ? 'TOTAL ABONADO: ' : 'TOTAL FACTURA: ') + money(card.movement.payment || card.movement.charge), x + 8, top - height + 13, 8, true);
  };
  for (let index = 0; index < cards.length; index += 2) {
    const left = cards[index];
    const right = cards[index + 1];
    const rowHeight = Math.max(cardHeight(left), right ? cardHeight(right) : 0);
    ensure(rowHeight + 15);
    drawCard(left, 40, y);
    if (right) drawCard(right, 305, y);
    y -= rowHeight + 15;
  }  if (!statement.movements.length) { label('No hay movimientos de crédito registrados.'); y -= 25; }
  ensure(40); label(`DEUDA TOTAL PENDIENTE: ${money(statement.balance)}`, 40, 12, true, '0.09 0.25 0.48');

  const objects: string[] = [];
  const put = (value: string) => { objects.push(value); return objects.length; };
  const catalogId = put('');
  const pagesId = put('');
  const regularId = put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const boldId = put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const logoId = statement.logo ? put(`<< /Type /XObject /Subtype /Image /Width ${statement.logo.width} /Height ${statement.logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${statement.logo.hex.length + 2} >>\nstream\n${statement.logo.hex}>\nendstream`) : null;
  const pageIds: number[] = [];
  pages.forEach((commands, index) => {
    commands.push(`0.4 0.45 0.5 rg BT /F1 8 Tf 40 28 Td (Página ${index + 1} de ${pages.length}) Tj ET`);
    const stream = commands.join('\n') + '\n';
    const contentId = put(`<< /Length ${bytes(stream).length} >>\nstream\n${stream}endstream`);
    pageIds.push(put(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regularId} 0 R /F2 ${boldId} 0 R >> ${logoId ? `/XObject << /Logo ${logoId} 0 R >>` : ''} >> /Contents ${contentId} 0 R >>`));
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(bytes(output).length); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = bytes(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { output += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([bytes(output)], { type: 'application/pdf' });
}

