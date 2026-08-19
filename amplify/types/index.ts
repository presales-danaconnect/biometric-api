// Environment type
export type Environment = 'dev' | 'staging' | 'prod' | string;

// UI Colors Configuration
export interface UIColors {
  primary: string;
  background: string;
  headerBackground: string;
  footerBackground: string;
  headerFontColor: string;
  footerFontColor: string;
}

// UI Layout Configuration
export interface UILayout {
  headerAlign: 'left' | 'center' | 'right';
  footerAlign: 'left' | 'center' | 'right';
}

// UI Configuration
export interface UIConfig {
  headerTitle: string;
  headerLogoUrl?: string;
  bgColor: string;
  footerPrivacyPolicyUrl?: string;
  footerWebsiteUrl?: string;
  colors: UIColors;
  layout: UILayout;
}

// Thresholds Configuration
export interface Thresholds {
  livenessConfidenceThreshold: number;
  compareFacesSimilarityThreshold: number;
  ocrConfidenceThreshold: number;
  maxAttempts: number;
  requiresBackDocument: boolean;
  documentType: number;
}

// Channel Settings
export interface ChannelSettings {
  steps: string[];
  baseUrl: string;
  webhookUrl?: string;
  projectId?: string;
  redirectUrl?: string;
  ui: UIConfig;
  thresholds: Thresholds;
}

// Channel DynamoDB Model
export interface Channel {
  channel_id: string;
  id_client: string;
  code_client: string;
  username: string;
  name: string;
  created_at: string;
  settings: ChannelSettings;
}

// Person Data
export interface Person {
  name?: string;
  documentNumber?: string;
  email?: string;
  birthDate?: string;
}

// Step Result
export interface StepResult {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  confidence?: number;
  data?: Record<string, unknown>;
  error?: string;
  completed_at?: string;
}

// Circuit DynamoDB Model
export interface Circuit {
  circuit_id: string;
  channel_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  current_step?: string;
  steps_completed: string[];
  person?: Person;
  result: Record<string, StepResult>;
  created_at: string;
  expires_at: string;
  completed_at?: string;
}