const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer(async (req, res) => {
  // Serve index.html for root
  if (!req.url.startsWith('/api/')) {
    const filename = req.url === '/' ? '/index.html' : req.url;
    const htmlPath = path.join(__dirname, filename);

    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
    };

    fs.readFile(htmlPath, (err, data) => {
      if (err) {
        console.log(err, htmlPath);
        res.writeHead(404);
        res.end('index.html not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type':
          mimeTypes[path.extname(htmlPath)] || 'application/octet-stream',
      });
      res.end(data);
    });
    return;
  }

  // Proxy API requests
  const immichUrl = req.headers['x-immich-url'];
  if (!immichUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing x-immich-url header' }));
    return;
  }

  const targetUrl = new URL(req.url, immichUrl);
  const client = targetUrl.protocol === 'https:' ? https : http;

  console.log(
    `Proxying request to: ${targetUrl.toString()}, , ${
      req.headers['x-api-key']
    }`
  );

  // Collect request body for POST/PUT/PATCH requests
  let body = null;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  const proxyReq = await fetch(targetUrl, {
    method: req.method,
    headers: {
      'x-api-key': req.headers['x-api-key'] || '',
      'Content-Type': req.headers['content-type'] || 'application/json',
    },
    body: body,
  });

  console.log(`Received response: ${proxyReq.status}`);

  res.writeHead(proxyReq.status);
  res.end(await proxyReq.text());
});

server.listen(PORT, () => {
  console.log(`Immich Album Manager running at http://localhost:${PORT}`);
});
