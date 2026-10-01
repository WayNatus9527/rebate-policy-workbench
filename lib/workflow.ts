import type { RecordItem } from "./domain";
export function transition(record:RecordItem,action:string,actor:{id:string;canReview:boolean}):RecordItem{
 const r=structuredClone(record);
 if(action==="submit"){
  if(r.creator!==actor.id)throw new Error("FORBIDDEN:仅活动配置人可提交");
  if(r.status!=="validated"||!r.trial||!r.digest)throw new Error("INPUT:当前版本须先校验并试算");
  r.status="submitted";r.submitter=actor.id;r.approver=null;
 }else if(action==="approve"||action==="reject"){
  if(!actor.canReview)throw new Error("FORBIDDEN:未配置审批权限");
  if(actor.id===r.submitter||actor.id===r.creator)throw new Error("FORBIDDEN:配置人与审批人必须分离，不能批准本人提交");
  if(r.status!=="submitted"||!r.trial||!r.digest)throw new Error("INPUT:仅可审批当前待审批版本");
  if(action==="approve"){r.status="approved";r.approver=actor.id;}else{r.status="draft";r.approver=null;r.submitter=null;r.trial=null;r.digest=null;r.config.confirmed=false;}
 }else throw new Error("INPUT:不支持的状态操作");
 return r;
}
