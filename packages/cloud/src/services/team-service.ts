/**
 * TeamService — manages teams, memberships, and invitations
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { AppError } from "../middleware/error-handler.js";

export interface TeamRepository {
  findById(id: string): Promise<TeamRecord | null>;
  findBySlug(slug: string): Promise<TeamRecord | null>;
  findByUser(userId: string): Promise<TeamRecord[]>;
  create(data: CreateTeamData): Promise<TeamRecord>;
  update(id: string, data: Partial<TeamRecord>): Promise<TeamRecord>;
}

export interface MemberRepository {
  findByTeam(teamId: string): Promise<MemberRecord[]>;
  findMembership(userId: string, teamId: string): Promise<MemberRecord | null>;
  add(teamId: string, userId: string, role: string): Promise<MemberRecord>;
  updateRole(id: string, role: string): Promise<MemberRecord>;
  remove(id: string): Promise<void>;
}

export interface TeamRecord {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: Date;
}

export interface CreateTeamData {
  name: string;
  slug: string;
  ownerId: string;
}

export interface MemberRecord {
  id: string;
  userId: string;
  teamId: string;
  role: string;
  joinedAt: Date;
}

export class TeamService {
  constructor(
    private readonly teams: TeamRepository,
    private readonly members: MemberRepository,
  ) {}

  async createTeam(data: CreateTeamData): Promise<TeamRecord> {
    const existing = await this.teams.findBySlug(data.slug);
    if (existing) throw AppError.conflict("Team slug already taken");

    const team = await this.teams.create(data);
    await this.members.add(team.id, data.ownerId, "OWNER");
    return team;
  }

  async getTeam(id: string): Promise<TeamRecord> {
    const team = await this.teams.findById(id);
    if (!team) throw AppError.notFound("Team");
    return team;
  }

  async listUserTeams(userId: string): Promise<TeamRecord[]> {
    return this.teams.findByUser(userId);
  }

  async getMembers(teamId: string): Promise<MemberRecord[]> {
    return this.members.findByTeam(teamId);
  }

  async addMember(teamId: string, userId: string, role: string = "MEMBER"): Promise<MemberRecord> {
    const existing = await this.members.findMembership(userId, teamId);
    if (existing) throw AppError.conflict("User is already a member");
    return this.members.add(teamId, userId, role);
  }

  async removeMember(membershipId: string): Promise<void> {
    return this.members.remove(membershipId);
  }

  async requireMembership(userId: string, teamId: string): Promise<MemberRecord> {
    const membership = await this.members.findMembership(userId, teamId);
    if (!membership) throw AppError.forbidden("Not a member of this team");
    return membership;
  }
}
