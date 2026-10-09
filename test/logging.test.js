const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const logger = require('../utils/logger');
const requestLogging = require('../middlewares/requestLogging');

test('structured logs filter levels and omit sensitive fields and error messages', () => {
    const lines = [];
    const log = logger.createLogger({ level: 'warn', write: line => lines.push(line) });
    log.info('ignored');
    const error = Object.assign(new Error('postgres://user:secret@example.test/db'), { code: 'P2003' });
    log.error('database.failed', { ...logger.safeError(error), password: 'secret', authorization: 'Bearer secret',
        body: { password: 'secret' }, email: 'private@example.test', token: 'secret', databaseUrl: 'secret' });
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.level, 'error');
    assert.equal(record.errorCode, 'P2003');
    assert.equal(record.errorType, 'Error');
    assert.equal(record.service, 'course-platform');
    assert(!lines[0].includes('secret'));
    assert(!lines[0].includes('private@example.test'));
    assert(!record.stack);
    assert(!record.message);
    assert(!Number.isNaN(Date.parse(record.timestamp)));
    logger.createLogger({ level: 'silent', write: () => assert.fail('silent logger wrote output') }).fatal('ignored');
});

test('request IDs correlate concurrent events, exclude URLs, log parser errors, and suppress healthy probes', async t => {
    const records = [];
    const log = logger.createLogger({ level: 'debug', write: line => records.push(JSON.parse(line)) });
    for (const level of ['debug', 'info', 'warn', 'error', 'fatal']) t.mock.method(logger, level, log[level]);
    const previousHealth = process.env.LOG_HEALTH_CHECKS;
    delete process.env.LOG_HEALTH_CHECKS;
    t.after(() => { if (previousHealth === undefined) delete process.env.LOG_HEALTH_CHECKS; else process.env.LOG_HEALTH_CHECKS = previousHealth; });
    const app = express();
    app.use(requestLogging);
    app.use(express.json());
    const router = express.Router();
    router.get('/courses/:id', async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        logger.info('test.action');
        res.json({ ok: true });
    });
    app.use('/api/v1/user', router);
    app.get('/health/live', (req, res) => res.json({ ok: true }));
    app.get('/health/ready', (req, res) => res.status(503).json({ ok: false }));
    app.use((req, res) => res.status(404).json({}));
    app.use((error, req, res, next) => res.status(400).json({}));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const responses = await Promise.all([1, 2].map(i => fetch(`${base}/api/v1/user/courses/private-${i}?token=secret`, {
        headers: { Authorization: 'Bearer secret', 'X-Request-ID': 'untrusted-secret' },
    })));
    const ids = responses.map(res => res.headers.get('x-request-id'));
    assert.notEqual(ids[0], ids[1]);
    for (const id of ids) {
        assert.match(id, /^[a-f0-9-]{36}$/);
        const matching = records.filter(record => record.requestId === id);
        assert.equal(matching.length, 2);
        assert(matching.some(record => record.event === 'test.action'));
        const completion = matching.find(record => record.event === 'http.request.completed');
        assert.equal(completion.route, '/api/v1/user/courses/:id');
        assert.equal(completion.statusCode, 200);
        assert(completion.durationMs >= 0);
    }
    const beforeHealth = records.length;
    await fetch(base + '/health/live');
    assert.equal(records.length, beforeHealth);
    await fetch(base + '/health/ready');
    assert.equal(records.at(-1).level, 'error');
    assert.equal(records.at(-1).statusCode, 503);
    await fetch(base + '/unknown-private-path?password=secret');
    assert.equal(records.at(-1).route, 'unmatched');
    assert.equal(records.at(-1).level, 'warn');
    await fetch(base + '/api/v1/user/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"secret"' });
    assert.equal(records.at(-1).statusCode, 400);
    assert(!JSON.stringify(records).includes('secret'));
    assert(!JSON.stringify(records).includes('private-'));
});
