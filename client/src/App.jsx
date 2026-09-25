import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import DashboardPage from './pages/DashboardPage';
import ResearchWorkspace from './pages/ResearchWorkspace';

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(20, 20, 40, 0.95)',
            color: '#f0f0ff',
            border: '1px solid rgba(108, 99, 255, 0.3)',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
          },
          success: { iconTheme: { primary: '#00d4aa', secondary: '#0a0a12' } },
          error: { iconTheme: { primary: '#ff6584', secondary: '#0a0a12' } },
        }}
      />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workspace/:id" element={<ResearchWorkspace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
