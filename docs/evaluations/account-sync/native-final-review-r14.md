**当前冻结生产源码未发现剩余 P0/P1；此前四项原生边界问题已关闭。** 本结论是只读源码审查，不替代真实 UI 验收。

1. **登录操作与回调归属已关闭。** `AccountSignInMethodsView.swift:102` 使用完整 `liveScope` 重建操作状态；Model 每次请求创建绑定 URL/token/account/user 的真实 client。`Model:345` 校验 provider round、operationID、requestID 和 scope；旧成功/失败回调均不能推进新流程。`Model:433、497` 避免旧请求清除新请求的 busy 状态。未知密码结果在 `Model:653` 必须具有原成功确认才能宣称已验证。

2. **真实刷新消费链与旧 scope 回写已关闭。** `TalentSignalApp.swift:360–370` 将实际身份读取器传入，并在同账户 token 变化时重建根视图。`RelationshipArchiveView.swift:1007、5559` 注册真实 open Session consumer；consumer release 会失效 Session/People。`RelationshipArchiveModels.swift:3017、3045、3076、3093` 覆盖成功、失败和旧 defer；`PursuitWorkspaceStore.swift:868–941` 也已覆盖恢复流程内层 `readOperation` 的迟到结果和持久化。

3. **删除恢复已关闭。** `RelationshipAskView.swift:1602` 提供可见的新会话入口；`:3336` 的共同发送入口阻止所有路径继续向已删除 Session 发送，并保留草稿。

4. **时间精度源码修复成立。** `RelationshipArchiveModels.swift:2858、2869` 使用服务端 canonical 创建时间修复本地 session/turn；`:2439、3133` 将毫秒精度保留到本地持久化与真实 PUT 编码。仍应以父代理正在执行的“原 Web Session 修改后成功写回”验收确认实际闭环。

父代理报告 r14f **25 tests / 0 failures、退出 0**；旧测试编译错误不再列为当前问题。剩余属于验收层：真实 Apple/Google 授权往返、same-account token 切换时的 UI 生命周期，以及上述 Web Session 写回。源码审查不将它们冒充为已完成。

最终 SHA-256（前后读回一致；People 文件采用补守卫后的最终版本）：

```text
AccountSignInMethodsModel.swift
56102640b5959f48b7774dbbe3f5f897063206fe4de6cca6380b775861102d73
AccountSignInMethodsView.swift
0afd3afc730e885041a2d736a64c687ed4cce7a844990fbdfda872bad93315b4
AgentSessionActiveRefreshConsumer.swift
b31be160ed128b0b8fe1c19efee91c994ade11b15429f512e5e782281fd4d2ce
RelationshipArchiveView.swift
1b446ae296393a0e78d94260ec389512cc1dcb7f83f01e4d7676b1650cf6f6ab
RelationshipArchiveModels.swift
56a98746e20d59ff483a235bd446cf926e819563bec50caed7d8f86d5a49cb41
RelationshipAskView.swift
eee9ab4940090ea202987bed37a69f5a55f8893c1ce5c24fdf04857b631eea72
PursuitWorkspaceStore.swift
9df21e04eae178cb9bfa06d4c7159dd80f2dc4093238b830034fcc68981f628a
TalentSignalApp.swift
09ba549a5fd983e37a55aee32bf8b529a5c133cb10bc586c13206feb1c86db3e
AgentSessionSyncClient.swift
2b3917830e61be714b0c7881038d779eb9fd524c47ec36d894ee87c3a90fe6ed
```
