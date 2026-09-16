import * as z from "zod/v4"

// Case-insensitive, spelled out with character classes rather than the `i`
// flag: JSON Schema `pattern` has no flags, so scripts/json-schema.mjs could
// not carry `i` over into the generated schema.
const urnRegex = /^[uU][rR][nN]:[a-zA-Z0-9][a-zA-Z0-9-]{0,31}:[a-zA-Z0-9()+,\-.:=@;$_!*'%]+$/;

export const URN = z.string().regex(urnRegex, {
  message: "Invalid Uniform Resource Name (URN)",
});

// Infer the TypeScript type
type URNInferred = z.infer<typeof URN>;
