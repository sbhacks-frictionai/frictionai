"use client";

import { DeployButton } from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";

// Sample classes data
const classes = [
  "CS16",
  "CS 130A",
  "MATH8",
  "CS 101",
  "MATH 19A",
  "CS 130B",
  "MATH 20A",
  "CS 12A",
  "MATH 21",
  "CS 102",
  "MATH 22",
  "CS 111",
  "MATH 23A",
  "CS 112",
  "MATH 24",
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredClasses = useMemo(() => {
    if (!searchQuery.trim()) {
      return classes;
    }
    const query = searchQuery.toLowerCase().trim();
    return classes.filter((className) =>
      className.toLowerCase().replace(/\s+/g, "").includes(query.replace(/\s+/g, ""))
    );
  }, [searchQuery]);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-8 items-center">
        {/* Navigation */}
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>FrictionAI</Link>
              <div className="flex items-center gap-2">
                <DeployButton />
              </div>
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
        <div className="flex-1 w-full max-w-5xl p-5 flex flex-col gap-8">
          {/* Search Bar */}
          <div className="w-full px-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search classes (e.g., CS16, MATH8, CS 130A)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
          </div>

          {/* Classes Grid */}
          <section className="px-4">
            <h2 className="text-2xl font-bold mb-6">Classes</h2>
            {filteredClasses.length > 0 ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredClasses.map((className) => (
                  <Link key={className} href={`/doc-editor?class=${encodeURIComponent(className)}`}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardHeader>
                        <CardTitle className="text-lg">{className}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Click to open class documents
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No classes found matching &quot;{searchQuery}&quot;
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <p>
            Powered by{" "}
            <a
              href="https://supabase.com/?utm_source=create-next-app&utm_medium=template&utm_term=nextjs"
              target="_blank"
              className="font-bold hover:underline"
              rel="noreferrer"
            >
              Supabase
            </a>
          </p>
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}
