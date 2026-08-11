// "Move checked to the bottom" — a per-list display order.
//
// This is a view transform, not a stored order: the item docs keep their own
// `order` field untouched, so turning the option off restores the list exactly
// as it was arranged by hand.
//
// Headings divide a list into sections, and an item that sinks past its heading
// would end up filed under the wrong one — so checked items sink to the bottom
// of their own section rather than the bottom of the whole list. A list with no
// headings is simply one section, which is the plain "checked at the bottom"
// behaviour.
export function sinkCheckedItems(items) {
  const out = [];
  let section = [];

  // filter() is stable, so unchecked and checked items each keep the relative
  // order the user dragged them into.
  const flush = () => {
    out.push(...section.filter((i) => !i.checked), ...section.filter((i) => i.checked));
    section = [];
  };

  for (const item of items) {
    if (item.kind === 'heading') {
      flush();
      out.push(item);
    } else {
      section.push(item);
    }
  }
  flush();
  return out;
}
