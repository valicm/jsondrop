import type { JsonApiClient, ResourceBase, ResourceRequestOptions } from '@jsondrop/core';

/**
 * A menu link from the jsonapi_menu_items module. Unlike core's
 * `menu_link_content` resources, it covers every link in the menu (links
 * defined by modules too) and comes with a resolved `url`.
 */
export interface MenuItem extends ResourceBase {
  /** Plugin ID: `menu_link_content:{uuid}`, `standard.front_page`, … */
  id: string;
  title: string;
  description: string | null;
  url: string;
  menu_name: string;
  /** Parent plugin ID, or empty at the root. */
  parent: string;
  weight: number;
  enabled: boolean;
  expanded: boolean;
  provider: string;
  route?: { name: string; parameters: Record<string, string> };
  options?: Record<string, unknown>;
}

export type MenuTreeItem<T> = T & { children: MenuTreeItem<T>[] };

/** A menu's enabled links, flat (jsonapi_menu_items module). */
export async function getMenuItems(client: JsonApiClient, menu: string, options?: ResourceRequestOptions): Promise<MenuItem[]> {
  const response = await client.get<MenuItem[]>(`/menu_items/${encodeURIComponent(menu)}`, options);
  return response.data ?? [];
}

/** A menu as a tree, sorted by weight then title (jsonapi_menu_items module). */
export async function getMenu(client: JsonApiClient, menu: string, options?: ResourceRequestOptions): Promise<MenuTreeItem<MenuItem>[]> {
  return buildMenuTree(await getMenuItems(client, menu, options));
}

interface TreeInput {
  id: string;
  type?: string;
  parent: string | null;
  weight: number;
  title: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nests flat menu links by `parent`, sorted by weight then title. Takes
 * jsonapi_menu_items links or core `menu_link_content` resources (whose
 * `parent` names the plugin ID `menu_link_content:{uuid}`). A link whose
 * parent is not in the list becomes a root.
 */
export function buildMenuTree<T extends TreeInput>(items: T[]): MenuTreeItem<T>[] {
  const pluginId = (item: T) => (item.type === 'menu_link_content--menu_link_content' && UUID.test(item.id) ? `menu_link_content:${item.id}` : item.id);
  const nodes = new Map<string, MenuTreeItem<T>>();
  for (const item of items) {
    nodes.set(pluginId(item), { ...item, children: [] });
  }
  const roots: MenuTreeItem<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent ? nodes.get(node.parent) : undefined;
    (parent && parent !== node ? parent.children : roots).push(node);
  }
  const sort = (list: MenuTreeItem<T>[]) => {
    list.sort((a, b) => a.weight - b.weight || a.title.localeCompare(b.title));
    list.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}
