/**
 * Example 9: validating responses at runtime.
 *
 * TypeScript types are promises about what Drupal sends; a schema checks them.
 * Fields are specific to your site (JSON:API Extras can rename any of them), so
 * the schemas are yours. jsondrop takes any Standard Schema and bundles none:
 * Zod here, but Valibot and ArkType work the same way.
 *
 * The schema runs on `data` after deserialization, so it describes the flat
 * resource, not the JSON:API document.
 */
import { isJsonApiError, isJsonApiSchemaError, JsonApiClient } from '@jsondrop/core';
import { z } from 'zod';

const drupal = new JsonApiClient({ baseUrl: 'https://cms.example.com' });

const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  // Anything optional in Drupal is nullable.
  subtitle: z.string().nullable(),
});

type Product = z.infer<typeof productSchema>;

/** `data` is typed from the schema; there is no type argument to get wrong. */
export async function getProduct(id: string): Promise<Product | null> {
  try {
    const response = await drupal.get(`/products/${id}`, { schema: productSchema });
    return response.data;
  }
  catch (error) {
    // A resource that does not exist is an answer. A response we do not
    // understand is a bug, so keep it out of this branch: reporting it as "not
    // found" would tell search engines that the page is gone.
    if (isJsonApiError(error) && error.status === 404) {
      return null;
    }
    if (isJsonApiSchemaError(error)) {
      // `issues` has a path per problem; the error holds no response body, so
      // this is safe to log. Use `onResponse` to see the body itself.
      console.error(error.method, error.url, error.issues);
    }
    throw error;
  }
}

/**
 * One bad item fails the whole collection. For a listing that should survive
 * one, validate each item yourself and drop what fails.
 */
export async function listProducts(): Promise<Product[]> {
  const { data } = await drupal.get('/products', { schema: z.array(z.unknown()) });
  return data.flatMap((item) => {
    const parsed = productSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
