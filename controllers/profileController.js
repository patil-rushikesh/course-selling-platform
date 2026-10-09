const logger = require('../utils/logger');
const z = require('zod');
const bcrypt = require('bcrypt');
const prisma = require('../config/db');
const serialize = require('../utils/serialize');

const profileFields = { id: true, email: true, firstName: true, lastName: true };
const profileSchema = z.object({
    firstName: z.string().trim().min(3).max(100).optional(),
    lastName: z.string().trim().min(3).max(100).optional(),
}).strict().refine(data => Object.keys(data).length > 0);
const passwordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
}).strict().refine(data => data.currentPassword !== data.newPassword, { message: 'Choose a different password' });

module.exports = function profileController(role, requestKey) {
    return {
        logout: async (req, res) => {
            await prisma[role].update({ where: { id: req[requestKey] }, data: { tokenVersion: { increment: 1 } } });
            logger.info('auth.sessions.revoked', { role, actorId: req[requestKey], reason: 'logout' });
            res.json({ message: 'Signed out from all sessions' });
        },
        getProfile: async (req, res) => {
            const account = await prisma[role].findUnique({ where: { id: req[requestKey] }, select: profileFields });
            if (!account) return res.status(404).json({ message: 'Account not found' });
            res.json({ profile: serialize(account) });
        },
        updateProfile: async (req, res) => {
            const parsed = profileSchema.safeParse(req.body);
            if (!parsed.success) return res.status(400).json({ message: 'Invalid profile', error: parsed.error });
            const account = await prisma[role].update({ where: { id: req[requestKey] }, data: parsed.data, select: profileFields });
            logger.info('account.profile.updated', { role, actorId: req[requestKey] });
            res.json({ profile: serialize(account) });
        },
        changePassword: async (req, res) => {
            const parsed = passwordSchema.safeParse(req.body);
            if (!parsed.success) return res.status(400).json({ message: 'Invalid password change', error: parsed.error });
            const account = await prisma[role].findUnique({ where: { id: req[requestKey] } });
            if (!account || !await bcrypt.compare(parsed.data.currentPassword, account.password)) {
                logger.warn('auth.password_change.failed', { role, actorId: req[requestKey], reason: 'invalid_current_password' });
                return res.status(403).json({ message: 'Current password is incorrect' });
            }
            const password = await bcrypt.hash(parsed.data.newPassword, 12);
            // Compare-and-set prevents simultaneous changes from accepting a stale password.
            const result = await prisma[role].updateMany({
                where: { id: account.id, password: account.password },
                data: { password, tokenVersion: { increment: 1 } },
            });
            if (!result.count) return res.status(409).json({ message: 'Password changed; sign in again' });
            logger.info('auth.password.changed', { role, actorId: req[requestKey] });
            res.json({ message: 'Password changed. Sign in again.' });
        },
    };
};
