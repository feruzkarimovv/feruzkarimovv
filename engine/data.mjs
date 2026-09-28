// Everything FK-1 eats, from the GitHub GraphQL API.
//
// Only public things are ever named. The contribution calendar includes private work as bare
// counts (the profile shares them); PR titles, releases and repos come from public repos only.

const QUERY = `query($login: String!) {
  user(login: $login) {
    name
    contributionsCollection {
      restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
    repositories(first: 100, privacy: PUBLIC, ownerAffiliations: OWNER, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        name url createdAt isFork
        releases(first: 10, orderBy: { field: CREATED_AT, direction: DESC }) {
          nodes { tagName name url createdAt isDraft }
        }
      }
    }
    pullRequests(first: 100, states: MERGED, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes { title url number mergedAt additions deletions repository { nameWithOwner isPrivate } }
    }
  }
}`;

export async function fetchActivity(login, token) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'fk-1' },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API: ${JSON.stringify(json.errors || json.message)}`);
  const u = json.data.user;
  const cal = u.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount }));

  const repos = u.repositories.nodes.filter((r) => !r.isFork).map((r) => ({ name: r.name, url: r.url, createdAt: r.createdAt }));
  const releases = u.repositories.nodes
    .flatMap((r) => r.releases.nodes.filter((x) => !x.isDraft).map((x) => ({ repo: r.name, tag: x.tagName, name: x.name, url: x.url, date: x.createdAt })))
    .sort((a, b) => b.date.localeCompare(a.date));
  const prs = u.pullRequests.nodes
    .filter((p) => p.repository && !p.repository.isPrivate)
    .map((p) => ({ title: p.title, url: p.url, number: p.number, repo: p.repository.nameWithOwner, date: p.mergedAt, additions: p.additions, deletions: p.deletions }));

  return {
    login,
    name: u.name,
    today: days[days.length - 1].date,
    total: cal.totalContributions,
    private: u.contributionsCollection.restrictedContributionsCount,
    days,
    repos,
    releases,
    prs,
  };
}
