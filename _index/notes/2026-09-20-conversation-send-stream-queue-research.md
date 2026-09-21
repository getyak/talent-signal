# 对话发送、过程反馈与追加消息：设计调研

- 日期：2026-09-20
- 作者：Codex，供产品设计评审
- 背景：用户提供的 Web Session 截图中，上一条回复已经可见，下一条文字仍停留在输入框，底部显示“正在回复…”，发送按钮不可用。
- 状态：最初调研阶段的记录；后续实现与验证见 [Implementation plan](../../plans/2026-09-20-conversation-send-stream-queue.md)。本文的竞品结论保持原有证据范围。
- 相关页面：[Product](../../docs/product.md)、[Design system](../../docs/design-system.md)
- 工作记录：[Research plan](../../plans/2026-09-20-conversation-send-ux-research.md)

## 结论

“发送消息”和“AI 完成回答”应是独立生命周期。点击发送后，用户的消息立即进入对话，本地可靠接收后清空输入框；服务端持久化后才标记已接收。AI 在自己的回复位置展示真实过程，并尽早输出可展示的正文。等待期间输入框保持可用，新消息有明确的排队或补充当前任务语义。

当前代码确实把多个阶段压进了一个 `sending` 状态。改善交互不必等模型变快；但本轮没有实时测量，无法把截图中的等待时长归因于模型、网络、草稿保存、数据库锁或会话读回。

## 1. 当前实现证据

检查基线：本地 `main`，`e631705c`。以下是源码事实，不代表已核验截图所用部署版本。

| 路径 | 已确认行为 | 用户感受 |
| --- | --- | --- |
| [SessionWorkbench](../../apps/web/components/session-workbench/session-workbench.tsx) 的 `sendMessage` | 先设 `sending=true`，然后依次等待 `persist`、保存队列排空、`ask`、`readSession` 和必要清理，最后解除 | 消息提交与回答完成共用一个等待期 |
| 同文件 `canSend` / `WorkspaceComposer` | `!sending` 才能发送；`readOnly={sending || sendPending}` | 不能继续写，也不能追加下一条 |
| 同文件 transcript | 渲染 `detail.turns`；发送中的新消息没有独立的本地消息条目 | 提交后仍像留在输入框里 |
| [useWorkspaceChat](../../apps/web/components/relationship-workspace/use-workspace-chat.ts) | POST 后 `await result.json()`，完整 `blocks` 到达才返回成功 | 普通会话没有消费增量正文 |
| [workspaceChat](../../apps/web/lib/server/workspaceChat.ts) | 等待 `createUnscopedChatTask` 完成，再将完整一轮写入 Session | 没有提前返回的持久化接收回执 |
| [unscopedChat](../../apps/backend/src/modules/unscopedChat.ts) | `inTransaction` 内等待 `executeUnscopedChatTask`，最后记录结果与幂等完成 | 异步接收需要拆分事务和任务执行边界 |

调用链：`sendMessage → /api/workspace-chat → askWorkspaceChat → /v1/chat/unscoped-tasks → executeUnscopedChatTask → 保存 Session → readSession → 解锁`。

另一个值得复用但不能误判的基础：[Pursuit stream](../../apps/web/lib/server/pursuitBackend.ts) 已有 SSE、游标、事件与快照；[reducer](../../apps/web/lib/agentTaskStream.ts) 有 `forming/committed` 语义块。当前正文路径在 `artifact.ready` 后从已生成 artifact 取完整文本，拆块并延迟 18 ms 发出。这能渐进呈现已有内容，不能据此宣称普通 Session 已经支持模型生成期间的正文流，也不能缩短该路径的真实首段等待。

## 2. 竞品能证实什么

本轮使用官方页面；未登录竞品账户发送测试，也未把 API 能力当作 Web UI 的实测。产品模式、平台和灰度会影响行为。

| 产品与范围 | 官方证据 | 可借鉴点 | 不能据此断言 |
| --- | --- | --- | --- |
| ChatGPT Thinking | 2026-03-05 发布说明：先给工作计划，可在回答途中调整方向 [S1] | 先让用户看到正在处理的方向，再允许补充 | 所有 ChatGPT 模式都有相同的多条 FIFO 队列 |
| ChatGPT agent | 官方说明：可中断、澄清、改变方向、停止并取得部分结果；执行过程有说明 [S2] | 任务可干预，等待不等于失去控制 | 中断一定在毫秒级生效，或一定不重做任何步骤 |
| Claude Chat | Thinking 指示、已用时间、可展开的摘要 [S3] | 正文前有独立、可折叠的状态区域 | Claude Chat 与 Claude Code 使用同一套排队机制 |
| Claude Code | Enter 可排队，输入框上方列出待发条目；工具调用结束可把消息交给当前轮；轮次结束仍有队列则先发最旧一条；可取回编辑 [S4] | 输入持续可用、队列可见、提交和消费时间分开 | “排队”必然意味着整轮回答结束后才处理 |
| Manus API | 创建任务后异步执行，事件区分 running / waiting / stopped / error；有 follow-up 消息接口 [S5][S6] | 接收、执行、等待用户、结果分离 | Web 聊天中运行时追加消息的准确顺序、编辑方式或中断时间 |
| Manus Slack / Browser Operator | Slack 收到请求后即时确认并显示 typing；Browser Operator 可实时观察、接管、关闭停止 [S7][S8] | 及时确认，长任务提供可观察进度和干预入口 | Slack 的反馈细节就是 Manus Web UI 的反馈细节 |

设计推论：共同值得借鉴的是接收反馈、可观察工作与用户控制。三家的实现并不等价。Talent Signal 应定义自己的消息契约，不能用一个“排队”标签同时指代下一轮和当前轮补充。

## 3. 建议的交互顺序

桌面对话工作区；面向正在记录、分析、跟进关系的用户。保持现有安静中性色、正文优先和固定输入区域。视觉注意力落在正在处理的回答与可操作的异常；不展示虚构思维过程。

1. **点击发送**：立即创建有稳定 ID 的本地消息，移入对话，显示短暂的“发送中”。本地保护性保存成功后清空已提交内容，焦点继续留在输入框。保存失败则保留草稿并说明原因。
2. **服务端接收**：消息和任务已提交到持久存储后，移除发送状态；未开始的任务显示“等待处理”。不能在点击时就标记“已发送成功”。
3. **AI 处理**：AI 回复位置出现一行“正在处理”或实际阶段，例如“正在读取已授权资料”。实际工具开始后才显示具体动作。超过短暂等待才补充已用时间和详情入口。
4. **正文到达**：在原回复位置按短块稳定追加文字；首段出现即开始阅读。阶段信息折叠为一行。结构化结论、引用、联系人或日程卡在对应验证完成后转为可用。
5. **继续输入**：处理期间正常打字。默认按钮为“加入队列”，Enter 同义；队列位于输入框上方，显示“完成当前回复后处理”。完成并持久化上一轮后依次处理下一条。

示例：用户发送“你可以做什么？”后，该消息立即出现在右侧；左侧出现 Talent Signal 的处理状态。用户继续写“结合招聘场景举例”，点击“加入队列”，该条显示待处理，输入框再次可用。不能一直把第一条留在输入框里并将整个编辑区锁住。

### AI 一侧的反馈与动效

| 阶段 | 显示 | 动效与停止条件 |
| --- | --- | --- |
| 接收尚未确认 | 用户消息旁“发送中” | 消息进入位置的一次轻微过渡；失败后原位可重试 |
| 排队 | “等待处理”或队列顺序 | 静态呈现，不用无限转圈表示尚未开始 |
| 已开始、尚无正文 | 简洁活动标记 + 一个真实阶段 | 一个低干扰活动指示；有正文、失败、暂停或失联即停止对应忙碌动效 |
| 正文生成中 | 持续追加的段落 | 按渲染帧合并到达的片段；不等完整回答再刻意逐字播放 |
| 等用户选择 | 明确问题和选择入口 | 停止忙碌动效；只接受针对该问题的回应，不悄悄用下一条队列消息代答 |
| 完成 | 完整可选择文字、必要引用和操作 | 去掉持续 loading；无需额外成功弹窗 |
| 连接中断 | “连接中断，正在恢复进度” | 连接状态独立于任务状态，不能把失联伪装成一直思考 |

短回复不强行轮播“理解问题→分析→总结”。长任务有真实阶段才扩展进度。只在已接近底部时自动跟随；用户向上阅读后显示“新内容”，不抢滚动。支持 reduced motion、中文输入法、键盘操作和阶段级屏幕阅读器播报，避免逐字播报。

## 4. 队列、补充与停止的语义

| 操作 | 含义 | 建议 |
| --- | --- | --- |
| 加入队列 | 当前轮结束并保存后，作为下一轮处理 | 第一阶段默认。服务端持久化、有顺序、允许多条；本地暂存要明确未同步 |
| 补充当前任务 | 在下一个可接收输入的执行边界影响当前任务 | 后续能力。单独入口与“等待纳入 / 已纳入本次处理”回执；本轮已结束时明确转为下一轮 |
| 停止生成 | 请求终止当前任务 | 独立于发送按钮；请求发出后先显示“正在停止”，收到确认再显示“已停止” |
| 停止并处理此条 | 终止当前工作，再优先处理指定消息 | 后续显式操作；其他排队项保留，顺序变化可见 |

第一阶段不让模型猜“这句话是下一轮还是纠正当前轮”。默认队列行为稳定；之后再评估更自然的当前轮补充。不要同时启动同一个 Session 的多个写入任务。

- 每条待处理消息可展开、编辑、撤回；编辑使用版本检查，仅 `queued` 可修改。若已经被 worker 领取，提示“已开始处理”，不能假装修改成功。
- 队列只有一个可编辑权威条目：执行前显示在输入框上方，开始后移入对话历史并绑定回复；不要在两个区域各自维护一份可变消息。
- 多条默认 FIFO，不静默合并或重排。多个设备共享服务端顺序；每轮在开始时固定上下文版本，纳入上一轮已提交结果。
- 当前轮失败、取消或等待用户决策时，暂停后续自动出队；仍能输入和排队。给“继续处理队列”，避免自动执行基于不完整前提的后续要求。
- 队列容量、长度与附件大小有统一前后端校验；达到上限保留草稿。现有编辑器 12,000 与普通发送 1,000 字符限制需统一解释。
- 队列消息仅表达对 AI 的意图，不代表已发给候选人或客户；任何联系人、日历、邮件等实际写入仍走原有独立确认与回执。

## 5. 必须保留的恢复边界

消息送达、模型工作、流连接应独立建模：

```text
delivery: local_pending → accepted | delivery_unknown | rejected
run:      queued → running → completed | failed | cancelled | waiting_user
stream:   connecting → live → reconnecting | closed
```

`delivery_unknown` 不能自动新建任务。使用原消息 ID 查回执或原幂等键重试。`completed` 需要规范结果已保存；收到最后一段文本不等于完成。

| 情况 | 正确恢复 |
| --- | --- |
| 断网后服务端是否接收未知 | 保留原消息，查询或同 ID 重试；不复制成一条新消息 |
| 回答中刷新 / 离开页面 | 从服务端恢复 run、队列和事件游标；不重新提交同一请求 |
| 流断了但任务还在跑 | 重连或查询状态；不宣称失败或重新启动模型 |
| 用户停止 | 保留已收到的部分回答并标“未完成”；暂停队列，停止不能撤销已经确认的外部效果 |
| 旧回答结束时已有新草稿 | 只清理与旧 messageId 匹配的发送记录，不清空新草稿 |
| 多标签页同时编辑队列 | 服务端 revision 检查，冲突原位恢复 |
| 账号切换 / 来源删除 / Session 删除 | 隔离或清除对应本地数据；停止相关队列与读取，重验来源权限；旧流不能污染新账号 |

## 6. 落地边界与优先级

先做完整的“即时提交 + 后台任务 + 队列”切片，再增强正文流；已有 SSE 可以借鉴传输与恢复模式，不能直接把某条 artifact 动画接到普通会话当作完成。

1. **可恢复提交**：拆分正在编辑的 draft 与不可变提交记录；增加持久化消息 / run 接收事务和快速回执。任务执行移到事务外的 worker，通过 durable outbox 避免“回执成功但没有 worker 任务”。本地 echo 不等待任何网络请求。
2. **任务生命周期与 FIFO**：同一 Session 只运行一轮；消息、顺序、版本和原 request ID 保存在服务端。worker 领取、停止、队列变更都要处理竞争；只有规范完成后才能自动出队。
3. **真实过程与正文流**：接入真实执行阶段和可展示的回答片段；事件绑定账号、Session、run、messageId、序号。先持久化可回放事件，再推送；重连去重，不依赖单个浏览器存活。未验证内容只作为形成中的回答，不提前开放写入按钮。
4. **当前轮补充**：在前面稳定后实现注入边界、消费回执和终止竞争。单次不可中断的 provider 调用不能只靠前端增加消息便承诺立即吸收新输入。

这里优先完成的是产品能力，不是引入 Redis 或复杂调度平台。继续由 PostgreSQL 拥有规范状态；是否需要额外 fan-out 服务应由实际负载决定。

### 验收与性能观测

以下是建议目标，不是竞品实测值，也不是当前系统已达到的指标。

- 点击到本地消息可见：p95 ≤ 100 ms；输入框同步可继续使用。存储失败保留原文。
- 正常连接时持久化接收：初始 p95 目标 ≤ 1 s，后续依据实际网络与数据库基线校准；不得等待完整模型回答。
- 持久化真实阶段到前端可见：初始 p95 目标 ≤ 500 ms；无新事件时不编造阶段推进。
- 分别记录首次可读正文、完整结果、持久化完成时间；按短问答、检索、复杂任务分组看 p50/p95。纯状态占位不能计入正文首段时间。
- 连续发送三条：每条立即反馈、顺序稳定、不覆盖草稿、不重复执行；停止、失败、确认等待、刷新、离线与两设备竞争都有可预测结果。
- 流结束 / 队列恢复后核对 canonical messageId、runId、顺序和结果；不以 UI 动画播放结束作为成功。
- 遥测仅记录不透明标识、时长和闭合状态，不记录候选人对话、提示词、图片或回答正文。

### 本轮证明范围

已完成源码与官方资料核对，并提供合成数据交互示意。示意展示本地 echo、模拟接收、部分内容、可编辑队列、停止与继续；时间经过压缩，仅用于体验决策。它不连接真实 API，不证明可靠持久化、真实 SSE、跨设备恢复或 provider 取消能力。那些是后续实现的验收要求。

本轮验证：`pnpm docs:check` 通过；示意 JavaScript 语法检查通过；在内置浏览器核对了三条连续消息、两个排队条目、停止保留队列、编辑、撤回、继续处理和新草稿保护。桌面与 360 px 窄屏已检查，窄屏无横向溢出。未启动 iOS Simulator，未测试真实 provider 时延或竞争恢复。

## 官方来源

- S1：[ChatGPT release notes，2026-03-05](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)：Thinking 的前置计划与途中调整。动态页面，访问日期 2026-09-20。
- S2：[Introducing ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/)：执行说明、中断、补充方向、停止与部分结果。访问日期 2026-09-20。
- S3：[Change the model, effort, and thinking settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)：Thinking 指示、计时与折叠摘要。访问日期 2026-09-20。
- S4：[Claude Code interactive mode — Queue messages while Claude works](https://code.claude.com/docs/en/interactive-mode#queue-messages-while-claude-works)：排队、工具边界消费和取回编辑，仅用于 Claude Code 范围。访问日期 2026-09-20。
- S5：[Manus Task Lifecycle](https://open.manus.im/docs/v2/task-lifecycle)：异步任务、状态事件和用户输入 / 确认的分流。访问日期 2026-09-20。
- S6：[Manus task.sendMessage](https://open.manus.im/docs/v2/task.sendMessage)：同一任务的后续消息。没有在此页确认运行中追加的 FIFO 细节。访问日期 2026-09-20。
- S7：[Manus Agent on Slack](https://help.manus.im/en/articles/14431752-chatting-with-manus-agent-on-slack-channels-dms-and-file-delivery)：即时接收确认和 typing，仅限 Slack 说明。访问日期 2026-09-20。
- S8：[Introducing Manus Browser Operator](https://manus.im/blog/manus-browser-operator)：实时观察、接管和关闭停止，仅限该功能。访问日期 2026-09-20。
