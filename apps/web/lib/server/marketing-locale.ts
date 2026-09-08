import { cache } from "react";
import { cookies, headers } from "next/headers";
import { localeCookie, resolveMarketingLocale } from "@/lib/marketing-locale";

export const getMarketingLocale = cache(async () => {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  return resolveMarketingLocale(
    cookieStore.get(localeCookie)?.value,
    requestHeaders.get("accept-language") ?? "",
  );
});
