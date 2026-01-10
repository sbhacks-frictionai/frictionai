import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { Footer } from "@/components/footer";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

// Dummy class data to render; in a real app this could come from a database or API
const CLASSES = [
  { id: 1, name: "Algebra II" },
  { id: 2, name: "AP Biology" },
  { id: 3, name: "English III" },
  { id: 4, name: "US History" },
];

function ClassesGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
      {CLASSES.map((cls) => (
        <Link
          key={cls.id}
          href="/class-docs"
          className="group block rounded-lg border border-muted bg-card shadow hover:shadow-lg transition p-6 hover:bg-accent hover:border-accent-foreground focus:outline-none focus-visible:ring"
        >
          <div className="flex flex-col items-start">
            <h2 className="text-lg font-semibold mb-2 group-hover:text-accent-foreground transition">
              {cls.name}
            </h2>
            <p className="text-muted-foreground text-sm">
              Docs and AI tools for {cls.name}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        {/* Navigation */}
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>FrictionAI</Link>
            </div>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>

        {/* Main Content */}
        <div className="flex-1 w-full max-w-5xl p-5">
          <ClassesGrid />
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </main>
  );
}