/**
 * Example 1: typing your site's content.
 *
 * The packages type Drupal's base fields. Your bundles add their own
 * fields: extend the generic types, then register the bundle once. Every
 * client call with that type name is typed from then on.
 */
import type { ToMany, ToOne } from '@jsondrop/core';
import type {
  File,
  ImageMeta,
  LinkField,
  MediaImage,
  MediaRemoteVideo,
  Node,
  Paragraph,
  Term,
  TextField,
} from '@jsondrop/drupal';

// A field type from a contrib module, typed once and reused.
export interface MetatagValue {
  tag: 'meta' | 'link';
  attributes: Record<string, string>;
}

// Taxonomy: a vocabulary with a custom field.
export interface Tag extends Term<'tags'> {
  field_color: string | null;
}

// Paragraphs: one interface per paragraph type, and a union of them for a
// field that accepts several.
export interface TextParagraph extends Paragraph<'text'> {
  field_text: TextField;
}

export interface ImageParagraph extends Paragraph<'image'> {
  field_media: ToOne<MediaImage>;
  field_caption: string | null;
}

export interface VideoParagraph extends Paragraph<'video'> {
  field_media: ToOne<MediaRemoteVideo>;
}

export interface CtaParagraph extends Paragraph<'cta'> {
  field_title: string;
  field_link: LinkField;
}

export type ContentParagraph = TextParagraph | ImageParagraph | VideoParagraph | CtaParagraph;

// Nodes.
export interface Article extends Node<'article'> {
  body: TextField | null;
  field_image: ToOne<File<ImageMeta>>;
  field_tags: ToMany<Tag>;
  field_metatag?: MetatagValue[];
}

export interface LandingPage extends Node<'landing_page'> {
  field_hero: ToOne<MediaImage>;
  field_content: ToMany<ContentParagraph>;
}

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'node--article': Article;
    'node--landing_page': LandingPage;
    'taxonomy_term--tags': Tag;
    'paragraph--text': TextParagraph;
    'paragraph--image': ImageParagraph;
    'paragraph--video': VideoParagraph;
    'paragraph--cta': CtaParagraph;
  }
}

// Bundles you don't register still get their entity type's base fields:
// `client.getResource('node--page', id)` is a `Node`, with any other
// field typed `unknown` until you register `node--page`.
