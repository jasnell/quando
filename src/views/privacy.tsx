import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { Session } from "../types";

interface PrivacyProps {
  session: Session | null;
  cspNonce?: string;
}

export const Privacy: FC<PrivacyProps> = ({ session, cspNonce }) => {
  return (
    <Layout title="Privacy Policy" session={session} cspNonce={cspNonce}>
      <div class="prose">
        <h1>Privacy Policy</h1>

        <h2>What data we collect</h2>
        <p>
          When you sign in with GitHub, we receive and store your <strong>GitHub
          user ID</strong>, <strong>username</strong>, and <strong>avatar
          URL</strong>. We do not request access to your email address,
          repositories, or any other GitHub data.
        </p>
        <p>
          When you use Quando, we store the <strong>polls you create</strong>{" "}
          (title, description, link, timezone, dates, times, duration) and the{" "}
          <strong>responses you submit</strong> on other users' polls (your
          yes/maybe/no selections).
        </p>

        <h2>Why we collect it</h2>
        <p>
          The lawful basis for processing your data is <strong>contractual
          necessity</strong> (GDPR Article 6(1)(b)). The data is required to
          provide the scheduling service you signed up to use. We do not use
          your data for advertising, analytics, profiling, or any purpose other
          than operating the poll.
        </p>

        <h2>Cookies</h2>
        <p>
          Quando uses a single <strong>session cookie</strong> to keep you
          signed in. This cookie is strictly necessary for the service to
          function and is exempt from consent requirements under the ePrivacy
          Directive. We do not use tracking cookies, analytics cookies, or
          any third-party cookies.
        </p>

        <h2>Data retention</h2>
        <p>
          Closed polls and their responses are automatically deleted{" "}
          <strong>90 days</strong> after the poll is closed. Open polls whose
          dates have all passed are deleted 90 days after the last date.
          You can delete all your data at any time from your dashboard.
        </p>

        <h2>Data sharing</h2>
        <p>
          Your data is not shared with any third parties. The service runs on{" "}
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">
            Cloudflare Workers
          </a>, which processes requests on our behalf. Cloudflare's infrastructure
          may log IP addresses and request metadata as part of normal network
          operations; this is governed by Cloudflare's own privacy policy.
        </p>

        <h2>Your rights</h2>
        <p>Under the GDPR, you have the right to:</p>
        <ul>
          <li>
            <strong>Access</strong> your data — use the "Download my data"
            button on your dashboard to get a JSON export of everything we
            store about you.
          </li>
          <li>
            <strong>Delete</strong> your data — use the "Delete all my data"
            button on your dashboard to permanently remove all your polls
            and responses. This also signs you out.
          </li>
          <li>
            <strong>Portability</strong> — the JSON export provides your data
            in a machine-readable format.
          </li>
        </ul>

        <h2>Open source</h2>
        <p>
          Quando is open source. You can review exactly what data is collected
          and how it is processed in the{" "}
          <a href="https://github.com/jasnell/quando" target="_blank" rel="noopener noreferrer">
            source code
          </a>.
        </p>

        <h2>Contact</h2>
        <p>
          For questions about this policy or your data, open an issue on the{" "}
          <a href="https://github.com/jasnell/quando/issues" target="_blank" rel="noopener noreferrer">
            GitHub repository
          </a>.
        </p>
      </div>
    </Layout>
  );
};
