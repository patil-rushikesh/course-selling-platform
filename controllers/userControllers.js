const prisma = require('../config/db');
const authController = require('./authController');
const serialize = require('../utils/serialize');

const handlePurchases = async (req, res) => {
    const rows = await prisma.purchase.findMany({
        where: { userId: req.userId }, include: { course: true },
    });
    res.json({
        purchases: rows.map(({ course, ...purchase }) => serialize(purchase)),
        courseData: rows.map(({ course }) => serialize(course)),
    });
};
module.exports = { ...authController('user', 'JWT_USER_PASSWORD'), handlePurchases };
