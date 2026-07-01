import { Routes, Route, Navigate } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'
import AdminLayout from './AdminLayout'
import AdminDashboard from './AdminDashboard'
import AdminUsers from './AdminUsers'
import AdminFeedback from './AdminFeedback'
import AdminAnalytics from './AdminAnalytics'

/* ════════════════════════════════════════════════════════════════
   AdminApp — the /admin route tree. Mounted by App.jsx only after the
   email gate passes, so every screen here can assume an authorised
   owner. Unknown /admin/* paths fall back to the dashboard.
   ════════════════════════════════════════════════════════════════ */
export default function AdminApp() {
  return (
    <AdminLayout>
      <Routes>
        <Route path={ROUTES.ADMIN} element={<AdminDashboard />} />
        <Route path={ROUTES.ADMIN_USERS} element={<AdminUsers />} />
        <Route path={ROUTES.ADMIN_FEEDBACK} element={<AdminFeedback />} />
        <Route path={ROUTES.ADMIN_ANALYTICS} element={<AdminAnalytics />} />
        <Route path="*" element={<Navigate to={ROUTES.ADMIN} replace />} />
      </Routes>
    </AdminLayout>
  )
}
