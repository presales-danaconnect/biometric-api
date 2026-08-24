import type { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({});

interface UIColors {
  primary: string;
  background: string;
  headerBackground: string;
  footerBackground: string;
  headerFontColor: string;
  footerFontColor: string;
}

interface UILayout {
  headerAlign: 'left' | 'center' | 'right';
  footerAlign: 'left' | 'center' | 'right';
}

interface UIConfig {
  headerTitle: string;
  headerLogoUrl?: string;
  bgColor: string;
  footerPrivacyPolicyUrl?: string;
  footerWebsiteUrl?: string;
  colors: UIColors;
  layout: UILayout;
}

interface Thresholds {
  livenessConfidenceThreshold: number;
  compareFacesSimilarityThreshold: number;
  ocrConfidenceThreshold: number;
  maxAttempts: number;
  requiresBackDocument: boolean;
}

interface ChannelSettings {
  steps: string[];
  baseUrl: string;
  webhookUrl?: string;
  projectId?: string;
  redirectUrl?: string;
  ui: UIConfig;
  thresholds: Thresholds;
}

interface ChannelItem {
  channel_id: string;
  channel_type: string;
  settings: ChannelSettings;
}

interface CircuitItem {
  circuit_id: string;
  channel_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  current_step?: string;
  steps_completed: string[];
  person?: {
    name?: string;
    documentNumber?: string;
    email?: string;
  };
  result: Record<string, unknown>;
  created_at: string;
  expires_at: string;
}

interface GetConfigResponse {
  circuitId: string;
  status: string;
  currentStep: string | null;
  stepsCompleted: string[];
  steps: string[];
  channelType: string;
  ui: UIConfig;
  thresholds: Thresholds;
}

interface ErrorResponse {
  statusCode: number;
  body: string;
}

function errorResponse(statusCode: number, message: string): ErrorResponse {
  return {
    statusCode,
    body: JSON.stringify({ error: message }),
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // Get circuit_id from path parameters
    const circuitId = event.pathParameters?.circuit_id;

    if (!circuitId) {
      return errorResponse(400, 'Missing circuit ID in path');
    }

    const circuitsTableName = process.env.CIRCUITS_TABLE_NAME;
    const channelsTableName = process.env.CHANNELS_TABLE_NAME;

    if (!circuitsTableName || !channelsTableName) {
      return errorResponse(500, 'Missing table names environment variables');
    }

    // Get circuit from DynamoDB
    const getCircuitCommand = new GetItemCommand({
      TableName: circuitsTableName,
      Key: {
        circuit_id: { S: circuitId },
      },
    });

    const circuitResponse = await dynamoClient.send(getCircuitCommand);

    if (!circuitResponse.Item) {
      return errorResponse(404, 'Circuit not found');
    }

    const circuit = unmarshall(circuitResponse.Item) as CircuitItem;

    // Check if circuit is already completed or failed
    if (circuit.status === 'completed' || circuit.status === 'failed') {
      return errorResponse(410, 'Circuit has already been processed');
    }

    // Get channel from DynamoDB
    const getChannelCommand = new GetItemCommand({
      TableName: channelsTableName,
      Key: {
        channel_id: { S: circuit.channel_id },
      },
    });

    const channelResponse = await dynamoClient.send(getChannelCommand);

    if (!channelResponse.Item) {
      return errorResponse(404, 'Channel not found');
    }

    const channel = unmarshall(channelResponse.Item) as ChannelItem;
    const settings = channel.settings;

    const response: GetConfigResponse = {
      circuitId: circuit.circuit_id,
      status: circuit.status,
      currentStep: circuit.current_step || null,
      stepsCompleted: circuit.steps_completed,
      steps: settings.steps,
      channelType: channel.channel_type,
      ui: {
        headerTitle: settings.ui.headerTitle,
        headerLogoUrl: settings.ui.headerLogoUrl,
        bgColor: settings.ui.bgColor,
        footerPrivacyPolicyUrl: settings.ui.footerPrivacyPolicyUrl,
        footerWebsiteUrl: settings.ui.footerWebsiteUrl,
        colors: settings.ui.colors,
        layout: settings.ui.layout,
      },
      thresholds: {
        livenessConfidenceThreshold: settings.thresholds.livenessConfidenceThreshold,
        compareFacesSimilarityThreshold: settings.thresholds.compareFacesSimilarityThreshold,
        ocrConfidenceThreshold: settings.thresholds.ocrConfidenceThreshold,
        maxAttempts: settings.thresholds.maxAttempts,
        requiresBackDocument: settings.thresholds.requiresBackDocument,
      },
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error getting config:', error);
    return errorResponse(500, 'Internal server error');
  }
};