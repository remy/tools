'use strict';

export function indexNodes(roots) {
  const index = new Map();
  const stack = [...roots];

  while (stack.length) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    index.set(node.id, node);
    for (const child of node.children) {
      stack.push(child);
    }
  }

  return index;
}

export function countNodes(nodes) {
  let count = 0;
  const stack = [...nodes];

  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    count += 1;
    for (const child of current.children) {
      stack.push(child);
    }
  }

  return count;
}

export function matchesFilter(node, activeFilter) {
  if (activeFilter === 'all') {
    return true;
  }
  return node.rootType === activeFilter;
}

export function matchesSearch(node, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  if (node.name.toLowerCase().includes(searchTerm) || node.version.toLowerCase().includes(searchTerm)) {
    return true;
  }

  return node.children.some((child) => matchesSearch(child, searchTerm));
}

export function countVisibleNodes(nodes, state) {
  let count = 0;
  const stack = [...nodes];

  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    count += 1;
    for (const child of current.children) {
      if (matchesSearch(child, state.searchTerm)) {
        stack.push(child);
      }
    }
  }

  return count;
}

export function getVisibleRoots(roots, state) {
  return roots.filter((root) => matchesFilter(root, state.activeFilter) && matchesSearch(root, state.searchTerm));
}

export function getDirectChildrenElement(nodeElement) {
  const childElement = Array.from(nodeElement.children).find((element) => element.classList.contains('children'));
  return childElement || null;
}

export function renderNode(node, depth, state) {
  const wrapper = document.createElement('div');
  wrapper.className = 'node';
  wrapper.dataset.nodeId = node.id;
  wrapper.dataset.depth = String(depth);
  wrapper.style.setProperty('--depth', String(depth));

  const row = document.createElement('div');
  row.className = 'node-row';

  const hasVisibleChildren = node.children.some((child) => matchesSearch(child, state.searchTerm));
  const isExpanded = state.searchTerm ? true : state.expandedNodes.has(node.id);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `toggle-btn${hasVisibleChildren ? '' : ' is-leaf'}`;
  toggle.dataset.nodeId = node.id;
  toggle.textContent = hasVisibleChildren ? (isExpanded ? '−' : '+') : '·';
  toggle.setAttribute('aria-expanded', String(hasVisibleChildren && isExpanded));
  row.append(toggle);

  const name = document.createElement('span');
  name.className = 'pkg-name';
  name.textContent = node.name;
  row.append(name);

  const version = document.createElement('span');
  version.className = 'pkg-version';
  version.textContent = `v${node.version}`;
  row.append(version);

  if (depth === 0) {
    const badge = document.createElement('span');
    badge.className = `badge ${node.rootType}`;
    badge.textContent = node.rootType === 'prod'
      ? 'production'
      : node.rootType === 'dev'
        ? 'development'
        : 'optional';
    row.append(badge);
  }

  if (node.unresolved || node.circular) {
    const warn = document.createElement('span');
    warn.className = 'badge warn';
    warn.textContent = node.circular ? 'circular' : 'unresolved';
    row.append(warn);
  }

  wrapper.append(row);

  if (hasVisibleChildren && isExpanded) {
    const children = renderChildren(node, depth, state);
    if (children) {
      wrapper.append(children);
    }
  }

  return wrapper;
}

export function renderChildren(node, depth, state) {
  const children = document.createElement('div');
  children.className = 'children';
  children.dataset.ownerId = node.id;

  let hasRenderedChild = false;
  for (const child of node.children) {
    if (!matchesSearch(child, state.searchTerm)) {
      continue;
    }
    children.append(renderNode(child, depth + 1, state));
    hasRenderedChild = true;
  }

  return hasRenderedChild ? children : null;
}
