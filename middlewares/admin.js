const authenticate = require('./auth');
module.exports = { adminAuth: authenticate('admin', 'JWT_ADMIN_PASSWORD', 'adminId') };
