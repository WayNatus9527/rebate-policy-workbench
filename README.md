# 返利政策配置工作台

首个可运行开发版本，实现人工政策配置、规则校验、本地模拟试算、审批约束、标准配置导出及历史结果留存。SAP仅预留接口，不实际对接或发放奖励。

## 已实现

- 活动、固定比例/核算组系数模板、成员及两类产品资格、分产品基础比例、阶梯、交易明细编辑。
- 政策文本录入及TXT/Markdown导入，交易JSON导入；所有配置须人工确认。
- 负数视为退货，每筆退货同步扣减两类金额；不发对应奖励，不执行扣款或已发奖励追回。
- 十进制定点计算；重复编码/交易、期间、阶梯缺口重叠、无依据确认及封顶互斥关键词阻断。
- D1持久化、乐观锁、版本与操作快照；提交后修改产生新版本并撤销旧验证。
- 服务端审批权限与配置/审批人员分离；默认没有审批人，私人试点只能提交或导出草稿，不伪造批准。
- 模拟快照与外部已完成核算分开；相同来源批次幂等导入，禁止覆盖历史结果。
- 自适应界面；只读WebMCP校验工具。

## 明确的试算约定

以下是当前模拟实现约定，不能替代财务口径签署：

- 单币种CNY，金额单位元、两位小数；比例及系数最多六位小数。
- 期间与阶梯左闭右开。交易应已按正确税、折扣和业务日期处理。
- 所有纳入活动明细的负数交易都同步扣减两类金额，产品资格不改变退货双扣规则。
- 退货使用该产品基础比例抵减加权基数。对于仅台阶产品或不同历史比例的退货，正式使用前需确认比例归属。
- 子抬头加权金额汇总后四舍五入到分。净台阶为负时系数0；返利基数或加权奖励非正时不发奖励，显示0，并保留原始负数。
- 不处理跨期退货追溯、期中变更、扣款及追回。数据归属须在导入前确认。
- 本地试算可在期末前进行；没有实际支付入口。正式历史核算不按当前规则重算。

## 本地运行

需要Node.js 22.13以上及npm。工程为Sites Vinext/React/TypeScript，数据库为Cloudflare D1。

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_ambiguous_luminals.sql
npm run dev -- --host 127.0.0.1
```

本地迁移只执行一次。开发服务的登录由Sites本地模拟提供，生产由Sites私有访问控制及认证头负责。不要将开发服务暴露到公网。

```sh
node --test tests/*.test.mjs
npx tsc --noEmit
node tests/integration.mjs
```

集成测试需要已启动并迁移的本地预览，自动生成标记为验收的测试记录，不向生产运行。

## 权限与发布

`REBATE_REVIEWERS`为服务端审批人ID或邮箱的逗号分隔列表，缺省为空；不能通过前端选择角色提升权限。多人审批需要另行配置实际站点访问与审批授权，本期站点默认私人。生产写接口均校验登录与同源请求，数据库按用户隔离。

`.openai/hosting.json`只保存Sites身份和逻辑绑定。SAP配置包始终标识`executable: false`、`sapStatus: not_connected`，不能当作真实SAP导入格式。

## 接口与示例

见`docs/contracts.md`。`public/examples/transactions.json`及`public/examples/history.json`为演示导入样本。

## 后续开发

PDF/DOCX/XLSX解析、OCR、大模型提取与字段级证据定位、企业主数据字典、歧义任务流、细化组织授权、版本差异与审计查询界面尚未实现。原PRD并非全部开发完成。本次完成可运行的人工配置与规则验证基础，为后续Agent复用同一规则服务做准备。
