import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { TestWorkspaces } from '@/components/test-workspaces';
import { listTestWorkspaces, primaryAccount } from '@/lib/server/testWorkspaceBackend';
import { leaveTestWorkspace } from './actions';
import styles from '@/components/account-settings.module.css';

export const dynamic='force-dynamic';
export const metadata={title:'测试空间',robots:{index:false,follow:false}};
export default async function TestingPage({searchParams}:{searchParams:Promise<{leave?:string}>}){
  if(!(await auth())?.user)redirect('/login?callbackUrl=%2Fworkspace%2Fsettings%2Ftesting');
  let data,primary;
  try{primary=await primaryAccount();data=await listTestWorkspaces();}catch{ /* No fixture or implicit authentication fallback. */ }
  return <main id="main-content" className={styles.page}><header className={styles.heading}><p className={styles.eyebrow}>可退出，可重新开始</p><h1>测试空间</h1><p>用自己的账号进入隔离空间，保留清楚的测试边界。</p></header><nav className={styles.tabs} aria-label="账号设置"><Link href="/workspace/settings">账号与安全</Link><Link href="/workspace/settings?section=workspace">工作空间</Link><Link href="/workspace/settings/testing" aria-current="page">测试空间</Link></nav>{(await searchParams).leave==='retry'&&<form action={leaveTestWorkspace} className={styles.form}><p className={styles.error}>退出结果暂时无法核验，请重试返回自己的空间。</p><button type="submit">重试返回</button></form>}{data&&primary?<TestWorkspaces workspaces={data.workspaces} enabled={data.enabled} parentAccountId={primary.backendAccountId} parentUserId={primary.backendUserId}/>:<section className={styles.section}><h2>测试空间暂不可用</h2><p>当前环境未开放此功能，或账号服务暂时无法连接。</p><Link href="/workspace/settings">返回账号设置</Link></section>}<section className={styles.section}><h2>默认账号说明</h2><p className={styles.secondary}>日常使用自己的 Google、Apple 或邮箱账号。正式环境没有共享的默认管理员密码；本地开发夹具账号只在显式初始化的测试后端中存在。</p><Link className={styles.button} href="/workspace/lab">打开场景评测</Link></section></main>;
}
