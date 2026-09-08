"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore, useTransition } from "react";
import { isMarketingLocale, localeCookie } from "@/lib/marketing-locale";
import { useMarketingLocale } from "./locale-provider";

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function LanguageSwitcher() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientReady,
    serverReady,
  );
  const locale = useMarketingLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      className="site-language"
      aria-label={locale === "en" ? "Language" : "语言"}
      value={locale}
      disabled={pending || !hydrated}
      onChange={(event) => {
        const next = event.target.value;
        if (!isMarketingLocale(next)) return;
        document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        startTransition(() => router.refresh());
      }}
    >
      <option value="zh-CN">中文</option>
      <option value="en">EN</option>
    </select>
  );
}
