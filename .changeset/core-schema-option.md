---
"@jsondrop/core": minor
---

New `schema` option on `get`, `post`, `patch`, `delete` and `request`, for validating responses at runtime with any Standard Schema (Zod, Valibot, ArkType, …), with no new dependency. It runs on `data` after deserialization, types `data` from the schema's output, and throws the new `JsonApiSchemaError` on a mismatch.
