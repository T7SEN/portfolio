import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Engine",
  robots: { index: false, follow: false },
};

export default function EnginePage() {
  return (
    <div className="p-6">
      <h1 className="font-mono text-sm tracking-widest">Engine</h1>
      <p className="mt-4 text-muted">
        Development only. The particle engine runs here on its own once it
        exists.
      </p>
    </div>
  );
}
