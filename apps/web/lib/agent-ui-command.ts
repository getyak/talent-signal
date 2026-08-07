export type AgentUiCommand =
  | "add_source"
  | "create_person"
  | "open_next_move"
  | "open_person"
  | "review_duplicate"
  | "review_changes";

export function resolveAgentUiCommand(
  objective: string,
): AgentUiCommand | null {
  const command = objective
    .trim()
    .toLocaleLowerCase()
    .replace(/[.!?。！？]+$/u, "");

  if (
    /^(create|new|add) (a )?(contact|person)$/u.test(command) ||
    /^(创建|新建|添加)(一个)?(联系人|人物)$/u.test(command)
  ) {
    return "create_person";
  }

  if (
    /^(add|attach|import) (a )?(source|note|file|link)$/u.test(command) ||
    /^(添加|导入)(一个)?(来源|笔记|文件|链接)$/u.test(command)
  ) {
    return "add_source";
  }

  if (
    /^(review|check|merge) (a )?(possible )?duplicate( contact| person)?$/u.test(
      command,
    ) ||
    /^(查看|审阅|合并)(可能的?)?(重复联系人|重复人物)$/u.test(command)
  ) {
    return "review_duplicate";
  }

  if (
    /^(review|show|open) (the )?(pending )?(changes|updates)$/u.test(
      command,
    ) ||
    /^(查看|审阅|打开)(待确认的?)?(变化|更新)$/u.test(command)
  ) {
    return "review_changes";
  }

  if (
    /^(show|open|go to) (the )?(person|contact) page$/u.test(command) ||
    /^(查看|打开|前往)(联系人|人物)(页面|档案)$/u.test(command)
  ) {
    return "open_person";
  }

  if (
    /^(show|open|go to) (the )?(next move|next action)$/u.test(command) ||
    /^(查看|打开|前往)(下一步|下一行动)$/u.test(command)
  ) {
    return "open_next_move";
  }

  return null;
}
