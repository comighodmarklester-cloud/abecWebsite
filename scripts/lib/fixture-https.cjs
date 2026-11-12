// Ephemeral loopback TLS, shared by browser fixtures. No certificate-store changes.
const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

module.exports = function fixtureHttps(handler) {
  const verifier = process.env.ABEC_VERIFICATION_DLL || path.resolve('artifacts/security-final-20261113/BatchVerification.dll');
  if (!fs.existsSync(verifier)) throw new Error('Build BatchVerification first or set ABEC_VERIFICATION_DLL to its current assembly.');
  const generated = spawnSync('dotnet', [verifier, '--create-browser-tls'], { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  if (generated.error || generated.status !== 0) throw new Error('Could not create the ephemeral browser TLS fixture.');
  const material = JSON.parse(generated.stdout);
  if (!material.key || !material.cert || !/^[A-Za-z0-9+/]{43}=$/.test(material.spki)) throw new Error('Invalid TLS fixture output.');
  return {
    server: https.createServer({ key: material.key, cert: material.cert, minVersion: 'TLSv1.2' }, handler),
    // Trust this one ephemeral key in the browser; keep normal verification for all other certificates.
    browserArgs: ['--ignore-certificate-errors-spki-list=' + material.spki],
    spki: material.spki,
    certificate: material.cert
  };
};
