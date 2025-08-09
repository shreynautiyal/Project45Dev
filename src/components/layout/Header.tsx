import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  LogOut,
  Trophy,
  MessageCircle,
  Settings,
  Zap,
  Users,
  User as UserIcon,
  Target, // Study Arena icon
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { getXPProgress } from '../../lib/utils';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown';

export function Header() {
  const { user, profile, signOut } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (!user || !profile) return null;

  const xpProgress = getXPProgress(profile.xp);

  const navItems = [
    { path: '/dashboard', icon: BookOpen, label: 'Dashboard' },
    { path: '/flashcards', icon: BookOpen, label: 'Flashcards' },
    { path: '/chat', icon: MessageCircle, label: 'AI Chat' },
    { path: '/essays', icon: BookOpen, label: 'Essays' },
    { path: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { path: '/social', icon: Users, label: 'Friends' },
    { path: '/arena', icon: Target, label: 'Study Arena' }, // Added directly here
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">45</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Project 45</span>
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
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                <UserIcon className="h-4 w-4 text-white" />
              </div>
              <span className="hidden md:block text-sm font-medium text-gray-700">
                {profile.username}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="py-3 px-4 border-b border-gray-100">
                <p className="text-sm font-semibold">{profile.username}</p>
                <p className="text-sm text-gray-500">
                  <Zap className="inline-block h-4 w-4 text-orange-600 mr-1" />
                  Level {xpProgress.level} • {profile.xp} XP
                </p>
                <p className="text-sm text-red-600 mt-1">
                  🔥 {profile.streak}-day streak
                </p>
              </div>

              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center space-x-2">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center space-x-2 text-red-600"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
