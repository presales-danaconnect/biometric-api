import type { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});

interface ChannelItem {
  channel_id: string;
  code_client: string;
  settings: Record<string, unknown>;
}

interface CircuitItem {
  circuit_id: string;
  channel_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  person?: {
    name?: string;
    documentNumber?: string;
    email?: string;
  };
  result: Record<string, unknown>;
  created_at: string;
  expires_at: string;
}

interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

interface ErrorResponse {
  statusCode: number;
  body: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-internal-key',
  'Content-Type': 'application/json',
};

function errorResponse(statusCode: number, message: string): ErrorResponse {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({ error: message }),
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // Validate x-internal-key header
    const internalKey = event.headers['x-internal-key'] || event.headers['X-Internal-Key'];
    if (!internalKey || internalKey !== process.env.INTERNAL_KEY) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // Get circuit_id from path parameters
    const circuitId = event.pathParameters?.circuit_id;

    if (!circuitId) {
      return errorResponse(400, 'Missing circuit ID in path');
    }

    // Get type from query string
    const type = event.queryStringParameters?.type;

    if (!type || (type !== 'front' && type !== 'back')) {
      return errorResponse(400, 'Missing or invalid type query parameter (front or back)');
    }

    const bucketName = process.env.DOCUMENTS_BUCKET_NAME;
    const circuitsTableName = process.env.CIRCUITS_TABLE_NAME;
    const channelsTableName = process.env.CHANNELS_TABLE_NAME;

    if (!bucketName || !circuitsTableName || !channelsTableName) {
      return errorResponse(500, 'Missing environment variables');
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
      return errorResponse(409, 'Circuit has already been processed');
    }

    // Get channel to get code_client
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

    // Build S3 key: {code_client}/{circuit_id}/{type}.jpg
    const s3Key = `${channel.code_client}/${circuitId}/${type}.jpg`;

    // Generate presigned URL for PUT
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: 'image/jpeg',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 600, // 10 minutes
    });

    const response: UploadUrlResponse = {
      uploadUrl,
      s3Key,
      expiresIn: 600,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return errorResponse(500, 'Internal server error');
  }
};