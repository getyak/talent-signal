import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  transcribeRelationshipVoice,
} from "@/lib/server/localBackend";
import { isAllowedMutationOrigin } from "@/lib/request-origin";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WAV_BYTES = 2_500_000;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return response({ code: "cross_origin_voice_denied" }, 403);
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const requestId = String(form.get("request_id") ?? "");
    if (
      !(file instanceof File) ||
      !UUID.test(requestId) ||
      file.type !== "audio/wav" ||
      file.size <= 44 ||
      file.size > MAX_WAV_BYTES
    ) {
      return response(
        {
          code: "voice_transcription_request_invalid",
          message: "Record one short voice note, up to 60 seconds.",
        },
        400,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (
      new TextDecoder("ascii").decode(bytes.slice(0, 4)) !== "RIFF" ||
      new TextDecoder("ascii").decode(bytes.slice(8, 12)) !== "WAVE"
    ) {
      return response(
        {
          code: "voice_audio_format_unsupported",
          message: "临时语音录音不是有效的 WAV 文件。",
        },
        415,
      );
    }
    return response(
      await transcribeRelationshipVoice({
        audio_base64: Buffer.from(bytes).toString("base64"),
        client_request_id: requestId,
        mime_type: "audio/wav",
      }),
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    return response(
      {
        code: "voice_transcription_failed",
        message:
          error instanceof Error
            ? error.message
            : "Voice transcription did not return an editable draft.",
      },
      503,
    );
  }
}
