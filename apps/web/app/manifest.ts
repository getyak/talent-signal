import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Talent Signal",
    short_name: "Talent Signal",
    description:
      "为独立招聘顾问提供有证据支撑的候选人关系进展。",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f1ed",
    theme_color: "#d84a35",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
