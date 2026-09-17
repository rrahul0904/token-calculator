import { describe, expect, it } from "vitest";
import { platformAdminCan } from "@/lib/admin/auth";

describe("platform admin authorization", () => {
  it("defaults organization roles out of platform privileges by construction", () => {
    expect(platformAdminCan("read_only", "read")).toBe(true);
    expect(platformAdminCan("read_only", "operations")).toBe(false);
    expect(platformAdminCan("operations", "finance")).toBe(false);
  });

  it("reserves administrator management for the explicit super-admin role", () => {
    expect(platformAdminCan("super_admin", "admin:manage")).toBe(true);
    expect(platformAdminCan("finance", "admin:manage")).toBe(false);
    expect(platformAdminCan("support", "admin:manage")).toBe(false);
  });
});
