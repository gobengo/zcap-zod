import * as z from "zod/v4"

const urnRegex = /^urn:[a-z0-9][a-z0-9-]{0,31}:[a-z0-9()+,\-.:=@;$_!*'%]+$/i;

export const URN = z.string().regex(urnRegex, {
  message: "Invalid Uniform Resource Name (URN)",
});

// Infer the TypeScript type
type URNInferred = z.infer<typeof URN>;
