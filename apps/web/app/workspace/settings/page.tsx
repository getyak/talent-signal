import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { AccountSettingsPanel } from '@/components/account-settings';
import { loadAccountSettings } from '@/lib/server/accountBackend';
import styles from '@/components/account-settings.module.css';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'账号与空间',robots:{index:false,follow:false}};
export default async function SettingsPage({searchParams}:{searchParams:Promise<{section?:string}>}){
  if(!(await auth())?.user) redirect('/login?callbackUrl=%2Fworkspace%2Fsettings');
  const section=(await searchParams).section==='workspace'?'workspace':'account';
  let data;
  try{data=await loadAccountSettings();}catch{ /* Render no account data from fixtures or stale JWT claims. */ }
  return <main id="main-content" className={styles.page}>{data?<AccountSettingsPanel key={`${data.workspace.id}-${section}`} initial={data} section={section}/>:<><h1>账号设置暂时无法连接</h1><p>请确认账号服务已启动，或重新登录后继续。</p><Link className={styles.button} href="/login?callbackUrl=%2Fworkspace%2Fsettings">重新登录</Link></>}</main>;
}
