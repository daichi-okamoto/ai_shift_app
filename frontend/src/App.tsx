import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import LoadingScreen from './components/LoadingScreen'
import { useAuth } from './features/auth/AuthContext'
import AvailabilityLandingPage from './pages/AvailabilityLandingPage'
import AvailabilityRequestPage from './pages/AvailabilityRequestPage'
import DashboardPage from './pages/DashboardPage'
import EmployeeFormPage from './pages/EmployeeFormPage'
import EmployeesPage from './pages/EmployeesPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import UnitSchedulePage from './pages/UnitSchedulePage'
import UnitManagementPage from './pages/UnitManagementPage'

function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingScreen message="セッションを確認しています…" />
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route element={user ? <AppShell /> : <Navigate to="/login" replace />}>
        <Route index element={<DashboardPage />} />
        <Route path="availability" element={<AvailabilityLandingPage />} />
        <Route path="units/:unitId" element={<UnitSchedulePage />} />
        <Route path="units/:unitId/availability" element={<AvailabilityRequestPage />} />
        <Route
          path="units/manage"
          element={['admin', 'leader'].includes(user?.role ?? '') ? <UnitManagementPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="employees"
          element={user?.role === 'admin' ? <EmployeesPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="employees/new"
          element={user?.role === 'admin' ? <EmployeeFormPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="employees/:employeeId"
          element={user?.role === 'admin' ? <EmployeeFormPage /> : <Navigate to="/" replace />}
        />
      </Route>
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  )
}

export default App
