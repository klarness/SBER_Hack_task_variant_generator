import { createBrowserRouter, Navigate } from "react-router-dom";
import { UploadPage } from "@/pages/Upload/UploadPage";
import { WorkspacePage } from "@/pages/Workspace/WorkspacePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <UploadPage />,
  },
  {
    path: "/workspace/:id",
    element: <WorkspacePage />,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
