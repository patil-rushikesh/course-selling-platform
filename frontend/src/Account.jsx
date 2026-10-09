import { useState } from 'react';
import { Field, Form, Heading, Resource, useResource } from './components.jsx';

export function SignIn({ api, onSession }) {
  const [register, setRegister] = useState(false);
  const [role, setRole] = useState('user');
  return <div>
    <p className="muted">{register ? 'Create an account to enroll in courses.' : 'Enter your account details to continue.'}</p>
    <Form key={String(register)} submit={register ? 'Create account' : 'Sign in'} onSubmit={async data => {
      const { invitation, ...credentials } = data;
      if (register) await api(`/${role}/signup`, { method: 'POST', body: credentials, headers: role === 'admin' ? { 'X-Admin-Signup-Key': invitation } : {} });
      const result = await api(`/${role}/signin`, { method: 'POST', body: { email: data.email, password: data.password } });
      onSession({ role, token: result.token });
    }}>
      <Field label="Account type" as="select" value={role} onChange={e => setRole(e.target.value)}>
        <option value="user">Student</option><option value="admin">Instructor / admin</option>
      </Field>
      <Field label="Email address" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" minLength={6} maxLength={72} autoComplete={register ? 'new-password' : 'current-password'} required />
      {register && <><div className="form-row"><Field label="First name" name="firstName" minLength={3} autoComplete="given-name" required /><Field label="Last name" name="lastName" minLength={3} autoComplete="family-name" required /></div>
        {role === 'admin' && <Field label="Admin invitation key" name="invitation" type="password" autoComplete="off" required />}</>}
    </Form>
    <button type="button" className="text-button" onClick={() => setRegister(!register)}>{register ? 'Already registered? Sign in' : 'Create a new account'}</button>
  </div>;
}
export function Account({ api, session, onPasswordChanged, notify }) {
  const state = useResource(api, `/${session.role}/me`);
  return <><Heading title="Account settings" text="Manage your profile and account security." />
    <Resource state={state}>{({ profile }) => <div className="settings-grid">
      <section className="panel"><h2>Profile</h2><p className="muted">{profile.email}</p>
        <Form onSubmit={async body => { await api(`/${session.role}/me`, { method: 'PATCH', body }); notify('Profile updated.'); }}>
          <Field label="First name" name="firstName" defaultValue={profile.firstName} minLength={3} maxLength={100} required />
          <Field label="Last name" name="lastName" defaultValue={profile.lastName} minLength={3} maxLength={100} required />
        </Form>
      </section>
      <section className="panel"><h2>Change password</h2><p className="muted">This signs you out of all active sessions.</p>
        <Form submit="Update password" onSubmit={async body => { await api(`/${session.role}/me/password`, { method: 'PATCH', body }); onPasswordChanged(); }}>
          <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
          <Field label="New password" name="newPassword" type="password" autoComplete="new-password" minLength={6} maxLength={72} required />
        </Form>
      </section>
    </div>}</Resource>
  </>;
}
