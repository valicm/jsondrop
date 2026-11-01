import type { ResourceBase, ToMany, ToOne } from '@jsondrop/core';
import type { DateTimeString, FileMeta, FileUri, ImageMeta, LinkField, PathField, TextField } from './fields.js';

/**
 * Drupal 11 core entity types, with the base fields JSON:API exposes.
 *
 * Bundle-specific fields are the project's: extend the generic types and
 * register the bundle.
 *
 * ```ts
 * interface Article extends Node<'article'> {
 *   body: TextField | null;
 *   field_image: ToOne<File<ImageMeta>>;
 *   field_tags: ToMany<Term<'tags'>>;
 * }
 * declare module '@jsondrop/core' {
 *   interface ResourceTypes { 'node--article': Article }
 * }
 * ```
 *
 * Fields hidden by access (an anonymous request sees no `mail`) or by
 * JSON:API Extras are absent at runtime even where typed as required.
 */

/** Fields shared by revisionable, translatable content entities. */
interface ContentEntity<TType extends string> extends ResourceBase<TType> {
  langcode: string;
  default_langcode?: boolean;
  revision_translation_affected?: boolean | null;
}

// Config entities: only the identifying fields are typed.

export interface NodeType extends ResourceBase<'node_type--node_type'> {
  drupal_internal__type: string;
  name: string;
  description: string | null;
}

export interface Vocabulary extends ResourceBase<'taxonomy_vocabulary--taxonomy_vocabulary'> {
  drupal_internal__vid: string;
  name: string;
  description: string | null;
}

export interface MediaType extends ResourceBase<'media_type--media_type'> {
  drupal_internal__id: string;
  label: string;
  description: string | null;
}

export interface Role extends ResourceBase<'user_role--user_role'> {
  drupal_internal__id: string;
  label: string;
}

export interface BlockContentType extends ResourceBase<'block_content_type--block_content_type'> {
  drupal_internal__id: string;
  label: string;
}

// Content entities.

export interface User extends ContentEntity<'user--user'> {
  drupal_internal__uid: number;
  display_name: string;
  name?: string;
  mail?: string | null;
  timezone?: string;
  status?: boolean;
  created?: DateTimeString;
  changed?: DateTimeString;
  access?: DateTimeString;
  login?: DateTimeString | null;
  preferred_langcode?: string;
  roles?: ToMany<Role>;
  user_picture?: ToOne<File<ImageMeta>>;
}

/**
 * `file--file`. `TMeta` types the relationship meta it carries when reached
 * through a field: {@link ImageMeta} for image fields.
 */
export interface File<TMeta extends object = Record<string, unknown>> extends ContentEntity<'file--file'> {
  drupal_internal__fid: number;
  filename: string;
  uri: FileUri;
  filemime: string;
  filesize: number;
  status: boolean;
  created: DateTimeString;
  changed: DateTimeString;
  uid?: ToOne<User>;
  relationshipMeta?: TMeta & Record<string, unknown>;
}

export interface Node<TBundle extends string = string> extends ContentEntity<`node--${TBundle}`> {
  drupal_internal__nid: number;
  drupal_internal__vid: number;
  title: string;
  status: boolean;
  promote: boolean;
  sticky: boolean;
  created: DateTimeString;
  changed: DateTimeString;
  revision_timestamp?: DateTimeString;
  revision_log?: string | null;
  path?: PathField;
  node_type?: ToOne<NodeType>;
  uid?: ToOne<User>;
  revision_uid?: ToOne<User>;
}

export interface Term<TVocabulary extends string = string> extends ContentEntity<`taxonomy_term--${TVocabulary}`> {
  drupal_internal__tid: number;
  drupal_internal__revision_id?: number;
  name: string;
  description: TextField | null;
  weight: number;
  status: boolean;
  changed: DateTimeString;
  path?: PathField;
  vid?: ToOne<Vocabulary>;
  /** Parents; a root term's parent is a stub with the id `virtual`. */
  parent?: ToMany<Term<TVocabulary>>;
  revision_user?: ToOne<User>;
}

export interface Media<TBundle extends string = string> extends ContentEntity<`media--${TBundle}`> {
  drupal_internal__mid: number;
  drupal_internal__vid: number;
  name: string;
  status: boolean;
  created: DateTimeString;
  changed: DateTimeString;
  path?: PathField;
  bundle?: ToOne<MediaType>;
  thumbnail?: ToOne<File<ImageMeta>>;
  uid?: ToOne<User>;
  revision_user?: ToOne<User>;
}

// The media types the standard install profile creates.

export interface MediaImage extends Media<'image'> {
  field_media_image: ToOne<File<ImageMeta>>;
}

export interface MediaDocument extends Media<'document'> {
  field_media_document: ToOne<File<FileMeta>>;
}

export interface MediaAudio extends Media<'audio'> {
  field_media_audio_file: ToOne<File<FileMeta>>;
}

export interface MediaVideo extends Media<'video'> {
  field_media_video_file: ToOne<File<FileMeta>>;
}

export interface MediaRemoteVideo extends Media<'remote_video'> {
  /** The oEmbed URL (YouTube, Vimeo). */
  field_media_oembed_video: string;
}

export interface MenuLinkContent extends ContentEntity<'menu_link_content--menu_link_content'> {
  drupal_internal__id: number;
  title: string;
  description: string | null;
  menu_name: string;
  link: LinkField;
  enabled: boolean;
  expanded: boolean;
  external: boolean;
  weight: number;
  /** Parent plugin ID, `menu_link_content:{uuid}`, or null at the root. */
  parent: string | null;
  changed: DateTimeString;
}

export interface BlockContent<TBundle extends string = string> extends ContentEntity<`block_content--${TBundle}`> {
  drupal_internal__id: number;
  info: string;
  status: boolean;
  reusable: boolean;
  changed: DateTimeString;
  body?: TextField | null;
  block_content_type?: ToOne<BlockContentType>;
}

export interface PathAlias extends ResourceBase<'path_alias--path_alias'> {
  drupal_internal__id: number;
  langcode: string;
  /** System path, e.g. `/node/1`. */
  path: string;
  alias: string;
  status: boolean;
}

/** `paragraph--{bundle}` (contrib paragraphs). */
export interface Paragraph<TBundle extends string = string> extends ContentEntity<`paragraph--${TBundle}`> {
  drupal_internal__id: number;
  drupal_internal__revision_id: number;
  status: boolean;
  created: DateTimeString;
  parent_id: string;
  parent_type: string;
  parent_field_name: string;
  behavior_settings?: unknown;
}

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'user--user': User;
    'file--file': File;
    'menu_link_content--menu_link_content': MenuLinkContent;
    'path_alias--path_alias': PathAlias;
    'node_type--node_type': NodeType;
    'taxonomy_vocabulary--taxonomy_vocabulary': Vocabulary;
    'media_type--media_type': MediaType;
    'user_role--user_role': Role;
    'block_content_type--block_content_type': BlockContentType;
  }

  interface EntityTypes {
    node: Node;
    taxonomy_term: Term;
    media: Media;
    block_content: BlockContent;
    paragraph: Paragraph;
  }
}
