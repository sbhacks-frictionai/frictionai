"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
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
];

export function ClassesGrid() {
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
    <div className="flex flex-col gap-8 w-full">
      {/* Search Bar */}
      <div className="w-full px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search classes"
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
              <Link
                key={className}
                href={`/class-docs?class=${encodeURIComponent(className)}`}
              >
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
  );
}
