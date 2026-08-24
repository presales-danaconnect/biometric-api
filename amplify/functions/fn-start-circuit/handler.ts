import type { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});

interface Person {
  name?: string;
  documentNumber?: string;
  email?: string;
}

interface StartCircuitRequest {
  person?: Person;
}

interface ChannelSettings {
  steps: string[];
  baseUrl: string;
  webhookUrl?: string;
  projectId?: string;
  redirectUrl?: string;
  ui: Record<string, unknown>;
  thresholds: Record<string, unknown>;
}

interface ChannelItem {
  channel_id: string;
  channel_type: string;
  settings: ChannelSettings;
}

interface CircuitItem {
  circuit_id: string;
  channel_id: string;
  channel_type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  current_step: string | null;
  steps_completed: string[];
  person?: Person;
  result: Record<string, unknown>;
  created_at: string;
  expires_at: string;
}

interface StartCircuitResponse {
  circuitId: string;
  link: string;
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
    // Get channel_id from path parameters
    const channelId = event.pathParameters?.channel_id;

    if (!channelId) {
      return errorResponse(400, 'Missing channel ID in path');
    }

    const circuitsTableName = process.env.CIRCUITS_TABLE_NAME;
    const channelsTableName = process.env.CHANNELS_TABLE_NAME;

    if (!circuitsTableName || !channelsTableName) {
      return errorResponse(500, 'Missing table names environment variables');
    }

    // Parse request body
    let person: Person | undefined;
    if (event.body) {
      try {
        const body = JSON.parse(event.body) as StartCircuitRequest;
        person = body.person;
      } catch {
        return errorResponse(400, 'Invalid JSON in request body');
      }
    }

    // Get channel from DynamoDB
    const getChannelCommand = new GetItemCommand({
      TableName: channelsTableName,
      Key: {
        channel_id: { S: channelId },
      },
    });

    const channelResponse = await dynamoClient.send(getChannelCommand);

    if (!channelResponse.Item) {
      return errorResponse(404, 'Channel not found');
    }

    const channel = unmarshall(channelResponse.Item) as ChannelItem;

    // Generate circuit_id with UUID
    const circuitId = uuidv4();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

    // Create circuit item
    const circuit: CircuitItem = {
      circuit_id: circuitId,
      channel_id: channelId,
      channel_type: channel.channel_type,
      status: 'pending',
      current_step: null,
      steps_completed: [],
      person,
      result: {},
      created_at: createdAt,
      expires_at: expiresAt,
    };

    // Save circuit to DynamoDB
    const putCommand = new PutItemCommand({
      TableName: circuitsTableName,
      Item: marshall(circuit),
    });

    await dynamoClient.send(putCommand);

    // Build verification link
    const link = `${channel.settings.baseUrl}/?circuit=${circuitId}`;

    const response: StartCircuitResponse = {
      circuitId,
      link,
    };

    return {
      statusCode: 201,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error starting circuit:', error);
    return errorResponse(500, 'Internal server error');
  }
};