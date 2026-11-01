import { describe, expect, it } from 'vitest';
import { deserialize, isStub, serialize, type Resource } from '../src/index.js';

describe('deserialize', () => {
  it('returns null without primary data', () => {
    expect(deserialize({})).toBeNull();
    expect(deserialize({ data: null })).toBeNull();
  });

  it('flattens attributes and resolves included relationships', () => {
    const article = deserialize({
      data: {
        type: 'node--article',
        id: 'a1',
        attributes: { title: 'Hello', drupal_internal__nid: 1 },
        relationships: {
          uid: { data: { type: 'user--user', id: 'u1' } },
          field_image: { data: { type: 'file--file', id: 'f1', meta: { alt: 'A cat', width: 640 } } },
          field_tags: { data: [{ type: 'taxonomy_term--tags', id: 't1' }, { type: 'taxonomy_term--tags', id: 't2' }] },
          field_empty: { data: null },
          node_type: { links: { related: { href: 'https://example.com/x' } } },
        },
        links: { self: { href: 'https://example.com/jsonapi/node/article/a1' } },
      },
      included: [
        { type: 'user--user', id: 'u1', attributes: { name: 'admin' } },
        { type: 'file--file', id: 'f1', attributes: { uri: { url: '/files/cat.jpg' } } },
        { type: 'taxonomy_term--tags', id: 't1', attributes: { name: 'Cats' } },
      ],
    }) as Resource;

    expect(article).toMatchObject({ id: 'a1', type: 'node--article', title: 'Hello', drupal_internal__nid: 1 });
    expect(article.uid).toEqual({ id: 'u1', type: 'user--user', name: 'admin' });
    expect(article.field_image).toEqual({ id: 'f1', type: 'file--file', uri: { url: '/files/cat.jpg' }, relationshipMeta: { alt: 'A cat', width: 640 } });
    const tags = article.field_tags as unknown[];
    expect(tags[0]).toMatchObject({ name: 'Cats' });
    expect(isStub(tags[1])).toBe(true);
    expect(tags[1]).toEqual({ id: 't2', type: 'taxonomy_term--tags', stub: true });
    expect(article.field_empty).toBeNull();
    expect('node_type' in article).toBe(false);
    expect(article.links).toBeDefined();
  });

  it('keeps id and type from being overwritten by attributes', () => {
    const resource = deserialize({ data: { type: 't', id: '1', attributes: { id: 'evil', type: 'evil' } } }) as Resource;
    expect(resource).toMatchObject({ id: '1', type: 't' });
  });

  it('shares resources and survives cycles', () => {
    const [product] = deserialize({
      data: [{
        type: 'commerce_product--default',
        id: 'p1',
        relationships: { variations: { data: [{ type: 'commerce_product_variation--default', id: 'v1' }] } },
      }],
      included: [{
        type: 'commerce_product_variation--default',
        id: 'v1',
        attributes: { sku: 'SKU1' },
        relationships: { product_id: { data: { type: 'commerce_product--default', id: 'p1' } } },
      }],
    }) as Resource[];

    const variation = (product!.variations as Resource[])[0]!;
    expect(variation.sku).toBe('SKU1');
    expect(variation.product_id).toBe(product);
  });
});

describe('serialize', () => {
  it('builds a create document, reducing resources to identifiers', () => {
    const author = { id: 'u1', type: 'user--user', name: 'admin', meta: { x: 1 } };
    expect(serialize('node--article', {
      attributes: { title: 'Hi' },
      relationships: {
        uid: author,
        field_tags: [{ type: 'taxonomy_term--tags', id: 't1' }],
        field_image: null,
      },
    })).toEqual({
      data: {
        type: 'node--article',
        attributes: { title: 'Hi' },
        relationships: {
          uid: { data: { type: 'user--user', id: 'u1', meta: { x: 1 } } },
          field_tags: { data: [{ type: 'taxonomy_term--tags', id: 't1' }] },
          field_image: { data: null },
        },
      },
    });
  });
});
