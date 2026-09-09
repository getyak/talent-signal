import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";

const ID = Type.String({ format: "uuid" });
const Time = Type.String({ format: "date-time" });
const Name = Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" });
const Revision = Type.Integer({ minimum: 1 });
const Role = Type.Union([Type.Literal("admin"), Type.Literal("member")]);
const Status = Type.Union([Type.Literal("active"), Type.Literal("revoked")]);
export const AccountSettingsSchema = Type.Object({
  contract_version: Type.Literal(CONTRACT_VERSION),
  user: Type.Object({ id: ID, email: Type.String(), display_name: Type.String(),
    username: Type.Union([Type.String(), Type.Null()]), kind: Type.String(), revision: Revision,
    login_methods: Type.Array(Type.Union([Type.Literal("google"), Type.Literal("apple"), Type.Literal("password")])) }),
  workspace: Type.Object({ id: ID, name: Type.String(), slug: Type.String(), revision: Revision,
    owner_user_id: Type.Union([ID, Type.Null()]), role: Role, is_owner: Type.Boolean(),
    can_manage: Type.Boolean(), is_test: Type.Boolean() }),
  sessions: Type.Array(Type.Object({ id: ID, client_label: Type.String(), created_at: Time,
    expires_at: Time, is_current: Type.Boolean() })),
  members: Type.Array(Type.Object({ id: ID, display_name: Type.String(), email: Type.String(),
    role: Role, status: Status, is_owner: Type.Boolean() })),
  activity: Type.Array(Type.Object({ id: ID, kind: Type.String(), actor_name: Type.String(), created_at: Time })),
  lab_enabled: Type.Boolean(),
}, { additionalProperties: false });

const Common = { id: ID, expected_revision: Revision };
export const AccountMutationSchema = Type.Union([
  Type.Object({ ...Common, kind: Type.Literal("profile"), name: Name }, { additionalProperties: false }),
  Type.Object({ ...Common, kind: Type.Literal("workspace"), name: Name }, { additionalProperties: false }),
  Type.Object({ ...Common, kind: Type.Literal("member"), user_id: ID, role: Role, status: Status }, { additionalProperties: false }),
  Type.Object({ ...Common, kind: Type.Literal("transfer"), user_id: ID }, { additionalProperties: false }),
  Type.Object({ id: ID, kind: Type.Literal("revoke_session"), session_id: ID }, { additionalProperties: false }),
]);
export type AccountSettings = Static<typeof AccountSettingsSchema>;
export type AccountMutation = Static<typeof AccountMutationSchema>;
