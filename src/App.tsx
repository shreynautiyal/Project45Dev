import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/layout/Layout';
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

import StudyArena from './pages/StudyArena/StudyArena';

// NEW: Socials page (friends + profile hub)
import Socials from './pages/Profile/Profile';


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
  return <>{children}</>;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  // Run exactly once on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route
          path="/"
          element={
            <PublicRoute>
              <Landing />
            </PublicRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
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
            <PublicRoute>
              <Signup />
            </PublicRoute>
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

        
        <Route
          path="/arena"
          element={
            <ProtectedRoute>
              <StudyArena />
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
