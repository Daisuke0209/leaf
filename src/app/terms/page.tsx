import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service — Leaf" };

export default function Terms() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16 text-sm leading-relaxed">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">
        Terms of Service
      </h1>
      <p className="mb-8 text-muted">Last updated: July 4, 2026</p>

      <section className="space-y-4 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold">
        <p>
          By using Leaf you agree to these terms. If you do not agree, please
          do not use the app.
        </p>

        <h2>The service</h2>
        <p>
          Leaf is a free Markdown editor that works with your Google Drive.
          Your documents are stored in your own Drive under your Google
          account&apos;s terms; Leaf does not host your content.
        </p>

        <h2>Acceptable use</h2>
        <p>
          Don&apos;t use Leaf to violate any law or third-party rights, or to
          interfere with the service&apos;s operation.
        </p>

        <h2>No warranty</h2>
        <p>
          Leaf is provided &quot;as is&quot;, without warranty of any kind.
          To the maximum extent permitted by law, the developer is not liable
          for any damages arising from the use of the service, including data
          loss. Keep backups of anything important — your files remain in
          your Drive, where Google&apos;s own versioning and trash apply.
        </p>

        <h2>Changes</h2>
        <p>
          The service and these terms may change or be discontinued at any
          time. Material changes will be reflected on this page.
        </p>

        <h2>Contact</h2>
        <p>
          Questions can be raised on the{" "}
          <a
            href="https://github.com/Daisuke0209/leaf/issues"
            className="text-accent hover:underline"
          >
            Leaf issue tracker
          </a>
          .
        </p>
      </section>

      <p className="mt-10">
        <Link href="/" className="text-accent hover:underline">
          ← Back to Leaf
        </Link>
      </p>
    </main>
  );
}
