export const dynamic="force-dynamic";
export async function GET(){return Response.json({mode:"interface_only",connected:false,supportedOperations:["precheck","simulate","import","readback","activate"],message:"SAP接口仅预留，本期不进行真实调用或验证"});}
export async function POST(){return Response.json({code:"SAP_NOT_CONNECTED",message:"SAP接口未接入，不执行导入、回读、激活或发放"},{status:501});}
