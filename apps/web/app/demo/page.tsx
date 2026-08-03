import type { Metadata } from "next";
import { DemoWorkbench } from "@/components/demo-workbench";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Live product demo",
  description:
    "Try Talent Signal with a local, deterministic candidate-conversation review. No text is uploaded or saved.",
  alternates: {
    canonical: "/demo",
  },
};

export default function DemoPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="demo-page">
        <div className="shell">
          <p className="demo-page__intro">
            A safe product preview. The extraction below runs locally with
            deterministic rules and does not send the text anywhere.
          </p>
          <DemoWorkbench />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
