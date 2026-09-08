"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MarketingLocale } from "@/lib/marketing-locale";

const LocaleContext = createContext<MarketingLocale>("zh-CN");
export function MarketingLocaleProvider({
  locale,
  children,
}: {
  locale: MarketingLocale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}
export function useMarketingLocale() {
  return useContext(LocaleContext);
}
