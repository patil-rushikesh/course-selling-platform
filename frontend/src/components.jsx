import { useEffect, useId, useRef, useState } from 'react';

export function useResource(api, path, version = 0) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: '', loading: true });
    api(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ data, error: '', loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ data: null, error: error.message, loading: false });
    });
    return () => controller.abort();
  }, [api, path, version]);
  return state;
}
export function Resource({ state, children }) {
  if (state.loading) return <p className="status" role="status">Loading…</p>;
  if (state.error) return <p className="error panel" role="alert">{state.error}</p>;
  return children(state.data);
}
export function Field({ label, as: Tag = 'input', ...props }) {
  return <label className={props.type === 'checkbox' ? 'checkbox' : ''}><span>{label}</span><Tag {...props} /></label>;
}
export function Form({ children, onSubmit, submit = 'Save changes', className = '' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <form className={className} onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try { await onSubmit(data); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy}>{children}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit">{busy ? 'Please wait…' : submit}</button>
    </fieldset>
  </form>;
}
export function Action({ children, onClick, className = '', disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <span className="action"><button type="button" className={className} disabled={disabled || busy} onClick={async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onClick(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }}>{busy ? 'Please wait…' : children}</button>{error && <span className="error" role="alert">{error}</span>}</span>;
}
export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={onClose}>
    <header className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}>×</button></header>
    {children}
  </dialog>;
}
export function Heading({ title, text, children }) {
  return <div className="page-heading"><div><h1>{title}</h1>{text && <p className="muted">{text}</p>}</div>{children}</div>;
}
export function Empty({ children }) { return <div className="empty">{children}</div>; }
export function CourseCard({ course, children }) {
  const [broken, setBroken] = useState(false);
  const validImage = /^https?:\/\//.test(course.imageURL || '');
  return <article className="course-card">
    {validImage && !broken ? <img className="course-image" src={course.imageURL} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <div className="course-placeholder" aria-hidden="true">Course Studio</div>}
    <div className="course-body"><span className="badge">{course.published === false ? 'Draft' : 'Free enrollment'}</span><h2>{course.title}</h2><p className="muted">{course.description}</p><div className="actions">{children}</div></div>
  </article>;
}
