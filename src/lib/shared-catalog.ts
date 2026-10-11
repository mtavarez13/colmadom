export function productBarcodes(product: Record<string, any>): string[] {
  return [...new Set(['barcode', 'barcode2', 'barcode3', 'barcode4', 'barcode5']
    .map(key => String(product[key] || '').trim())
    .filter(code => /^[A-Za-z0-9._-]+$/.test(code)))];
}

export function sharedProductImage(product: Record<string, any>, images: Record<string, string>): string {
  for (const barcode of productBarcodes(product)) {
    if (images[barcode]) return images[barcode];
  }
  return product.imageUrl || '';
}
