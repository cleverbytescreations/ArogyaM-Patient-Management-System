import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Nav } from "./Nav";
import { BrandLogo } from "./BrandLogo";
import { useAuth } from "@/auth/AuthContext";
import { useSessionTimeout } from "@/lib/session";
import { APP_NAME } from "@/lib/constants";
import { UserMenu } from "@/features/auth/UserMenu";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout } = useAuth();

  useSessionTimeout(logout);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 transform bg-card border-r transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:relative lg:translate-x-0 lg:flex lg:flex-col
        `}
        aria-label="Sidebar"
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <Link
            to="/"
            aria-label={`${APP_NAME} — go to dashboard`}
            className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandLogo variant="wordmark" className="h-7 w-auto" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <Nav onNavigate={() => setSidebarOpen(false)} />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b bg-card px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>

          <div className="hidden lg:block" />

          <UserMenu />
        </header>

        <Separator />

        {/* Page content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-4 lg:p-6"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
