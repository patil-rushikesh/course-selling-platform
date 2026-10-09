const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

test('PostgreSQL API: auth, ownership, courses, purchases and constraints', {
    skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a migrated test database',
}, async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_USER_PASSWORD = 'integration-user-secret';
    process.env.JWT_ADMIN_PASSWORD = 'integration-admin-secret';
    process.env.ADMIN_SIGNUP_KEY = 'integration-admin-invitation';
    const prisma = require('../config/db');
    const app = require('../app');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const emails = [];
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const request = async (path, method = 'GET', body, token) => {
        const response = await fetch(base + path, {
            method, headers: { 'Content-Type': 'application/json', ...(path === '/admin/signup' && { 'X-Admin-Signup-Key': process.env.ADMIN_SIGNUP_KEY }), ...(token && { Authorization: `Bearer ${token}` }) },
            ...(body !== undefined && { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: await response.json() };
    };
    const account = async role => {
        const data = { email: `${randomUUID()}@example.com`, password: 'test-password', firstName: 'Test', lastName: 'Account' };
        emails.push(data.email);
        assert.equal((await request(`/${role}/signup`, 'POST', data)).status, 201);
        assert.equal((await request(`/${role}/signup`, 'POST', data)).status, 409);
        assert.equal((await request(`/${role}/signin`, 'POST', { email: data.email, password: 'incorrect' })).status, 403);
        const signin = await request(`/${role}/signin`, 'POST', data);
        assert.equal(signin.status, 200);
        return signin.body.token;
    };
    try {
        assert.equal((await request('/user/signin', 'POST', {})).status, 400);
        assert.equal((await request('/admin/signup', 'POST', {})).status, 400);
        assert.equal((await request('/course/purchase', 'POST', {})).status, 403);
        const admin = await account('admin');
        const other = await account('admin');
        const user = await account('user');
        assert.equal((await fetch(base + '/admin/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
        for (const [role, token] of [['user', user], ['admin', admin]]) {
            assert.equal((await request(`/${role}/me`)).status, 403);
            const me = await request(`/${role}/me`, 'GET', undefined, token);
            assert.equal(me.status, 200);
            assert.equal(me.body.profile.password, undefined);
            assert.equal(me.body.profile.tokenVersion, undefined);
            assert.equal((await request(`/${role}/me`, 'PATCH', { firstName: 'Updated' }, token)).body.profile.firstName, 'Updated');
            assert.equal((await request(`/${role}/me`, 'PATCH', {}, token)).status, 400);
            assert.equal((await request(`/${role}/me`, 'PATCH', { email: 'stolen@example.com' }, token)).status, 400);
            assert.equal((await request(`/${role}/me/password`, 'PATCH', { currentPassword: 'wrong', newPassword: 'new-password' }, token)).status, 403);
        }
        assert.equal((await request('/admin/me', 'GET', undefined, user)).status, 403);
        const course = { title: 'SQL course', description: 'Learn PostgreSQL and Prisma', imageURL: 'https://example.com/course.png', price: 19.99 };
        assert.equal((await request('/admin/course', 'POST', course, user)).status, 403);
        const created = await request('/admin/course', 'POST', course, admin);
        assert.equal(created.status, 201);
        const id = created.body.courseId;
        assert.equal((await request(`/course/${id}`)).body.course.id, id);
        assert.equal((await request('/course/bad-id')).status, 400);
        assert.equal((await request(`/course/${randomUUID()}`)).status, 404);
        for (const query of ['limit=101', 'page=0', 'minPrice=20&maxPrice=10', 'q=x&q=y', 'sort=invalid', 'minPrice=']) {
            assert.equal((await request('/course?' + query)).status, 400);
        }
        assert.equal((await request('/course')).body.pagination.page, 1);
        assert.equal((await request('/course')).body.pagination.limit, 20);
        const search = await request('/course?q=SQL&limit=1&minPrice=10&maxPrice=30&sort=price_desc');
        assert.equal(search.status, 200);
        assert(search.body.courses.some(item => item.id === id));
        assert.equal(search.body.pagination.limit, 1);
        assert.equal((await request(`/user/courses/${id}/lessons`, 'GET', undefined, user)).status, 403);
        const lessonBody = { title: 'Introduction', content: 'Learning PostgreSQL, one query at a time.', position: 0 };
        assert.equal((await request(`/admin/course/${id}/lessons`, 'POST', lessonBody, other)).status, 404);
        const lesson = await request(`/admin/course/${id}/lessons`, 'POST', lessonBody, admin);
        assert.equal(lesson.status, 201);
        const lessonId = lesson.body.lesson.id;
        assert.equal((await request(`/admin/course/${id}/lessons`, 'POST', lessonBody, admin)).status, 409);
        assert.equal((await request(`/admin/course/${id}/lessons/${lessonId}`, 'PATCH', { videoURL: 'javascript:alert(1)' }, admin)).status, 400);
        assert.equal((await request(`/admin/course/${id}/lessons/${lessonId}`, 'PATCH', { title: 'Introduction to SQL' }, admin)).status, 200);
        assert.equal((await request(`/admin/course/${id}/lessons`, 'GET', undefined, admin)).body.lessons.length, 1);
        const draft = await request('/admin/course', 'POST', { ...course, published: false }, admin);
        assert.equal((await request(`/course/${draft.body.courseId}`)).status, 404);
        assert.equal((await request('/course/purchase', 'POST', { courseId: draft.body.courseId }, user)).status, 404);
        assert(!(await request('/course/preview')).body.courses.some(item => item.id === draft.body.courseId));
        assert.equal((await request(`/admin/course/${draft.body.courseId}`, 'DELETE', undefined, admin)).status, 200);
        assert.equal((await request(`/admin/course/${id}`, 'PUT', { price: 29.99 }, other)).status, 404);
        assert.equal((await request(`/admin/course/${id}`, 'DELETE', undefined, other)).status, 404);
        assert.equal((await request(`/admin/course/${id}`, 'PUT', { title: 'Updated SQL course' }, admin)).status, 200);
        assert.equal((await request('/admin/course/not-a-uuid', 'PUT', { price: 10 }, admin)).status, 400);
        const own = await request('/admin/course/view-all', 'GET', undefined, admin);
        assert.equal(own.body.courses.length, 1);
        assert.equal(own.body.courses[0]._id, id);
        assert.equal(own.body.courses[0].price, 19.99);
        assert.equal((await request('/admin/course/view-all', 'GET', undefined, other)).body.courses.length, 0);
        assert((await request('/course/preview')).body.courses.some(c => c._id === id));
        assert.deepEqual((await request('/user/purchases', 'GET', undefined, user)).body, { purchases: [], courseData: [] });
        assert.equal((await request('/course/purchase', 'POST', { courseId: 'bad' }, user)).status, 400);
        assert.equal((await request('/course/purchase', 'POST', { courseId: randomUUID() }, user)).status, 404);
        const attempts = await Promise.all([1, 2].map(() => request('/course/purchase', 'POST', { courseId: id }, user)));
        assert.deepEqual(attempts.map(r => r.status).sort(), [201, 400]);
        const purchases = (await request('/user/purchases', 'GET', undefined, user)).body;
        assert.equal(purchases.purchases.length, 1);
        assert.equal(purchases.courseData[0]._id, id);
        const lessons = await request(`/user/courses/${id}/lessons`, 'GET', undefined, user);
        assert.equal(lessons.body.lessons[0].content, lessonBody.content);
        assert.equal(lessons.body.lessons[0].completed, false);
        assert.equal((await request(`/user/courses/${id}/lessons/${lessonId}/progress`, 'PUT', { completed: true }, user)).status, 200);
        assert.deepEqual((await request(`/user/courses/${id}/progress`, 'GET', undefined, user)).body, { total: 1, completed: 1, percent: 100 });
        assert.equal((await request(`/user/courses/${id}/lessons/${randomUUID()}/progress`, 'PUT', { completed: true }, user)).status, 404);
        assert.equal((await request(`/user/courses/${id}/lessons/${lessonId}/progress`, 'PUT', { completed: 'yes' }, user)).status, 400);
        const dashboard = await request('/admin/dashboard', 'GET', undefined, admin);
        assert.deepEqual(dashboard.body, { courses: 1, enrollments: 1 });
        assert.equal((await request(`/admin/course/${id}/lessons/${lessonId}`, 'DELETE', undefined, other)).status, 404);
        assert.equal((await request(`/admin/course/${id}/lessons/${lessonId}`, 'DELETE', undefined, admin)).status, 200);
        assert.deepEqual((await request(`/user/courses/${id}/progress`, 'GET', undefined, user)).body, { total: 0, completed: 0, percent: 0 });
        assert.equal((await request(`/admin/course/${id}`, 'DELETE', undefined, admin)).status, 409);
        const disposable = await request('/admin/course', 'POST', course, admin);
        assert.equal((await request(`/admin/course/${disposable.body.courseId}`, 'DELETE', undefined, admin)).status, 200);
        const stored = await prisma.user.findUnique({ where: { email: emails[2] } });
        assert.notEqual(stored.password, 'test-password');
        await assert.rejects(prisma.purchase.create({ data: { userId: randomUUID(), courseId: id } }), { code: 'P2003' });
        for (const [role, token, email] of [['user', user, emails[2]], ['admin', admin, emails[0]]]) {
            assert.equal((await request(`/${role}/me/password`, 'PATCH', { currentPassword: 'test-password', newPassword: 'updated-password' }, token)).status, 200);
            assert.equal((await request(`/${role}/me`, 'GET', undefined, token)).status, 403);
            assert.equal((await request(`/${role}/signin`, 'POST', { email, password: 'test-password' })).status, 403);
            const fresh = await request(`/${role}/signin`, 'POST', { email, password: 'updated-password' });
            assert.equal(fresh.status, 200);
            assert.equal((await request(`/${role}/logout`, 'POST', {}, fresh.body.token)).status, 200);
            assert.equal((await request(`/${role}/me`, 'GET', undefined, fresh.body.token)).status, 403);
        }
        const health = await fetch(base.replace('/api/v1', '/health/ready'));
        assert.equal(health.status, 200);
        assert.equal((await request('/missing')).status, 404);
        const home = await fetch(base.replace('/api/v1', '/'));
        assert.equal(home.status, 404);
        assert.equal((await home.json()).message, 'Route not found');
        assert(home.headers.get('content-security-policy'));
    } finally {
        await new Promise(resolve => server.close(resolve));
        await prisma.purchase.deleteMany({ where: { user: { email: { in: emails } } } });
        await prisma.course.deleteMany({ where: { creator: { email: { in: emails } } } });
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
        await prisma.admin.deleteMany({ where: { email: { in: emails } } });
        await prisma.$disconnect();
    }
});
