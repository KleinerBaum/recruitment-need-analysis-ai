import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createRecruitmentMcpServer } from "@/mcp/server";
import { WIDGET_URI } from "@/mcp/widget";

describe("Needly MCP App server", () => {
  const closeHandlers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closeHandlers.length) await closeHandlers.pop()?.();
  });

  async function connectedClient() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createRecruitmentMcpServer();
    const client = new Client({ name: "needly-tests", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeHandlers.push(async () => { await client.close(); await server.close(); });
    return client;
  }

  it("exposes the four bounded recruitment tools", async () => {
    const client = await connectedClient();
    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "analyze_recruitment_need",
      "model_market_scenario",
      "retrieve_job_ad_evidence",
      "search_esco"
    ]);
    expect(result.tools.every((tool) => tool._meta?.ui)).toBe(true);
  });

  it("serves a self-contained MCP App resource", async () => {
    const client = await connectedClient();
    const result = await client.readResource({ uri: WIDGET_URI });
    const resource = result.contents[0];
    expect(resource).toBeDefined();
    expect(resource?.mimeType).toBe("text/html;profile=mcp-app");
    expect(resource && "text" in resource ? resource.text : "").toContain("NEEDLY · MCP APP");
  });

  it("returns an explicitly synthetic market scenario", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "model_market_scenario",
      arguments: {
        briefId: "brief-test",
        searchRadiusKm: 50,
        remoteSharePercent: 40,
        seniority: "senior",
        mustHaveSkills: ["TypeScript"],
        addedMustHaveSkills: ["Kubernetes"]
      }
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      kind: "market_scenario",
      status: "synthetic_scenario_only"
    });
  });
});
