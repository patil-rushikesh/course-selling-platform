const logger = require('../utils/logger');
const z = require('zod');
const { timingSafeEqual } = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

const signupSchema = z.object({
    email: z.email().min(5), password: z.string().min(6).max(72),
    firstName: z.string().min(3), lastName: z.string().min(3),
}).refine(data => Buffer.byteLength(data.password, 'utf8') <= 72, { message: 'Password must be at most 72 bytes' });
const signinSchema = z.object({ email: z.email(), password: z.string().min(6) });

function authController(role, secretName) {
    return {
        handleSignUp: async (req, res) => {
            if (role === 'admin') {
                const key = process.env.ADMIN_SIGNUP_KEY;
                const supplied = req.get('X-Admin-Signup-Key') || '';
                if (!key || Buffer.byteLength(key) !== Buffer.byteLength(supplied) ||
                    !timingSafeEqual(Buffer.from(key), Buffer.from(supplied))) {
                    logger.warn('auth.signup.denied', { role, reason: 'invalid_invitation' });
                    return res.status(403).json({ message: 'Admin registration requires an invitation key' });
                }
            }
            const parsed = signupSchema.safeParse(req.body);
            if (!parsed.success) return res.status(400).json({ message: 'Incorrect data format', error: parsed.error });
            const data = { ...parsed.data, password: await bcrypt.hash(parsed.data.password, 12) };
            try {
                const account = await prisma[role].create({ data });
                logger.info('auth.signup.succeeded', { role, accountId: account.id });
            } catch (error) {
                if (error.code === 'P2002') return res.status(409).json({ message: 'You are already signed up' });
                throw error;
            }
            return res.status(201).json({ message: 'SignUp Successfull!' });
        },
        handleSignIn: async (req, res) => {
            const parsed = signinSchema.safeParse(req.body);
            if (!parsed.success) return res.status(400).json({ message: 'Incorrect data format', error: parsed.error });
            const account = await prisma[role].findUnique({ where: { email: parsed.data.email } });
            if (!account || !await bcrypt.compare(parsed.data.password, account.password)) {
                logger.warn('auth.signin.failed', { role, reason: 'invalid_credentials' });
                return res.status(403).json({ message: 'Invalid Credentials!' });
            }
            const token = jwt.sign({ id: account.id, role, tokenVersion: account.tokenVersion }, process.env[secretName], { expiresIn: '7d' });
            logger.info('auth.signin.succeeded', { role, accountId: account.id });
            return res.json({ token });
        },
    };
}
module.exports = authController;
