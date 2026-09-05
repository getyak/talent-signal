import { redirect } from "next/navigation";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import { ContactAgentWorkspace } from "@/components/contact-agent/contact-agent-workspace";
export const dynamic="force-dynamic";
export const metadata={title:"截图归档 · Talent Signal",robots:{index:false,follow:false}};
export default async function Page(){
  if(!await readBackendSessionClaims())redirect("/login?callbackUrl=%2Fcontact-agent");
  return <ContactAgentWorkspace/>;
}
