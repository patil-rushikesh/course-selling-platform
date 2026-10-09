const { randomUUID } = require('node:crypto');
const logger = require('../utils/logger');

module.exports = function requestLogging(req, res, next) {
    const requestId = randomUUID();
    const started = process.hrtime.bigint();
    // Derive only a known router prefix; never log raw URLs or query strings.
    const prefix = req.path.match(/^\/api\/v1\/(user|admin|course)(?=\/|$)/)?.[0] || '';
    res.setHeader('X-Request-ID', requestId);
    let logged = false;
    const finish = () => {
        if (logged) return;
        logged = true;
        const aborted = !res.writableFinished;
        const route = req.route ? prefix + req.route.path : 'unmatched';
        const durationMs = Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(2));
        const configuredSlowMs = Number(process.env.LOG_SLOW_REQUEST_MS || 1000);
        const slowMs = Number.isFinite(configuredSlowMs) && configuredSlowMs >= 0 ? configuredSlowMs : 1000;
        if (!aborted && res.statusCode < 400 && ['/health/live', '/health/ready'].includes(route) && process.env.LOG_HEALTH_CHECKS !== 'true') return;
        const level = res.statusCode >= 500 ? 'error' : aborted || res.statusCode >= 400 || durationMs >= slowMs ? 'warn' : 'info';
        logger[level](aborted ? 'http.request.aborted' : 'http.request.completed', {
            requestId, method: req.method, route, statusCode: res.statusCode, durationMs, aborted,
            actorId: req.userId || req.adminId, role: req.adminId ? 'admin' : req.userId ? 'user' : undefined,
        });
    };
    res.once('finish', finish);
    res.once('close', finish);
    logger.context.run({ requestId }, next);
};
