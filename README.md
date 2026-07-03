# Leaf

A Markdown editor for Google Drive with a Notion-style writing experience.

Google Drive is the file manager; Leaf is just the editor. Pages are plain
`.md` files (MIME `text/markdown`) living wherever you keep them in Drive:

- **New**: in Drive, choose *New → More → Leaf* — creates a Markdown file in
  the current folder and opens the editor.
- **Open**: right-click a Markdown file → *Open with → Leaf*.

## Architecture

Client-only static site (Next.js `output: "export"`) — no server, no secrets.

- **Auth**: [Google Identity Services token client](src/lib/google/gis.ts).
  The browser gets short-lived access tokens directly; when silent re-auth
  isn't possible, UI surfaces a "Connect Google Drive" button.
- **Storage**: [Drive REST called directly from the browser](src/lib/google/drive.ts)
  with the `drive.file` scope (the app can only see files it created or the
  user opened with it).
- **Editor**: [BlockNote](https://www.blocknotejs.org/) (MPL-2.0), converting
  Markdown ↔ blocks on load/save.
- **Entry points**: [/drive/open](src/app/drive/open/page.tsx) and
  [/drive/new](src/app/drive/new/page.tsx) parse the Drive UI `state` param;
  the editor lives at `/edit/?file=<fileId>`.
- **Collaboration** (optional): real-time co-editing via
  [Liveblocks + Yjs](src/lib/collab.ts) — one room per Drive file, shared
  cursors, title synced through the Yjs doc. The room's awareness "leader"
  is the only client that autosaves to Drive. Enabled by setting
  `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`; without it the editor runs solo.

## Development

```bash
cp .env.example .env.local   # set NEXT_PUBLIC_GOOGLE_CLIENT_ID
yarn install
yarn dev
```

The OAuth client (Google Cloud Console → Credentials, type "Web application")
must list the app's origin under **Authorized JavaScript origins**
(`http://localhost:3000` for dev). No redirect URI or client secret is used.

## Deploy

```bash
yarn build                                            # emits out/
npx wrangler pages deploy out --project-name=leaf   # Cloudflare Pages
```

Production: https://leaf-dlm.pages.dev

## Drive UI integration (Google Cloud Console)

Drive API → *Drive UI integration* tab:

- Open URL: `https://leaf-dlm.pages.dev/drive/open/`
- New URL: `https://leaf-dlm.pages.dev/drive/new/`
- Default MIME type / extension: `text/markdown` / `md`
- Icons: upload from [branding/](branding/)
