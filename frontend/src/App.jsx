import { useEffect, useMemo, useState } from 'react';
import { createApi, readSession } from './api.js';
import { Action, Empty, Heading, Modal } from './components.jsx';
import { Account, SignIn } from './Account.jsx';
import { Catalog, CourseDetails } from './Catalog.jsx';
import { Learning, Lessons } from './Learning.jsx';
import { Studio, ManageLessons } from './Studio.jsx';

export default function App() {
  const [session, setSession] = useState(() => { try { return readSession(window.sessionStorage); } catch { return null; } });
  const [route, setRoute] = useState(() => location.hash.slice(1) || 'catalog');
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const api = useMemo(() => createApi(session?.token), [session?.token]);
  useEffect(() => {
    const navigate = () => { setRoute(location.hash.slice(1) || 'catalog'); setModal(null); };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  function saveSession(value) {
    setSession(value);
    try { if (value) sessionStorage.setItem('course-session', JSON.stringify(value)); else sessionStorage.removeItem('course-session'); } catch { /* Continue with an in-memory session when storage is disabled. */ }
  }
  function navigate(next) { setRoute(next); location.hash = next; }
  const [page, id] = route.split('/');
  const active = page === 'learn' ? 'learning' : page === 'manage' ? 'studio' : page;
  const protectedRole = ['learning', 'learn'].includes(page) ? 'user' : ['studio', 'manage'].includes(page) ? 'admin' : null;
  const denied = (protectedRole && session?.role !== protectedRole) || (page === 'account' && !session);
  let content;
  if (denied) content = <><Heading title="Sign in required" text={protectedRole ? `Use a ${protectedRole === 'user' ? 'student' : 'instructor'} account to access this page.` : 'Sign in to manage your account.'} /><button className="primary" onClick={() => setModal({ type: 'auth' })}>Sign in</button></>;
  else if (page === 'learning') content = <Learning api={api} />;
  else if (page === 'learn' && id) content = <Lessons api={api} id={id} />;
  else if (page === 'studio') content = <Studio api={api} notify={setMessage} />;
  else if (page === 'manage' && id) content = <ManageLessons api={api} id={id} notify={setMessage} />;
  else if (page === 'account') content = <Account api={api} session={session} notify={setMessage} onPasswordChanged={() => { saveSession(null); setMessage('Password updated. Please sign in again.'); setModal({ type: 'auth' }); }} />;
  else if (page === 'catalog' || page === 'browse') content = <Catalog api={api} openCourse={id => setModal({ type: 'course', id })} />;
  else content = <><Heading title="Page not found" /><Empty><a href="#catalog">Return to the course catalog</a></Empty></>;
  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content').focus(); }}>Skip to content</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="#catalog"><span className="brand-mark" aria-hidden="true">CS</span><span>Course Studio<small>Learning platform</small></span></a>
      <nav aria-label="Main navigation"><a href="#catalog" aria-current={['catalog', 'browse'].includes(active) ? 'page' : undefined}>Catalog</a>{session?.role === 'user' && <a href="#learning" aria-current={active === 'learning' ? 'page' : undefined}>My learning</a>}{session?.role === 'admin' && <a href="#studio" aria-current={active === 'studio' ? 'page' : undefined}>Course management</a>}{session && <a href="#account" aria-current={active === 'account' ? 'page' : undefined}>Account</a>}</nav>
      {session ? <Action onClick={async () => { try { await api(`/${session.role}/logout`, { method: 'POST' }); } catch { setMessage('Local session cleared. Server sign-out could not be confirmed.'); } finally { saveSession(null); navigate('catalog'); } }}>Sign out</Action> : <button className="primary" onClick={() => setModal({ type: 'auth' })}>Sign in</button>}
    </div></header>
    <main id="main-content" tabIndex={-1} key={`${session?.role || 'guest'}-${session?.token || ''}-${route}`}>{content}</main>
    <footer><span>Course Studio</span><span>Courses · Learning · Progress</span></footer>
    {message && <div className="toast" role="status">{message}<button aria-label="Dismiss notification" onClick={() => setMessage('')}>×</button></div>}
    {modal?.type === 'auth' && <Modal title="Account access" onClose={() => setModal(null)}><SignIn api={api} onSession={value => { saveSession(value); setModal(null); navigate(value.role === 'admin' ? 'studio' : 'learning'); }} /></Modal>}
    {modal?.type === 'course' && <Modal title="Course details" onClose={() => setModal(null)}><CourseDetails api={api} id={modal.id} session={session} onSignIn={() => setModal({ type: 'auth' })} onEnrolled={() => { setModal(null); setMessage('You are enrolled in this course.'); navigate('learning'); }} /></Modal>}
  </>;
}
