export const marketingLocales = ["zh-CN", "en"] as const;
export type MarketingLocale = (typeof marketingLocales)[number];
export const localeCookie = "talent-signal-locale";

export function isMarketingLocale(value: unknown): value is MarketingLocale {
  return value === "zh-CN" || value === "en";
}

/** Explicit preference wins; otherwise honor the browser's weighted language list. */
export function resolveMarketingLocale(
  preference?: string,
  acceptLanguage = "",
): MarketingLocale {
  if (isMarketingLocale(preference)) return preference;
  const languages = acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().toLowerCase().split(";");
      const q = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      return { tag, index, weight: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter(
      ({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1,
    )
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of languages) {
    if (/^zh(?:-|$)/.test(tag)) return "zh-CN";
    if (/^en(?:-|$)/.test(tag)) return "en";
  }
  return "en";
}
