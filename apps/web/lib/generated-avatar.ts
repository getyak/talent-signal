import { Avatar, Style, type StyleDefinition } from "@dicebear/core";
import shapesDefinition from "@dicebear/styles/shapes.json";
import glassDefinition from "@dicebear/styles/glass.json";
import { avatarPalette } from "./avatar";

// Pin both dependency versions: changing the renderer can change a saved seed's image.
// Only these two CC0 definitions are bundled. No HTTP API or personal data is used.
const styles = {
  shapes: new Style(shapesDefinition as StyleDefinition),
  glass: new Style(glassDefinition as StyleDefinition),
};

const cache = new Map<string, string>();

export function generatedAvatar(style: "shapes" | "glass", seed: string, dark: boolean) {
  const key = `${style}:${seed}:${dark}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const result = new Avatar(styles[style], {
    seed,
    size: 192,
    animationVariant: ["none"],
    backgroundColor: avatarPalette.map(color => style === "glass" ? color[dark ? 1 : 2] : color[dark ? 2 : 0]),
    ...(style === "shapes" ? {
      shape1Color: avatarPalette.map(color => color[dark ? 0 : 2]),
      shape2Color: avatarPalette.map(color => color[dark ? 0 : 2]),
      shape3Color: avatarPalette.map(color => color[dark ? 2 : 0]),
    } : {}),
  }).toDataUri();
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
