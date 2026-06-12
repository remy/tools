import { state } from './state.js';
import { filteredSubs, isSubActive, subEndsInMonth, parseEndDate, convertAmount, formatCurrency, escapeHtml } from './utils.js';

export function openBreakdown() {
  const list = document.getElementById('breakdown-list');
  const emptyEl = document.getElementById('breakdown-empty');
  const dialog = document.getElementById('breakdown-popover');
  // showModal() throws if the dialog is already open — this function doubles
  // as a re-render (e.g. after deleting an item), so only open when closed.
  const show = () => { if (!dialog.open) dialog.showModal(); };

  const visible = filteredSubs().filter(sub =>
    isSubActive(sub, state.currentYear, state.currentMonth)
  );
  if (visible.length === 0) {
    list.innerHTML = '';
    emptyEl.hidden = false;
    document.getElementById('breakdown-total').innerHTML = formatCurrency(0, state.settings.displayCurrency) + '<span>/mo</span>';
    show();
    return;
  }

  emptyEl.hidden = true;
  const items = visible.map(sub => {
    let thisMonthCost;
    if (sub.cycle === 'yearly') {
      thisMonthCost = sub.recurringMonth === state.currentMonth
        ? convertAmount(sub.amount, sub.currency, state.settings.displayCurrency, state.settings.exchangeRate)
        : 0;
    } else {
      thisMonthCost = convertAmount(sub.amount, sub.currency, state.settings.displayCurrency, state.settings.exchangeRate);
    }
    return { ...sub, monthlyConverted: thisMonthCost };
  }).sort((a, b) => b.monthlyConverted - a.monthlyConverted);

  let total = 0;
  let html = '';
  for (const item of items) {
    total += item.monthlyConverted;
    const favSrc = item.favicon || '';
    const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let originalLabel;
    if (item.cycle === 'yearly') {
      const monthLabel = item.recurringMonth !== undefined ? SHORT_MONTHS[item.recurringMonth] + ' ' : '';
      originalLabel = `${formatCurrency(item.amount, item.currency)}/yr · ${monthLabel}${item.recurringDay}`;
    } else {
      originalLabel = `${formatCurrency(item.amount, item.currency)}/mo · day ${item.recurringDay}`;
    }
    const cycleClass = item.cycle === 'yearly' ? 'cycle-yearly' : 'cycle-monthly';

    html += `<li class="breakdown-item">`;
    html += `<div class="breakdown-favicon">`;
    if (favSrc) {
      html += `<img src="${escapeHtml(favSrc)}" alt="" width="20" height="20" loading="lazy">`;
    }
    html += `</div>`;
    const cat = item.category || 'personal';
    const catClass = cat === 'business' ? 'cat-business' : 'cat-personal';
    const nameHtml = item.url
      ? `<a class="breakdown-name" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.name)}</a>`
      : `<div class="breakdown-name">${escapeHtml(item.name)}</div>`;
    html += `<div class="breakdown-info">
      ${nameHtml}
    </div>`;
    html += `<div class="breakdown-price">
      <div class="breakdown-converted">${formatCurrency(item.monthlyConverted, state.settings.displayCurrency)}</div>
      <div class="breakdown-original">${originalLabel}</div>
    </div>`;
    html += `<div class="breakdown-actions">
      <button data-edit-id="${item.id}" aria-label="Edit">&#9998;</button>
      <button data-delete-id="${item.id}" aria-label="Delete">&times;</button>
    </div>`;
    const renewsThisMonth = item.cycle === 'yearly' && item.recurringMonth === state.currentMonth;
    const endsThisMonth = subEndsInMonth(item, state.currentYear, state.currentMonth);
    const end = parseEndDate(item.endDate);
    const endLabel = endsThisMonth && end
      ? `ends ${SHORT_MONTHS[end.getMonth()]} ${end.getDate()}`
      : '';
    html += `<div class="breakdown-tags">
      <span class="breakdown-cycle ${cycleClass}">${item.cycle}</span>
      <span class="cat-badge ${catClass}">${cat}</span>
      ${renewsThisMonth ? '<span class="tag-renews">renews</span>' : ''}
      ${endLabel ? `<span class="tag-ends">${endLabel}</span>` : ''}
    </div>`;
    html += `</li>`;
  }

  list.innerHTML = html;
  document.getElementById('breakdown-total').innerHTML =
    formatCurrency(total, state.settings.displayCurrency) + '<span>/mo</span>';

  show();
}
