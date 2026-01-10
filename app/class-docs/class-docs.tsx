import { Footer } from "@/components/footer";

// Fake course data for preview/testing
const courseData = [
  {
    topic: "Topic 1: Intro to C++",
    documents: [
      {
        name: "Syllabus.pdf",
      },
      {
        name: "Lecture 1 Slides.pptx",
      },
      {
        name: "Intro Reading.docx",
      },
    ],
  },
  {
    topic: "Topic 2: Pointers",
    documents: [
      {
        name: "Lecture 2 Notes.pdf",
      },
      {
        name: "Pointer Exercises.docx",
      },
      {
        name: "Sample Code.cpp",
      },
    ],
  },
];

export function ClassDocs() {
  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      {/* Main Content */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-5 space-y-6">
        {/* Class Title */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold">CMPSC 16: Problem Solving</h1>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search course documents…"
            className="w-full max-w-lg px-5 py-3 rounded-lg border border-border bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring
                       text-base"
          />
        </div>

        {/* Topics & Documents */}
        <div className="space-y-8">
          {courseData.map((topic) => (
            <section key={topic.topic}>
              <h2 className="text-2xl font-semibold mb-4 text-foreground">
                {topic.topic}
              </h2>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                {topic.documents.map((doc) => (
                  <div
                    key={doc.name}
                    className="bg-card rounded-lg border border-border shadow-sm transition-transform flex items-center gap-4
                               p-4 cursor-pointer hover:-translate-y-1 hover:shadow-md"
                    tabIndex={0}
                  >
                    <div className="p-2 bg-muted rounded-lg flex items-center justify-center">
                      <span
                        className="text-xl"
                        role="img"
                        aria-label="document"
                      >
                        📄
                      </span>
                    </div>
                    <span className="font-medium text-sm text-foreground">
                      {doc.name}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
