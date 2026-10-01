import { database,actor,digest,errorResponse } from '@/lib/server/storage';
import { validateHistorical } from '@/lib/history';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const user=actor(request);const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new Error('FORBIDDEN:不允许跨站写入');
 if(!request.headers.get('content-type')?.includes('application/json'))throw new Error('INPUT:仅支持JSON');
 const raw=await request.text();if(raw.length>2500000)throw new Error('INPUT:最多2.5MB');let data;try{data=JSON.parse(raw);}catch{throw new Error('INPUT:JSON格式无效');}
 const entry=validateHistorical(data),db=database(),now=new Date().toISOString();const id='external:'+await digest([user.id,entry.source,entry.externalBatch]);const hash=await digest(entry);
 const snapshot={...entry,id,kind:'completed',createdAt:now,digest:hash,paymentStatus:'unconfirmed'};
 await db.prepare('INSERT OR IGNORE INTO history (id,owner,kind,payload,created_at) VALUES (?,?,?,?,?)').bind(id,user.id,'completed',JSON.stringify(snapshot),now).run();
 const existing=await db.prepare('SELECT payload FROM history WHERE id=? AND owner=?').bind(id,user.id).first<{payload:string}>();
 if(!existing)throw new Error('历史存储失败');if(JSON.parse(existing.payload).digest!==hash)throw new Error('CONFLICT:此来源和批次已有不同结果，历史记录不可覆盖');
 return Response.json({id,kind:'completed',paymentStatus:'unconfirmed'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}}
