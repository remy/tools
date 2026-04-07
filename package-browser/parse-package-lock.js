'use strict';

export function collectRootDependencies(rootInfo) {
  const result = [];
  const seen = new Set();

  const addEntries = (entries, type) => {
    if (!entries || typeof entries !== 'object') {
      return;
    }
    for (const [name, ref] of Object.entries(entries)) {
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      result.push({ name, ref, type });
    }
  };

  addEntries(rootInfo.dependencies, 'prod');
  addEntries(rootInfo.devDependencies, 'dev');
  addEntries(rootInfo.optionalDependencies, 'optional');

  return result;
}

export function inferTopLevelPackageLockDependencies(packages) {
  const inferred = [];

  for (const [key, entry] of Object.entries(packages)) {
    if (!key.startsWith('node_modules/')) {
      continue;
    }
    if (key.slice('node_modules/'.length).includes('/node_modules/')) {
      continue;
    }

    const name = key.slice('node_modules/'.length);
    if (!name) {
      continue;
    }

    inferred.push({
      name,
      ref: entry?.version || '',
      type: 'prod'
    });
  }

  return inferred;
}

export function mergeDependencyMaps(entry, keys) {
  const merged = {};
  if (!entry || typeof entry !== 'object') {
    return merged;
  }

  for (const key of keys) {
    if (!entry[key] || typeof entry[key] !== 'object') {
      continue;
    }
    Object.assign(merged, entry[key]);
  }

  return merged;
}

function ascendPackagePath(path) {
  if (!path) {
    return null;
  }

  const marker = '/node_modules/';
  const index = path.lastIndexOf(marker);
  if (index === -1) {
    return '';
  }

  return path.slice(0, index);
}

function getPackageLockVersion(packageEntry, requestedRef) {
  if (packageEntry && typeof packageEntry.version === 'string') {
    return packageEntry.version;
  }
  if (packageEntry && packageEntry.link) {
    return 'link';
  }
  if (requestedRef) {
    return String(requestedRef);
  }
  return 'unknown';
}

export function resolvePackageLockDependency(packages, parentKey, depName) {
  let cursor = parentKey || '';

  while (true) {
    const candidate = cursor ? `${cursor}/node_modules/${depName}` : `node_modules/${depName}`;
    if (packages[candidate]) {
      return candidate;
    }

    const nextCursor = ascendPackagePath(cursor);
    if (nextCursor === null) {
      break;
    }
    cursor = nextCursor;
  }

  const topLevel = `node_modules/${depName}`;
  return packages[topLevel] ? topLevel : null;
}

export function buildPackageLockNode({ depName, requestedRef, parentKey, rootType, packages, path, ancestry }) {
  const resolvedKey = resolvePackageLockDependency(packages, parentKey, depName);
  const packageEntry = resolvedKey ? packages[resolvedKey] : null;
  const version = getPackageLockVersion(packageEntry, requestedRef);
  const nodeToken = resolvedKey || `${depName}@${version}`;

  const node = {
    id: `lock:${path}`,
    name: depName,
    version,
    rootType,
    children: [],
    unresolved: !packageEntry,
    circular: false
  };

  if (ancestry.has(nodeToken)) {
    node.circular = true;
    return node;
  }

  if (!packageEntry) {
    return node;
  }

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(nodeToken);

  const childDependencies = mergeDependencyMaps(packageEntry, ['dependencies', 'optionalDependencies']);
  for (const [childName, childRef] of Object.entries(childDependencies)) {
    node.children.push(buildPackageLockNode({
      depName: childName,
      requestedRef: childRef,
      parentKey: resolvedKey,
      rootType,
      packages,
      path: `${path}>${childName}`,
      ancestry: nextAncestry
    }));
  }

  return node;
}

export function parsePackageLockWithPackages(lock) {
  const packages = lock.packages || {};
  const rootInfo = packages[''] || {};
  const roots = [];

  let rootDependencies = collectRootDependencies(rootInfo);
  if (!rootDependencies.length) {
    rootDependencies = inferTopLevelPackageLockDependencies(packages);
  }
  for (const dependency of rootDependencies) {
    roots.push(buildPackageLockNode({
      depName: dependency.name,
      requestedRef: dependency.ref,
      parentKey: '',
      rootType: dependency.type,
      packages,
      path: dependency.name,
      ancestry: new Set()
    }));
  }

  if (!roots.length && lock.dependencies && typeof lock.dependencies === 'object') {
    return parseNestedDependencies(lock);
  }

  return {
    roots,
    formatLabel: 'package-lock.json'
  };
}

export function buildNestedNode(name, dependency, rootType, path, ancestry) {
  const version = String(dependency?.version || dependency?.resolved || 'unknown');
  const token = `${name}@${version}`;

  const node = {
    id: `nested:${path}`,
    name,
    version,
    rootType,
    children: [],
    unresolved: false,
    circular: false
  };

  if (ancestry.has(token)) {
    node.circular = true;
    return node;
  }

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(token);

  const childDependencies = dependency?.dependencies || {};
  for (const [childName, childDependency] of Object.entries(childDependencies)) {
    node.children.push(buildNestedNode(childName, childDependency, rootType, `${path}>${childName}`, nextAncestry));
  }

  return node;
}

export function parseNestedDependencies(data) {
  const roots = [];
  const dependencies = data.dependencies || {};

  for (const [name, dependency] of Object.entries(dependencies)) {
    const rootType = dependency?.dev ? 'dev' : dependency?.optional ? 'optional' : 'prod';
    roots.push(buildNestedNode(name, dependency, rootType, name, new Set()));
  }

  return {
    roots,
    formatLabel: 'npm dependency JSON'
  };
}
