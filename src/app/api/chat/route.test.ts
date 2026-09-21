import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/chat", () => {
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
});
