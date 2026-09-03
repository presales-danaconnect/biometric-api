import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';

const dynamoClient = new DynamoDBClient({});
const secretsClient = new SecretsManagerClient({});

interface UpdateDanaconnectRequest {
  clientId: string;
  clientSecret: string;
}

interface ChannelItem {
  channel_id: string;
  code_client: string;
  settings: {
    steps?: string[];
    baseUrl?: string;
    webhookUrl?: string;
    projectId?: string;
    redirectUrl?: string;
    ui?: Record<string, unknown>;
    thresholds?: {
      livenessConfidenceThreshold: number;
      compareFacesSimilarityThreshold: number;
      ocrConfidenceThreshold: number;
      maxAttempts: number;
      requiresBackDocument: boolean;
    };
  };
}

interface DanaconnectCredentials {
  [code_client: string]: {
    clientId: string;
    clientSecret: string;
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-key',
  'Content-Type': 'application/json',
};

interface ErrorResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function errorResponse(statusCode: number, message: string): ErrorResponse {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({ error: message }),
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // Validate x-admin-key header
    const adminKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // Get code_client from path
    const codeClient = event.pathParameters?.code_client;
    if (!codeClient) {
      return errorResponse(400, 'Missing code_client in path');
    }

    if (!event.body) {
      return errorResponse(400, 'Missing request body');
    }

    let body: UpdateDanaconnectRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse(400, 'Invalid JSON in request body');
    }

    const { clientId, clientSecret } = body;
    if (!clientId || !clientSecret) {
      return errorResponse(400, 'clientId and clientSecret are required');
    }

    const channelsTableName = process.env.CHANNELS_TABLE_NAME;
    const secretName = process.env.DANACONNECT_SECRET_NAME;

    if (!channelsTableName || !secretName) {
      return errorResponse(500, 'Missing environment variables');
    }

    // Check if channel exists for this code_client
    const getChannelCommand = new GetItemCommand({
      TableName: channelsTableName,
      Key: { channel_id: { S: codeClient } },
    });

    const channelResponse = await dynamoClient.send(getChannelCommand);
    if (!channelResponse.Item) {
      return errorResponse(404, 'Channel not found for this code_client');
    }

    const channel = unmarshall(channelResponse.Item) as ChannelItem;

    // Verify the channel has projectId configured for DANAconnect
    if (!channel.settings.projectId) {
      return errorResponse(400, 'Channel does not have projectId configured for DANAconnect');
    }

    // Get current secrets
    const getSecretCommand = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const secretResponse = await secretsClient.send(getSecretCommand);
    let credentials: DanaconnectCredentials = {};
    
    if (secretResponse.SecretString) {
      try {
        credentials = JSON.parse(secretResponse.SecretString);
      } catch {
        // If parsing fails, start with empty object
        credentials = {};
      }
    }

    // Update credentials for this code_client
    credentials[codeClient] = {
      clientId,
      clientSecret,
    };

    // Save updated credentials
    const updateSecretCommand = new UpdateSecretCommand({
      SecretId: secretName,
      SecretString: JSON.stringify(credentials),
    });

    await secretsClient.send(updateSecretCommand);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'DANAconnect credentials updated successfully',
        code_client: codeClient,
        projectId: channel.settings.projectId,
      }),
    };
  } catch (error) {
    console.error('Error updating DANAconnect credentials:', error);
    return errorResponse(500, 'Internal server error');
  }
};