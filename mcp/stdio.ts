import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRecruitmentMcpServer } from "@/mcp/server";

const server = createRecruitmentMcpServer();
await server.connect(new StdioServerTransport());
