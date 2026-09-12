import { leaveTestWorkspace } from "@/app/workspace/settings/testing/actions";
import styles from "@/components/account-settings.module.css";
import { redirect } from "next/navigation";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import { ContactAgentWorkspace } from "@/components/contact-agent/contact-agent-workspace";
export const dynamic="force-dynamic";
export const metadata={title:"截图归档 · Talent Signal",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{task?:string}>}){
  const scope=await readBackendSessionClaims();
  if(!scope)redirect("/login?callbackUrl=%2Fcontact-agent");
  const task = (await searchParams).task;
  return <div data-workspace-scope={scope.backendAccountId}><>{scope.backendAccountSlug.startsWith("lab-")&&<div className={styles.banner}><span>测试空间 · {scope.backendAccountName}</span><form action={leaveTestWorkspace}><button type="submit">返回我的空间</button></form></div>}<ContactAgentWorkspace initialTaskID={task && /^[0-9a-f-]{36}$/iu.test(task) ? task : undefined}/></></div>;
}
