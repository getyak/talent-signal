import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { loadTelemetryArtifact } from "@/lib/server/telemetryBackend";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ artifactId: string }> },
) {
  if (!(await auth())?.user) return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  const { artifactId } = await context.params;
  if (!UUID.test(artifactId)) return NextResponse.json({ code: "artifact_id_invalid" }, { status: 400 });
  try {
    const artifact = await loadTelemetryArtifact(artifactId);
    return new NextResponse(artifact.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": artifact.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ code: "telemetry_backend_unavailable" }, { status: 503 });
  }
}
