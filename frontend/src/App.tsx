import { Navigate, Route, Routes } from "react-router-dom"
import { useAuth } from "./auth/AuthContext"
import { ProtectedRoute } from "./auth/ProtectedRoute"
import { CLINICAL_ROLES, homePathFor, PATIENT_EDITOR_ROLES, REPORT_ROLES, USER_MANAGER_ROLES } from "./auth/roles"
import { AppLayout } from "./components/layout/AppLayout"
import { Spinner } from "./components/ui/Spinner"
import { UsersPage } from "./pages/admin/UsersPage"
import { CardPage } from "./pages/card/CardPage"
import { CardPrintPage } from "./pages/card/CardPrintPage"
import { ChartsPage } from "./pages/ChartsPage"
import { LabPage } from "./pages/LabPage"
import { LoginPage } from "./pages/LoginPage"
import { ForbiddenPage, NotFoundPage } from "./pages/ErrorPages"
import { OperationFormPage } from "./pages/OperationFormPage"
import { PatientFormPage } from "./pages/PatientFormPage"
import { PatientsPage } from "./pages/PatientsPage"
import { ProfilePage } from "./pages/ProfilePage"
import { ProtocolPage } from "./pages/protocol/ProtocolPage"
import { ProtocolPrintPage } from "./pages/protocol/ProtocolPrintPage"
import { ReportsPage } from "./pages/ReportsPage"

function HomeRedirect() {
  const { status, user } = useAuth()
  if (status === "loading") return <Spinner className="p-8" />
  return <Navigate to={user ? homePathFor(user.role) : "/login"} replace />
}

const clinical = (element: JSX.Element) => <ProtectedRoute roles={CLINICAL_ROLES}>{element}</ProtectedRoute>

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="/patients" element={clinical(<PatientsPage />)} />
        <Route path="/patients/new" element={<ProtectedRoute roles={PATIENT_EDITOR_ROLES}><PatientFormPage /></ProtectedRoute>} />
        <Route path="/patients/:patientId/edit" element={<ProtectedRoute roles={PATIENT_EDITOR_ROLES}><PatientFormPage /></ProtectedRoute>} />
        <Route path="/patients/:patientId/operations/new" element={<ProtectedRoute roles={PATIENT_EDITOR_ROLES}><OperationFormPage /></ProtectedRoute>} />
        <Route path="/operations/:operationId/edit" element={<ProtectedRoute roles={PATIENT_EDITOR_ROLES}><OperationFormPage /></ProtectedRoute>} />
        <Route path="/operations/:operationId/protocol" element={clinical(<ProtocolPage />)} />
        <Route path="/operations/:operationId/card" element={clinical(<CardPage />)} />
        <Route path="/operations/:operationId/charts" element={clinical(<ChartsPage />)} />
        <Route path="/operations/:operationId/labs" element={clinical(<LabPage />)} />
        <Route path="/operations/:operationId/card/print" element={clinical(<CardPrintPage />)} />
        <Route path="/operations/:operationId/protocol/print" element={clinical(<ProtocolPrintPage />)} />
        <Route path="/reports" element={<ProtectedRoute roles={REPORT_ROLES}><ReportsPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute roles={USER_MANAGER_ROLES}><UsersPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
