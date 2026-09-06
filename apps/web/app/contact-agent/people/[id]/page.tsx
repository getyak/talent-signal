import { redirect } from "next/navigation";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import { ContactAgentWorkspace } from "@/components/contact-agent/contact-agent-workspace";
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{context?:string}>}){
  if(!await readBackendSessionClaims())redirect("/login?callbackUrl=%2Fcontact-agent");
  const {id}=await params;const {context}=await searchParams;
  if(!context)redirect("/contact-agent");
  return <ContactAgentWorkspace personID={id} contextID={context}/>;
}
