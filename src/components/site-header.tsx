import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

const navItems: { to: string; label: string; exact?: boolean }[] = [
  { to: "/", label: "Home", exact: true },
  { to: "/about", label: "About" },
  { to: "/services", label: "Services" },
  { to: "/pricing", label: "Pricing" },
  { to: "/compare", label: "Features" },
  { to: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent font-mono text-sm font-bold text-accent-foreground">
            TP
          </span>
          <span className="font-mono text-sm font-semibold tracking-[0.2em] text-foreground">
            TP-CAMP
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 text-sm lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={item.exact ? { exact: true } : undefined}
              className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <>
              <Link
                to="/dashboard"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                aria-label="Sign out"
                className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
            className="rounded-lg border border-border p-2 text-muted-foreground lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border/60 px-5 py-3 lg:hidden">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
              activeOptions={item.exact ? { exact: true } : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 text-sm text-muted-foreground">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">
          TP-CAMP ONESUITE · BETA VERSION V1.0
        </p>
        <p>
          Run your music business—not just your music. Built in Trinidad and Tobago for Caribbean
          artists and the world by extension.
        </p>
        <div className="flex flex-wrap gap-4 pt-2">
          <Link to="/about" className="hover:text-foreground">
            About
          </Link>
          <Link to="/services" className="hover:text-foreground">
            Services
          </Link>
          <Link to="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link to="/contact" className="hover:text-foreground">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
