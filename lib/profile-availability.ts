import { normalize, type Snapshot } from './relationships.ts';

export type UnavailableProfile = {
  username: string;
  reason: string;
};

export function parseUnavailableUsernames(input: string) {
  const usernames = new Set<string>();
  const invalid: string[] = [];
  for (const token of input.split(/[\s,;]+/).filter(Boolean)) {
    const username = normalize(token);
    if (username) usernames.add(username);
    else invalid.push(token);
  }
  return { usernames: [...usernames].sort(), invalid };
}

export function withoutUnavailableProfiles(
  snapshot: Snapshot,
  usernames: ReadonlySet<string>,
): Snapshot {
  if (!usernames.size) return snapshot;
  return {
    ...snapshot,
    followers: snapshot.followers.filter((name) => !usernames.has(name)),
    following: snapshot.following.filter((name) => !usernames.has(name)),
  };
}
