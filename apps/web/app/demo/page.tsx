import type { Metadata } from "next";
import { DemoWorkbench } from "@/components/demo-workbench";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAiAvailability } from "@/lib/server/ai-analysis";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live product demo",
  description:
    "Try Talent Signal with local rules or an explicitly selected, private AI candidate-conversation review.",
  alternates: {
    canonical: "/demo",
  },
};

export default function DemoPage() {
  const ai = getAiAvailability();

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="demo-page">
        <div className="shell">
          <p className="demo-page__intro">
            A controlled product preview. Local analysis stays in your browser;
            the optional AI route runs only when you explicitly select it.
          </p>
          <DemoWorkbench
            aiEnabled={ai.enabled}
            aiProvider={ai.provider}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
