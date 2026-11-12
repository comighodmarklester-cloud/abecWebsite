const assert = require('node:assert/strict');
const https = require('node:https');
const fixtureHttps = require('./lib/fixture-https.cjs');

(async () => {
  const fixture = fixtureHttps((req, res) => res.end('verified fixture'));
  await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const port = fixture.server.address().port;
  function request(options) {
    return new Promise((resolve, reject) => {
      const req = https.get({ hostname: '127.0.0.1', port, ...options }, response => {
        let body = ''; response.on('data', data => body += data); response.on('end', () => resolve(body));
      });
      req.on('error', reject);
    });
  }
  try {
    assert.equal(fixture.server.address().address, '127.0.0.1');
    assert.equal(await request({ ca: fixture.certificate }), 'verified fixture');
    await assert.rejects(request({}), error => /SELF_SIGNED|CERT_AUTHORITY|UNABLE_TO_VERIFY/.test(error.code));
    await assert.rejects(request({ ca: fixture.certificate, servername: 'wrong-host.invalid' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    console.log('PASS 4 loopback TLS checks: binding, trusted certificate, unknown issuer rejection and hostname validation.');
  } finally { await new Promise(resolve => fixture.server.close(resolve)); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
