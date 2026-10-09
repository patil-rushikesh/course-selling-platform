import { useState } from 'react';
import { Action, CourseCard, Empty, Heading, Resource, useResource } from './components.jsx';

export function Learning({ api }) {
  const state = useResource(api, '/user/purchases');
  return <><Heading title="My learning" text="Access your enrolled courses and track your progress." />
    <Resource state={state}>{({ courseData }) => courseData.length ? <div className="course-grid">{courseData.map(course => <CourseCard key={course.id} course={course}><a className="button" href={`#learn/${course.id}`}>Continue learning →</a></CourseCard>)}</div> : <Empty>You have not enrolled in a course yet. <a href="#catalog">Browse the catalog</a>.</Empty>}</Resource>
  </>;
}
export function Lessons({ api, id }) {
  const [version, setVersion] = useState(0);
  const state = useResource(api, `/user/courses/${id}/lessons`, version);
  const purchases = useResource(api, '/user/purchases');
  const title = purchases.data?.courseData.find(course => course.id === id)?.title || 'Course lessons';
  return <><a className="back-link" href="#learning">← My learning</a><Heading title={title} text="Complete each lesson to update your progress." />
    <Resource state={state}>{({ lessons }) => {
      const completed = lessons.filter(lesson => lesson.completed).length;
      const percent = lessons.length ? Math.round(completed / lessons.length * 100) : 0;
      return <><div className="progress-panel"><div><strong>{percent}% complete</strong><span>{completed} of {lessons.length} lessons</span></div><progress aria-label="Course completion" value={percent} max={100} /></div>
        {!lessons.length && <Empty>Lessons have not been added to this course yet.</Empty>}
        {lessons.map(lesson => <section className="panel lesson" key={lesson.id}>
          <div className="section-heading"><h2>{lesson.position + 1}. {lesson.title}</h2><span className="badge">{lesson.completed ? 'Completed' : 'Not completed'}</span></div>
          <div className="lesson-content">{lesson.content}</div>
          <div className="actions">{lesson.videoURL && /^https?:\/\//.test(lesson.videoURL) && <a href={lesson.videoURL} target="_blank" rel="noopener noreferrer" className="button">Open lesson video ↗</a>}
            <Action className={lesson.completed ? '' : 'primary'} onClick={async () => { await api(`/user/courses/${id}/lessons/${lesson.id}/progress`, { method: 'PUT', body: { completed: !lesson.completed } }); setVersion(v => v + 1); }}>{lesson.completed ? 'Mark incomplete' : 'Mark complete'}</Action>
          </div>
        </section>)}
      </>;
    }}</Resource>
  </>;
}
