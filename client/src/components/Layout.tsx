import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Menu, X } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm relative z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
             {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            
            <Link to="/dashboard" className="text-xl font-bold text-indigo-600">
              Olin
            </Link>
            
            {/* Desktop Nav */}
            <nav className="hidden md:flex gap-6 ml-4">
              <Link
                to="/dashboard"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  isActive('/dashboard')
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-600 hover:text-indigo-600'
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/profiles"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  isActive('/profiles')
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-600 hover:text-indigo-600'
                }`}
              >
                Profiles
              </Link>
              <Link
                to="/settings"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  isActive('/settings')
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-600 hover:text-indigo-600'
                }`}
              >
                Settings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {session ? (
              <>
            <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-gray-900">{session.user.email}</p>
                  <p className="text-xs text-gray-500">Authenticated</p>
            </div>
            <button
                  onClick={signOut}
              className="hidden md:block rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Logout
            </button>
              </>
            ) : (
              <Link
                to="/profiles"
                className="hidden md:block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="absolute top-16 left-0 w-full bg-white border-b shadow-lg md:hidden p-4 flex flex-col gap-4">
            <Link
              to="/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-md text-base font-medium ${
                isActive('/dashboard') ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/profiles"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-md text-base font-medium ${
                isActive('/profiles') ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Profiles
            </Link>
            <Link
              to="/settings"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-md text-base font-medium ${
                isActive('/settings') ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Settings
            </Link>
            <div className="border-t pt-4 mt-2">
              {session ? (
                <>
                <div className="px-4 mb-4">
                    <p className="font-medium text-gray-900">{session.user.email}</p>
                    <p className="text-sm text-gray-500">Authenticated</p>
                </div>
                <button
                    onClick={signOut}
                  className="w-full text-left px-4 py-3 rounded-md text-base font-medium text-red-600 hover:bg-red-50"
                >
                  Logout
                </button>
                </>
              ) : (
                <Link
                  to="/profiles"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full rounded-md bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden min-h-0 relative z-0">{children}</main>
    </div>
  );
}
