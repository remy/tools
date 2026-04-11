// Deduplicate tiles and build a tilemap of indices that reproduces the
// original layout. A tile is considered equal to another when every pixel
// matches.

function tileKey(tile) {
  let s = '';
  for (let r = 0; r < 8; r++) {
    const row = tile[r];
    for (let c = 0; c < 8; c++) s += row[c];
  }
  return s;
}

export function dedupeTiles(tileData) {
  const seen = new Map();
  const uniqueTiles = [];
  const tileMap = new Array(tileData.length);
  for (let i = 0; i < tileData.length; i++) {
    const key = tileKey(tileData[i]);
    let idx = seen.get(key);
    if (idx === undefined) {
      idx = uniqueTiles.length;
      seen.set(key, idx);
      uniqueTiles.push(tileData[i]);
    }
    tileMap[i] = idx;
  }
  return { uniqueTiles, tileMap };
}
