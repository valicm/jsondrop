import { JsonApiClient, type Resource, type ToMany, type ToOne } from '@jsondrop/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  buildMenuTree,
  fileUrl,
  getMenu,
  getResourceByPath,
  getView,
  image,
  imageStyleUrl,
  translatePath,
  type CommentField,
  type File,
  type ImageMeta,
  type LinkField,
  type MenuLinkContent,
  type Node,
  type Term,
  type TextField,
  type User,
} from '../src/index.js';
import { json, mockFetch } from '../../core/test/mock-fetch.js';

interface Article extends Node<'article'> {
  body: TextField | null;
  field_image: ToOne<File<ImageMeta>>;
  field_tags: ToMany<Term<'tags'>>;
}

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'node--article': Article;
  }
}

const client = (fetch: typeof globalThis.fetch) => new JsonApiClient({ baseUrl: 'https://cms.example.com', fetch });

describe('entity types', () => {
  it('types registered, core and fallback resources', async () => {
    const { fetch } = mockFetch(json({ data: null }));
    const drupal = client(fetch);
    expectTypeOf(drupal.getResource('node--article', 'x')).resolves.toEqualTypeOf<Article>();
    expectTypeOf(drupal.getResource('user--user', 'x')).resolves.toEqualTypeOf<User>();
    expectTypeOf(drupal.getResource('node--landing_page', 'x')).resolves.toEqualTypeOf<Node & Resource>();
    expectTypeOf(drupal.getCollection('taxonomy_term--tags')).resolves.toEqualTypeOf<Array<Term & Resource>>();
    expectTypeOf(drupal.getResource('custom_entity--thing', 'x')).resolves.toEqualTypeOf<Resource>();
  });
});

describe('translatePath', () => {
  const route = {
    resolved: 'https://cms.example.com/about',
    isHomePath: false,
    entity: { canonical: 'https://cms.example.com/about', type: 'node', bundle: 'page', id: '1', uuid: 'n1' },
    label: 'About',
    jsonapi: {
      individual: 'http://internal/de/jsonapi/node/page/n1',
      resourceName: 'node--page',
      pathPrefix: 'jsonapi',
      basePath: '/jsonapi',
      entryPoint: 'http://internal/jsonapi',
    },
  };

  it('resolves a path with decoupled_router', async () => {
    const { fetch, calls } = mockFetch(json(route));
    const drupal = new JsonApiClient({ baseUrl: 'https://cms.example.com', fetch, locale: 'de', defaultLocale: 'en' });
    expect(await translatePath(drupal, '/about')).toEqual(route);
    expect(calls[0]!.url).toBe('https://cms.example.com/de/router/translate-path?path=%2Fabout&_format=json');
    expect(calls[0]!.headers.get('Accept')).toBe('application/json');
  });

  it('is null for an unknown path', async () => {
    const { fetch } = mockFetch(json({ message: 'Unable to resolve path /nope.' }, 404));
    expect(await translatePath(client(fetch), '/nope')).toBeNull();
  });

  it('fetches the entity at a path from the site origin', async () => {
    const { fetch, calls } = mockFetch(json(route), json({ data: { type: 'node--page', id: 'n1', attributes: { title: 'About' } } }));
    const result = await getResourceByPath<Node<'page'>>(client(fetch), '/about', { query: { include: ['uid'] } });
    expect(result?.resource?.title).toBe('About');
    expect(calls[1]!.url).toBe('https://cms.example.com/de/jsonapi/node/page/n1?include=uid');
  });

  it('returns the route alone for a path that is not an entity', async () => {
    const { fetch, calls } = mockFetch(json({ resolved: 'https://cms.example.com/search', isHomePath: false }));
    expect(await getResourceByPath(client(fetch), '/search')).toEqual({ route: { resolved: 'https://cms.example.com/search', isHomePath: false }, resource: null });
    expect(calls).toHaveLength(1);
  });
});

describe('menus', () => {
  it('builds a tree from jsonapi_menu_items', async () => {
    const item = (id: string, title: string, parent: string, weight: number) => ({
      type: 'menu_link_content--menu_link_content',
      id,
      attributes: { title, parent, weight, url: `/${title.toLowerCase()}`, enabled: true, expanded: false, menu_name: 'main', provider: 'menu_link_content', description: null },
    });
    const { fetch, calls } = mockFetch(json({
      data: [
        item('menu_link_content:b', 'Blog', '', 1),
        item('standard.front_page', 'Home', '', 0),
        item('menu_link_content:c', 'News', 'menu_link_content:b', 0),
        item('menu_link_content:d', 'Archive', 'menu_link_content:b', 0),
      ],
    }));
    const tree = await getMenu(client(fetch), 'main');
    expect(calls[0]!.url).toBe('https://cms.example.com/jsonapi/menu_items/main');
    expect(tree.map((node) => node.title)).toEqual(['Home', 'Blog']);
    expect(tree[1]!.children.map((node) => node.title)).toEqual(['Archive', 'News']);
  });

  it('builds a tree from core menu_link_content resources', () => {
    const link = (id: string, parent: string | null, weight = 0) => ({ id, type: 'menu_link_content--menu_link_content', title: id, parent, weight }) as unknown as MenuLinkContent;
    const tree = buildMenuTree([
      link('11111111-1111-1111-1111-111111111111', null),
      link('22222222-2222-2222-2222-222222222222', 'menu_link_content:11111111-1111-1111-1111-111111111111'),
      link('33333333-3333-3333-3333-333333333333', 'menu_link_content:99999999-9999-9999-9999-999999999999'),
    ]);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.children[0]!.id).toBe('22222222-2222-2222-2222-222222222222');
  });
});

describe('views', () => {
  it('passes filters, arguments, sort and page', async () => {
    const { fetch, calls } = mockFetch(json({ data: [{ type: 'node--article', id: 'a1', attributes: {} }], meta: { count: '12' } }));
    const result = await getView(client(fetch), 'content', 'page_1', {
      filters: { type: 'article', tags: ['1', '2'] },
      arguments: ['5'],
      sort: { by: 'created', order: 'DESC' },
      page: 2,
    });
    expect(result.count).toBe(12);
    expect(result.data).toHaveLength(1);
    expect(decodeURIComponent(calls[0]!.url)).toBe(
      'https://cms.example.com/jsonapi/views/content/page_1?views-filter[type]=article&views-filter[tags][]=1&views-filter[tags][]=2&views-argument[]=5&views-sort[sort_by]=created&views-sort[sort_order]=DESC&page=2',
    );
  });
});

describe('files', () => {
  const drupal = new JsonApiClient({ baseUrl: 'https://cms.example.com' });

  it('makes file URLs absolute', () => {
    expect(fileUrl(drupal, { uri: { value: 'public://a.jpg', url: '/sites/default/files/a.jpg' } })).toBe('https://cms.example.com/sites/default/files/a.jpg');
    expect(fileUrl(drupal, { uri: { value: 's3://a.jpg', url: 'https://cdn.example.com/a.jpg' } })).toBe('https://cdn.example.com/a.jpg');
  });

  it('reads an image field', () => {
    expect(image(drupal, {
      id: 'f1',
      type: 'file--file',
      uri: { value: 'public://a.jpg', url: '/sites/default/files/a.jpg' },
      relationshipMeta: { alt: 'A cat', title: '', width: 640, height: 480 },
    })).toEqual({ url: 'https://cms.example.com/sites/default/files/a.jpg', alt: 'A cat', title: null, width: 640, height: 480 });
    expect(image(drupal, { id: 'f1', type: 'file--file', stub: true })).toBeNull();
    expect(image(drupal, null)).toBeNull();
  });

  it('finds image style links', () => {
    expect(imageStyleUrl({ links: { large: { href: 'https://cms.example.com/styles/large/a.jpg' } } }, 'large')).toBe('https://cms.example.com/styles/large/a.jpg');
    expect(imageStyleUrl({}, 'large')).toBeNull();
  });
});

describe('field value types', () => {
  it('match what JSON:API sends', () => {
    expectTypeOf<keyof LinkField>().toEqualTypeOf<'uri' | 'resolvable_uri' | 'title' | 'options'>();
    expectTypeOf<keyof CommentField>().toEqualTypeOf<'status' | 'cid' | 'last_comment_timestamp' | 'last_comment_name' | 'last_comment_uid' | 'comment_count'>();
    expectTypeOf<CommentField['last_comment_timestamp']>().toEqualTypeOf<number>();
  });
});
