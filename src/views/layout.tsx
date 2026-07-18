import type { FC, PropsWithChildren } from "hono/jsx";
import type { Session } from "../types";

interface LayoutProps {
  title?: string;
  session: Session | null;
  csrfToken?: string;
  cspNonce?: string;
  scripts?: string[];
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ title, session, csrfToken, cspNonce, scripts, children }) => {
  const pageTitle = title ? `${title} - Quando` : "Quando";
  return (
    <html lang="en" data-theme="system">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{pageTitle}</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/style.css" />
        {/* Inline script to apply saved theme before paint (avoids flash) */}
        <script nonce={cspNonce} dangerouslySetInnerHTML={{__html: `(function(){var t=localStorage.getItem("quando-theme")||"system";document.documentElement.setAttribute("data-theme",t)})()`}} />
      </head>
      <body>
        <a href="#main-content" class="skip-link">Skip to content</a>
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
              <button type="button" class="theme-toggle gh-link" id="theme-toggle" aria-label="Toggle theme">
                {/* Sun icon — shown when light mode is active */}
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="theme-icon-light">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
                {/* Moon icon — shown when dark mode is active */}
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="theme-icon-dark">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                {/* Monitor icon — shown when system mode is active */}
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="theme-icon-system">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </button>
              <a href="https://github.com/jasnell/quando" target="_blank" rel="noopener noreferrer" class="gh-link" aria-label="GitHub">
                <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
              </a>
            </nav>
          </div>
        </header>
        <main class="container" id="main-content">{children}</main>
        <footer class="site-footer">
          <div class="container">
            <p>
              Quando &mdash; open-source scheduling polls
              {" "}&middot;{" "}
              <a href="/privacy">Privacy</a>
            </p>
          </div>
        </footer>
        {/* Theme toggle logic */}
        <script nonce={cspNonce} dangerouslySetInnerHTML={{__html: `(function(){
  var btn = document.getElementById("theme-toggle");
  if (!btn) return;
  var cycle = ["system", "light", "dark"];
  var labels = { system: "System theme", light: "Light theme", dark: "Dark theme" };
  btn.addEventListener("click", function() {
    var current = document.documentElement.getAttribute("data-theme") || "system";
    var next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("quando-theme", next);
    btn.setAttribute("aria-label", labels[next]);
  });
  var saved = localStorage.getItem("quando-theme") || "system";
  btn.setAttribute("aria-label", labels[saved]);
})()`}} />
        {scripts?.map((src) => (
          <script src={src} nonce={cspNonce} defer />
        ))}
      </body>
    </html>
  );
};
