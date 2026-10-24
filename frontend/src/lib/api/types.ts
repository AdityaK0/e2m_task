export type Role = "admin" | "manager";

export type CustomerStatus =
  | "prospect"
  | "onboarding"
  | "active"
  | "at_risk"
  | "churned";

export type InteractionType = "meeting" | "call" | "email" | "other";

export type InsightStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stale";

export type Sentiment = "Positive" | "Neutral" | "Negative";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  auto_assign_new_customers: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface UserOption {
  id: number;
  name: string;
}

export interface Customer {
  id: number;
  name: string;
  company: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  industry: string | null;
  website: string | null;
  status: CustomerStatus;
  health_score: number | null;
  health_sample_size: number;
  assigned_managers: UserSummary[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerDetail extends Customer {
  interaction_count: number;
  last_interaction_at: string | null;
  insight_count: number;
}

export interface Interaction {
  id: number;
  customer_id: number;
  customer: Pick<Customer, "id" | "name" | "company">;
  title: string;
  type: InteractionType;
  occurred_at: string;
  notes: string | null;
  notes_version: number;
  ai_provider: string | null;
  ai_model: string | null;
  participants: number[];
  external_attendees: string[];
  owner_id: number | null;
  owner: UserSummary | null;
  created_at: string;
  updated_at: string;
}

export interface InteractionDetail extends Interaction {
  insight_status: InsightStatus | null;
  insight_generated_at: string | null;
}

export interface ActionItem {
  description: string;
  owner: string | null;
  due_date: string | null;
}

export interface RiskItem {
  description: string;
  severity: "low" | "medium" | "high" | null;
}

export interface MeetingInsight {
  id: number;
  interaction_id: number;
  status: InsightStatus;
  summary: string | null;
  sentiment: Sentiment | null;
  action_items: ActionItem[];
  risks: RiskItem[];
  action_item_count: number;
  risk_count: number;
  notes_version: number;
  generation_version: number;
  provider: string | null;
  model: string | null;
  error_message: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
  is_stale: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface UserList extends Paginated<User> {}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: User;
}

export interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

export interface UserCredentials {
  user: Pick<User, "email">;
  password: string;
}

export interface MeResponse {
  data: User;
}

export interface MessageResponse {
  success: boolean;
  message: string;
}

export interface AuthorizationConfig {
  registration_enabled: boolean;
  roles: Role[];
}

export interface RoleOption {
  value: Role;
  label: string;
}

export interface StatusCount {
  status: CustomerStatus;
  count: number;
}

export interface SentimentCount {
  sentiment: string;
  count: number;
}

export interface RecentInteraction {
  id: number;
  title: string;
  type: InteractionType;
  occurred_at: string;
  customer_id: number;
  customer_name: string;
  has_insight: boolean;
}

export interface AtRiskCustomer {
  id: number;
  name: string;
  status: CustomerStatus;
  health_score: number | null;
  health_sample_size: number;
  assigned_manager: string | null | undefined;
}

export interface DashboardSummary {
  total_customers: number;
  active_customers: number;
  at_risk_customers: number;
  average_health_score: number | null;
  prospect_customers: number;
  churned_customers: number;
  total_interactions: number;
  interactions_last_7_days: number;
  completed_insights: number;
  failed_insights: number;
  stale_insights: number;
  open_action_items: number;
  customers_by_status: StatusCount[];
  sentiment_distribution: SentimentCount[];
  recent_interactions: RecentInteraction[];
  at_risk_list: AtRiskCustomer[];
  insights_needing_review: number;
}

export interface Preference {
  key: string;
  value: number;
  default: number;
  min: number | null;
  max: number | null;
  description: string;
}

export interface InsightConfig {
  configured: boolean;
  provider: string | null;
  model: string | null;
}

export interface ApiValidationError {
  field: string;
  message: string;
  type: string;
}

export interface ApiErrorPayload {
  success?: false;
  message?: string;
  error_code?: string;
  errors?: ApiValidationError[];
}
