import type { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({});

interface ChannelItem {
  channel_id: string;
  id_client: number;
  code_client: string;
  username: string;
  name: string;
  channel_type: string;
  created_at: string;
  settings: Record<string, unknown>;
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

    // Get channel_id from path parameters
    const channelId = event.pathParameters?.id;

    if (!channelId) {
      return errorResponse(400, 'Missing channel ID in path');
    }

    const tableName = process.env.CHANNELS_TABLE_NAME;
    if (!tableName) {
      return errorResponse(500, 'Missing CHANNELS_TABLE_NAME environment variable');
    }

    // Get item from DynamoDB
    const getCommand = new GetItemCommand({
      TableName: tableName,
      Key: {
        channel_id: { S: channelId },
      },
    });

    const response = await dynamoClient.send(getCommand);

    if (!response.Item) {
      return errorResponse(404, 'Channel not found');
    }

    const channel = unmarshall(response.Item) as ChannelItem;

    return {
      statusCode: 200,
      body: JSON.stringify(channel),
    };
  } catch (error) {
    console.error('Error getting channel:', error);
    return errorResponse(500, 'Internal server error');
  }
};