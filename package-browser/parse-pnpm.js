'use strict';

import { mergeDependencyMaps } from './parse-package-lock.js';

export function stripQuotes(value) {
  if (!value) {
    return value;
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseYamlPair(line) {
  const colon = line.indexOf(':');
  if (colon === -1) {
    return null;
  }

  const key = stripQuotes(line.slice(0, colon).trim());
  const value = stripQuotes(line.slice(colon + 1).trim());

  return { key, value };
}

export function stripPnpmPeerSuffix(value) {
  if (!value) {
    return value;
  }

  const parenIndex = value.indexOf('(');
  if (parenIndex !== -1) {
    return value.slice(0, parenIndex);
  }

  return value;
}

export function parsePnpmNameAndVersion(spec) {
  const at = spec.lastIndexOf('@');
  if (at > 0) {
    const name = spec.slice(0, at);
    const version = spec.slice(at + 1);
    if (name && version) {
      return { name, version };
    }
  }

  const slash = spec.lastIndexOf('/');
  if (slash > 0) {
    const name = spec.slice(0, slash);
    const version = spec.slice(slash + 1);
    if (name && version) {
      return { name, version };
    }
  }

  return null;
}

export function getVersionFromSpec(spec) {
  if (!spec) {
    return '';
  }

  const parsed = parsePnpmNameAndVersion(spec);
  return parsed?.version || '';
}

export function getPnpmVersionFromKey(key) {
  if (!key) {
    return '';
  }

  const normalized = stripPnpmPeerSuffix(String(key).replace(/^\//, ''));
  const parsed = parsePnpmNameAndVersion(normalized);
  return parsed?.version || '';
}

export function looksLikePnpmSpec(value) {
  if (!value) {
    return false;
  }

  const at = value.lastIndexOf('@');
  return at > 0 || value.includes('/');
}

export function findPnpmByName(depName, indexes) {
  const candidates = indexes.nameIndex.get(depName) || [];
  return candidates[0] || null;
}

export function importerHasDependencies(importer) {
  if (!importer || typeof importer !== 'object') {
    return false;
  }

  const dependencyKeys = ['dependencies', 'devDependencies', 'optionalDependencies'];
  return dependencyKeys.some((key) => importer[key] && Object.keys(importer[key]).length > 0);
}

export function parsePnpmYaml(yamlText) {
  const lines = yamlText.replace(/\t/g, '  ').split(/\r?\n/);
  const result = {
    importers: {},
    packages: {}
  };

  let section = '';

  let importerName = '';
  let importerDepType = '';
  let importerDepName = '';

  let packageKey = '';
  let packageDepType = '';

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();

    if (indent === 0 && line.endsWith(':')) {
      section = stripQuotes(line.slice(0, -1));
      importerName = '';
      importerDepType = '';
      importerDepName = '';
      packageKey = '';
      packageDepType = '';
      continue;
    }

    if (section === 'importers') {
      if (indent === 2 && line.endsWith(':')) {
        importerName = stripQuotes(line.slice(0, -1));
        result.importers[importerName] = {
          dependencies: {},
          devDependencies: {},
          optionalDependencies: {}
        };
        importerDepType = '';
        importerDepName = '';
        continue;
      }

      if (!importerName) {
        continue;
      }

      if (indent === 4 && line.endsWith(':')) {
        const key = stripQuotes(line.slice(0, -1));
        importerDepType = ['dependencies', 'devDependencies', 'optionalDependencies'].includes(key) ? key : '';
        importerDepName = '';
        continue;
      }

      if (!importerDepType) {
        continue;
      }

      if (indent === 6) {
        const pair = parseYamlPair(line);
        if (!pair) {
          continue;
        }

        if (!pair.value) {
          importerDepName = pair.key;
          result.importers[importerName][importerDepType][importerDepName] = '';
        } else {
          importerDepName = '';
          result.importers[importerName][importerDepType][pair.key] = pair.value;
        }
        continue;
      }

      if (indent === 8 && importerDepName) {
        const pair = parseYamlPair(line);
        if (pair && pair.key === 'version') {
          result.importers[importerName][importerDepType][importerDepName] = pair.value;
        }
        continue;
      }

      continue;
    }

    if (section === 'packages') {
      if (indent === 2 && line.endsWith(':')) {
        packageKey = stripQuotes(line.slice(0, -1));
        result.packages[packageKey] = {
          dependencies: {},
          optionalDependencies: {}
        };
        packageDepType = '';
        continue;
      }

      if (!packageKey) {
        continue;
      }

      if (indent === 4 && line.endsWith(':')) {
        const key = stripQuotes(line.slice(0, -1));
        packageDepType = ['dependencies', 'optionalDependencies'].includes(key) ? key : '';
        continue;
      }

      if (indent === 4 && !line.endsWith(':')) {
        const pair = parseYamlPair(line);
        if (pair && pair.key === 'version') {
          result.packages[packageKey].version = pair.value;
        }
        continue;
      }

      if (indent === 6 && packageDepType) {
        const pair = parseYamlPair(line);
        if (pair) {
          result.packages[packageKey][packageDepType][pair.key] = pair.value;
        }
        continue;
      }
    }
  }

  return result;
}

export function buildPnpmIndexes(packages) {
  const specIndex = new Map();
  const nameIndex = new Map();

  for (const key of Object.keys(packages)) {
    const spec = stripPnpmPeerSuffix(key).replace(/^\//, '');
    const parsed = parsePnpmNameAndVersion(spec);
    if (!parsed) {
      continue;
    }

    if (!specIndex.has(spec)) {
      specIndex.set(spec, []);
    }
    specIndex.get(spec).push(key);

    if (!nameIndex.has(parsed.name)) {
      nameIndex.set(parsed.name, []);
    }
    nameIndex.get(parsed.name).push(key);
  }

  return { specIndex, nameIndex };
}

export function resolvePnpmDependency(depName, ref, _packages, indexes) {
  const raw = String(ref || '').trim();
  if (!raw) {
    const fallbackKey = findPnpmByName(depName, indexes);
    return {
      key: fallbackKey,
      version: getPnpmVersionFromKey(fallbackKey) || 'unknown',
      special: false
    };
  }

  if (raw.startsWith('workspace:') || raw.startsWith('link:') || raw.startsWith('file:')) {
    return {
      key: null,
      version: raw,
      special: true
    };
  }

  let normalized = raw;
  if (normalized.startsWith('npm:')) {
    normalized = normalized.slice(4);
  }
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }
  normalized = stripPnpmPeerSuffix(normalized);

  const candidateSpecs = [];
  if (looksLikePnpmSpec(normalized)) {
    candidateSpecs.push(normalized);
  } else if (normalized) {
    candidateSpecs.push(`${depName}@${normalized}`);
  }

  for (const spec of candidateSpecs) {
    const candidates = indexes.specIndex.get(spec) || [];
    if (!candidates.length) {
      continue;
    }

    const exactName = candidates.find((candidate) => {
      const parsed = parsePnpmNameAndVersion(stripPnpmPeerSuffix(candidate).replace(/^\//, ''));
      return parsed && parsed.name === depName;
    });

    const key = exactName || candidates[0];
    return {
      key,
      version: getPnpmVersionFromKey(key) || getVersionFromSpec(spec),
      special: false
    };
  }

  const fallbackKey = findPnpmByName(depName, indexes);
  return {
    key: fallbackKey,
    version: getPnpmVersionFromKey(fallbackKey) || getVersionFromSpec(candidateSpecs[0]) || normalized || raw,
    special: false
  };
}

export function buildPnpmNode({ depName, ref, rootType, packages, indexes, path, ancestry }) {
  const resolution = resolvePnpmDependency(depName, ref, packages, indexes);
  const packageEntry = resolution.key ? packages[resolution.key] : null;
  const version = packageEntry?.version || getPnpmVersionFromKey(resolution.key) || resolution.version || 'unknown';
  const token = resolution.key || `${depName}@${version}`;

  const node = {
    id: `pnpm:${path}`,
    name: depName,
    version,
    rootType,
    children: [],
    unresolved: !packageEntry && !resolution.special,
    circular: false
  };

  if (ancestry.has(token)) {
    node.circular = true;
    return node;
  }

  if (!packageEntry) {
    return node;
  }

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(token);

  const childDependencies = mergeDependencyMaps(packageEntry, ['dependencies', 'optionalDependencies']);
  for (const [childName, childRef] of Object.entries(childDependencies)) {
    node.children.push(buildPnpmNode({
      depName: childName,
      ref: childRef,
      rootType,
      packages,
      indexes,
      path: `${path}>${childName}`,
      ancestry: nextAncestry
    }));
  }

  return node;
}

export function parsePnpmLock(yamlText) {
  const parsed = parsePnpmYaml(yamlText);
  const importerNames = Object.keys(parsed.importers);
  if (!importerNames.length) {
    throw new Error('No pnpm importers found.');
  }

  const importerNamesWithDependencies = importerNames.filter((name) => importerHasDependencies(parsed.importers[name]));
  let selectedImporters = [];
  if (parsed.importers['.'] && importerHasDependencies(parsed.importers['.'])) {
    selectedImporters = ['.'];
  } else if (importerNamesWithDependencies.length) {
    selectedImporters = importerNamesWithDependencies;
  } else {
    selectedImporters = [importerNames[0]];
  }

  const indexes = buildPnpmIndexes(parsed.packages);
  const roots = [];
  const seen = new Set();

  const addImporterType = (typeKey, typeLabel) => {
    for (const importerName of selectedImporters) {
      const importer = parsed.importers[importerName];
      const entries = importer?.[typeKey];
      if (!entries || typeof entries !== 'object') {
        continue;
      }
      for (const [name, ref] of Object.entries(entries)) {
        if (seen.has(name)) {
          continue;
        }
        seen.add(name);
        roots.push(buildPnpmNode({
          depName: name,
          ref,
          rootType: typeLabel,
          packages: parsed.packages,
          indexes,
          path: name,
          ancestry: new Set()
        }));
      }
    }
  };

  addImporterType('dependencies', 'prod');
  addImporterType('devDependencies', 'dev');
  addImporterType('optionalDependencies', 'optional');

  const formatSuffix = selectedImporters.length === 1
    ? selectedImporters[0]
    : `${selectedImporters.length} importers merged`;

  return {
    roots,
    formatLabel: `pnpm-lock.yaml (${formatSuffix})`
  };
}
