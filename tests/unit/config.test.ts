import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../server/src/config';

describe('Unit: Backend Worker Configuration (server/src/config.ts)', () => {
  it('loadConfig mengembalikan konfigurasi lengkap dengan tipe data yang valid', () => {
    const config = loadConfig();

    assert.equal(typeof config.host, 'string');
    assert.equal(typeof config.port, 'number');
    assert.ok(config.port > 0 && config.port <= 65535);
    assert.equal(typeof config.sessionDir, 'string');
    assert.equal(typeof config.showTerminalQr, 'boolean');
    assert.equal(typeof config.maxReconnectRetries, 'number');
    assert.equal(typeof config.initialReconnectDelayMs, 'number');
    assert.equal(typeof config.maxReconnectDelayMs, 'number');
    assert.ok(Array.isArray(config.allowedOrigins));
    assert.equal(config.openwaBaseUrl.endsWith('/'), false);
  });
});
