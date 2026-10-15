/**
 * Notification state lives in TanStack Query only (the server is the source of truth). Live
 * events, HTTP responses and refetches all go through these helpers, which work by id, so the
 * same notification arriving twice (socket + response, a retried event, another tab) is shown
 * once.
 */

export const notificationsKey = ['notifications'];
export const notificationListKey = (filter) => ['notifications', 'list', filter];
export const unreadCountKey = ['notifications', 'unread-count'];
export const notificationPreferencesKey = ['notifications', 'preferences'];

/** Applies `change(items, filter)` to every loaded notification list. */
function updateLists(queryClient, change) {
  for (const [key, data] of queryClient.getQueriesData({
    queryKey: ['notifications', 'list'],
  })) {
    if (!data?.pages) continue;
    const filter = key[2];
    const pages = change(data.pages, filter);
    if (pages !== data.pages) queryClient.setQueryData(key, { ...data, pages });
  }
}

const withoutIds = (pages, ids) => {
  let changed = false;
  const next = pages.map((page) => {
    const items = page.items.filter((item) => !ids.has(item.id));
    if (items.length === page.items.length) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? next : pages;
};

export function setUnreadCount(queryClient, unreadCount) {
  if (typeof unreadCount === 'number') queryClient.setQueryData(unreadCountKey, unreadCount);
}

/** A new or refreshed notification: it moves to the top (replacing any copy of it). */
export function upsertNotification(queryClient, notification, unreadCount) {
  updateLists(queryClient, (pages, filter) => {
    const rest = withoutIds(pages, new Set([notification.id]));
    if (filter === 'unread' && notification.read) return rest;
    const [first, ...others] = rest;
    return [{ ...first, items: [notification, ...first.items] }, ...others];
  });
  setUnreadCount(queryClient, unreadCount);
}

/**
 * Notifications marked read: `ids`, or (ids null) everything that happened at or before
 * `before`. They stay where they are, shown as read.
 */
export function markNotificationsRead(queryClient, { ids, before, unreadCount }) {
  const covered = ids
    ? (item) => ids.includes(item.id)
    : (item) => before !== undefined && item.createdAt <= before;
  updateLists(queryClient, (pages) => {
    let changed = false;
    const next = pages.map((page) => {
      if (!page.items.some((item) => !item.read && covered(item))) return page;
      changed = true;
      return {
        ...page,
        items: page.items.map((item) => (covered(item) ? { ...item, read: true } : item)),
      };
    });
    return changed ? next : pages;
  });
  setUnreadCount(queryClient, unreadCount);
}

export function removeNotifications(queryClient, { ids, unreadCount }) {
  const set = new Set(ids);
  updateLists(queryClient, (pages) => withoutIds(pages, set));
  setUnreadCount(queryClient, unreadCount);
}

/** Every loaded page, without duplicates (a moved entry may be on two pages briefly). */
export function flattenPages(data) {
  const seen = new Set();
  const items = [];
  for (const page of data?.pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}
