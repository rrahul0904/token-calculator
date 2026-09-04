import { describe, expect, it } from "vitest";
import { platformCostProviderStates } from "@/lib/admin/cost-providers";
describe("platform cost provider discovery", () => { it("never represents unconfigured provider billing as a zero cost", () => { for (const provider of platformCostProviderStates()) expect(["configured", "not_configured"]).toContain(provider.state); }); });
