import type { APIGatewayProxyHandler } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

interface UpdateDanaconnectRequest {
  clientId: string;
  clientSecret: string;
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

function errorResponse(statusCode: number, message: string) {
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

    const secretName = process.env.DANACONNECT_SECRET_NAME;
    if (!secretName) {
      return errorResponse(500, 'Missing environment variable: DANACONNECT_SECRET_NAME');
    }

    // Get current secrets
    const getSecretCommand = new GetSecretValueCommand({ SecretId: secretName });
    const secretResponse = await secretsClient.send(getSecretCommand);

    let credentials: DanaconnectCredentials = {};

    if (secretResponse.SecretString) {
      try {
        credentials = JSON.parse(secretResponse.SecretString);
      } catch {
        credentials = {};
      }
    }

    // Update credentials for this code_client
    credentials[codeClient] = { clientId, clientSecret };

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
      }),
    };
  } catch (error) {
    console.error('Error updating DANAconnect credentials:', error);
    return errorResponse(500, 'Internal server error');
  }
};