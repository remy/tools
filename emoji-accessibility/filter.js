export function debounce(fn, delay = 200) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function applyFilters(rows, state) {
  const term = state.search.trim().toLowerCase();
  const cat = state.category;
  const onlyDiff = state.onlyDiff;

  let visible = 0;
  for (const row of rows) {
    const matchSearch = !term || row.dataset.search.includes(term);
    const matchCat = !cat || row.dataset.grp === cat;
    const matchDiff = !onlyDiff || row.dataset.hasDiff === '1';
    const show = matchSearch && matchCat && matchDiff;
    row.hidden = !show;
    if (show) visible++;
  }
  return visible;
}
