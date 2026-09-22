import { notFound } from "next/navigation";
import { DesktopChromeFixture } from "./preview";

export default function DesktopChromePreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DesktopChromeFixture />;
}
