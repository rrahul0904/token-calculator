import { describe, expect, it } from "vitest";
import { onboardingLockKeys } from "@/app/api/v1/onboarding/route";

describe("onboarding concurrency locks", () => {
  it("serializes both the external organization and user identity", () => {
    expect(onboardingLockKeys({
      userId: "user_release",
      email: "Owner@Example.Test",
      workosOrganizationId: "org_workos_release",
    })).toEqual([
      "onboarding:workos-org:org_workos_release",
      "onboarding:user:user_release:owner@example.test",
    ]);
  });

  it("falls back to the user identity when no external organization exists", () => {
    expect(onboardingLockKeys({
      userId: "user_release",
      email: "owner@example.test",
      workosOrganizationId: null,
    })).toEqual(["onboarding:user:user_release:owner@example.test"]);
  });
});
