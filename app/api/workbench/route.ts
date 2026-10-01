import { database,actor,digest,errorResponse } from "@/lib/server/storage";
import { calculate,validate,type Config,type RecordItem } from "@/lib/domain";
import { transition } from "@/lib/workflow";
export const dynamic="force-dynamic";
const json=(v:unknown)=>Response.json(v,{headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){try{const user=actor(request),db=database();const acts=user.canReview?await db.prepare("SELECT payload FROM activities ORDER BY updated_at DESC LIMIT 200").all<{payload:string}>():await db.prepare("SELECT payload FROM activities WHERE owner=? ORDER BY updated_at DESC LIMIT 200").bind(user.id).all<{payload:string}>();const hist=await db.prepare("SELECT payload FROM history WHERE owner=? ORDER BY created_at DESC LIMIT 200").bind(user.id).all<{payload:string}>();return json({activities:acts.results.map(r=>JSON.parse(r.payload)),history:hist.results.map(r=>JSON.parse(r.payload)),identity:user.id,canReview:user.canReview});}catch(e){return errorResponse(e);}}
function assertDraftShape(c:Config){if(c&&typeof c==="object"&&Object.keys(c).some(k=>!["name","periodStart","periodEnd","template","policy","confirmed","metricNote","members","products","tiers","transactions"].includes(k)))throw new Error("INPUT:配置包含不支持的字段，不允许静默忽略");if(!c||typeof c!=="object"||!Array.isArray(c.members)||!Array.isArray(c.products)||!Array.isArray(c.tiers)||!Array.isArray(c.transactions)||typeof c.name!=="string"||typeof c.policy!=="string"||typeof c.metricNote!=="string"||typeof c.periodStart!=="string"||typeof c.periodEnd!=="string"||typeof c.confirmed!=="boolean"||!["group","fixed"].includes(c.template))throw new Error("INPUT:配置结构无效");if(c.members.length>1000||c.products.length>1000||c.tiers.length>100||c.transactions.length>10000)throw new Error("INPUT:配置行数超出限制");for(const [rows,fields] of [[c.members,["code","name","group"]],[c.products,["code","name","rate"]],[c.tiers,["min","max","factor"]],[c.transactions,["id","member","product","amount","date"]]] as [unknown[],string[]][]){if(!rows.every(r=>r&&typeof r==="object"&&fields.every(k=>typeof (r as Record<string,unknown>)[k]==="string")))throw new Error("INPUT:表格字段结构无效");}if([...c.members,...c.products].some(r=>typeof r.threshold!=="boolean"||typeof r.rebate!=="boolean"))throw new Error("INPUT:资格字段必须是布尔值");}
export async function POST(request:Request){try{
 const user=actor(request);const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)throw new Error("FORBIDDEN:不允许跨站写入");
 if(!request.headers.get("content-type")?.includes("application/json"))throw new Error("INPUT:仅支持JSON请求");const text=await request.text();if(text.length>2500000)throw new Error("INPUT:请求超过2.5MB");let body;try{body=JSON.parse(text);}catch{throw new Error("INPUT:JSON格式无效");}
 if(!body||typeof body!=="object")throw new Error("INPUT:请求不能为空");const db=database(),now=new Date().toISOString();const {action,id,revision}=body;
 let old:RecordItem|null=null;
 if(id){if(typeof id!=="string")throw new Error("INPUT:活动编号无效");const entry=await db.prepare("SELECT payload FROM activities WHERE id=?").bind(id).first<{payload:string}>();if(!entry)throw new Error("NOT_FOUND:活动不存在");old=JSON.parse(entry.payload);if(old!.creator!==user.id&&!user.canReview)throw new Error("FORBIDDEN:无权访问此活动");if(revision!==old!.revision)throw new Error("CONFLICT:活动已被更新，请重新打开最新版本");}
 if(action==="export"){
  if(!old)throw new Error("INPUT:请先保存活动");
  return json({package:{schemaVersion:"1.0",purpose:old.status==="approved"?"approved_configuration":"draft_review_only",sapStatus:"not_connected",executable:false,activityId:old.id,version:old.version,revision:old.revision,configuration:old.config,sha256:await digest(old.config),approval:{status:old.status,submitter:old.submitter,approver:old.approver},simulation:old.trial,exportedAt:now,limitations:["未验证SAP映射，不可直接导入SAP","不执行发放、退货扣款或奖励追回"]}});
 }
 if(action==="archive"){
  if(!old?.trial||!old.digest)throw new Error("INPUT:先试算当前版本，再留存快照");if(old.creator!==user.id)throw new Error("FORBIDDEN:仅配置人可留档");
  const historyId=`simulation:${old.id}:${old.digest}`;const snapshot={id:historyId,activityName:old.config.name,period:`${old.config.periodStart} — ${old.config.periodEnd}（不含）`,source:"工作台模拟试算",kind:"simulation",result:old.trial,configuration:old.config,activityVersion:old.version,digest:old.digest,createdAt:now,paymentStatus:"not_executed"};
  await db.prepare("INSERT OR IGNORE INTO history (id,owner,kind,payload,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM activities WHERE id=? AND revision=?)").bind(historyId,user.id,"simulation",JSON.stringify(snapshot),now,old.id,old.revision).run();return json({historyId});
 }
 let record:RecordItem;
 if(action==="save"||action==="trial"){
  if(old&&old.creator!==user.id)throw new Error("FORBIDDEN:仅配置人可编辑");const config=body.config as Config;assertDraftShape(config);
  if(action==="trial"){const errors=validate(config);if(errors.length)return Response.json({error:"规则校验未通过",issues:errors},{status:400});}
  const changed=!!old&&JSON.stringify(old.config)!==JSON.stringify(config);
  // Edits after submission/approval fork a new immutable version; the previous audit snapshot remains intact.
  const fork=!!old&&changed&&["submitted","approved"].includes(old.status);
  record={id:old?.id||crypto.randomUUID(),version:(old?.version||1)+(fork?1:0),revision:(old?.revision||0)+1,status:action==="trial"?"validated":"draft",config,trial:action==="trial"?calculate(config):null,digest:action==="trial"?await digest(config):null,creator:old?.creator||user.id,submitter:null,approver:null,updatedAt:now};
  if(old&&!changed&&["submitted","approved"].includes(old.status))throw new Error("INPUT:已提交版本不可重新保存或试算；修改配置将创建新版本");
 }else{
  if(!old)throw new Error("INPUT:请先保存活动");if(old.digest!==await digest(old.config))throw new Error("CONFLICT:配置摘要与验证结果不一致，请重新试算");record=transition(old,action,user);record.revision=old.revision+1;record.updatedAt=now;
 }
 const op=crypto.randomUUID(),payload=JSON.stringify(record);
 const change=old?db.prepare("UPDATE activities SET revision=?,status=?,payload=?,last_operation=?,updated_at=? WHERE id=? AND revision=?").bind(record.revision,record.status,payload,op,now,record.id,old.revision):db.prepare("INSERT INTO activities (id,owner,revision,status,payload,last_operation,updated_at) VALUES (?,?,?,?,?,?,?)").bind(record.id,user.id,record.revision,record.status,payload,op,now);
 const audit=db.prepare("INSERT INTO audits (id,activity_id,actor,action,snapshot,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM activities WHERE id=? AND last_operation=?)").bind(op,record.id,user.id,action,payload,now,record.id,op);
 const result=await db.batch([change,audit]);if(!result[0].meta.changes)throw new Error("CONFLICT:保存冲突，请重新打开活动");return json({record});
 }catch(e){return errorResponse(e);}}
