import { Suspense } from "react";
import { DocEditor } from "./doc-editor";
import { NavBar } from "@/components/nav-bar";

export default function DocEditorPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <NavBar />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
        <DocEditor />
      </Suspense>
    </main>
  );
}
