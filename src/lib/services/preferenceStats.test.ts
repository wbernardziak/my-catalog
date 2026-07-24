import { describe, expect, it } from "vitest";
import { computeMemberStats, hasAnyData } from "./preferenceStats";

/**
 * Unit tests for the pure per-member stats core. No Supabase: we feed
 * `computeMemberStats` plain row arrays the way `listPreferenceStats` does after
 * its DB fetch. The DB wrapper itself is verified manually (consistent with the
 * codebase not mocking Supabase).
 */

const ME = "member-me";
const OTHER = "member-other";

describe("computeMemberStats", () => {
  it("emits a single zero 'You' row for empty input", () => {
    const stats = computeMemberStats([], [], ME);
    expect(stats).toEqual([
      { memberId: ME, isCurrent: true, label: "You", playedCount: 0, likedCount: 0, dislikedCount: 0 },
    ]);
  });

  it("counts the current member's played + mixed liked/disliked", () => {
    const played = [{ member_id: ME }, { member_id: ME }, { member_id: ME }];
    const preference = [
      { member_id: ME, preference: "liked" as const },
      { member_id: ME, preference: "disliked" as const },
    ];
    const [you] = computeMemberStats(played, preference, ME);
    expect(you).toEqual({
      memberId: ME,
      isCurrent: true,
      label: "You",
      playedCount: 3,
      likedCount: 1,
      dislikedCount: 1,
    });
  });

  it("counts a second member separately, labeled 'Other member', with 'You' first", () => {
    const played = [{ member_id: ME }, { member_id: OTHER }, { member_id: OTHER }];
    const preference = [
      { member_id: ME, preference: "liked" as const },
      { member_id: OTHER, preference: "disliked" as const },
    ];
    const stats = computeMemberStats(played, preference, ME);
    expect(stats).toHaveLength(2);
    expect(stats[0]).toMatchObject({ memberId: ME, isCurrent: true, label: "You", playedCount: 1, likedCount: 1 });
    expect(stats[1]).toMatchObject({
      memberId: OTHER,
      isCurrent: false,
      label: "Other member",
      playedCount: 2,
      dislikedCount: 1,
      likedCount: 0,
    });
  });

  it("gives a member with played rows but no preferences zero liked/disliked", () => {
    const [you] = computeMemberStats([{ member_id: ME }, { member_id: ME }], [], ME);
    expect(you).toMatchObject({ playedCount: 2, likedCount: 0, dislikedCount: 0 });
  });

  it("is order-independent: shuffled input yields the same stats", () => {
    const playedA = [{ member_id: OTHER }, { member_id: ME }];
    const playedB = [{ member_id: ME }, { member_id: OTHER }];
    expect(computeMemberStats(playedA, [], ME)).toEqual(computeMemberStats(playedB, [], ME));
  });

  it("labels more than one other member 'Other member', 'Other member 2' (sorted by id)", () => {
    const played = [{ member_id: "member-b" }, { member_id: "member-a" }, { member_id: ME }];
    const stats = computeMemberStats(played, [], ME);
    expect(stats.map((s) => [s.memberId, s.label])).toEqual([
      [ME, "You"],
      ["member-a", "Other member"],
      ["member-b", "Other member 2"],
    ]);
  });
});

describe("hasAnyData", () => {
  it("is false for the empty-input result (single zero 'You' row)", () => {
    expect(hasAnyData(computeMemberStats([], [], ME))).toBe(false);
  });

  it("is true once any member has a non-zero count", () => {
    expect(hasAnyData(computeMemberStats([{ member_id: OTHER }], [], ME))).toBe(true);
  });
});
