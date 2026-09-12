'use client';
import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LabWorkspace } from '@talent-signal/contracts';
import { manageTestWorkspace, type TestActionState } from '@/app/workspace/settings/testing/actions';
import styles from './account-settings.module.css';

function TestForm({kind,workspaceId,parentAccountId,parentUserId,children}:{kind:string;workspaceId?:string;parentAccountId:string;parentUserId:string;children:React.ReactNode}){
  const [id,setId]=useState('');const router=useRouter();
  const [state,action,pending]=useActionState(async(previous:TestActionState,form:FormData)=>{const result=await manageTestWorkspace(previous,form);if(result.workspace){setId('');router.refresh();}return result;},{});
  return <form action={action} className={styles.form} onSubmit={event=>{
    if(kind==='stop'&&!window.confirm('结束并清空这个测试空间？其中的测试数据将被删除，自己的空间不受影响。')){event.preventDefault();return;}
    const next=id||crypto.randomUUID();(event.currentTarget.elements.namedItem('operationId') as HTMLInputElement).value=next;setId(next);
  }}><input type="hidden" name="operationId" defaultValue={id}/><input type="hidden" name="workspaceId" value={workspaceId??''}/><input type="hidden" name="parentAccountId" value={parentAccountId}/><input type="hidden" name="parentUserId" value={parentUserId}/><input type="hidden" name="kind" value={kind}/><fieldset disabled={pending}>{children}</fieldset><p aria-live="polite" className={state.error?styles.error:styles.notice}>{pending?'正在核验…':state.error??(state.workspace?state.workspace.state==='deleted'?'测试数据已清理。':state.workspace.state==='deleting'?'已停止访问，数据清理尚未完成。':'测试空间已创建。':'')}</p></form>;
}
export function TestWorkspaces({workspaces,enabled,parentAccountId,parentUserId}:{workspaces:LabWorkspace[];enabled:boolean;parentAccountId:string;parentUserId:string}){
  const parent={parentAccountId,parentUserId};
  const states={active:'可进入',expired:'已到期',deleting:'清理中',deleted:'已清理'};
  return <><section className={styles.section}><h2>从空白开始测试</h2><p className={styles.secondary}>每个测试空间使用独立身份，不需要测试密码。只放入合成或明确授权的测试资料。到期后停止访问并清理。</p>{enabled?<TestForm kind="create" {...parent}><label>保留时间<select name="duration" defaultValue="4"><option value="1">1 小时</option><option value="4">4 小时</option><option value="24">24 小时</option></select></label><button type="submit">创建测试空间</button></TestForm>:<p>当前存储尚不支持经过核验的测试清理，创建入口暂不可用。</p>}</section><section className={styles.section}><h2>我的测试空间</h2>{workspaces.length===0?<p className={styles.secondary}>还没有测试空间。创建后可以随时进入，并返回自己的空间。</p>:workspaces.map(w=><div className={styles.member} key={w.id}><div><strong>{w.name}</strong><p className={styles.secondary}>{states[w.state]} · 到期 {new Date(w.expires_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p>{w.cleanup_error&&<p className={styles.error}>清理尚未核验完成，空间不会显示为已清理。</p>}</div>{w.state==='active'&&enabled&&<TestForm kind="enter" workspaceId={w.id} {...parent}><button type="submit">进入测试</button></TestForm>}{w.state!=='deleted'&&<TestForm kind="stop" workspaceId={w.id} {...parent}><button type="submit">结束并清空</button></TestForm>}</div>)}</section></>;
}
