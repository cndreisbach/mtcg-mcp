import { test, expect, describe } from "bun:test";
import { computeLevenshteinDistance, findClosestMatches } from "./fuzzy.ts";

describe("computeLevenshteinDistance", () => {
  test("identical strings return 0", () => {
    expect(computeLevenshteinDistance("Lightning Bolt", "Lightning Bolt")).toBe(0);
  });

  test("is case-insensitive", () => {
    expect(computeLevenshteinDistance("lightning bolt", "LIGHTNING BOLT")).toBe(0);
  });

  test("empty string vs non-empty returns length", () => {
    expect(computeLevenshteinDistance("", "hello")).toBe(5);
    expect(computeLevenshteinDistance("hello", "")).toBe(5);
  });

  test("both empty returns 0", () => {
    expect(computeLevenshteinDistance("", "")).toBe(0);
  });

  test("single character difference", () => {
    // substitution
    expect(computeLevenshteinDistance("cat", "bat")).toBe(1);
  });

  test("single insertion", () => {
    expect(computeLevenshteinDistance("cat", "cats")).toBe(1);
  });

  test("single deletion", () => {
    expect(computeLevenshteinDistance("cats", "cat")).toBe(1);
  });

  test("well-known distance: kitten -> sitting = 3", () => {
    expect(computeLevenshteinDistance("kitten", "sitting")).toBe(3);
  });

  test("completely different strings", () => {
    expect(computeLevenshteinDistance("abc", "xyz")).toBe(3);
  });

  test("handles MTG card names with special characters", () => {
    // The // in double-faced card names is just regular characters
    const distance = computeLevenshteinDistance(
      "Wear // Tear",
      "Wear // Tear"
    );
    expect(distance).toBe(0);
  });
});

describe("findClosestMatches", () => {
  const candidates = [
    "Lightning Bolt",
    "Lightning Greaves",
    "Lightning Helix",
    "Swords to Plowshares",
    "Sol Ring",
    "Counterspell",
  ];

  test("exact match is first result", () => {
    const matches = findClosestMatches("Lightning Bolt", candidates);
    expect(matches[0]).toBe("Lightning Bolt");
  });

  test("close misspelling finds the right card", () => {
    const matches = findClosestMatches("Lightening Bolt", candidates);
    expect(matches[0]).toBe("Lightning Bolt");
  });

  test("respects maxResults limit", () => {
    const matches = findClosestMatches("Lightning", candidates, 2);
    expect(matches.length).toBe(2);
  });

  test("defaults to 5 results", () => {
    const matches = findClosestMatches("a", candidates);
    expect(matches.length).toBe(5);
  });

  test("returns all candidates when fewer than maxResults", () => {
    const matches = findClosestMatches("a", candidates, 100);
    expect(matches.length).toBe(candidates.length);
  });

  test("empty candidates returns empty", () => {
    const matches = findClosestMatches("anything", []);
    expect(matches.length).toBe(0);
  });

  test("ranks by edit distance, closest first", () => {
    const matches = findClosestMatches("Lightning", candidates, 3);
    // Distances: Bolt=5, Helix=6, Sol Ring=6, Greaves=8
    // Bolt should rank first, then Helix and Sol Ring tied at 6
    expect(matches[0]).toBe("Lightning Bolt");
    expect(matches).toContain("Lightning Helix");
    expect(matches.length).toBe(3);
  });
});
