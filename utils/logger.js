const { AsyncLocalStorage } = require('node:async_hooks');

const context = new AsyncLocalStorage();
const levels = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50, silent: Infinity };
// Explicit metadata allowlist: never serialize arbitrary requests, errors, or DB rows.
const fields = new Set(['requestId', 'method', 'route', 'statusCode', 'durationMs', 'aborted',
    'actorId', 'accountId', 'role', 'courseId', 'lessonId', 'published', 'completed',
    'errorType', 'errorCode', 'reason', 'signal', 'port', 'setting']);
function safeError(error) {
    const result = { errorType: /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(error?.name) ? error.name : 'Error' };
    if (/^[A-Z][A-Z0-9_]{0,39}$/.test(error?.code)) result.errorCode = error.code;
    // Error messages/stacks may contain SQL parameters, credentials, or request data.
    return result;
}
function createLogger({ level = process.env.LOG_LEVEL || 'info', write = line => process.stdout.write(line) } = {}) {
    const threshold = levels[level] ?? levels.info;
    return Object.fromEntries(Object.keys(levels).filter(name => name !== 'silent').map(name => [name, (event, metadata = {}) => {
        if (levels[name] < threshold) return;
        const record = { timestamp: new Date().toISOString(), level: name, service: 'course-platform', event };
        for (const [key, value] of Object.entries({ ...metadata, ...context.getStore() })) {
            if (fields.has(key) && ['string', 'number', 'boolean'].includes(typeof value)) {
                record[key] = typeof value === 'string' ? value.slice(0, 200) : value;
            }
        }
        write(JSON.stringify(record) + '\n');
    }]));
}
module.exports = { ...createLogger(), createLogger, context, safeError };
