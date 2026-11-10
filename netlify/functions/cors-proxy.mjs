// Generic CORS proxy (Netlify Function, v2 API).
//
// Browsers can't read responses from origins that don't send
// `Access-Control-Allow-Origin`, which blocks tools from fetching things like
// RSS feeds directly. This function fetches an arbitrary URL server-side and
// re-serves the response with permissive CORS headers, so any tool on this
// site can read it.
//
// It is deliberately NOT tied to any one tool — call it from anywhere with:
//   /cors-proxy?url=<url-encoded absolute http(s) URL>
//
// Security note: this is an open proxy, so it applies basic SSRF guards
// (only http/https, and no private / loopback / link-local hosts). Those
// guards match on the literal host and so do not defend against DNS
// rebinding — good enough for fetching public resources on a personal site,
// but don't treat it as a hardened gateway.

const ALLOWED_METHODS = ['GET', 'HEAD'];

function corsHeaders(extra) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-allow-headers': '*',
    ...extra,
  };
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders({ 'content-type': 'application/json; charset=utf-8' }),
  });
}

// Reject hosts that clearly point back at the deploy's own network.
function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  // Bracketed / bare IPv6.
  if (host.includes(':')) return isBlockedIPv6(host.replace(/^\[|\]$/g, ''));

  // IPv4 literal?
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return isBlockedIPv4(v4.slice(1).map(Number));

  return false;
}

function isBlockedIPv4([a, b]) {
  if ([a, b].some((n) => n > 255)) return true; // malformed — reject
  if (a === 0) return true;                       // 0.0.0.0/8
  if (a === 10) return true;                      // 10.0.0.0/8
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;        // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

function isBlockedIPv6(addr) {
  const ip = addr.toLowerCase();
  if (ip === '::1' || ip === '::') return true;   // loopback / unspecified
  if (/^fe[89ab]/.test(ip)) return true;          // fe80::/10 link-local
  if (/^f[cd]/.test(ip)) return true;             // fc00::/7 unique-local
  // IPv4-mapped, either dotted (::ffff:127.0.0.1) or hex-normalised by URL
  // parsing (::ffff:7f00:1) — validate the embedded v4 either way.
  const dotted = ip.match(/::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) return isBlockedIPv4(dotted.slice(1).map(Number));
  const hex = ip.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isBlockedIPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }
  return false;
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    return jsonError(`Method ${req.method} is not allowed. Use GET or HEAD.`, 405);
  }

  const target = new URL(req.url).searchParams.get('url');
  if (!target) {
    return jsonError('Missing "url" query parameter.', 400);
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return jsonError('The "url" parameter is not a valid URL.', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonError('Only http and https URLs can be proxied.', 400);
  }

  if (isBlockedHost(parsed.hostname)) {
    return jsonError('That host is not allowed.', 403);
  }

  let upstream;
  try {
    upstream = await fetch(parsed, {
      method: req.method,
      redirect: 'follow',
      headers: {
        // A real UA — some servers 403 requests without one.
        'user-agent': 'Mozilla/5.0 (compatible; tools-cors-proxy/1.0; +https://github.com/remy/tools)',
        accept: req.headers.get('accept') || '*/*',
      },
    });
  } catch (err) {
    return jsonError(`Could not fetch the target URL: ${err.message}`, 502);
  }

  // Re-serve the upstream response with CORS added. Only a small allow-list of
  // headers is forwarded so we never leak upstream cookies or CORS rules.
  const headers = corsHeaders();
  for (const name of ['content-type', 'content-disposition', 'cache-control', 'last-modified', 'etag']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  headers['x-proxied-url'] = parsed.href;
  headers['x-proxied-status'] = String(upstream.status);

  return new Response(upstream.body, { status: upstream.status, headers });
};

export const config = { path: '/cors-proxy' };
