import {contactHandoffSessionVersion} from "@/lib/server/contact-handoff-session";
import {NextRequest,NextResponse} from "next/server";
import {backendAuthBaseUrl,readBackendSessionClaims} from "@/lib/server/backendAuth";
import {backendSessionIsExpired} from "@/lib/backend-session";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,context:{params:Promise<{taskID:string;artifact?:string[]}>}){
  const {taskID,artifact=[]}=await context.params,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
  if(!uuid.test(taskID)||artifact.length>1||artifact.some(id=>!uuid.test(id)))return NextResponse.json({message:"文件不存在。"},{status:404});
  const claims=await readBackendSessionClaims();
  if(!claims||backendSessionIsExpired(claims.backendExpiresAt))return NextResponse.json({message:"请重新登录。"},{status:401});
  const binding=contactHandoffSessionVersion(claims),expected=request.headers.get("x-workspace-session");
  if((artifact.length||expected!==null)&&expected!==binding)return NextResponse.json({code:"session_stale",message:"登录已改变，请重新打开当前资料。"},{status:409,headers:{"cache-control":"no-store"}});
  try{
    const upstream=await fetch(`${backendAuthBaseUrl()}/v1/chat/tasks/${taskID}/artifacts${artifact.length?`/${artifact[0]}`:""}`,{
      headers:{authorization:`Bearer ${claims.backendAccessToken}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
    const body=await upstream.arrayBuffer();if(body.byteLength>65000)throw new Error("FILE_LIMIT");
    const headers:Record<string,string>={"cache-control":"no-store","x-content-type-options":"nosniff",
      "content-type":upstream.headers.get("content-type")??"application/json","x-workspace-session":binding};
    const disposition=upstream.headers.get("content-disposition");if(disposition)headers["content-disposition"]=disposition;
    return new NextResponse(body,{status:upstream.status,headers});
  }catch{return NextResponse.json({message:"暂时无法读取文件，请重试。"},{status:503,headers:{"cache-control":"no-store"}});}
}
