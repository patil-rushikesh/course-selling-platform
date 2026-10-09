const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const z = require('zod');
const prisma = require('../config/db');

module.exports = function authenticate(role, secretName, requestKey) {
    return async (req, res, next) => {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : header;
        let decoded;
        try {
            decoded = jwt.verify(token, process.env[secretName]);
            if (decoded.role !== role || !z.uuid().safeParse(decoded.id).success) throw new Error('Invalid token');
        } catch {
            logger.warn('auth.access.denied', { role, reason: 'invalid_token' });
            return res.status(403).json({ message: 'You are Not Signed in!' });
        }
        const account = await prisma[role].findUnique({ where: { id: decoded.id }, select: { id: true, tokenVersion: true } });
        if (!account || (decoded.tokenVersion ?? 0) !== account.tokenVersion) {
            logger.warn('auth.access.denied', { role, reason: 'revoked_or_missing_account' });
            return res.status(403).json({ message: 'You are Not Signed in!' });
        }
        req[requestKey] = account.id;
        next();
    };
};
