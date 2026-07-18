import type { FC, PropsWithChildren } from "hono/jsx";
import type { Session } from "../types";

interface LayoutProps {
  title?: string;
  session: Session | null;
  csrfToken?: string;
  scripts?: string[];
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ title, session, csrfToken, scripts, children }) => {
  const pageTitle = title ? `${title} - Quando` : "Quando";
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{pageTitle}</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <header class="site-header">
          <div class="header-inner">
            <a href="/" class="logo">
              <svg class="logo-icon" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
                <rect width="32" height="32" rx="7" fill="#2563eb"/>
                <circle cx="14.5" cy="13.5" r="8.5" fill="none" stroke="#fff" stroke-width="2.5"/>
                <line x1="14.5" y1="13.5" x2="14.5" y2="7.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                <line x1="14.5" y1="13.5" x2="19.5" y2="10" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                <circle cx="14.5" cy="13.5" r="1.5" fill="#fff"/>
                <line x1="20" y1="19" x2="27" y2="27" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
              Quando
            </a>
            <nav class="header-nav">
              {session ? (
                <>
                  <a href="/dashboard">My polls</a>
                  <a href="/new" class="btn btn-sm">
                    New poll
                  </a>
                  <div class="user-menu">
                    <img
                      src={session.avatar_url}
                      alt={session.github_login}
                      class="avatar"
                      width="28"
                      height="28"
                    />
                    <span class="username">@{session.github_login}</span>
                    <form method="post" action="/auth/logout" class="inline-form">
                      {csrfToken && <input type="hidden" name="_csrf" value={csrfToken} />}
                      <button type="submit" class="btn-link">
                        Sign out
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <a href="/auth/login" class="btn btn-sm">
                  Sign in with GitHub
                </a>
              )}
            </nav>
          </div>
        </header>
        <main class="container">{children}</main>
        <footer class="site-footer">
          <div class="container">
            <p>Quando &mdash; open-source scheduling polls</p>
          </div>
        </footer>
        {scripts?.map((src) => (
          <script src={src} defer />
        ))}
      </body>
    </html>
  );
};
