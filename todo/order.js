// Landing-page ordering for the lists themselves.
//
// Deliberately NOT stored in the synced database: the list `order` field in
// PouchDB replicates to every device sharing a CouchDB, so one person dragging
// a list would rearrange everyone else's landing page. This ordering lives in
// localStorage instead, making it bespoke per browser/user while the lists
// themselves stay shared.

const ORDER_KEY = 'todo-lists.listOrder';

export function getListOrder() {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function hasListOrder() {
  return getListOrder().length > 0;
}

// `ids` is the full set of list ids in their new sequence — passing the whole
// set (rather than patching) means ids for deleted lists prune themselves.
export function setListOrder(ids) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify([...ids]));
  } catch (err) {
    console.error('Could not save the list order', err);
  }
}

export function clearListOrder() {
  localStorage.removeItem(ORDER_KEY);
}

// Re-sort lists (already in their synced order) by the local preference.
// Lists the local order has never seen — created on another device since the
// last drag — keep their relative order and fall to the end, which is where a
// newly created list belongs anyway.
export function applyListOrder(lists) {
  const order = getListOrder();
  if (!order.length) return lists;
  const rank = new Map(order.map((id, i) => [id, i]));
  return lists
    .map((list, i) => ({ list, i, rank: rank.has(list.id) ? rank.get(list.id) : Infinity }))
    .sort((a, b) => (a.rank === b.rank ? a.i - b.i : a.rank - b.rank))
    .map((entry) => entry.list);
}
