// src/pages/Settings/Settings.tsx
import React, { useState, useEffect, ChangeEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [email, setEmail] = useState(user?.email || '');
  const [loadingEmail, setLoadingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light')
  );

  // Apply theme class and persist
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Update email via Supabase Auth
  const handleEmailUpdate = async () => {
    setLoadingEmail(true);
    const { error } = await supabase.auth.updateUser({ email });
    if (error) {
      toast.error('Failed to update email.');
      console.error(error);
    } else {
      toast.success('Email updated! Please verify if prompted.');
    }
    setLoadingEmail(false);
  };

  // Update password via Supabase Auth
  const handlePasswordUpdate = async () => {
    if (!newPassword) return toast.error('Enter a new password.');
    setLoadingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error('Failed to update password.');
      console.error(error);
    } else {
      toast.success('Password updated!');
      setCurrentPassword('');
      setNewPassword('');
    }
    setLoadingPassword(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <h1 className="text-3xl font-extrabold">⚙️ Settings</h1>

      {/* Account Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button onClick={handleEmailUpdate} disabled={loadingEmail}>
            {loadingEmail ? 'Updating…' : 'Update Email'}
          </Button>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>
          <Button onClick={handlePasswordUpdate} disabled={loadingPassword}>
            {loadingPassword ? 'Updating…' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
          <Button
            variant="outline"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
