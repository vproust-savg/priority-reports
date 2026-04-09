// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/NotFoundPage.tsx
// PURPOSE: Catch-all for invalid URLs. Prevents blank white page
//          in iframe embeds. No redirect — keeps iframe stable.
// USED BY: App.tsx (catch-all route)
// EXPORTS: NotFoundPage
// ═══════════════════════════════════════════════════════════════

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-page)] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
          Page not found
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          This URL does not match any department or report.
        </p>
      </div>
    </div>
  );
}
