import Link from "next/link";

export default function Footer() {
  return (
    <footer className="relative bg-background">
      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-card-border/60 to-transparent" />
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-12 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-bold text-primary">
          Inner Voice
        </Link>

        <nav className="flex gap-6">
          <a href="#features" className="text-sm text-muted transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-muted transition-colors hover:text-foreground">
            How It Works
          </a>
          <a href="#integrations" className="text-sm text-muted transition-colors hover:text-foreground">
            Integrations
          </a>
        </nav>

        <p className="text-sm text-muted">
          &copy; {new Date().getFullYear()} Inner Voice. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
