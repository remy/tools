// =============================================
// Cook Planner — events.js
// =============================================

import { COOK_TYPE_MAP } from './constants.js';
import { formatDuration } from './utils.js';

export function buildEvents(items, serveTime) {
  const events = [];

  for (const item of items) {
    const { cookStart, prepStart, cookEnd, setEnd } = item._s;
    const ct = COOK_TYPE_MAP[item.cookType];

    if (item.prepTime > 0) {
      events.push({
        time: prepStart,
        endTime: cookStart,
        type: 'prep',
        label: `Prep ${item.name}`,
        sub: formatDuration(item.prepTime),
        itemId: item.id,
        itemName: item.name,
      });
    }

    // Prep-only items have no cook stage -- emit a prep event at cookStart
    // so the schedule shows when to actually start preparing them, not just
    // when they should be ready.
    if (item.cookType === 'none' && item.cookTime > 0) {
      events.push({
        time: cookStart,
        endTime: cookEnd,
        type: 'prep',
        label: `Prep ${item.name}`,
        sub: formatDuration(item.cookTime),
        itemId: item.id,
        itemName: item.name,
      });
    }

    if (item.cookType !== 'none' && item.cookTime > 0) {
      const appLabel = applianceLabel(item._appliance, ct);
      // applianceKey groups items that share the same destination (for merged labels)
      const appKey = item._appliance || 'none';
      // Shelf label: only main oven has 2 addressable shelves worth calling out
      const shelfLabel = (item._appliance === 'main' && item._shelf)
        ? ` \u00b7 Shelf ${item._shelf}` : '';
      events.push({
        time: cookStart,
        endTime: cookEnd,
        type: 'cook_start',
        label: cookStartLabel(item, ct, appLabel),
        sub: `${formatDuration(item.cookTime)} \u00b7 ${appLabel}${shelfLabel}`,
        itemId: item.id,
        itemName: item.name,
        canOverride: true,
        applianceKey: appKey,
        applianceLabel: appLabel,
        shelfInfo: item._shelf ?? null,
        ct,
      });
      events.push({
        time: cookEnd,
        endTime: cookEnd,
        type: 'cook_end',
        label: cookEndLabel(item, ct),
        sub: null,
        itemId: item.id,
        itemName: item.name,
        applianceKey: appKey,
        applianceLabel: appLabel,
        ct,
      });
    }

    if (item.setTime > 0) {
      events.push({
        time: cookEnd,
        endTime: setEnd,
        type: 'set',
        label: `${item.name} \u2014 rest / set`,
        sub: formatDuration(item.setTime),
        itemId: item.id,
        itemName: item.name,
        applianceKey: 'set',
      });
    }

    events.push({
      time: setEnd,
      endTime: setEnd,
      type: 'ready',
      label: `${item.name} ready`,
      sub: null,
      itemId: item.id,
      itemName: item.name,
      applianceKey: 'ready',
    });
  }

  // Cooked items that are already done before serve get a "ready and waiting"
  // note. Prep-only items aren't included \u2014 they're not "out of the oven".
  const restingNotes = items
    .filter(it => it.cookType !== 'none' && it.cookTime > 0 && it._s.setEnd < serveTime)
    .map(it => `${it.name} been out ${formatDuration(serveTime - it._s.setEnd)}`)
    .join(' \u00b7 ');

  events.push({
    time: serveTime,
    endTime: serveTime,
    type: 'serve',
    label: '\ud83c\udf7d SERVE',
    sub: restingNotes || null,
    itemId: null,
  });

  // Sort; serve goes last if same time
  events.sort((a, b) => a.time - b.time || (a.type === 'serve' ? 1 : b.type === 'serve' ? -1 : 0));

  // Deduplicate adjacent ready + serve at same time
  return events;
}

export function joinNames(names) {
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

export function mergedLabel(type, evs, names) {
  if (names.length === 0) return evs[0]?.label || '';
  const appLabel = evs[0]?.applianceLabel;
  const ct = evs[0]?.ct;
  switch (type) {
    case 'prep':       return `Prep ${joinNames(names)}`;
    case 'cook_start': {
      const resource = ct?.resource;
      if (resource === 'oven' || resource === 'combi') return `${joinNames(names)} \u2192 ${appLabel}`;
      if (resource === 'hob') return `${joinNames(names)} on ${appLabel}`;
      return `Start ${joinNames(names)}`;
    }
    case 'cook_end': {
      const resource = ct?.resource;
      if (resource === 'oven' || resource === 'combi') return `${joinNames(names)} out of oven`;
      if (resource === 'hob') return `${joinNames(names)} off hob`;
      return `${joinNames(names)} done`;
    }
    case 'set':   return `${joinNames(names)} \u2014 rest / set`;
    case 'ready': return `${joinNames(names)} ready`;
    default:      return evs[0]?.label || '';
  }
}

export function mergedSub(type, evs) {
  if (evs.length === 1) return evs[0].sub;
  if (type === 'cook_start') {
    // Extract duration and shelf separately for cleaner merged formatting
    const appLabel  = evs[0].applianceLabel || '';
    const durParts  = evs.map(e => e.sub?.split(' \u00b7 ')[0] ?? '');   // "45 min"
    const shelfParts = evs.map(e => e.shelfInfo != null ? `Shelf ${e.shelfInfo}` : null);
    const uniqueDurs   = [...new Set(durParts)];
    const uniqueShelves = [...new Set(shelfParts.filter(Boolean))];

    // All items have the same duration and same shelf -> single compact sub
    if (uniqueDurs.length === 1 && (uniqueShelves.length <= 1)) {
      return [durParts[0], appLabel, uniqueShelves[0]].filter(Boolean).join(' \u00b7 ');
    }
    // Same duration, different shelves
    if (uniqueDurs.length === 1 && uniqueShelves.length > 1) {
      const shelfList = evs.map(e => e.shelfInfo != null ? `${e.itemName}: Shelf ${e.shelfInfo}` : e.itemName).join(', ');
      return [durParts[0], appLabel, shelfList].filter(Boolean).join(' \u00b7 ');
    }
    // Different durations -- show per-item (include shelf inline)
    return evs.map(e => {
      const dur   = e.sub?.split(' \u00b7 ')[0] ?? '';
      const shelf = e.shelfInfo != null ? ` Shelf ${e.shelfInfo}` : '';
      return `${e.itemName}: ${dur}${shelf}`;
    }).join(' \u00b7 ') + (appLabel ? ` \u00b7 ${appLabel}` : '');
  }
  // For set/ready: show duration if uniform
  const subs = evs.map(e => e.sub).filter(Boolean);
  const unique = [...new Set(subs)];
  return unique.length === 1 ? unique[0] : '';
}

export function applianceLabel(app, ct) {
  if (!app || app === 'none') return ct?.label || '';
  if (app === 'main') return 'Main Oven';
  if (app === 'combi') return 'Combi Oven';
  if (app === 'combi-mw') return 'Microwave';
  if (app.startsWith('hob')) return `Hob ${app.replace('hob', '')}`;
  return app;
}

export function cookStartLabel(item, ct, appLabel) {
  if (ct?.resource === 'oven' || ct?.resource === 'combi') return `${item.name} \u2192 ${appLabel}`;
  if (ct?.resource === 'hob') return `${item.name} on ${appLabel}`;
  return `Start ${item.name}`;
}

export function cookEndLabel(item, ct) {
  if (ct?.resource === 'oven' || ct?.resource === 'combi') return `${item.name} out of oven`;
  if (ct?.resource === 'hob') return `${item.name} off hob`;
  return `${item.name} done`;
}
