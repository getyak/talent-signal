export type AgentContactDraft = {
  identityClue: string;
  name: string;
  relationshipContext: string;
  sourceNote: string;
  trigger: "explicit_add" | "identity_clue";
};

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const URL_PATTERN = /https?:\/\/[^\s，。；;]+/iu;
const WECHAT_PATTERN = /(?:wechat|微信)\s*[:：]\s*[\w.-]{3,64}/iu;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/u;

function cleanSegment(value: string): string {
  return value
    .replace(/^[\s:：,，;；-]+|[\s:：,，;；-]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function firstMatch(value: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = value.match(pattern)?.[0];
    if (match) return cleanSegment(match);
  }
  return "";
}

function isHighPrecisionUnlabeledName(value: string): boolean {
  const normalized = cleanSegment(value).toLocaleLowerCase();
  if (
    /^(?:met|meet|spoke|talked|remember|introduced|referred)\s/iu.test(
      normalized,
    ) || /^(?:认识|见到|见了|刚聊|聊了)/u.test(normalized)
  ) {
    return false;
  }
  return /^[\p{Script=Han}]{2,8}$/u.test(normalized) ||
    /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){1,3}$/u.test(
      normalized,
    );
}

function looksLikeOrdinaryQuestion(value: string): boolean {
  return /^\s*(?:who|what|when|where|why|how|can|could|would|should|is|are|do|does|did|check|find)\b/iu.test(
    value,
  ) || /^\s*(?:谁|什么|何时|哪里|为什么|怎么|如何|能否|是否|请问|帮我查)/u.test(
    value,
  );
}

function extractUnlabeledName(value: string, identityClue: string): string {
  const clueIndex = value.toLocaleLowerCase().indexOf(
    identityClue.toLocaleLowerCase(),
  );
  if (clueIndex < 0) return "";
  const prefix = value
    .slice(0, clueIndex)
    .replace(
      /(?:email|e-mail|phone|mobile|linkedin|wechat|邮箱|邮件|电话|手机|微信)\s*[:：]?\s*$/iu,
      "",
    )
    .replace(/[\s,，;；—:：。-]+$/gu, "");
  const candidate = cleanSegment(prefix.split(/[，,；;\n]/u).at(-1) ?? prefix);
  return isHighPrecisionUnlabeledName(candidate) ? candidate : "";
}

function extractName(value: string, identityClue = ""): string {
  const labeled = value.match(
    /(?:^|[\n,，;；])\s*(?:name|person|contact|姓名|联系人)\s*[:：]\s*([^\n,，;；]{1,80})/iu,
  )?.[1];
  if (labeled) return cleanSegment(labeled);

  const englishCommand = value.match(
    /^\s*(?:please\s+)?(?:add|create|save|remember|new)\s+(.+)$/iu,
  )?.[1];
  const englishRemainder = englishCommand?.replace(
    /^(?:(?:a|this)\s+)?(?:contact|person)\s+/iu,
    "",
  );
  const english = englishRemainder?.match(
    /^(?!(?:for|to|as|from|with)\b)([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,3}?)(?=\s*[,，;；]|\s+(?:as|for|to|at|from|is|with|who|—|-)|$)/iu,
  )?.[1];
  if (english) return cleanSegment(english);

  const chinese = value.match(
    /^\s*(?:请)?(?:添加|创建|新建|保存|记住)(?:一个)?(?:联系人|人物)?\s*[:：]?\s*([\p{Script=Han}]{2,4}|[A-Za-z][A-Za-z'’. -]{1,79}?)(?=\s*[，,；;。]|\s+(?:是|为|来自|加入|担任)|$)/u,
  )?.[1];
  if (chinese) return cleanSegment(chinese);

  if (identityClue && !looksLikeOrdinaryQuestion(value)) {
    return extractUnlabeledName(value, identityClue);
  }
  return "";
}

function extractRelationshipContext(
  value: string,
  identityClue = "",
): string {
  const labeled = value.match(
    /(?:relationship|context|pursuit|search|assignment|关系|项目|职位|招聘)\s*[:：]\s*([^\n,，;；。]{2,100})/iu,
  )?.[1];
  if (labeled) return cleanSegment(labeled);

  const englishSearch = value.match(
    /(?:for|into|on)\s+(?:the\s+)?([^\n,，;；。]{2,80}?\b(?:search|role|mandate|assignment))\b/iu,
  )?.[1];
  if (englishSearch) return cleanSegment(englishSearch);

  const conciseEnglishContext = value.match(
    /\bfor\s+(?:the\s+)?(.+?)(?=\s*[,，;；。]|\s+(?:email|phone|wechat|linkedin|referred|introduced|available|open)\b|$)/iu,
  )?.[1];
  if (conciseEnglishContext) return cleanSegment(conciseEnglishContext);

  const standaloneSearch = value.match(
    /(?:^|[\s,，;；])([\p{L}\d][\p{L}\d&/'’+ -]{1,70}\b(?:search|role|mandate|assignment))(?=$|[，,；;。])/iu,
  )?.[1];
  if (standaloneSearch) return cleanSegment(standaloneSearch);

  const chineseContext = value.match(
    /(?:加入|用于|放到|归到|关联到|在)\s*([^\n，,；;。]{2,60}(?:项目|职位|招聘|寻访))/u,
  )?.[1];
  if (chineseContext) return cleanSegment(chineseContext);

  if (identityClue) {
    const clueIndex = value.toLocaleLowerCase().indexOf(
      identityClue.toLocaleLowerCase(),
    );
    if (clueIndex >= 0) {
      const remainder = value
        .slice(clueIndex + identityClue.length)
        .replace(/^[\s,，;；。—:：-]+/gu, "");
      const suffix = cleanSegment(
        remainder.split(/[，,；;。\n]/u)[0] ?? "",
      );
      if (
        suffix.length <= 120 &&
        !/^(?:referred|introduced|met|available|phone|email|推荐|介绍|下周|可聊|电话|邮箱)/iu.test(
          suffix,
        )
      ) {
        return suffix;
      }
    }
  }
  return "";
}

function hasExplicitAddIntent(value: string): boolean {
  return /^(?:\s*please\s+)?\s*(?:add|create|save|remember|new)\b/iu.test(
    value,
  ) || /^\s*(?:请)?(?:添加|创建|新建|保存|记住)/u.test(value);
}

/**
 * Produces a review-only draft from concise recruiter language.
 *
 * This helper deliberately does not infer a person from an ordinary question,
 * does not select a directory match, and has no mutation capability. Canonical
 * identity lookup and the explicit review surface remain authoritative.
 */
export function proposeAgentContactDraft(
  input: string,
): AgentContactDraft | null {
  const sourceNote = input.trim();
  if (!sourceNote) return null;

  const identityClue = firstMatch(sourceNote, [
    EMAIL_PATTERN,
    WECHAT_PATTERN,
    URL_PATTERN,
    PHONE_PATTERN,
  ]);
  const explicitAdd = hasExplicitAddIntent(sourceNote);
  const name = extractName(sourceNote, identityClue);

  if (!explicitAdd && !(identityClue && name)) return null;

  return {
    identityClue,
    name,
    relationshipContext: extractRelationshipContext(sourceNote, identityClue),
    sourceNote,
    trigger: explicitAdd ? "explicit_add" : "identity_clue",
  };
}
