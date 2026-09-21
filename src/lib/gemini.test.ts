import { describe, expect, it } from "vitest";
import { ProviderUnavailableError, shouldTryFallback, withModelFallback, withProviderFallback } from "@/lib/gemini";

describe("Gemini fallback", () => {
  it("uses the fallback model after a rate limit", async () => {
    const rateLimited = Object.assign(new Error("slow down"), { status: 429 });
    const result = await withModelFallback(
      async (model) => {
        if (model === "primary") throw rateLimited;
        return "grounded response";
      },
      "primary",
      "fallback",
    );
    expect(result).toEqual({ result: "grounded response", model: "fallback" });
  });

  it("tries the fallback model when the primary model has been retired", () => {
    expect(shouldTryFallback(Object.assign(new Error("model not found"), { status: 404 }))).toBe(true);
  });

  it("does not retry validation errors", async () => {
    const validationError = Object.assign(new Error("bad request"), { status: 400 });
    expect(shouldTryFallback(validationError)).toBe(false);
    await expect(withModelFallback(async () => { throw validationError; }, "primary", "fallback")).rejects.toThrow("bad request");
  });

  it("returns an honest unavailable error if both models fail", async () => {
    const unavailable = Object.assign(new Error("unavailable"), { status: 503 });
    await expect(withModelFallback(async () => { throw unavailable; }, "primary", "fallback")).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("uses Groq when Gemini is unavailable for any reason", async () => {
    const response = await withProviderFallback(
      async () => { throw Object.assign(new Error("Gemini credits depleted"), { status: 402 }); },
      async () => "Groq grounded response",
    );
    expect(response).toBe("Groq grounded response");
  });
});
