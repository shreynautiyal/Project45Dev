import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Trophy,
  MessageCircle,
  Users,
  User as UserIcon,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export function Header() {
  const { user, profile, signOut } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (!user || !profile) return null;

  const navItems = [
    { path: '/dashboard', icon: BookOpen, label: 'Dashboard' },
    { path: '/flashcards', icon: BookOpen, label: 'Flashcards' },
    { path: '/chat', icon: MessageCircle, label: 'AI Chat' },
    { path: '/essays', icon: BookOpen, label: 'Essays' },
    { path: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { path: '/social', icon: Users, label: 'Profile' },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo (B/W) */}
          <Link to="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center">
              <span className="font-bold text-sm">45</span>
            </div>
            <span className="text-xl font-bold text-black">Project 45</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-black text-white'
                      : 'text-gray-700 hover:text-black hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right side: Avatar (no dropdown) */}
          <div className="flex items-center gap-3">
            {/* Sign out (optional small button). Remove if you don't want it here. */}
            <button
              onClick={handleSignOut}
              className="hidden sm:inline-flex px-3 py-1.5 rounded-md border text-sm text-gray-700 hover:bg-gray-100"
            >
              Sign out
            </button>

            {/* Avatar links to Profile */}
            <Link
              to="/social"
              className="w-9 h-9 rounded-full overflow-hidden bg-white border border-gray-300 flex items-center justify-center"
              title={profile.username}
            >
              {profile.profile_picture ? (
                <img
                  src={profile.profile_picture}
                  alt={profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="h-5 w-5 text-black" />
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
