import { beforeEach, describe, expect, it } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { POST } from "./route";

describe("POST /api/chat", () => {
  beforeEach(() => resetRateLimits());

  it("rejects malformed and invalid questions", async () => {
    const malformed = await POST(new Request("http://localhost/api/chat", { method: "POST", body: "not-json" }));
    expect(malformed.status).toBe(400);
    const invalid = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "x" }),
    }));
    expect(invalid.status).toBe(400);
  });

  it("rate limits a client that sends too many requests", async () => {
    const send = () =>
      POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" }, body: "not-json" }));
    for (let i = 0; i < 10; i += 1) expect((await send()).status).toBe(400);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
  });
});
