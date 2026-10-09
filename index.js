require('dotenv').config({ quiet: true });

const logger = require('./utils/logger');

async function start() {
    for (const name of ['DATABASE_URL', 'JWT_USER_PASSWORD', 'JWT_ADMIN_PASSWORD']) {
        if (!process.env[name]) { logger.error('configuration.invalid', { setting: name, reason: 'missing' }); throw new Error('Missing configuration'); }
    }
    if (process.env.NODE_ENV === 'production') {
        for (const name of ['JWT_USER_PASSWORD', 'JWT_ADMIN_PASSWORD', 'ADMIN_SIGNUP_KEY']) {
            if (!process.env[name] || process.env[name].length < 32 || process.env[name].startsWith('replace-with')) {
                logger.error('configuration.invalid', { setting: name, reason: 'weak_or_placeholder_secret' });
                throw new Error('Invalid secret configuration');
            }
        }
        if (process.env.JWT_USER_PASSWORD === process.env.JWT_ADMIN_PASSWORD) throw new Error('Use distinct JWT secrets');
    }
    if (process.env.TRUST_PROXY_HOPS && !/^[0-9]+$/.test(process.env.TRUST_PROXY_HOPS)) throw new Error('Invalid TRUST_PROXY_HOPS');
    const prisma = require('./config/db');
    const app = require('./app');
    logger.info('database.connecting');
    await prisma.$connect();
    logger.info('database.connected');
    const server = app.listen(process.env.PORT || 3000, () => {
        logger.info('server.started', { port: server.address().port });
    });
    server.on('error', async error => {
        logger.error('server.failed', logger.safeError(error));
        await prisma.$disconnect();
        process.exitCode = 1;
    });
    let stopping = false;
    const stop = signal => {
        if (stopping) return;
        stopping = true;
        logger.info('server.shutdown.started', { signal });
        const timeout = setTimeout(() => { logger.fatal('server.shutdown.timeout'); process.exit(1); }, 10000).unref();
        server.close(async () => {
            try {
                await prisma.$disconnect();
                logger.info('server.shutdown.completed');
            } catch (error) {
                logger.error('server.shutdown.failed', logger.safeError(error));
                process.exitCode = 1;
            } finally { clearTimeout(timeout); }
        });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
}
start().catch(error => {
    logger.fatal('server.startup.failed', logger.safeError(error));
    process.exitCode = 1;
});
