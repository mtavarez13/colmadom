import { z } from 'zod';
export const catalogOrderSchema=z.object({
  colmadoId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),requestId:z.string().uuid(),
  customerName:z.string().trim().min(1).max(120),customerAddress:z.string().trim().min(1).max(500),customerPhone:z.string().trim().max(30),
  customerLatitude:z.number().min(-90).max(90).nullable(),customerLongitude:z.number().min(-180).max(180).nullable(),
  expectedTotal:z.number().finite().min(0).max(1000000),
  items:z.array(z.object({productId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),quantity:z.number().finite().positive().max(10000),amountInDop:z.number().finite().positive().max(1000000).optional()})).min(1).max(80)
}).strict().refine(d=>(d.customerLatitude===null)===(d.customerLongitude===null),'Coordenadas incompletas');
export function deliveryCost(store:Record<string,any>,lat:number|null,lng:number|null) {
  if(lat===null || lng===null || store.latitude==null || store.longitude==null)return 0;
  const rad=(n:number)=>n*Math.PI/180,a=rad(lat-Number(store.latitude)),b=rad(lng-Number(store.longitude));
  const h=Math.sin(a/2)**2+Math.cos(rad(lat))*Math.cos(rad(Number(store.latitude)))*Math.sin(b/2)**2;
  const km=6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  return Math.max(Number(store.minDeliveryFee)||0,Math.round(km*(Number(store.deliveryFeePerKm)||0)));
}
