import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { ActivityDashboardPage } from "./pages/ActivityDashboardPage";
import { AdminPage } from "./pages/AdminPage";
import { HelpPage } from "./pages/HelpPage";
import { LeaderboardsPage } from "./pages/LeaderboardsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { DataLoggerPage } from "./pages/DataLoggerPage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrailsPage } from "./pages/TrailsPage";
import { TrailLogMapPage } from "./pages/TrailLogMapPage";

export const router = createBrowserRouter([
  { path: "/trail-log",        element: <TrailLogMapPage /> },
  { path: "/trail-log/:logId", element: <TrailLogMapPage /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <ActivityDashboardPage /> },
      { path: "schedule", element: <SchedulePage /> },
      { path: "data-logger", element: <DataLoggerPage /> },
      { path: "trails", element: <TrailsPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "leaderboards", element: <LeaderboardsPage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "help", element: <HelpPage /> },
    ],
  },
]);
