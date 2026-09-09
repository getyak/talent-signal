import { leaveTestWorkspace } from "@/app/workspace/settings/testing/actions";
import styles from "@/components/account-settings.module.css";
import { redirect } from "next/navigation";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import { ContactAgentWorkspace } from "@/components/contact-agent/contact-agent-workspace";
export const dynamic="force-dynamic";
export const metadata={title:"截图归档 · Talent Signal",robots:{index:false,follow:false}};
export default async function Page(){
  const scope=await readBackendSessionClaims();
  if(!scope)redirect("/login?callbackUrl=%2Fcontact-agent");
  return <div data-workspace-scope={scope.backendAccountId}><>{scope.backendAccountSlug.startsWith("lab-")&&<div className={styles.banner}><span>测试空间 · {scope.backendAccountName}</span><form action={leaveTestWorkspace}><button type="submit">返回我的空间</button></form></div>}<ContactAgentWorkspace/></></div>;
}
