import type { FC } from "hono/jsx";
import type { SiteStats } from "../types";

interface StatsProps {
  stats: SiteStats;
}

export const Stats: FC<StatsProps> = ({ stats }) => {
  return (
    <details class="stats-section collapsible-section">
      <summary><h2>Activity</h2></summary>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{stats.activePolls}</div>
          <div class="stat-label">Active polls</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{stats.closedPolls}</div>
          <div class="stat-label">Closed polls</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{stats.totalResponses}</div>
          <div class="stat-label">Total responses</div>
        </div>
      </div>
      {stats.topCreators.length > 0 && (
        <div class="top-creators">
          <h3>Top creators</h3>
          <ol class="creator-list">
            {stats.topCreators.map((c) => (
              <li class="creator-item">
                <span class="creator-name">@{c.login}</span>
                <span class="creator-count">
                  {c.count} active poll{c.count !== 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </details>
  );
};
