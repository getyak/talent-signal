import { ContactChatExtractionSchema, type ContactChatExtraction } from "@talent-signal/agent";

export function mergeContactExtractions(parts: ContactChatExtraction[]): {
  extraction: ContactChatExtraction | null; identityConflict: boolean; question: string | null;
} {
  const names = new Set(parts.map(p => p.contact_name?.normalize("NFKC").trim().toLowerCase()).filter(Boolean));
  if (names.size > 1) return {extraction:null, identityConflict:true,
    question:"这些截图显示了不同联系人，请按联系人分别发送。"};
  if (parts.some(p => p.messages.length === 0)) return {extraction:null, identityConflict:true,
    question:"部分图片没有可读取的聊天消息，请移除或替换后重新发送。"};
  if (parts.reduce((sum,p) => sum + p.messages.length,0) > 100) return {extraction:null, identityConflict:true,
    question:"这组截图的消息过多，请拆成较小的两组发送。"};
  let sequence = 0;
  const extraction = ContactChatExtractionSchema.parse({
    platform: parts[0]!.platform,
    conversation_kind: parts.every(p => p.conversation_kind === "direct") ? "direct" : "unknown",
    contact_name: parts.find(p => p.contact_name)?.contact_name ?? null,
    // Keep all distinct clues; never silently drop message evidence. The bounded
    // model schema limits clue context, while per-image checkpoints retain originals.
    identity_clues: parts.flatMap((p,index) => p.identity_clues.map(c => ({...c,source_image_index:index}))).slice(0,12),
    messages: parts.flatMap((p,index) => p.messages.map(m => {
      const position = sequence++;
      return {...m,message_id:`m${position+1}`,sequence:position,source_image_index:index};
    })),
    uncertainties: [...new Set(parts.flatMap(p => p.uncertainties)),
      ...(parts.length>1 ? ["Images are ordered as attached; overlapping messages are preserved with their image provenance, not assumed to be separate events."] : [])].slice(-15),
  });
  return {extraction,identityConflict:false,question:null};
}
