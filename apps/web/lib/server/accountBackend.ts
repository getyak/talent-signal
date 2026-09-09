import 'server-only';
import { TalentSignalHttpError, type AccountSettings, type AccountMutation } from '@talent-signal/contracts';
import { authenticatedBackendClient } from './backendAuth';

export async function accountBackend() {
  const client = await authenticatedBackendClient();
  if (!client) throw new TalentSignalHttpError(401, 'AUTH_REQUIRED', '请重新登录。', null);
  return client;
}
export async function loadAccountSettings(): Promise<AccountSettings> {
  return (await accountBackend()).accountSettings();
}
export async function updateAccountSettings(input: AccountMutation) {
  return (await accountBackend()).updateAccountSettings(input);
}
