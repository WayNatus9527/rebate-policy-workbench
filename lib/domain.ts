export type Member = { code: string; name: string; group: string; threshold: boolean; rebate: boolean };
export type Product = { code: string; name: string; threshold: boolean; rebate: boolean; rate: string };
export type Tier = { min: string; max: string; factor: string };
export type Transaction = { id: string; member: string; product: string; amount: string; date: string };
export type Config = {
  name: string; periodStart: string; periodEnd: string; template: "group" | "fixed";
  policy: string; confirmed: boolean; metricNote: string;
  members: Member[]; products: Product[]; tiers: Tier[]; transactions: Transaction[];
};
export type Issue = { field: string; message: string };
export type Trial = { groups: { code: string; threshold: string; factor: string }[]; children: { code: string; name: string; group: string; threshold: string; base: string; returns: string; factor: string; reward: string }[]; total: string; notices: string[]; mode: "simulation" | "historical" };
export type RecordItem = { id: string; version: number; revision: number; status: "draft" | "validated" | "submitted" | "approved"; config: Config; trial: Trial | null; digest: string | null; creator: string; submitter: string | null; approver: string | null; updatedAt: string };

const decimal = /^-?\d{1,12}(?:\.\d{1,6})?$/;
export function scaled(value: string, digits = 2): bigint {
  if (typeof value !== "string" || !decimal.test(value) || (value.split(".")[1]?.length ?? 0) > digits) throw new Error("金额或比例格式不正确");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  return (BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0"))) * (negative ? -1n : 1n);
}
export function money(value: bigint): string {
  const sign = value < 0n ? "-" : ""; const v = value < 0n ? -value : value;
  return `${sign}${v / 100n}.${String(v % 100n).padStart(2, "0")}`;
}
function validDate(s: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; }
export function validate(c: Config): Issue[] {
  const errors: Issue[] = []; const add = (field: string, message: string) => errors.push({ field, message });
  if (!c || typeof c !== "object") return [{ field: "config", message: "配置不能为空" }];
  if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 120) add("name", "活动名称必填，最多120字");
  if (!validDate(c.periodStart) || !validDate(c.periodEnd) || c.periodStart >= c.periodEnd) add("period", "活动期间无效，结束日期为不含当日的边界");
  if (!["group", "fixed"].includes(c.template)) add("template", "仅支持集团系数及固定比例模板");
  if (typeof c.policy !== "string" || !c.policy.trim()) add("policy", "请提供政策原文或规则依据");
  if (typeof c.policy === "string" && /封顶|互斥|不重复享受|预算上限/.test(c.policy)) add("policy", "政策包含封顶或互斥关键词，请人工核对；本期不支持此类规则");
  if (typeof c.metricNote !== "string" || !c.metricNote.trim()) add("metricNote", "请记录金额、税、日期及退货归属口径");
  if (c.confirmed !== true) add("confirmed", "请确认政策依据、配置与试算口径");
  const numeric = (v: string, field: string, digits = 2, nonnegative = false) => {
    try { const n = scaled(v, digits); if (nonnegative && n < 0n) throw new Error(); return n; } catch { add(field, `请输入有效的${nonnegative ? "非负" : ""}十进制数，最多${digits}位小数`); return null; }
  };
  if (!Array.isArray(c.members) || !c.members.length || c.members.length > 1000) add("members", "成员数须为1至1000");
  if (!Array.isArray(c.products) || !c.products.length || c.products.length > 1000) add("products", "产品数须为1至1000");
  if (!Array.isArray(c.transactions) || c.transactions.length > 10000) add("transactions", "试算明细最多10000行");
  if (!Array.isArray(c.tiers) || !c.tiers.length || c.tiers.length > 100) add("tiers", "阶梯须为1至100行");
  if (![c.members, c.products, c.transactions, c.tiers].every(Array.isArray)) return errors;
  const codes = new Set<string>();
  c.members.forEach((m, i) => {
    if (!m || typeof m.code !== "string" || !m.code.trim() || codes.has(m.code)) add(`members.${i}`, "成员编码缺失或重复，不能跨组重复归属");
    if (!m || typeof m.group !== "string" || !m.group.trim() || typeof m.name !== "string" || !m.name.trim()) add(`members.${i}`, "成员名称和核算组必填");
    if (!m || typeof m.threshold !== "boolean" || typeof m.rebate !== "boolean") add(`members.${i}`, "资格必须明确为是或否");
    if (m) codes.add(m.code);
  });
  const products = new Set<string>();
  c.products.forEach((p, i) => {
    if (!p || typeof p.code !== "string" || !p.code.trim() || products.has(p.code)) add(`products.${i}`, "产品编码缺失或重复");
    if (!p || typeof p.name !== "string" || !p.name.trim() || typeof p.threshold !== "boolean" || typeof p.rebate !== "boolean") add(`products.${i}`, "产品名称与两类资格必填");
    if (p) { products.add(p.code); const rate = numeric(p.rate, `products.${i}.rate`, 6, true); if (rate !== null && rate > 1000000n) add(`products.${i}.rate`, "基础比例不能超过1（100%）"); }
  });
  if (c.template === "group") c.tiers.forEach((t, i) => {
    if (!t) { add(`tiers.${i}`, "阶梯不能为空"); return; }
    const min = numeric(t.min, `tiers.${i}.min`, 2, true); const max = t.max === "" ? null : numeric(t.max, `tiers.${i}.max`, 2, true);
    numeric(t.factor, `tiers.${i}.factor`, 6, true);
    if (i === 0 && min !== 0n) add("tiers", "首档必须从0开始");
    if (max !== null && min !== null && max <= min) add(`tiers.${i}`, "上限必须大于下限");
    if (i < c.tiers.length - 1 && t.max === "") add(`tiers.${i}`, "只有最后一档可以无上限");
    if (i === c.tiers.length - 1 && t.max !== "") add("tiers", "最后一档必须无上限");
    if (i > 0) { try { if (scaled(c.tiers[i - 1].max) !== min) add(`tiers.${i}`, "阶梯不能有空档或重叠"); } catch { add(`tiers.${i}`, "阶梯边界无效"); } }
  });
  const ids = new Set<string>();
  c.transactions.forEach((t, i) => {
    if (!t) { add(`transactions.${i}`, "交易行不能为空"); return; }
    if (typeof t.id !== "string" || !t.id.trim() || ids.has(t.id)) add(`transactions.${i}`, "交易唯一编号缺失或重复");
    ids.add(t.id);
    if (!codes.has(t.member) || !products.has(t.product)) add(`transactions.${i}`, "交易引用的成员或产品不存在");
    if (!validDate(t.date) || t.date < c.periodStart || t.date >= c.periodEnd) add(`transactions.${i}.date`, "交易日期必须处于活动期间内");
    numeric(t.amount, `transactions.${i}.amount`);
  });
  return errors;
}

export function calculate(c: Config): Trial {
  const issues = validate(c); if (issues.length) throw new Error(issues.map(e => `${e.field}: ${e.message}`).join("；"));
  const totals = new Map<string, { threshold: bigint; base: bigint; returns: bigint; weighted: bigint }>();
  const groups = new Map<string, bigint>();
  for (const m of c.members) { totals.set(m.code, { threshold: 0n, base: 0n, returns: 0n, weighted: 0n }); groups.set(m.group, 0n); }
  const members = new Map(c.members.map(m => [m.code, m])); const products = new Map(c.products.map(p => [p.code, p]));
  for (const t of c.transactions) {
    const m = members.get(t.member)!; const p = products.get(t.product)!; const r = totals.get(t.member)!; const amount = scaled(t.amount); const rate = scaled(p.rate, 6);
    if (amount < 0n) {
      // Confirmed scope: every included return reduces both bases, independent of product flags.
      r.threshold += amount; r.base += amount; r.returns += amount; r.weighted += amount * rate;
    } else {
      if (m.threshold && p.threshold) r.threshold += amount;
      if (m.rebate && p.rebate) { r.base += amount; r.weighted += amount * rate; }
    }
  }
  for (const m of c.members) groups.set(m.group, groups.get(m.group)! + totals.get(m.code)!.threshold);
  const factors = new Map<string, string>();
  for (const [group, amount] of groups) {
    const tier = c.template === "group" ? c.tiers.find(t => amount >= scaled(t.min) && (t.max === "" || amount < scaled(t.max))) : null;
    factors.set(group, c.template === "fixed" ? "1" : amount < 0n ? "0" : tier!.factor);
  }
  let total = 0n;
  const children = c.members.map(m => {
    const r = totals.get(m.code)!; const factor = factors.get(m.group)!; const numerator = r.weighted * scaled(factor, 6);
    const reward = !m.rebate || r.base <= 0n || numerator <= 0n ? 0n : (numerator + 500000000000n) / 1000000000000n;
    total += reward;
    return { code: m.code, name: m.name, group: m.group, threshold: money(r.threshold), base: money(r.base), returns: money(r.returns), factor, reward: money(reward) };
  });
  return { mode: "simulation", groups: [...groups].map(([code, amount]) => ({ code, threshold: money(amount), factor: factors.get(code)! })), children, total: money(total), notices: ["工作台本地试算，未连接SAP，不代表已完成正式核算或发放。", "退货同步扣减两类金额；不产生退货扣款或奖励追回。", "试算约定：子抬头汇总后四舍五入至分；净台阶金额为负时系数为0，无可发奖励时显示0。请在正式使用前确认该约定。"] };
}

export function sample(): Config {
  return { name: "2026年第四季度渠道返利", periodStart: "2026-10-01", periodEnd: "2027-01-01", template: "group", policy: "核算组G包含A、B两个子抬头。X、Y参与台阶累计，Y、Z参与返利。基础比例2%。100万元以下系数0，100万元至200万元以下系数1，200万元及以上系数1.2。退货金额同步扣减台阶金额和返利基数，退货部分不奖励。期末统一发放。", confirmed: false, metricNote: "演示数据已按口径处理，币种CNY，单位元；活动期间左闭右开。本期退货同步扣减；子抬头汇总后四舍五入至分。负净台阶不达标，无可发奖励时为0。正式税及取数口径待财务确认。", members: [{ code: "A", name: "华东渠道一部", group: "G", threshold: true, rebate: true }, { code: "B", name: "华东渠道二部", group: "G", threshold: true, rebate: true }], products: [{ code: "X", name: "标准产品", threshold: true, rebate: false, rate: "0.02" }, { code: "Y", name: "重点产品", threshold: true, rebate: true, rate: "0.02" }, { code: "Z", name: "新品系列", threshold: false, rebate: true, rate: "0.02" }], tiers: [{ min: "0", max: "1000000", factor: "0" }, { min: "1000000", max: "2000000", factor: "1" }, { min: "2000000", max: "", factor: "1.2" }], transactions: [ ["A","X","800000"], ["A","Y","400000"], ["A","Z","200000"], ["B","X","300000"], ["B","Y","500000"], ["B","Z","100000"] ].map(([member,product,amount],i) => ({id:`DEMO-${i+1}`,member,product,amount,date:"2026-10-01"})) };
}
