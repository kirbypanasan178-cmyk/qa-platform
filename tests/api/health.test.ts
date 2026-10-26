import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/v1/health/route";

describe("GET /api/v1/health", () => {
  it("returns HTTP status 200", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it("returns JSON content type", async () => {
    const response = await GET();
    const contentType = response.headers.get("content-type");
    expect(contentType).not.toBeNull();
    expect(contentType).toContain("application/json");
  });

  it("returns response body containing status: ok", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data).toHaveProperty("status");
    expect(data.status).toBe("ok");
  });

  it("returns a valid ISO 8601 timestamp", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data).toHaveProperty("timestamp");
    expect(typeof data.timestamp).toBe("string");

    const parsedDate = new Date(data.timestamp);
    expect(Number.isNaN(parsedDate.getTime())).toBe(false);
    expect(parsedDate.toISOString()).toBe(data.timestamp);
  });

  it("produces valid responses for separate requests", async () => {
    const response1 = await GET();
    const data1 = await response1.json();

    // Small delay to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 5));

    const response2 = await GET();
    const data2 = await response2.json();

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(data1.status).toBe("ok");
    expect(data2.status).toBe("ok");

    const time1 = new Date(data1.timestamp).getTime();
    const time2 = new Date(data2.timestamp).getTime();
    expect(time2).toBeGreaterThanOrEqual(time1);
  });
});
