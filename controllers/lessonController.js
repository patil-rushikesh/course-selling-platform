const logger = require('../utils/logger');
const z = require('zod');
const prisma = require('../config/db');
const serialize = require('../utils/serialize');
const lessonSchema = z.object({
    title: z.string().trim().min(3).max(200),
    content: z.string().min(1).max(50000),
    videoURL: z.url().refine(value => /^https?:\/\//.test(value)).nullable().optional(),
    position: z.number().int().min(0).max(10000),
}).strict();
const updateSchema = lessonSchema.partial().refine(data => Object.keys(data).length > 0);
const validIds = req => [req.params.id, req.params.lessonId].filter(x => x !== undefined).every(x => z.uuid().safeParse(x).success);

async function ownedCourse(req, res) {
    if (!validIds(req)) { res.status(400).json({ message: 'Invalid ID' }); return null; }
    const course = await prisma.course.findFirst({ where: { id: req.params.id, creatorId: req.adminId } });
    if (!course) res.status(404).json({ message: 'Course Not Found!' });
    return course;
}
async function enrolledCourse(req, res) {
    if (!validIds(req)) { res.status(400).json({ message: 'Invalid ID' }); return null; }
    const enrollment = await prisma.purchase.findUnique({ where: { userId_courseId: { userId: req.userId, courseId: req.params.id } } });
    if (!enrollment) res.status(403).json({ message: 'Enroll in this course to access lessons' });
    return enrollment;
}
const listAdminLessons = async (req, res) => {
    if (!await ownedCourse(req, res)) return;
    const lessons = await prisma.lesson.findMany({ where: { courseId: req.params.id }, orderBy: { position: 'asc' } });
    res.json({ lessons: lessons.map(serialize) });
};
const createLesson = async (req, res) => {
    if (!await ownedCourse(req, res)) return;
    const parsed = lessonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid lesson', error: parsed.error });
    try {
        const lesson = await prisma.lesson.create({ data: { ...parsed.data, courseId: req.params.id } });
        logger.info('lesson.created', { actorId: req.adminId, courseId: req.params.id, lessonId: lesson.id });
        res.status(201).json({ lesson: serialize(lesson) });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ message: 'A lesson already uses this position' });
        throw error;
    }
};
const updateLesson = async (req, res) => {
    if (!await ownedCourse(req, res)) return;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid lesson', error: parsed.error });
    try {
        const result = await prisma.lesson.updateMany({ where: { id: req.params.lessonId, courseId: req.params.id }, data: parsed.data });
        if (!result.count) return res.status(404).json({ message: 'Lesson not found' });
        logger.info('lesson.updated', { actorId: req.adminId, courseId: req.params.id, lessonId: req.params.lessonId });
        res.json({ message: 'Lesson updated' });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ message: 'A lesson already uses this position' });
        throw error;
    }
};
const deleteLesson = async (req, res) => {
    if (!await ownedCourse(req, res)) return;
    const result = await prisma.lesson.deleteMany({ where: { id: req.params.lessonId, courseId: req.params.id } });
    if (!result.count) return res.status(404).json({ message: 'Lesson not found' });
    logger.info('lesson.deleted', { actorId: req.adminId, courseId: req.params.id, lessonId: req.params.lessonId });
    res.json({ message: 'Lesson deleted' });
};
const listLessons = async (req, res) => {
    if (!await enrolledCourse(req, res)) return;
    const lessons = await prisma.lesson.findMany({ where: { courseId: req.params.id }, orderBy: { position: 'asc' },
        include: { progress: { where: { userId: req.userId }, select: { completed: true } } } });
    res.json({ lessons: lessons.map(({ progress, ...lesson }) => ({ ...serialize(lesson), completed: progress[0]?.completed || false })) });
};
const updateProgress = async (req, res) => {
    if (!await enrolledCourse(req, res)) return;
    const parsed = z.object({ completed: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'completed must be a boolean' });
    const lesson = await prisma.lesson.findFirst({ where: { id: req.params.lessonId, courseId: req.params.id } });
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
    const progress = await prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId: req.userId, lessonId: lesson.id } },
        create: { userId: req.userId, lessonId: lesson.id, completed: parsed.data.completed },
        update: parsed.data,
    });
    logger.info('lesson.progress.updated', { actorId: req.userId, courseId: req.params.id, lessonId: lesson.id, completed: parsed.data.completed });
    res.json({ progress });
};
const getProgress = async (req, res) => {
    if (!await enrolledCourse(req, res)) return;
    const [total, completed] = await prisma.$transaction([
        prisma.lesson.count({ where: { courseId: req.params.id } }),
        prisma.lessonProgress.count({ where: { userId: req.userId, completed: true, lesson: { courseId: req.params.id } } }),
    ], { isolationLevel: 'RepeatableRead' });
    res.json({ total, completed, percent: total ? Math.round(completed / total * 100) : 0 });
};
module.exports = { listAdminLessons, createLesson, updateLesson, deleteLesson, listLessons, updateProgress, getProgress };
