import { Suspense } from "react";
import { ClassDocs } from "./class-docs";
import { NavBar } from "@/components/nav-bar";

export default function ClassDocsPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <NavBar />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
        <ClassDocs />
      </Suspense>
    </main>
  );
}
