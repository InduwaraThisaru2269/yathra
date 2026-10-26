import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/session';
import { ProjectShell } from './components/AppShell';
import { YathraLogo } from './components/ui';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from './pages/AuthPages';
import { BacklogPage } from './pages/BacklogPage';
import { BaBoardPage, DevBoardPage } from './pages/BoardPages';
import { ProjectsPage } from './pages/HomePages';
import { ReportsPage } from './pages/ReportsPage';
import { RetroPage } from './pages/RetroPage';
import { SettingsPage } from './pages/SettingsPage';
import { WikiPageScreen } from './pages/WikiPage';

export function App() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="login" aria-busy="true">
        <YathraLogo size={56} />
      </div>
    );
  }

  return (
    <Routes>
      {/* Email links work whether or not someone is already signed in. */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {status === 'signedOut' ? (
        <>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
        </>
      ) : (
        <>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/p/:key" element={<ProjectShell />}>
            <Route index element={<Navigate to="backlog" replace />} />
            <Route path="backlog" element={<BacklogPage />} />
            <Route path="board" element={<DevBoardPage />} />
            <Route path="ba-board" element={<BaBoardPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="retro" element={<RetroPage />} />
            <Route path="retro/:sprintId" element={<RetroPage />} />
            <Route path="wiki" element={<WikiPageScreen />} />
            <Route path="wiki/:pageId" element={<WikiPageScreen />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
