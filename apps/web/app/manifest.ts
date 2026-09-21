import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Talent Signal",
    short_name: "Talent Signal",
    description:
      "保留关系背景，跟进承诺，让每一次合作都有清晰的下一步。",
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
