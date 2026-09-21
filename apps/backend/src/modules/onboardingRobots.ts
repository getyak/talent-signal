type Rule = { allow: boolean; path: string };
/** Public-profile reads respect both wildcard and our specific bot groups. */
export function profileRobotsAllows(text: string, url: URL): boolean {
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let current: (typeof groups)[number] | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === "allow" || field === "disallow") && value) {
      current.rules.push({ allow: field === "allow", path: value });
    }
  }
  const bot = "talentsignalresearchbot";
  const specific = groups.filter(group => group.agents.some(agent => agent !== "*" && agent.length > 0 && bot.startsWith(agent)));
  const applicable = specific.length ? specific : groups.filter(group => group.agents.includes("*"));
  const rules = applicable.flatMap(group => group.rules);
  const path = url.pathname + url.search;
  const matches = rules.filter(rule => matchesRobotsPath(rule.path, path))
    .sort((a, b) => b.path.replace(/[*$]/g, "").length - a.path.replace(/[*$]/g, "").length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

// Literal segments keep remote-controlled wildcard patterns out of a backtracking regex.
function matchesRobotsPath(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const parts = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  const first = parts.shift() ?? "";
  if (!path.startsWith(first)) return false;
  let cursor = first.length;
  if (!parts.length) return !anchored || cursor === path.length;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (anchored && index === parts.length - 1) return path.endsWith(part) && path.length - part.length >= cursor;
    const found = path.indexOf(part, cursor);
    if (found < 0) return false;
    cursor = found + part.length;
  }
  return true;
}
