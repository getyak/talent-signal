# Talent Signal Skills 使用说明（面向 AI）

## 目的

使用 `.agent/skills/` 下的专业 reviewer 对 Talent Signal 做评估、打分、审核和测试。它们是基于公开专业方法建立的评审视角，不是对真实人物的模仿或背书。

## 基本调用方式

单一问题只调用最相关的 skill：

```text
Use $evidence-safety-reviewer to audit this screenshot-to-calendar flow.
```

需要多个视角或最终发布结论时，从 `product-adjudicator` 开始：

```text
Use $product-adjudicator to run a release review on this build.
```

AI 必须：

1. 冻结同一个 artifact、版本、场景和证据包。
2. 选择最小充分 panel，不要为了“专家更多”滥用 skill。
3. 先让各 reviewer 独立评审，再做汇总。
4. 每个结论引用代码、界面、日志、测试或原始证据。
5. 证据不足时输出 `abstain`，不要猜测。
6. 安全、隐私、错误身份、未经授权写入和候选人评估红线不能被平均分抵消。

## Skill 选择

| Skill | 适用场景 | 不应用来判断 |
|---|---|---|
| `recruiter-workflow-reviewer` | 核心产品流程、导入、review、brief、follow-up、联系人、会议、提醒、桌面工作台 | 候选人质量、法律合规 |
| `evidence-safety-reviewer` | OCR、说话人和身份、证据溯源、隐私、权限、保留与删除、联系人或日历写入 | 产品市场需求、法律认证 |
| `mobile-ux-reviewer` | iOS/移动端 UI、截图、录屏、Simulator、无障碍、Dynamic Type、暗色、错误与中断恢复 | 仅凭静态截图判断隐藏运行行为 |
| `selection-science-auditor` | 候选人测评、评分卡、模型 grader、评测集、有效性、公平性、结果指标 | 未经验证的候选人推荐 |
| `candidate-experience-guardrail` | 候选人沟通、等待、通知、自动化、同意、拒绝和跟进体验 | 视觉工艺、心理测量 |
| `performance-outcome-fit` | 岗位成果、可比业绩、职业价值、角色匹配和双赢行动 | 缺少岗位成果与行为证据时判断 fit |
| `candidate-decision-motivation` | competing offer、决策驱动、阻碍、取舍、closing 和候选人行动条件 | 操纵性说服、接受 offer 概率 |
| `executive-potential-evidence` | 有目标岗位、多个独立行为事件和佐证的高管潜力研究 | 从单张截图或一句话推断潜力 |
| `inclusive-sourcing-recall` | 搜索策略、人才地图、query、隐藏人才、sparse profile、排除与召回 | 当前不含 sourcing 的截图处理流程 |
| `recruiting-trend-radar` | 路线图、招聘前沿、近期市场变化、竞品和 AI 趋势 | 因为趋势流行就批准功能或发布 |
| `product-adjudicator` | 多 reviewer 交叉验证、冲突处理、release gate、最终优先级和复测 | 替代缺失的专业 reviewer |

## 常用组合

### iOS 截图到行动发布评审

```text
recruiter-workflow-reviewer
+ evidence-safety-reviewer
+ mobile-ux-reviewer
+ candidate-experience-guardrail
```

涉及模型评测或候选人判断时，再加入 `selection-science-auditor`。

### OCR、证据与外部写入

```text
evidence-safety-reviewer
+ recruiter-workflow-reviewer
+ mobile-ux-reviewer
```

### 岗位与候选人建议概念

```text
recruiter-workflow-reviewer
+ candidate-experience-guardrail
+ performance-outcome-fit
+ candidate-decision-motivation
+ selection-science-auditor
```

只有满足多事件、目标岗位、佐证和反证要求时，才加入 `executive-potential-evidence`。

### Sourcing 产品

```text
inclusive-sourcing-recall
+ recruiter-workflow-reviewer
+ selection-science-auditor
+ evidence-safety-reviewer
```

### 路线图与前沿研究

```text
recruiting-trend-radar
+ recruiter-workflow-reviewer
+ proposed capability 的领域 reviewer
```

`recruiting-trend-radar` 每次使用都必须重新搜索当前来源，不能依赖旧结论。

## 支撑型 Skills

- `candidate-signal-analysis`：执行显式事实抽取和 reviewable action proposal；它是被评测对象，不能独立给自己打分。
- `design-talent-signal`：检查 Talent Signal 视觉系统、信息层级和 provenance 状态；与 `mobile-ux-reviewer` 配合使用，不能替代运行与无障碍测试。

## 输出要求

单个 reviewer 应返回：

- `verdict`: `pass`、`pass_with_changes`、`fail` 或 `abstain`
- `score`: 0–4；`abstain` 时为 `null`
- `confidence`: `direct`、`supported_inference` 或 `insufficient`
- `findings`: observation、evidence、user impact、recommendation、verification
- `strengths`、`missing_evidence`、`vetoes`、`open_questions`

不得计算跨 reviewer 平均分。最终裁决最多保留三个最高优先级问题，并明确下一项测试、所需证据和通过条件。

## 校验

```bash
python3 .agent/skills/product-adjudicator/scripts/check_panel_skills.py
python3 .agent/skills/product-adjudicator/scripts/validate_review.py path/to/review-or-panel.json
```

详细规则：

- `.agent/skills/product-adjudicator/references/panel-map.md`
- `.agent/skills/product-adjudicator/references/review-contract.md`
- `.agent/skills/product-adjudicator/references/adjudication-rules.md`
- `.agent/skills/product-adjudicator/references/test-scenarios.md`
