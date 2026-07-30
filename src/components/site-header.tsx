import { Link } from "@tanstack/react-router";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent font-mono text-sm font-bold text-accent-foreground">
            TP
          </span>
          <span className="font-mono text-sm font-semibold tracking-[0.2em] text-foreground">
            TP-CAMP
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Pricing
          </Link>
          <Link
            to="/compare"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Compare tiers
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 text-sm text-muted-foreground">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">TP-CAMP SUITE</p>
        <p>Rights management, campaign operations and label finance — billed yearly.</p>
      </div>
    </footer>
  );
}
