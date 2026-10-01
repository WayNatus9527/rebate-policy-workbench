# 接口契约

所有金额为十进制字符串；所有写入须通过Sites认证。正式接口上线前还需与企业身份、口径及SAP目标字段对齐。

## 工作台

`GET /api/workbench` 返回可访问活动、本人历史记录及审批权限。

`POST /api/workbench` 接受 `action`、`id`、`revision`，保存/试算另含`config`。

| action | 行为 | 前置要求 |
|---|---|---|
| save | 保存草稿并使旧验证失效 | 活动所有者；保存可不完整，但结构须有效 |
| trial | 校验并保存确定性模拟结果 | 配置完整、确认通过 |
| submit | 进入待审批 | 当前版本已试算 |
| approve / reject | 审批或退回 | 服务端审批授权且非配置/提交人 |
| archive | 留存模拟快照 | 当前版本有试算，重复请求幂等 |
| export | 导出标准JSON包 | 当前已保存；未审批的包标识草稿 |

状态及revision在服务端验证，冲突返回409。提交后编辑产生新version，操作快照保留在audits表；当前未提供删除接口。

## 历史结果

`POST /api/history` 接收已完成核算结果JSON。必须包含`activityName`、`period`、`source`、`externalBatch`、`completedAt`、`result`。结果含`groups`、`children`、`total`，字段见导入样本。

唯一标识按用户、来源和外部批次计算，相同内容重试不新增，不同内容返回409。核验字段、日期、引用和金额合计，不验证外部来源真实性，不重算历史奖励。发放状态固定为`unconfirmed`；历史核算完成不等于已支付。

## SAP预留

`GET /api/sap` 返回`mode: interface_only`和`connected: false`。

`POST /api/sap` 返回501与`SAP_NOT_CONNECTED`，绝不请求外部SAP。

后续适配器操作预留为预校验、试算、导入、回读和激活；本期不提供假成功响应。发布、回退、对账、支付与凭证均不执行。

## 导入示例

页面历史入口接受`public/examples/history.json`结构。交易入口接受对象数组，每行包括字符串字段`id`、`member`、`product`、`amount`、`date`。金额负数表示退货。
