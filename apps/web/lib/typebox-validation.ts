import { FormatRegistry, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (value) => UUID.test(value));
}
if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set(
    "date-time",
    (value) => DATE_TIME.test(value) && !Number.isNaN(Date.parse(value)),
  );
}

export function matchesTypeBox(schema: TSchema, value: unknown): boolean {
  return Value.Check(schema, value);
}
