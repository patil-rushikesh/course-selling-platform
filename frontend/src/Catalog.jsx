import { useState } from 'react';
import { Action, CourseCard, Empty, Field, Heading, Resource, useResource } from './components.jsx';

export function Catalog({ api, openCourse }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const state = useResource(api, `/course?${new URLSearchParams({ q: query, page, limit: 9, sort: 'title' })}`);
  return <>
    <Heading title="Course catalog" text="Explore available courses and continue your professional development." />
    <form className="search-bar" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(new FormData(event.currentTarget).get('query').trim()); }}>
      <Field label="Search courses" name="query" type="search" placeholder="Search by title or topic" maxLength={200} />
      <button className="primary" type="submit">Search</button>
    </form>
    <Resource state={state}>{({ courses, pagination }) => <>
      <div className="section-label"><span>Available courses</span><span>{pagination.total} results · Free enrollment</span></div>
      <div className="course-grid">{courses.map(course => <CourseCard key={course.id} course={course}><button type="button" onClick={() => openCourse(course.id)}>View course <span aria-hidden="true">→</span></button></CourseCard>)}</div>
      {!courses.length && <Empty>No courses match your search. Try another topic or check back later.</Empty>}
      <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {Math.max(1, pagination.totalPages)}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </>}</Resource>
  </>;
}
export function CourseDetails({ api, id, session, onSignIn, onEnrolled }) {
  const state = useResource(api, `/course/${id}`);
  return <Resource state={state}>{({ course }) => <>
    <span className="badge">Free enrollment</span><h3>{course.title}</h3><p className="description">{course.description}</p>
    {session?.role === 'admin' ? <p className="muted">Use a student account to enroll in this course.</p> : <Action className="primary" onClick={async () => {
      if (!session) return onSignIn();
      await api('/course/purchase', { method: 'POST', body: { courseId: id } }); onEnrolled();
    }}>{session ? 'Enroll in course' : 'Sign in to enroll'}</Action>}
  </>}</Resource>;
}
