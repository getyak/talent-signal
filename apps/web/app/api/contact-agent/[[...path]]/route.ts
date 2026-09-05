import { NextRequest, NextResponse } from "next/server";
import { backendAuthBaseUrl, readBackendSessionClaims } from "@/lib/server/backendAuth";
import { backendSessionIsExpired } from "@/lib/backend-session";
import { isAllowedMutationOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";
type Context={params:Promise<{path?:string[]}>};
const uuid="[0-9a-fA-F-]{36}";
const routes=[new RegExp(`^tasks(?:/${uuid}(?:/(?:resume|cancel))?)?$`),new RegExp(`^people/${uuid}/(?:contact-intelligence|archive)$`),new RegExp(`^archives/${uuid}/restore$`)];
async function proxy(request:NextRequest,context:Context){
  const path=(await context.params).path?.join("/")??"";
  if(!routes.some(r=>r.test(path)))return NextResponse.json({message:"入口不存在。"},{status:404});
  if(request.method!=="GET"&&!isAllowedMutationOrigin(request.headers))return NextResponse.json({message:"请求来源不受支持。"},{status:403});
  const claims=await readBackendSessionClaims();
  if(!claims||backendSessionIsExpired(claims.backendExpiresAt))return NextResponse.json({message:"请重新登录。"},{status:401});
  let body:string|undefined;
  if(request.method==="POST"){
    const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
    if(reader){while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>14_000_000){await reader.cancel();return NextResponse.json({message:"截图不能超过 10 MB。"},{status:413});}chunks.push(item.value);}}
    body=Buffer.concat(chunks).toString("utf8");
  }
  const upstreamPath=path.startsWith("people/")?`/v1/${path}`:path.startsWith("archives/")?`/v1/contact-${path}`:`/v1/contact-agent/${path}`;
  try{
    const upstream=await fetch(`${backendAuthBaseUrl()}${upstreamPath}${request.nextUrl.search}`,{method:request.method,
      headers:{authorization:`Bearer ${claims.backendAccessToken}`,"content-type":"application/json"},
      ...(body?{body}:{}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(40_000)});
    return new NextResponse(await upstream.text(),{status:upstream.status,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});
  }catch{return NextResponse.json({message:"暂时无法读取任务；稍后重试会继续核对原任务。"},{status:503});}
}
export const GET=proxy;
export const POST=proxy;
