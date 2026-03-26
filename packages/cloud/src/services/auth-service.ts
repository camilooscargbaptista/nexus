/**
 * AuthService — handles user registration, login, token management
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error-handler.js";

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(data: CreateUserData): Promise<UserRecord>;
  update(id: string, data: Partial<UserRecord>): Promise<UserRecord>;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
}

export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(private readonly users: UserRepository) {}

  async register(input: RegisterInput): Promise<UserRecord> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict("Email already registered");
    }

    const passwordHash = await bcrypt.hash(input.password, this.SALT_ROUNDS);
    return this.users.create({
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      passwordHash,
    });
  }

  async login(input: LoginInput): Promise<UserRecord> {
    const user = await this.users.findByEmail(input.email.toLowerCase().trim());
    if (!user) {
      throw AppError.unauthorized("Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized("Invalid email or password");
    }

    return user;
  }

  async getProfile(userId: string): Promise<UserRecord> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw AppError.notFound("User");
    }
    return user;
  }
}
