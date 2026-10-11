function safe(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, match => '\\' + match);
}

export function createTextPdf(title: string, lines: string[]) {
  const contentLines = [title, ...lines].slice(0, 55);
  const stream = ['BT', '/F1 16 Tf', '42 790 Td', `(${safe(contentLines[0])}) Tj`, '/F1 10 Tf', ...contentLines.slice(1).flatMap(line => ['0 -14 Td', `(${safe(line).slice(0, 105)}) Tj`]), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

export function createThermalPdf(lines: string[], paperWidth: '58mm'|'80mm'='80mm') {
  const width=paperWidth==='58mm'?164:226,chars=paperWidth==='58mm'?30:42;
  const wrapped=lines.flatMap(line=>{const value=String(line??'');if(!value)return[''];const parts:string[]=[];for(let index=0;index<value.length;index+=chars)parts.push(value.slice(index,index+chars));return parts});
  const height=Math.max(320,wrapped.length*12+42),stream=['BT','/F1 8 Tf',`12 ${height-22} Td`,...wrapped.flatMap((line,index)=>index===0?[`(${safe(line)}) Tj`]:['0 -12 Td',`(${safe(line)}) Tj`]),'ET'].join('\n');
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;offsets.slice(1).forEach(offset=>{pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`});pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(pdf,'binary');
}
