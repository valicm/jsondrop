// Loads the built packages the way a consumer does and runs one request of
// each through a fake fetch. CI runs it on the oldest supported Node (the
// dev tools themselves need a newer one).
import assert from 'node:assert/strict';
import { buildQueryString, clientCredentials, JsonApiClient, OAuthClient } from '@jsondrop/core';
import { buildMenuTree, fileUrl } from '@jsondrop/drupal';
import { CommerceApi, commerceApiResourcePath, createCartToken } from '@jsondrop/commerce';
import { fieldState, normalizeElements } from '@jsondrop/webform';

const calls = [];
const fetch = async (url, init = {}) => {
  calls.push({ url: String(url), headers: new Headers(init.headers) });
  if (String(url).endsWith('/oauth/token')) {
    return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
  }
  return new Response(JSON.stringify({
    data: { type: 'node--article', id: 'a1', attributes: { title: 'Hi' }, relationships: { uid: { data: { type: 'user--user', id: 'u1' } } } },
    included: [{ type: 'user--user', id: 'u1', attributes: { display_name: 'Ana' } }],
  }), { status: 200, headers: { 'Content-Type': 'application/vnd.api+json' } });
};

const drupal = new JsonApiClient({ baseUrl: 'https://cms.example.com', fetch, auth: clientCredentials({ clientId: 'id', clientSecret: 's' }) });
const article = await drupal.getResource('node--article', 'a1', { query: { include: ['uid'] } });
assert.equal(article.title, 'Hi');
assert.equal(article.uid.display_name, 'Ana');
assert.equal(calls.at(-1).headers.get('Authorization'), 'Bearer t');

assert.equal(buildQueryString({ filter: { status: 1 } }), '?filter%5Bstatus%5D=1');
assert.equal(fileUrl(drupal, { uri: { url: '/f.jpg' } }), 'https://cms.example.com/f.jpg');
assert.equal(buildMenuTree([{ id: 'a', parent: null, weight: 0, title: 'A' }]).length, 1);
assert.equal(commerceApiResourcePath('product-variation--default'), '/product-variations/default');
assert.match(createCartToken(), /^[0-9a-f-]{36}$/);
assert.ok((await new OAuthClient({ baseUrl: 'https://cms.example.com', clientId: 'web', redirectUri: 'https://app/cb' }).startLogin()).url.includes('code_challenge='));
assert.ok(new CommerceApi(drupal).withCartToken('t') instanceof CommerceApi);

const [phone] = normalizeElements({ phone: { '#type': 'tel', '#states': { visible: { ':input[name="method"]': { value: 'phone' } } } } });
assert.equal(fieldState(phone, { method: 'phone' }).visible, true);
assert.equal(fieldState(phone, { method: 'email' }).visible, false);

console.log(`Smoke test passed on Node ${process.version}`);
