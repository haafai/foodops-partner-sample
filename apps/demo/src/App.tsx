import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ModeBanner } from './components/ModeBanner';
import { useSession } from './config/SessionProvider';
import { SetupPage } from './pages/SetupPage';

export function App() {
  const { client } = useSession();
  return (
    <div className="min-h-screen">
      <ModeBanner />
      <nav className="flex gap-4 border-b bg-white px-4 py-2 text-sm">
        <Link to="/setup">Setup</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to={client ? '/outlets' : '/setup'} replace />} />
          <Route path="/setup" element={<SetupPage />} />
        </Routes>
      </main>
    </div>
  );
}
