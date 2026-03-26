/**
 * TeamService Tests
 * @author Test Suite
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { TeamService } from "../services/team-service.js";
import { createInMemoryRepositories } from "../repositories/in-memory.js";
import { AppError } from "../middleware/error-handler.js";

describe("TeamService", () => {
  let teamService: TeamService;
  let repos: ReturnType<typeof createInMemoryRepositories>;
  const testUserId = "user-123";

  beforeEach(() => {
    repos = createInMemoryRepositories();
    teamService = new TeamService(repos.teams, repos.members);
  });

  describe("createTeam", () => {
    it("creates team and adds owner", async () => {
      const team = await teamService.createTeam({
        name: "Engineering",
        slug: "engineering",
        ownerId: testUserId,
      });

      expect(team.id).toBeDefined();
      expect(team.name).toBe("Engineering");
      expect(team.slug).toBe("engineering");
      expect(team.plan).toBe("FREE");
      expect(team.createdAt).toBeInstanceOf(Date);

      // Verify owner was added
      const members = await teamService.getMembers(team.id);
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(testUserId);
      expect(members[0].role).toBe("OWNER");
    });

    it("rejects duplicate slug", async () => {
      await teamService.createTeam({
        name: "First Team",
        slug: "shared-slug",
        ownerId: testUserId,
      });

      await expect(
        teamService.createTeam({
          name: "Second Team",
          slug: "shared-slug",
          ownerId: "user-456",
        })
      ).rejects.toThrow(AppError);
    });
  });

  describe("getTeam", () => {
    it("returns team by ID", async () => {
      const created = await teamService.createTeam({
        name: "Products",
        slug: "products",
        ownerId: testUserId,
      });

      const retrieved = await teamService.getTeam(created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe("Products");
    });

    it("throws if not found", async () => {
      await expect(teamService.getTeam("nonexistent-team")).rejects.toThrow(
        AppError
      );
    });
  });

  describe("listUserTeams", () => {
    it("returns teams for user", async () => {
      const user1 = "user-alpha";
      const user2 = "user-beta";

      const team1 = await teamService.createTeam({
        name: "Team A",
        slug: "team-a",
        ownerId: user1,
      });

      const team2 = await teamService.createTeam({
        name: "Team B",
        slug: "team-b",
        ownerId: user2,
      });

      // Add user1 to team2
      await teamService.addMember(team2.id, user1);

      const user1Teams = await teamService.listUserTeams(user1);

      // Should include at least the teams where user1 is a member
      expect(user1Teams.length).toBeGreaterThan(0);
    });
  });

  describe("getMembers", () => {
    it("returns team members", async () => {
      const team = await teamService.createTeam({
        name: "Development",
        slug: "development",
        ownerId: testUserId,
      });

      // Add another member
      await teamService.addMember(team.id, "user-456", "DEVELOPER");

      const members = await teamService.getMembers(team.id);

      expect(members).toHaveLength(2);
      const roles = members.map((m) => m.role).sort();
      expect(roles).toEqual(["DEVELOPER", "OWNER"]);
    });
  });

  describe("addMember", () => {
    it("adds member to team", async () => {
      const team = await teamService.createTeam({
        name: "Marketing",
        slug: "marketing",
        ownerId: testUserId,
      });

      const member = await teamService.addMember(
        team.id,
        "user-789",
        "CONTRIBUTOR"
      );

      expect(member.id).toBeDefined();
      expect(member.userId).toBe("user-789");
      expect(member.teamId).toBe(team.id);
      expect(member.role).toBe("CONTRIBUTOR");
      expect(member.joinedAt).toBeInstanceOf(Date);
    });

    it("adds member with default role", async () => {
      const team = await teamService.createTeam({
        name: "Sales",
        slug: "sales",
        ownerId: testUserId,
      });

      const member = await teamService.addMember(team.id, "user-999");

      expect(member.role).toBe("MEMBER");
    });

    it("rejects duplicate membership", async () => {
      const team = await teamService.createTeam({
        name: "HR",
        slug: "hr",
        ownerId: testUserId,
      });

      await teamService.addMember(team.id, "user-111");

      await expect(
        teamService.addMember(team.id, "user-111")
      ).rejects.toThrow(AppError);
    });
  });

  describe("removeMember", () => {
    it("removes member", async () => {
      const team = await teamService.createTeam({
        name: "Finance",
        slug: "finance",
        ownerId: testUserId,
      });

      const member = await teamService.addMember(team.id, "user-222");

      await teamService.removeMember(member.id);

      const members = await teamService.getMembers(team.id);

      expect(members).toHaveLength(1);
      expect(members[0].userId).not.toBe("user-222");
    });
  });

  describe("requireMembership", () => {
    it("returns membership if member", async () => {
      const team = await teamService.createTeam({
        name: "Operations",
        slug: "operations",
        ownerId: testUserId,
      });

      const membership = await teamService.requireMembership(
        testUserId,
        team.id
      );

      expect(membership.userId).toBe(testUserId);
      expect(membership.teamId).toBe(team.id);
    });

    it("throws if not a member", async () => {
      const team = await teamService.createTeam({
        name: "Executive",
        slug: "executive",
        ownerId: testUserId,
      });

      await expect(
        teamService.requireMembership("user-nonmember", team.id)
      ).rejects.toThrow(AppError);
    });
  });
});
