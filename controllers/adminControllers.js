const logger = require('../utils/logger');
const z = require('zod');
const prisma = require('../config/db');
const authController = require('./authController');
const serialize = require('../utils/serialize');

const courseSchema = z.object({
    published: z.boolean().optional(), title: z.string().min(3), description: z.string().min(10),
    imageURL: z.url(), price: z.number().nonnegative().max(9999999999.99).multipleOf(0.01),
});
const updateSchema = courseSchema.partial().refine(data => Object.keys(data).length > 0);
const validId = id => z.uuid().safeParse(id).success;

const handleCourseAdd = async (req, res) => {
    const parsed = courseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Incorrect data format', error: parsed.error });
    const course = await prisma.course.create({ data: { ...parsed.data, creatorId: req.adminId } });
    logger.info('course.created', { actorId: req.adminId, courseId: course.id, published: course.published });
    res.status(201).json({ message: 'Course Created!', courseId: course.id });
};
const handleCourseUpdate = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid course ID' });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Incorrect data format', error: parsed.error });
    const result = await prisma.course.updateMany({
        where: { id: req.params.id, creatorId: req.adminId }, data: parsed.data,
    });
    if (!result.count) return res.status(404).json({ message: 'Course Not Found!' });
    logger.info('course.updated', { actorId: req.adminId, courseId: req.params.id, published: parsed.data.published });
    res.json({ message: 'Course Updated!' });
};
const handleCourseDelete = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid course ID' });
    try {
        const result = await prisma.course.deleteMany({ where: { id: req.params.id, creatorId: req.adminId } });
        if (!result.count) return res.status(404).json({ message: 'Course Not Found!' });
    } catch (error) {
        if (error.code === 'P2003') return res.status(409).json({ message: 'Purchased courses cannot be deleted' });
        throw error;
    }
    logger.info('course.deleted', { actorId: req.adminId, courseId: req.params.id });
    res.json({ message: 'Course Deleted!' });
};
const handleViewCourses = async (req, res) => {
    const courses = await prisma.course.findMany({ where: { creatorId: req.adminId } });
    res.json({ courses: courses.map(serialize) });
};
module.exports = {
    ...authController('admin', 'JWT_ADMIN_PASSWORD'),
    handleCourseAdd, handleCourseUpdate, handleCourseDelete, handleViewCourses,
};
