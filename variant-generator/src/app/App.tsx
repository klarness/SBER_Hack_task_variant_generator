import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { queryClient } from "./queryClient";
import { router } from "./routes";
import { DesktopGuard } from "./DesktopGuard";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DesktopGuard>
        <RouterProvider router={router} />
      </DesktopGuard>
    </QueryClientProvider>
  );
}
