/**
 * The types of Standard Schema v1 (https://standardschema.dev), the interface
 * Zod, Valibot, ArkType and others implement. Copied, as the specification
 * recommends, so that validating responses adds no dependency.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaProps<Input, Output>;
}

export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (value: unknown) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  readonly types?: { readonly input: Input; readonly output: Output } | undefined;
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

/** What a schema produces: the type of `data` on a validated response. */
export type InferSchemaOutput<S extends StandardSchemaV1> = NonNullable<S['~standard']['types']>['output'];

/** One way a response failed its schema. */
export interface SchemaIssue {
  message: string;
  /** Where in `data`, e.g. `[0, 'title']`. Empty for `data` itself. */
  path: PropertyKey[];
}

/** Runs a schema over a value: its output, or the issues it found. */
export async function runSchema(schema: StandardSchemaV1, value: unknown): Promise<{ value: unknown } | { issues: SchemaIssue[] }> {
  const result = await schema['~standard'].validate(value);
  if (!result.issues) {
    return { value: result.value };
  }
  return {
    issues: result.issues.map((issue) => ({
      message: issue.message,
      path: (issue.path ?? []).map((segment) => (typeof segment === 'object' ? segment.key : segment)),
    })),
  };
}
