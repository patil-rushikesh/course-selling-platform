const logger = require('../utils/logger');
const z = require('zod');
const prisma = require('../config/db');
const serialize = require('../utils/serialize');

const coursePurchaseController = async (req, res) => {
    const parsed = z.object({ courseId: z.uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Please provide a valid courseId' });
    const course = await prisma.course.findFirst({ where: { id: parsed.data.courseId, published: true } });
    if (!course) return res.status(404).json({ message: 'Course Not Found!' });
    try {
        await prisma.purchase.create({ data: { courseId: parsed.data.courseId, userId: req.userId } });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ message: 'You have already bought this course!' });
        if (error.code === 'P2003') return res.status(404).json({ message: 'Course Not Found!' });
        throw error;
    }
    logger.info('course.enrollment.created', { actorId: req.userId, courseId: course.id });
    res.status(201).json({ message: 'You successfully bought this course' });
};
const viewCoursesController = async (req, res) => {
    const courses = await prisma.course.findMany({ where: { published: true } });
    res.json({ courses: courses.map(serialize) });
};
const queryNumber = z.string().trim().min(1).pipe(z.coerce.number().finite().nonnegative().max(9999999999.99));
const listSchema = z.object({
    q: z.string().trim().max(200).optional(),
    page: z.string().regex(/^[1-9]\d*$/).pipe(z.coerce.number().int().max(100000)).default(1),
    limit: z.string().regex(/^[1-9]\d*$/).pipe(z.coerce.number().int().max(100)).default(20),
    minPrice: queryNumber.optional(), maxPrice: queryNumber.optional(),
    sort: z.enum(['title', 'price_asc', 'price_desc']).default('title'),
}).strict().refine(data => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
    { message: 'minPrice must not exceed maxPrice' });
const listCourses = async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid search parameters', error: parsed.error });
    const { q, page, limit, minPrice, maxPrice, sort } = parsed.data;
    const where = {
        published: true,
        ...(q && { OR: ['title', 'description'].map(field => ({ [field]: { contains: q, mode: 'insensitive' } })) }),
        ...((minPrice !== undefined || maxPrice !== undefined) && { price: { gte: minPrice, lte: maxPrice } }),
    };
    const orderBy = sort === 'title' ? { title: 'asc' } : { price: sort === 'price_asc' ? 'asc' : 'desc' };
    const [total, courses] = await prisma.$transaction([
        prisma.course.count({ where }),
        prisma.course.findMany({ where, orderBy: [orderBy, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
    ], { isolationLevel: 'RepeatableRead' });
    res.json({ courses: courses.map(serialize), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
};
const getCourse = async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success) return res.status(400).json({ message: 'Invalid course ID' });
    const course = await prisma.course.findFirst({ where: { id: req.params.id, published: true } });
    if (!course) return res.status(404).json({ message: 'Course Not Found!' });
    res.json({ course: serialize(course) });
};
module.exports = { coursePurchaseController, viewCoursesController, listCourses, getCourse };
