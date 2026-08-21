import type { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});

interface ChannelSettings {
  steps: string[];
  baseUrl: string;
  webhookUrl?: string;
  projectId?: string;
  redirectUrl?: string;
  ui: Record<string, unknown>;
  thresholds: Record<string, unknown>;
}

interface CreateChannelRequest {
  id_client: number;
  code_client: string;
  username: string;
  name: string;
  channel_type: string;
  settings: ChannelSettings;
}

interface ChannelItem {
  channel_id: string;
  id_client: number;
  code_client: string;
  username: string;
  name: string;
  channel_type: string;
  created_at: string;
  settings: ChannelSettings;
}

interface CreateChannelResponse {
  channelId: string;
  createdAt: string;
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
    // Validate x-admin-key header
    const adminKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
    const expectedAdminKey = process.env.ADMIN_KEY;

    if (!adminKey || adminKey !== expectedAdminKey) {
      return errorResponse(401, 'Unauthorized: Missing or invalid x-admin-key header');
    }

    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'Missing request body');
    }

    let body: CreateChannelRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse(400, 'Invalid JSON in request body');
    }

    // Validate required fields
    const { id_client, code_client, username, name, channel_type, settings } = body;

    if (!id_client || !code_client || !username || !name || !channel_type || !settings) {
      return errorResponse(400, 'Missing required fields');
    }

    if (!Array.isArray(settings.steps) || settings.steps.length === 0) {
      return errorResponse(400, 'settings.steps must be a non-empty array');
    }

    const tableName = process.env.CHANNELS_TABLE_NAME;
    if (!tableName) {
      return errorResponse(500, 'Missing CHANNELS_TABLE_NAME environment variable');
    }

    // Generate channel_id with UUID
    const channel_id = uuidv4();
    const created_at = new Date().toISOString();

    const item: ChannelItem = {
      channel_id,
      id_client,
      code_client,
      username,
      name,
      channel_type,
      created_at,
      settings,
    };

    // Save to DynamoDB
    const putCommand = new PutItemCommand({
      TableName: tableName,
      Item: marshall(item),
    });

    await dynamoClient.send(putCommand);

    const response: CreateChannelResponse = {
      channelId: channel_id,
      createdAt: created_at,
    };

    return {
      statusCode: 201,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error creating channel:', error);
    return errorResponse(500, 'Internal server error');
  }
};