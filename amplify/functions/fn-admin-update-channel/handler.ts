import type { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({});

interface ChannelSettings {
  steps?: string[];
  baseUrl?: string;
  webhookUrl?: string;
  projectId?: string;
  redirectUrl?: string;
  ui?: Record<string, unknown>;
  thresholds?: Record<string, unknown>;
}

interface UpdateChannelRequest {
  id_client?: number;
  code_client?: string;
  username?: string;
  name?: string;
  channel_type?: string;
  settings?: Partial<ChannelSettings>;
}

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

    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'Missing request body');
    }

    let body: UpdateChannelRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse(400, 'Invalid JSON in request body');
    }

    const tableName = process.env.CHANNELS_TABLE_NAME;
    if (!tableName) {
      return errorResponse(500, 'Missing CHANNELS_TABLE_NAME environment variable');
    }

    // Build update expression and attribute values
    const updateParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, AttributeValue> = {};

    let attrIndex = 1;

    if (body.id_client !== undefined) {
      updateParts.push(`#id_client = :v${attrIndex}`);
      expressionAttributeNames['#id_client'] = 'id_client';
      expressionAttributeValues[`:v${attrIndex}`] = { N: body.id_client.toString() };
      attrIndex++;
    }

    if (body.code_client !== undefined) {
      updateParts.push(`#code_client = :v${attrIndex}`);
      expressionAttributeNames['#code_client'] = 'code_client';
      expressionAttributeValues[`:v${attrIndex}`] = { S: body.code_client };
      attrIndex++;
    }

    if (body.username !== undefined) {
      updateParts.push(`#username = :v${attrIndex}`);
      expressionAttributeNames['#username'] = 'username';
      expressionAttributeValues[`:v${attrIndex}`] = { S: body.username };
      attrIndex++;
    }

    if (body.name !== undefined) {
      updateParts.push(`#name = :v${attrIndex}`);
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[`:v${attrIndex}`] = { S: body.name };
      attrIndex++;
    }

    if (body.channel_type !== undefined) {
      updateParts.push(`#channel_type = :v${attrIndex}`);
      expressionAttributeNames['#channel_type'] = 'channel_type';
      expressionAttributeValues[`:v${attrIndex}`] = { S: body.channel_type };
      attrIndex++;
    }

    if (body.settings) {
      if (body.settings.steps !== undefined) {
        updateParts.push(`#settings.#steps = :v${attrIndex}`);
        expressionAttributeNames['#settings'] = 'settings';
        expressionAttributeNames['#steps'] = 'steps';
        expressionAttributeValues[`:v${attrIndex}`] = { L: body.settings.steps.map((s) => ({ S: s })) } as AttributeValue;
        attrIndex++;
      }
      if (body.settings.baseUrl !== undefined) {
        updateParts.push(`#settings.#baseUrl = :v${attrIndex}`);
        expressionAttributeNames['#settings'] = 'settings';
        expressionAttributeNames['#baseUrl'] = 'baseUrl';
        expressionAttributeValues[`:v${attrIndex}`] = { S: body.settings.baseUrl };
        attrIndex++;
      }
      if (body.settings.webhookUrl !== undefined) {
        updateParts.push(`#settings.#webhookUrl = :v${attrIndex}`);
        expressionAttributeNames['#settings'] = 'settings';
        expressionAttributeNames['#webhookUrl'] = 'webhookUrl';
        expressionAttributeValues[`:v${attrIndex}`] = { S: body.settings.webhookUrl };
        attrIndex++;
      }
      if (body.settings.projectId !== undefined) {
        updateParts.push(`#settings.#projectId = :v${attrIndex}`);
        expressionAttributeNames['#settings'] = 'settings';
        expressionAttributeNames['#projectId'] = 'projectId';
        expressionAttributeValues[`:v${attrIndex}`] = { S: body.settings.projectId };
        attrIndex++;
      }
      if (body.settings.redirectUrl !== undefined) {
        updateParts.push(`#settings.#redirectUrl = :v${attrIndex}`);
        expressionAttributeNames['#settings'] = 'settings';
        expressionAttributeNames['#redirectUrl'] = 'redirectUrl';
        expressionAttributeValues[`:v${attrIndex}`] = { S: body.settings.redirectUrl };
        attrIndex++;
      }
    }

    if (updateParts.length === 0) {
      return errorResponse(400, 'No fields to update');
    }

    // Update item in DynamoDB
    const updateCommand = new UpdateItemCommand({
      TableName: tableName,
      Key: {
        channel_id: { S: channelId },
      },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const response = await dynamoClient.send(updateCommand);

    if (!response.Attributes) {
      return errorResponse(500, 'Failed to update channel');
    }

    const channel = unmarshall(response.Attributes) as ChannelItem;

    return {
      statusCode: 200,
      body: JSON.stringify(channel),
    };
  } catch (error) {
    console.error('Error updating channel:', error);
    return errorResponse(500, 'Internal server error');
  }
};