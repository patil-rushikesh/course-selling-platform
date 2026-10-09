const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const prisma = require('./config/db');
const { userRouter } = require('./routes/user');
const { adminRouter } = require('./routes/admin');
const { courseRouter } = require('./routes/course');

const logger = require('./utils/logger');
const requestLogging = require('./middlewares/requestLogging');

const app = express();
app.use(requestLogging);
const httpsOnly = process.env.NODE_ENV === 'production' && process.env.HTTPS_ONLY !== 'false';
// Configure only the known number of trusted reverse proxies in your deployment.
if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'https:', 'data:'], upgradeInsecureRequests: httpsOnly ? [] : null } }, strictTransportSecurity: httpsOnly ? undefined : false }));
app.use(express.json({ limit: '100kb' }));
app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', async (req, res) => {
    try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ready' }); }
    catch (error) { logger.error('database.readiness.failed', logger.safeError(error)); res.status(503).json({ status: 'unavailable' }); }
});
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('auth.rate_limited');
        res.status(429).json({ message: 'Too many authentication attempts. Try again later.' });
    } });
for (const role of ['user', 'admin']) {
    app.use(`/api/v1/${role}/signin`, authLimit);
    app.use(`/api/v1/${role}/signup`, authLimit);
    app.use(`/api/v1/${role}/me/password`, authLimit);
}
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/v1/user', userRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/course', courseRouter);
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use((error, req, res, next) => {
    logger[error.status >= 400 && error.status < 500 || ['P2025', 'P2003'].includes(error.code) ? 'warn' : 'error']('http.request.failed', logger.safeError(error));
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' });
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large' });
    if (error.code === 'P2025') return res.status(404).json({ message: 'Record not found' });
    if (error.code === 'P2003') return res.status(409).json({ message: 'A related record changed; refresh and try again' });
    res.status(500).json({ message: 'Internal server error' });
});
module.exports = app;
