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

const OnboardingStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("completed"),
  Type.Literal("skipped"),
]);
const OnboardingFocus = Type.String({ maxLength: 280 });
const OnboardingProfileUrl = Type.String({
  maxLength: 2000,
  pattern: "^(|https://[^\\s]+)$",
});
export const AccountOnboardingSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    account_id: ID,
    user_id: ID,
    display_name: Type.String({ minLength: 1, maxLength: 100 }),
    focus: OnboardingFocus,
    profile_url: OnboardingProfileUrl,
    status: OnboardingStatus,
    revision: Revision,
  },
  { $id: "AccountOnboarding", additionalProperties: false },
);
export const AccountOnboardingMutationSchema = Type.Object(
  {
    id: ID,
    expected_revision: Revision,
    display_name: Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" }),
    focus: OnboardingFocus,
    profile_url: OnboardingProfileUrl,
    status: Type.Union([Type.Literal("completed"), Type.Literal("skipped")]),
  },
  { $id: "AccountOnboardingMutation", additionalProperties: false },
);
export const AccountOnboardingPreviewRequestSchema = Type.Object(
  { url: Type.String({ minLength: 1, maxLength: 2000 }) },
  { $id: "AccountOnboardingPreviewRequest", additionalProperties: false },
);
export const AccountOnboardingPreviewSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    profile_url: Type.String({ minLength: 1, maxLength: 2000 }),
    excerpt: Type.String({ maxLength: 600 }),
    retrieved_at: Time,
  },
  { $id: "AccountOnboardingPreview", additionalProperties: false },
);

export type AccountOnboarding = Static<typeof AccountOnboardingSchema>;
export type AccountOnboardingMutation = Static<
  typeof AccountOnboardingMutationSchema
>;
export type AccountOnboardingPreviewRequest = Static<
  typeof AccountOnboardingPreviewRequestSchema
>;
export type AccountOnboardingPreview = Static<
  typeof AccountOnboardingPreviewSchema
>;

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
