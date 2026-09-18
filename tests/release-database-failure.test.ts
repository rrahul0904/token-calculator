import { describe, expect, it } from "vitest";
import { classifyDatabaseReleaseFailure } from "../scripts/release/database-failure";

describe("release database failure classification", () => {
  it("identifies stale or invalid PostgreSQL credentials without exposing the original error", () => {
    const error = Object.assign(new Error("password authentication failed for user secret_user"), {
      code: "28P01",
      host: "private-db.example.test",
    });

    expect(classifyDatabaseReleaseFailure(error)).toBe(
      "DATABASE_AUTHENTICATION_FAILED:sqlstate=28P01",
    );
  });

  it("identifies missing database and permission failures by SQLSTATE", () => {
    expect(classifyDatabaseReleaseFailure({ code: "3D000" })).toBe(
      "DATABASE_NOT_FOUND:sqlstate=3D000",
    );
    expect(classifyDatabaseReleaseFailure({ code: "42501" })).toBe(
      "DATABASE_PERMISSION_DENIED:sqlstate=42501",
    );
  });

  it("preserves only a sanitized connection code for other failures", () => {
    expect(classifyDatabaseReleaseFailure({ code: "ETIMEDOUT" })).toBe(
      "DATABASE_CONNECTION_FAILED:code=ETIMEDOUT",
    );
    expect(classifyDatabaseReleaseFailure({ code: "bad host/password" })).toBe(
      "DATABASE_CONNECTION_FAILED",
    );
    expect(classifyDatabaseReleaseFailure(new Error("sensitive details"))).toBe(
      "DATABASE_CONNECTION_FAILED",
    );
  });
});
