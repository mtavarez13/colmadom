export function publicOrder(id:string, d:FirebaseFirestore.DocumentData) {
  return {id,colmadoId:d.colmadoId,customerName:d.customerName || '',customerPhone:d.customerPhone || '',customerAddress:d.customerAddress || '',status:d.status,totalAmount:d.totalAmount,createdAt:d.createdAt,source:d.source || 'legacy',subtotalAmount:d.subtotalAmount,deliveryFee:d.deliveryFee};
}
