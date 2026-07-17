import { NextResponse } from "next/server";
import { z } from "zod";

import { importJobAdUrl, JobSourceError } from "@/lib/server/job-source";

export const runtime = "nodejs";

const RequestSchema = z.strictObject({ url: z.string().trim().min(8).max(2_000) });

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Request body must be valid JSON." } }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Please enter a valid job-ad URL." } }, { status: 400 });
  }
  try {
    return NextResponse.json(await importJobAdUrl(parsed.data.url), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof JobSourceError ? error.message : "The job-ad URL could not be retrieved.";
    const status = error instanceof JobSourceError ? error.status : 502;
    return NextResponse.json({ error: { message } }, { status });
  }
}
