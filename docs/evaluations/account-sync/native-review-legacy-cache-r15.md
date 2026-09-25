# Scoped native review: unchanged-revision legacy timestamp repair

结论：本次增量未发现 P0/P1。只读核验了同 revision 的旧缓存修复与新增回归测试，未修改产品/测试源码，也未运行 build、测试或 Simulator。

本补充修正 r14 时间精度验收边界：先前 fractional encoder 与不同 revision 的 merge 修复仍未覆盖实际遗留缓存的同 revision early-return；父代理真实 UI 写回证据发现该缺口。本次结论只确认新增分支的源码行为，实际写回仍需重新验收。

## Production delta

Source root: `/Users/cubxxw/.local/state/pi-delegate/tasks/20260925-013010-76d8a6ad/worktree`.

- `apps/ios/Sources/Features/RelationshipArchiveModels.swift:2927–2952` 在远端 revision 等于已缓存 revision 时，仍采用远端 canonical session 创建时间及匹配 turn 的创建时间。该分支保留本地 session 副本，仅替换这两个创建时间字段；未替换 composer draft、updatedAt、pending 状态、scope、title、receipts 或本地新增 turns。
- `:2934、2940–2943` 保留小于 1 秒的遗留精度修复界限；匹配 turn 还要求 objective 与 taskID 相同。超过界限或身份字段冲突会抛出 transcriptConflict。
- `:2933–2951` 在局部副本上完成全部验证和映射后才写入 storedSessions。任一匹配 turn 失败不会提交部分修复。重建 turn 显式携带原 response、requiresRefresh、feedback、feedbackUpdatedAt。
- `:2913–2926` 的旧 revision、删除/过期、pending deletion 与 payload/session ID 守卫继续先执行；此次修复不会复活删除项。分支未更新 syncDigests，不会把已有本地草稿错误标记为已上传。调用方仍先持久化完整 GET 结果，再按现有 dirty digest 路径上传。

## Test evidence boundary

`apps/ios/Tests/SessionTimestampRoundTripTests.swift:182–220` 通过旧 `.iso8601` 策略实际序列化 envelope，保存 revision 7，恢复真实 AgentSessionStore，再读取相同 revision 的 canonical page。测试断言一次上传具有修复后的 session/turn 时间、同一 session/turn ID、原草稿和 feedback，并重新从 persistence 加载验证时间与草稿。

此测试捕获的是 AgentSessionSyncServing 的 PUT 参数；它本身不是 HTTP/后端接受证明。既有 real-client 编码测试覆盖 JSON 编码，但最终仍需父代理对原保留 Web Session 做真实 iOS 修改与写回读回。本审查期间 build/focused tests 正在运行，未将其写作通过。

未在本次增量中发现需要修复的 P0/P1。新增测试未覆盖冲突分支的原子回退或全部 pending 字段的持久化断言；源码上这些字段保持原值，这属于测试覆盖边界，不是已确认产品缺陷。

## Frozen SHA-256

前后两次读回一致：

```text
8c35008ee324b50be7cb5cd1a93b10a775f27c3fe8a6f8ea08f0700b7248c9d8  apps/ios/Sources/Features/RelationshipArchiveModels.swift
90cd92ce18e07ddee214792a6b418edb370385ba1ecbfe56893208a3534f27e5  apps/ios/Tests/SessionTimestampRoundTripTests.swift
```
