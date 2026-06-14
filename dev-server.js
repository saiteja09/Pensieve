const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const rootDir = __dirname;
const port = Number(process.env.PORT || process.argv[2] || 8765);

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.wgt': 'application/octet-stream',
    '.xml': 'application/xml; charset=utf-8'
};

function send(response, statusCode, headers, body) {
    response.writeHead(statusCode, headers);
    response.end(body);
}

function sendText(response, statusCode, message) {
    send(response, statusCode, { 'Content-Type': 'text/plain; charset=utf-8' }, message);
}

function serveStatic(request, response) {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    let pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === '/') {
        pathname = '/index.html';
    }

    if (pathname === '/favicon.ico') {
        pathname = '/icon.png';
    }

    const filePath = path.normalize(path.join(rootDir, pathname));
    if (!filePath.startsWith(rootDir)) {
        sendText(response, 403, 'Forbidden');
        return;
    }

    fs.readFile(filePath, (error, body) => {
        if (error) {
            sendText(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
            return;
        }

        const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        send(response, 200, { 'Content-Type': contentType }, body);
    });
}

function proxyImmich(request, response) {
    const prefix = '/__immich-proxy/';
    const proxyPath = request.url.slice(prefix.length);
    const slashIndex = proxyPath.indexOf('/');

    if (slashIndex < 0) {
        sendText(response, 400, 'Missing Immich proxy path');
        return;
    }

    let targetOrigin;
    try {
        targetOrigin = new URL(decodeURIComponent(proxyPath.slice(0, slashIndex)));
    } catch (error) {
        sendText(response, 400, 'Invalid Immich server URL');
        return;
    }

    if (targetOrigin.protocol !== 'http:' && targetOrigin.protocol !== 'https:') {
        sendText(response, 400, 'Immich server URL must start with http:// or https://');
        return;
    }

    const upstreamPath = proxyPath.slice(slashIndex);
    const upstreamUrl = new URL(upstreamPath, targetOrigin);
    const upstreamClient = upstreamUrl.protocol === 'https:' ? https : http;
    const headers = Object.assign({}, request.headers, {
        host: upstreamUrl.host,
        origin: targetOrigin.origin,
        referer: targetOrigin.origin + '/',
        'accept-encoding': 'identity'
    });

    delete headers.connection;

    const upstreamRequest = upstreamClient.request(upstreamUrl, {
        method: request.method,
        headers
    }, (upstreamResponse) => {
        const responseHeaders = Object.assign({}, upstreamResponse.headers);
        delete responseHeaders['content-encoding'];
        delete responseHeaders['content-length'];
        response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
        upstreamResponse.pipe(response);
    });

    upstreamRequest.on('error', (error) => {
        sendText(response, 502, `Unable to reach Immich server: ${error.message}`);
    });

    request.pipe(upstreamRequest);
}

const server = http.createServer((request, response) => {
    if (request.url.indexOf('/__immich-proxy/') === 0) {
        proxyImmich(request, response);
        return;
    }

    serveStatic(request, response);
});

server.listen(port, '127.0.0.1', () => {
    console.log(`Pensieve dev server running at http://localhost:${port}`);
    console.log('Enter your real Immich server URL in the app, for example http://192.168.86.228:2283');
});
