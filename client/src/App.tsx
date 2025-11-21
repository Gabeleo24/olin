import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import MarketingNavbar from './components/MarketingNavbar';
import SettingsPage from './pages/SettingsPage';
import Dashboard from './pages/Dashboard';
import LandingPage from './pages/LandingPage';
import ProfilesPage from './pages/Profiles';

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Routes>
      {/* Marketing Routes */}
      <Route path="/" element={
        <>
          <MarketingNavbar />
          <LandingPage />
        </>
      } />

      {/* App Routes (Protected by Layout) */}
      <Route path="/dashboard" element={
        <Layout>
          <Dashboard />
        </Layout>
      } />
      <Route path="/profiles" element={
        <Layout>
          <ProfilesPage />
        </Layout>
      } />
      <Route path="/settings" element={
        <Layout>
          <SettingsPage />
        </Layout>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppRoutes />
      </Router>
    </QueryClientProvider>
  );
}
