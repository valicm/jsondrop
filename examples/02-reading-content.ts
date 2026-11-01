/**
 * Example 2: reading content with the types from example 1.
 */
import { isStub, JsonApiClient, clientCredentials } from '@jsondrop/core';
import { getMenu, getResourceByPath, image, type MediaImage } from '@jsondrop/drupal';
import type { ContentParagraph, LandingPage } from './01-content-types.js';

export const drupal = new JsonApiClient({
  baseUrl: 'https://cms.example.com',
  defaultLocale: 'en',
  auth: clientCredentials({ clientId: 'web', clientSecret: 'secret', scope: 'content:read' }),
});

/** The latest articles, with their image and tags. */
export async function latestArticles(locale = 'en') {
  const articles = await drupal.getCollection('node--article', {
    locale,
    query: {
      include: ['field_image', 'field_tags'],
      fields: {
        'node--article': ['title', 'path', 'created', 'field_image', 'field_tags'],
        'taxonomy_term--tags': ['name', 'field_color'],
      },
      filter: { status: 1 },
      sort: ['-created'],
      page: { limit: 12 },
    },
  });

  return articles.map((article) => ({
    title: article.title,
    url: article.path?.alias ?? `/node/${article.drupal_internal__nid}`,
    image: image(drupal, article.field_image),
    // A relationship target that was not included is a stub.
    tags: article.field_tags.filter((tag) => !isStub(tag)).map((tag) => (isStub(tag) ? '' : tag.name)),
  }));
}

/** Articles tagged with any of the given terms, published or promoted. */
export async function articlesByTags(tagIds: string[]) {
  return drupal.getCollection('node--article', {
    query: {
      groups: { visible: { conjunction: 'OR' } },
      filter: {
        tags: { path: 'field_tags.id', operator: 'IN', value: tagIds },
        published: { path: 'status', value: 1, memberOf: 'visible' },
        promoted: { path: 'promote', value: 1, memberOf: 'visible' },
      },
    },
  });
}

/** Every article ID, page by page (e.g. for a sitemap). */
export async function allArticlePaths(): Promise<string[]> {
  const paths: string[] = [];
  for await (const article of drupal.iterate('node--article', { query: { fields: { 'node--article': ['path'] }, page: { limit: 50 } } })) {
    if (article.path?.alias) paths.push(article.path.alias);
  }
  return paths;
}

/** A landing page by its URL, with its paragraphs and their media. */
export async function landingPage(path: string) {
  const result = await getResourceByPath<LandingPage>(drupal, path, {
    query: { include: ['field_hero.field_media_image', 'field_content', 'field_content.field_media', 'field_content.field_media.field_media_image'] },
  });
  if (!result?.resource) {
    return null;
  }
  const page = result.resource;
  return {
    title: page.title,
    hero: isStub(page.field_hero) ? null : image(drupal, page.field_hero?.field_media_image),
    sections: page.field_content.filter((item): item is ContentParagraph => !isStub(item)).map(renderParagraph),
  };
}

// The union narrows on `type`, so each case sees its own fields.
function renderParagraph(paragraph: ContentParagraph) {
  switch (paragraph.type) {
    case 'paragraph--text':
      return { kind: 'text', html: paragraph.field_text.processed } as const;
    case 'paragraph--image': {
      const media = paragraph.field_media as MediaImage | null;
      return { kind: 'image', image: media ? image(drupal, media.field_media_image) : null, caption: paragraph.field_caption } as const;
    }
    case 'paragraph--video':
      return { kind: 'video', url: isStub(paragraph.field_media) ? null : paragraph.field_media?.field_media_oembed_video ?? null } as const;
    case 'paragraph--cta':
      return { kind: 'cta', title: paragraph.field_title, href: paragraph.field_link.uri } as const;
  }
}

export const mainMenu = () => getMenu(drupal, 'main');
