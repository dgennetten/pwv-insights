import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { ActivityDashboardPage } from "./pages/ActivityDashboardPage";
import { AdminPage } from "./pages/AdminPage";
import { HelpPage } from "./pages/HelpPage";
import { LeaderboardsPage } from "./pages/LeaderboardsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrailsPage } from "./pages/TrailsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <ActivityDashboardPage /> },
      { path: "trails", element: <TrailsPage /> },
      { path: "leaderboards", element: <LeaderboardsPage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "help", element: <HelpPage /> },
    ],
  },
]);
