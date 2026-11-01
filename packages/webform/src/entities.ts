import type { ResourceBase, ToOne } from '@jsondrop/core';

/**
 * Webform's entities as core JSON:API exposes them. Read-only in practice:
 * the webform is a config entity, and creating submissions through JSON:API
 * skips Webform's validation, so submit with `submitWebform()` instead.
 * Use these to list webforms or read their status.
 */

/** `webform--webform`: a webform's configuration. */
export interface WebformConfig extends ResourceBase<'webform--webform'> {
  /** The machine name, used by webform_rest (`contact`). */
  drupal_internal__id: string;
  title: string;
  description: string | null;
  /** `open`, `closed` or `scheduled`. */
  status: 'open' | 'closed' | 'scheduled' | string;
  open: string | null;
  close: string | null;
  categories?: string[];
  /** The element definitions as YAML source. Render from `getWebform()` instead. */
  elements?: string;
  settings?: Record<string, unknown>;
}

/** `webform_submission--{webform}`. The submitted values are not exposed by core JSON:API. */
export interface WebformSubmission<TWebform extends string = string> extends ResourceBase<`webform_submission--${TWebform}`> {
  drupal_internal__sid: number;
  serial: number;
  uri?: string;
  created: string;
  completed: string | null;
  changed: string;
  in_draft: boolean;
  current_page?: string | null;
  locked?: boolean;
  sticky?: boolean;
  langcode?: string;
  webform_id?: ToOne<WebformConfig>;
}

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'webform--webform': WebformConfig;
  }

  interface EntityTypes {
    webform_submission: WebformSubmission;
  }
}
