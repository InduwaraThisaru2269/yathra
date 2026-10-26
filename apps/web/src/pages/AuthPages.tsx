import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GoogleButton } from '../auth/google';
import { microsoftConfigured, microsoftToken } from '../auth/msal';
import { ApiError, authPost, getProviders, setSession, type SessionPayload } from '../auth/session';
import { YathraLogo } from '../components/ui';

const PASSWORD_MIN = 10;

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="login">
      <div className="panel login-card">
        <div className="row" style={{ gap: 12 }}>
          <YathraLogo size={44} />
          <span style={{ fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>Yathra</span>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.02em' }}>{title}</h1>
          {subtitle && <p className="muted" style={{ margin: '6px 0 0' }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <div className="hold-note" role="alert">
      {error}
    </div>
  ) : null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Microsoft and Google buttons; each shows only when the API has that provider configured. */
function ProviderButtons({ onError }: { onError: (msg: string) => void }) {
  const navigate = useNavigate();
  const { data: providers } = useQuery({ queryKey: ['auth-providers'], queryFn: getProviders, staleTime: Infinity });
  const [busy, setBusy] = useState(false);

  const finish = (p: SessionPayload) => {
    setSession(p);
    navigate('/', { replace: true });
  };

  const onGoogle = useCallback(
    (credential: string) =>
      authPost<SessionPayload>('google', { token: credential })
        .then((p) => {
          setSession(p);
          navigate('/', { replace: true });
        })
        .catch((e) => onError(message(e))),
    [onError, navigate],
  );
  const onGoogleError = useCallback((e: Error) => onError(e.message), [onError]);

  const showMicrosoft = providers?.microsoft && microsoftConfigured;
  if (!providers || (!showMicrosoft && !providers.google)) return null;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
        {showMicrosoft && (
          <button
            className="btn"
            type="button"
            style={{ minHeight: 46 }}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                finish(await authPost<SessionPayload>('microsoft', { token: await microsoftToken() }));
              } catch (e) {
                if (!(e instanceof Error && /user_cancelled|popup_window_error/i.test(e.message))) onError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Continue with Microsoft
          </button>
        )}
        {providers.google && <GoogleButton clientId={providers.google.clientId} onCredential={onGoogle} onError={onGoogleError} />}
      </div>
      <div className="row muted" style={{ fontSize: 13 }}>
        <span style={{ flex: 1, borderTop: '2px dashed #E1E1EE' }} />
        or with email
        <span style={{ flex: 1, borderTop: '2px dashed #E1E1EE' }} />
      </div>
    </>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSession(await authPost<SessionPayload>('login', { email, password }));
      navigate('/', { replace: true });
    } catch (err) {
      setUnverified(err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED');
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in" subtitle="Every project's journey, from plan to release.">
      <ErrorNote error={error} />
      {notice && <div className="panel" style={{ padding: 12, boxShadow: 'none', background: '#DDFBEF' }}>{notice}</div>}
      <ProviderButtons onError={setError} />
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          Email
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        <label className="field">
          <span className="row">
            Password
            <Link to="/forgot-password" className="spacer" style={{ fontWeight: 600, fontSize: 13 }}>
              Forgot password?
            </Link>
          </span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={busy} style={{ minHeight: 46 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {unverified && (
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const r = await authPost<{ message: string }>('resend-verification', { email }).catch((e) => ({ message: message(e) }));
              setNotice(r.message);
              setUnverified(false);
              setError(null);
            }}
          >
            Send the verification link again
          </button>
        )}
      </form>
      <p style={{ margin: 0 }}>
        New to Yathra? <Link to="/signup" style={{ fontWeight: 700 }}>Create an account</Link>
      </p>
    </AuthCard>
  );
}

export function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <AuthCard title="Check your inbox" subtitle={sent}>
        <p style={{ margin: 0 }}>
          Open the link we sent to <b>{email}</b> to finish creating your account. It expires in 24 hours.
        </p>
        <Link className="btn" to="/login">Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" subtitle="You'll see projects once a project PM adds you.">
      <ErrorNote error={error} />
      <ProviderButtons onError={setError} />
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await authPost<{ message: string }>('register', { name, email, password });
            setSent(r.message);
          } catch (err) {
            setError(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Full name
          <input className="input" autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nimal Perera" />
        </label>
        <label className="field">
          Email
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        <label className="field">
          Password
          <input className="input" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>
            At least {PASSWORD_MIN} characters. A short sentence works well.
          </span>
        </label>
        <button className="btn primary" type="submit" disabled={busy} style={{ minHeight: 46 }}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p style={{ margin: 0 }}>
        Already have an account? <Link to="/login" style={{ fontWeight: 700 }}>Sign in</Link>
      </p>
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // The link works once, so make sure React's development double-render does not spend it twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('token');
    if (!token) {
      setError('This link is missing its token.');
      return;
    }
    authPost<SessionPayload>('verify-email', { token })
      .then((p) => {
        setSession(p);
        navigate('/', { replace: true });
      })
      .catch((e) => setError(message(e)));
  }, [params, navigate]);

  return (
    <AuthCard title={error ? "Couldn't verify your email" : 'Verifying your email…'}>
      <ErrorNote error={error} />
      {error && (
        <p style={{ margin: 0 }}>
          Sign in to get a new link sent, or <Link to="/signup">sign up again</Link>.
        </p>
      )}
      {error && <Link className="btn" to="/login">Back to sign in</Link>}
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      <ErrorNote error={error} />
      {sent ? (
        <div className="panel" style={{ padding: 12, boxShadow: 'none', background: '#DDFBEF' }}>{sent}</div>
      ) : (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              setSent((await authPost<{ message: string }>('forgot-password', { email })).message);
            } catch (err) {
              setError(message(err));
            }
          }}
        >
          <label className="field">
            Email
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </label>
          <button className="btn primary" type="submit" style={{ minHeight: 46 }}>Send reset link</button>
        </form>
      )}
      <Link to="/login" style={{ fontWeight: 700 }}>Back to sign in</Link>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AuthCard title="Choose a new password" subtitle="This signs you out on every other device.">
      <ErrorNote error={error} />
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) return setError("The passwords don't match.");
          setBusy(true);
          setError(null);
          try {
            setSession(await authPost<SessionPayload>('reset-password', { token: params.get('token') ?? '', password }));
            navigate('/', { replace: true });
          } catch (err) {
            setError(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          New password
          <input className="input" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          Confirm new password
          <input className="input" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={busy} style={{ minHeight: 46 }}>
          Save password and sign in
        </button>
      </form>
    </AuthCard>
  );
}
