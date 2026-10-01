import { scaled,money } from './domain.ts';
export function validateHistorical(input:unknown){
 if(!input||typeof input!=='object')throw new Error('INPUT:历史记录必须是JSON对象');
 const d=input as Record<string,unknown>;
 for(const key of ['activityName','period','source','externalBatch','completedAt'])if(typeof d[key]!=='string'||!(d[key] as string).trim()||(d[key] as string).length>300)throw new Error(`INPUT:历史记录缺少${key}或长度超过300`);
 if(isNaN(Date.parse(d.completedAt as string)))throw new Error('INPUT:完成时间格式不正确');
 if(Date.parse(d.completedAt as string)>Date.now())throw new Error('INPUT:完成时间不能在未来');
 const r=d.result as Record<string,unknown>;if(!r||!Array.isArray(r.children)||!r.children.length||!Array.isArray(r.groups)||!r.groups.length||r.children.length>10000||r.groups.length>1000)throw new Error('INPUT:历史结果需包含核算组和子抬头明细');
 const groups=new Set<string>();
 for(const row of r.groups){if(!row||typeof row.code!=='string'||!row.code||groups.has(row.code))throw new Error('INPUT:核算组编号缺失或重复');groups.add(row.code);try{scaled(row.threshold);if(scaled(row.factor,6)<0n)throw new Error();}catch{throw new Error('INPUT:历史核算组金额或系数无效');}}
 let total=0n;const codes=new Set<string>();
 for(const row of r.children){if(!row||['code','name','group','threshold','base','returns','factor','reward'].some(k=>typeof row[k]!=='string'))throw new Error('INPUT:子抬头结果字段不完整');if(codes.has(row.code)||!row.code||!row.name||!groups.has(row.group))throw new Error('INPUT:子抬头重复或核算组引用无效');codes.add(row.code);try{scaled(row.threshold);scaled(row.base);if(scaled(row.returns)>0n||scaled(row.factor,6)<0n||scaled(row.reward)<0n)throw new Error();total+=scaled(row.reward);}catch{throw new Error('INPUT:历史金额无效，奖励须非负，退货须非正');}}
 try{if(scaled(r.total as string)!==total)throw new Error();}catch{throw new Error('INPUT:历史奖励合计与明细不一致');}
 return {activityName:d.activityName as string,period:d.period as string,source:d.source as string,externalBatch:d.externalBatch as string,completedAt:d.completedAt as string,result:{mode:'historical' as const,groups:r.groups,children:r.children,total:money(total),notices:['由用户导入的外部已完成核算结果，未通过SAP验证；不按当前规则重算。','核算完成不代表奖励已发放，发放状态未确认。']}};
}
