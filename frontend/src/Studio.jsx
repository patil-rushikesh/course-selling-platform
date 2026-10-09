import { useState } from 'react';
import { Action, Empty, Field, Form, Heading, Modal, Resource, useResource } from './components.jsx';

export function CourseForm({ api, course, onSaved }) {
  return <Form submit={course ? 'Save course' : 'Create course'} onSubmit={async data => {
    await api(course ? `/admin/course/${course.id}` : '/admin/course', { method: course ? 'PUT' : 'POST', body: { ...data, published: data.published === 'on', price: course?.price ?? 0 } }); onSaved();
  }}>
    <Field label="Course title" name="title" defaultValue={course?.title || ''} minLength={3} required />
    <Field label="Description" as="textarea" name="description" defaultValue={course?.description || ''} minLength={10} rows={5} required />
    <Field label="Cover image URL" name="imageURL" type="url" defaultValue={course?.imageURL || ''} placeholder="https://example.com/course.jpg" required />
    <Field label="Publish in the course catalog" name="published" type="checkbox" defaultChecked={course?.published || false} />
    <p className="muted small">All courses are free to enroll in.</p>
  </Form>;
}
export function Studio({ api, notify }) {
  const [version, setVersion] = useState(0);
  const [edit, setEdit] = useState(null);
  const [remove, setRemove] = useState(null);
  const state = useResource(api, '/admin/course/view-all', version);
  const stats = useResource(api, '/admin/dashboard', version);
  const refresh = () => setVersion(v => v + 1);
  return <><Heading title="Course management" text="Manage your courses, lesson content, and publishing status."><button className="primary" onClick={() => setEdit({})}>Create course</button></Heading>
    <div className="stats"><div><span>Courses</span><strong>{stats.loading ? '—' : stats.data?.courses ?? 'Unavailable'}</strong></div><div><span>Enrollments</span><strong>{stats.loading ? '—' : stats.data?.enrollments ?? 'Unavailable'}</strong></div></div>
    {stats.error && <p className="error" role="alert">{stats.error}</p>}
    <Resource state={state}>{({ courses }) => courses.length ? <div className="table-wrap"><table><caption className="sr-only">Your courses</caption><thead><tr><th>Course</th><th>Status</th><th>Actions</th></tr></thead><tbody>{courses.map(course => <tr key={course.id}>
      <td><strong>{course.title}</strong><p className="muted small">{course.description.slice(0, 120)}</p></td><td><span className="badge">{course.published ? 'Published' : 'Draft'}</span></td>
      <td><div className="actions"><a href={`#manage/${course.id}`} className="button">Lessons</a><button onClick={() => setEdit(course)}>Edit</button><Action onClick={async () => { await api(`/admin/course/${course.id}`, { method: 'PUT', body: { published: !course.published } }); refresh(); }}>{course.published ? 'Unpublish' : 'Publish'}</Action><button className="danger" onClick={() => setRemove(course)}>Delete</button></div></td>
    </tr>)}</tbody></table></div> : <Empty>No courses yet. Create a course to get started.</Empty>}</Resource>
    {edit && <Modal title={edit.id ? 'Edit course' : 'Create course'} onClose={() => setEdit(null)}><CourseForm api={api} course={edit.id ? edit : null} onSaved={() => { setEdit(null); refresh(); notify('Course saved.'); }} /></Modal>}
    {remove && <Modal title="Delete course" onClose={() => setRemove(null)}><p>Delete “{remove.title}”? This cannot be undone. Courses with enrollments cannot be deleted.</p><Action className="danger" onClick={async () => { await api(`/admin/course/${remove.id}`, { method: 'DELETE' }); setRemove(null); refresh(); notify('Course deleted.'); }}>Delete course</Action></Modal>}
  </>;
}
function LessonForm({ api, id, lesson, nextPosition, onSaved }) {
  return <Form submit="Save lesson" onSubmit={async data => {
    await api(`/admin/course/${id}/lessons${lesson ? '/' + lesson.id : ''}`, { method: lesson ? 'PATCH' : 'POST', body: { ...data, position: Number(data.position), videoURL: data.videoURL || null } }); onSaved();
  }}>
    <Field label="Lesson title" name="title" defaultValue={lesson?.title || ''} minLength={3} maxLength={200} required />
    <Field label="Position (starting at 0)" name="position" type="number" defaultValue={lesson?.position ?? nextPosition} min={0} max={10000} step={1} required />
    <Field label="Lesson content" name="content" as="textarea" rows={8} defaultValue={lesson?.content || ''} maxLength={50000} required />
    <Field label="Video URL (optional)" name="videoURL" type="url" defaultValue={lesson?.videoURL || ''} />
  </Form>;
}
export function ManageLessons({ api, id, notify }) {
  const [version, setVersion] = useState(0);
  const [edit, setEdit] = useState(null);
  const [remove, setRemove] = useState(null);
  const state = useResource(api, `/admin/course/${id}/lessons`, version);
  const courses = useResource(api, '/admin/course/view-all');
  const title = courses.data?.courses.find(course => course.id === id)?.title || 'Manage lessons';
  const nextPosition = Math.max(-1, ...(state.data?.lessons || []).map(lesson => lesson.position)) + 1;
  const refresh = () => setVersion(v => v + 1);
  return <><a className="back-link" href="#studio">← Course management</a><Heading title={title} text="Add and arrange the lessons in this course."><button className="primary" onClick={() => setEdit({})}>Add lesson</button></Heading>
    <Resource state={state}>{({ lessons }) => lessons.length ? lessons.map(lesson => <section className="panel" key={lesson.id}><div className="section-heading"><h2>{lesson.position + 1}. {lesson.title}</h2><div className="actions"><button onClick={() => setEdit(lesson)}>Edit</button><button className="danger" onClick={() => setRemove(lesson)}>Delete</button></div></div><p className="muted">{lesson.content.slice(0, 200)}</p></section>) : <Empty>No lessons yet. Add a lesson to this course.</Empty>}</Resource>
    {edit && <Modal title={edit.id ? 'Edit lesson' : 'Add lesson'} onClose={() => setEdit(null)}><LessonForm api={api} id={id} lesson={edit.id ? edit : null} nextPosition={nextPosition} onSaved={() => { setEdit(null); refresh(); notify('Lesson saved.'); }} /></Modal>}
    {remove && <Modal title="Delete lesson" onClose={() => setRemove(null)}><p>Delete “{remove.title}”? Its content and student completion records will be removed.</p><Action className="danger" onClick={async () => { await api(`/admin/course/${id}/lessons/${remove.id}`, { method: 'DELETE' }); setRemove(null); refresh(); notify('Lesson deleted.'); }}>Delete lesson</Action></Modal>}
  </>;
}
