const prisma = require('../config/db');
const getDashboard = async (req, res) => {
    const [courses, enrollments] = await prisma.$transaction([
        prisma.course.count({ where: { creatorId: req.adminId } }),
        prisma.purchase.count({ where: { course: { creatorId: req.adminId } } }),
    ], { isolationLevel: 'RepeatableRead' });
    res.json({ courses, enrollments });
};
module.exports = { getDashboard };
