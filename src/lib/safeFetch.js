// Fetches a user-supplied web page without letting it reach internal services.
//
// - Every address the hostname resolves to must be public (no loopback, private
//   ranges, link-local / cloud metadata 169.254.169.254, etc.). The check runs in
//   the socket's DNS lookup, so it also covers DNS rebinding.
// - Redirects are followed by hand (max 5) and each hop is checked the same way.
// - Only http/https on ports 80/443.
// - The body is capped (default 2 MB) and the whole request has a hard timeout.
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

const blocked = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].forEach(([ip, bits]) => blocked.addSubnet(ip, bits, 'ipv4'));
[
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64],
  ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
].forEach(([ip, bits]) => blocked.addSubnet(ip, bits, 'ipv6'));

function isPublicIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip, 'ipv4');
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d) -> judge by the embedded IPv4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return !blocked.check(mapped[1], 'ipv4');
    return !blocked.check(ip, 'ipv6');
  }
  return false;
}

// dns.lookup replacement used by the socket: refuses non-public results.
function safeLookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const bad = addresses.find(a => !isPublicIp(a.address));
    if (!addresses.length || bad) {
      const e = new Error(`Refusing to connect to non-public address${bad ? ` ${bad.address}` : ''}`);
      e.code = 'EBLOCKEDADDRESS';
      return callback(e);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

function requestOnce(url, { headers, maxBytes, signal }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error('Only http(s) URLs are allowed'));
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    if (port !== '80' && port !== '443') return reject(new Error('Only ports 80/443 are allowed'));
    const host = u.hostname.replace(/^\[|\]$/g, '');
    // IP literals skip DNS lookup entirely, so check them here.
    if (net.isIP(host) && !isPublicIp(host)) return reject(new Error(`Refusing to connect to non-public address ${host}`));

    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'GET', headers, lookup: safeLookup, signal }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          // Keep what we have; a page's <head> and opening content is enough.
          res.destroy();
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') });
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * @returns {Promise<{ ok: boolean, status: number, url: string, text: string }>}
 */
async function safeFetch(url, { headers = {}, maxBytes = 2 * 1024 * 1024, timeoutMs = 8000, maxRedirects = 5 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    for (let i = 0; i <= maxRedirects; i++) {
      const res = await requestOnce(current, { headers, maxBytes, signal: controller.signal });
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        current = new URL(res.headers.location, current).toString();
        continue;
      }
      return { ok: res.status >= 200 && res.status < 300, status: res.status, url: current, text: res.body };
    }
    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { safeFetch, isPublicIp };
