import type { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
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

/**
 * Deep merge two objects recursively.
 * Arrays are replaced completely, not merged.
 * Primitive values and other types are replaced.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const targetValue = target[key];
    const sourceValue = source[key];

    if (sourceValue === undefined) {
      continue;
    }

    if (
      targetValue !== undefined &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue) &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue)
    ) {
      // Both are objects (not arrays), merge recursively
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else {
      // Replace with source value (includes arrays and primitives)
      result[key] = sourceValue;
    }
  }

  return result;
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

    // Get current channel from DynamoDB
    const getCommand = new GetItemCommand({
      TableName: tableName,
      Key: {
        channel_id: { S: channelId },
      },
    });

    const getResponse = await dynamoClient.send(getCommand);

    if (!getResponse.Item) {
      return errorResponse(404, 'Channel not found');
    }

    const currentChannel = unmarshall(getResponse.Item) as ChannelItem;

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

    // Handle settings with deep merge
    if (body.settings) {
      const mergedSettings = deepMerge(currentChannel.settings, body.settings);

      // Update entire settings object
      updateParts.push(`#settings = :v${attrIndex}`);
      expressionAttributeNames['#settings'] = 'settings';
      expressionAttributeValues[`:v${attrIndex}`] = { M: convertToDynamoMap(mergedSettings) };
      attrIndex++;
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

/**
 * Recursively convert a plain object to DynamoDB attribute map
 */
function convertToDynamoMap(obj: Record<string, unknown>): Record<string, AttributeValue> {
  const result: Record<string, AttributeValue> = {};

  for (const [key, value] of Object.entries(obj)) {
    result[key] = toAttributeValue(value);
  }

  return result;
}

/**
 * Convert a JavaScript value to a DynamoDB AttributeValue
 */
function toAttributeValue(value: unknown): AttributeValue {
  if (value === null || value === undefined) {
    return { NULL: true };
  }

  if (typeof value === 'string') {
    return { S: value };
  }

  if (typeof value === 'number') {
    return { N: value.toString() };
  }

  if (typeof value === 'boolean') {
    return { BOOL: value };
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'string') {
      // String array
      return { L: value.map((v) => ({ S: v })) };
    }
    // Generic array
    return { L: value.map(toAttributeValue) };
  }

  if (typeof value === 'object') {
    return { M: convertToDynamoMap(value as Record<string, unknown>) };
  }

  return { S: String(value) };
}