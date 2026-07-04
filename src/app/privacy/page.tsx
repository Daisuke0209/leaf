import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy — Leaf" };

/**
 * Required for the Google Workspace Marketplace listing. Keep the Limited
 * Use disclosure — it's mandated by Google's API Services User Data Policy.
 */
export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16 text-sm leading-relaxed">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mb-8 text-muted">Last updated: July 4, 2026</p>

      <section className="space-y-4 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold">
        <p>
          Leaf is a Markdown editor for Google Drive. It is designed so that
          we do not store your data: your documents live in your own Google
          Drive, and the app runs in your browser.
        </p>

        <h2>What Leaf accesses</h2>
        <p>
          With your consent, Leaf uses Google&apos;s <code>drive.file</code>{" "}
          scope, which only grants access to files you create with Leaf or
          explicitly open with it — never your whole Drive. Leaf also receives
          your basic profile (name, email) to label your account in the app,
          and the <code>drive.install</code> permission to appear in
          Drive&apos;s &quot;New&quot; and &quot;Open with&quot; menus.
        </p>

        <h2>Where your data goes</h2>
        <p>
          Documents are read from and saved to your Google Drive directly from
          your browser. Access tokens are kept in your browser&apos;s local
          storage and expire within about an hour. Our authorization service
          processes your Google access token transiently to verify file access
          and keeps no records.
        </p>
        <p>
          When real-time collaboration is active, document contents are
          transmitted through and stored by Liveblocks, Inc. (our
          collaboration infrastructure provider) so that co-editors stay in
          sync. See the{" "}
          <a
            href="https://liveblocks.io/privacy"
            className="text-accent hover:underline"
          >
            Liveblocks privacy policy
          </a>
          .
        </p>

        <h2>What we don&apos;t do</h2>
        <p>
          Leaf has no analytics, no advertising, no tracking, and no database
          of user content. We do not sell or share your data. We cannot read
          your documents.
        </p>

        <h2>Google user data (Limited Use)</h2>
        <p>
          Leaf&apos;s use and transfer of information received from Google
          APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-accent hover:underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>Revoking access</h2>
        <p>
          You can disconnect Leaf at any time from the app&apos;s home page,
          or revoke its access from your{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-accent hover:underline"
          >
            Google Account permissions
          </a>
          .
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy can be raised on the{" "}
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
