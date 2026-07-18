import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { OgMeta } from "./layout";
import type { Session, SiteStats } from "../types";
import { Stats } from "./stats";

interface LandingProps {
  session: Session | null;
  stats: SiteStats;
  cspNonce?: string;
  ogMeta?: OgMeta;
}

export const Landing: FC<LandingProps> = ({ session, stats, cspNonce, ogMeta }) => {
  return (
    <Layout session={session} cspNonce={cspNonce} ogMeta={ogMeta}>
      <div class="hero">
        <h1>Find a time that works for everyone.</h1>
        <p class="hero-sub">
          Create a poll, share the link, see who's free. No fuss.
        </p>
        {session ? (
          <a href="/new" class="btn btn-lg">
            Create a poll
          </a>
        ) : (
          <>
            <a href="/auth/login" class="btn btn-lg">
              Sign in with GitHub
            </a>
            <p class="consent-notice">
              By signing in, you agree to our <a href="/privacy">privacy policy</a>.
            </p>
          </>
        )}
      </div>
      <div class="features">
        <div class="feature">
          <h3>Pick dates visually</h3>
          <p>Click dates on a calendar, add times, done.</p>
        </div>
        <div class="feature">
          <h3>Timezone-aware</h3>
          <p>Set your timezone. Respondents see times in theirs.</p>
        </div>
        <div class="feature">
          <h3>Simple responses</h3>
          <p>Yes, no, or maybe for each slot. See results at a glance.</p>
        </div>
      </div>
      <Stats stats={stats} />
    </Layout>
  );
};
