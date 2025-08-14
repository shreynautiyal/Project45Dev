// src/App.tsx
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/layout/Layout';
import { Header } from './components/layout/Header';
import UpgradePro from './pages/upgrades';

// Public Pages
import { Landing } from './pages/Landing';
import Login from './pages/Auth/Login';
import Signup from './pages/Auth/Signup';
import SubjectSetup from './pages/Auth/SubjectSetup';
import 'katex/dist/katex.min.css';

// Protected Pages
import { Dashboard } from './pages/Dashboard';
import EssayMarking from './pages/Essays/EssayMarking';
import LearnHub from './pages/Learning/LearnHub';
import Leaderboard from './pages/Leaderboard/Leaderboard';
import Flashcards from './pages/Flashcards/Flashcards';

// NEW: Socials page (friends + profile hub)
import Socials from './pages/Profile/Profile';

/** Global background layer that sits behind the entire app */
function AppBackground() {
  return (
    <div className="fixed inset-0 -z-10 bg-gradient-to-br from-[#e8f0ff] via-white to-white">
      {/* optional ornaments grid */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, bootstrapped } = useAuthStore();
  if (!bootstrapped) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, bootstrapped } = useAuthStore();
  if (!bootstrapped) return <LoadingSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <>
      <Header />
      <main className="pt-16">{children}</main>
    </>
  );
}

function LandingRoute({ children }: { children: React.ReactNode }) {
  const { user, bootstrapped } = useAuthStore();
  if (!bootstrapped) return <LoadingSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  // Landing page doesn't need the global header or background
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, bootstrapped } = useAuthStore();
  if (!bootstrapped) return <LoadingSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  // Auth pages don't need the global header or background
  return <>{children}</>;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  // Run exactly once on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      {/* Background behind everything (navbar + pages) */}
      <AppBackground />

      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route
            path="/"
            element={
              <LandingRoute>
                <Landing />
              </LandingRoute>
            }
          />
          <Route
            path="/login"
            element={
              <AuthRoute>
                <Login />
              </AuthRoute>
            }
          />
          <Route
            path="/upgrade"
            element={
              <ProtectedRoute>
                <UpgradePro />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subject-setup"
            element={
              <ProtectedRoute>
                <SubjectSetup />
              </ProtectedRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <AuthRoute>
                <Signup />
              </AuthRoute>
            }
          />

          {/* Protected */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <LearnHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flashcards"
            element={
              <ProtectedRoute>
                <Flashcards />
              </ProtectedRoute>
            }
          />
          <Route
            path="/essays"
            element={
              <ProtectedRoute>
                <EssayMarking />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute>
                <Leaderboard />
              </ProtectedRoute>
            }
          />
          {/* NEW socials hub */}
          <Route
            path="/social"
            element={
              <ProtectedRoute>
                <Socials />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
