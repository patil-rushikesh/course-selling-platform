const authenticate = require('./auth');
module.exports = { userAuth: authenticate('user', 'JWT_USER_PASSWORD', 'userId') };
