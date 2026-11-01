import { describe, expect, it } from 'vitest';
import { buildQueryString } from '../src/index.js';

const decode = (query: string) => decodeURIComponent(query.replace(/\+/g, ' '));

describe('buildQueryString', () => {
  it('is empty for an empty query', () => {
    expect(buildQueryString()).toBe('');
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString('')).toBe('');
  });

  it('passes a prebuilt string through', () => {
    expect(buildQueryString('include=uid')).toBe('?include=uid');
    expect(buildQueryString('?include=uid')).toBe('?include=uid');
  });

  it('builds include, fields, sort and page', () => {
    expect(decode(buildQueryString({
      include: ['uid', 'field_image'],
      fields: { 'node--article': ['title', 'uid'], 'user--user': ['name'] },
      sort: ['-created', 'title'],
      page: { limit: 10, offset: 20 },
    }))).toBe(
      '?include=uid,field_image&fields[node--article]=title,uid&fields[user--user]=name&sort=-created,title&page[limit]=10&page[offset]=20',
    );
  });

  it('builds shorthand and condition filters', () => {
    expect(decode(buildQueryString({
      filter: {
        status: 1,
        recent: { path: 'created', operator: '>', value: 1700000000 },
        tags: { path: 'field_tags.name', operator: 'IN', value: ['a', 'b'] },
        empty: { path: 'field_summary', operator: 'IS NULL' },
      },
    }))).toBe(
      '?filter[status]=1'
      + '&filter[recent][condition][path]=created&filter[recent][condition][operator]=>&filter[recent][condition][value]=1700000000'
      + '&filter[tags][condition][path]=field_tags.name&filter[tags][condition][operator]=IN&filter[tags][condition][value][]=a&filter[tags][condition][value][]=b'
      + '&filter[empty][condition][path]=field_summary&filter[empty][condition][operator]=IS NULL',
    );
  });

  it('builds groups and memberships', () => {
    expect(decode(buildQueryString({
      groups: { either: { conjunction: 'OR' } },
      filter: {
        mine: { path: 'uid.id', value: 'abc', memberOf: 'either' },
        promoted: { path: 'promote', value: true, memberOf: 'either' },
      },
    }))).toBe(
      '?filter[either][group][conjunction]=OR'
      + '&filter[mine][condition][path]=uid.id&filter[mine][condition][value]=abc&filter[mine][condition][memberOf]=either'
      + '&filter[promoted][condition][path]=promote&filter[promoted][condition][value]=true&filter[promoted][condition][memberOf]=either',
    );
  });

  it('appends custom params', () => {
    expect(decode(buildQueryString({ params: { _format: 'json', 'x[]': ['1', '2'] } }))).toBe('?_format=json&x[]=1&x[]=2');
  });
});
