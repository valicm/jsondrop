/**
 * Example 8: a webform, from Drupal to a framework-free form controller.
 *
 * The controller holds values and errors, says what to render, and submits.
 * A React, Vue or Svelte component maps `view()` to markup; the logic
 * stays here.
 */
import { JsonApiClient } from '@jsondrop/core';
import {
  defaultValues,
  fieldState,
  getWebform,
  submitWebform,
  WebformError,
  WebformValidationError,
  type FieldState,
  type SubmitResult,
  type WebformField,
} from '@jsondrop/webform';

const drupal = new JsonApiClient({ baseUrl: process.env.DRUPAL_URL ?? 'https://cms.example.com' });

/** A field to render, with its state for the current values. */
export interface FieldView extends FieldState {
  field: WebformField;
  value: unknown;
  error: string | null;
  children: FieldView[];
}

export async function createWebformController(webformId: string) {
  const webform = await getWebform(drupal, webformId);
  let values = defaultValues(webform.fields);
  let errors: WebformValidationError | null = null;

  const view = (fields: WebformField[]): FieldView[] =>
    fields
      .map((field) => ({
        ...fieldState(field, values),
        field,
        value: values[field.key],
        error: errors?.errorFor(field.key) ?? null,
        children: field.kind === 'composite' ? [] : view(field.children),
      }))
      .filter((item) => item.visible);

  return {
    title: webformId,
    /** What to render now. Hidden fields (by #states or #access) are left out. */
    view: () => view(webform.fields),

    setValue(key: string, value: unknown) {
      values = { ...values, [key]: value };
    },

    /** Checks a checkboxes option on or off. */
    toggleOption(key: string, option: string, on: boolean) {
      const current = Array.isArray(values[key]) ? (values[key] as string[]) : [];
      values = { ...values, [key]: on ? [...new Set([...current, option])] : current.filter((item) => item !== option) };
    },

    /** Submits; on validation errors, they show up in `view()`. */
    async submit(): Promise<{ ok: true; result: SubmitResult } | { ok: false; message: string }> {
      try {
        const result = await submitWebform(drupal, webformId, values);
        errors = null;
        return { ok: true, result };
      }
      catch (error) {
        if (error instanceof WebformValidationError) {
          errors = error;
          return { ok: false, message: error.message };
        }
        if (error instanceof WebformError) {
          return { ok: false, message: error.message };
        }
        throw error;
      }
    },
  };
}

// With React, for one:
//
//   function Field({ item, form }) {
//     const { field } = item;
//     if (field.kind === 'markup') return <div dangerouslySetInnerHTML={{ __html: field.markup ?? '' }} />;
//     if (field.kind === 'container') return <fieldset><legend>{field.title}</legend>{item.children.map(…)}</fieldset>;
//     if (field.type === 'select') return <select required={item.required} disabled={item.disabled}
//       onChange={(e) => form.setValue(field.key, e.target.value)}>{field.options?.map((o) => <option value={o.value}>{o.label}</option>)}</select>;
//     …
//   }
