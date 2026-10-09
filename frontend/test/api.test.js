import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, readSession } from '../src/api.js';

test('API uses the same-origin proxy and includes auth without putting tokens in URLs', async () => {
  const api = createApi('example-token', async (url, options) => {
    assert.equal(url, '/api/v1/course/purchase');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer example-token');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { courseId: 'course-id' });
    return Response.json({ message: 'Enrolled' });
  });
  assert.deepEqual(await api('/course/purchase', { method: 'POST', body: { courseId: 'course-id' } }), { message: 'Enrolled' });
});
test('public requests omit auth; invitation headers and abort signals are forwarded', async () => {
  const signal = new AbortController().signal;
  const api = createApi(null, async (url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['X-Admin-Signup-Key'], 'invitation');
    assert.equal(options.signal, signal);
    return Response.json({});
  });
  await api('/admin/signup', { method: 'POST', body: {}, headers: { 'X-Admin-Signup-Key': 'invitation' }, signal });
});
test('API displays server errors and handles gateway, network, and abort failures', async () => {
  await assert.rejects(createApi(null, async () => Response.json({ message: 'Enroll first' }, { status: 403 }))('/test'), /Enroll first/);
  await assert.rejects(createApi(null, async () => new Response('<html>Bad gateway</html>', { status: 502 }))('/test'), /unexpected response/);
  await assert.rejects(createApi(null, async () => { throw new TypeError('network detail'); })('/test'), /Unable to connect/);
  await assert.rejects(createApi(null, async () => { throw new DOMException('Aborted', 'AbortError'); })('/test'), { name: 'AbortError' });
});
test('session restoration rejects malformed or unsupported sessions', () => {
  for (const value of [null, '{}', '{invalid', '{"role":"superadmin","token":"x"}', '{"role":"user","token":4}', '{"role":"user","token":""}']) {
    assert.equal(readSession({ getItem: () => value }), null);
  }
  assert.deepEqual(readSession({ getItem: () => '{"role":"user","token":"x"}' }), { role: 'user', token: 'x' });
  assert.equal(readSession({ getItem: () => { throw new Error('Storage disabled'); } }), null);
});
