import { createBrowserRouter, Navigate } from "react-router-dom";
import { HomePage } from "@/pages/Home/HomePage";
import { LibraryPage } from "@/pages/Library/LibraryPage";
import { UploadPage } from "@/pages/Upload/UploadPage";
import { WorkspacePage } from "@/pages/Workspace/WorkspacePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/upload",
    element: <UploadPage />,
  },
  {
    path: "/workspace/:id",
    element: <WorkspacePage />,
  },
  {
    path: "/library",
    element: <LibraryPage />,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
