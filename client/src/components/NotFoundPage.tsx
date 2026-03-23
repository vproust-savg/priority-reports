// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/NotFoundPage.tsx
// PURPOSE: Catch-all for invalid URLs. Prevents blank white page
//          in iframe embeds. No redirect — keeps iframe stable.
// USED BY: App.tsx (catch-all route)
// EXPORTS: NotFoundPage
// ═══════════════════════════════════════════════════════════════

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Page not found
        </h1>
        <p className="text-slate-500">
          This URL does not match any department or report.
        </p>
      </div>
    </div>
  );
}
