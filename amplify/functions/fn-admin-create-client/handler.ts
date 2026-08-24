import type { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, CreateUserPoolClientCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

interface CreateClientRequest {
  code_client: string;
  username: string;
}

interface CreateClientResponse {
  clientId: string;
  clientSecret: string;
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

    let body: CreateClientRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse(400, 'Invalid JSON in request body');
    }

    const { code_client, username } = body;

    if (!code_client || !username) {
      return errorResponse(400, 'Missing required fields: code_client, username');
    }

    const userPoolId = process.env.USER_POOL_ID;
    if (!userPoolId) {
      return errorResponse(500, 'Missing USER_POOL_ID environment variable');
    }

    // Create App Client in Cognito User Pool
    const clientName = `${code_client}-client`;

    const createClientCommand = new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: clientName,
      GenerateSecret: true,
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ['client_credentials'],
      AllowedOAuthScopes: [
        'biometric-danaconnect/start_circuit',
        'biometric-danaconnect/read',
      ],
      SupportedIdentityProviders: [],
    });

    const createClientResponse = await cognitoClient.send(createClientCommand);

    if (!createClientResponse.UserPoolClient?.ClientId || !createClientResponse.UserPoolClient?.ClientSecret) {
      return errorResponse(500, 'Failed to create Cognito App Client');
    }

    const response: CreateClientResponse = {
      clientId: createClientResponse.UserPoolClient.ClientId,
      clientSecret: createClientResponse.UserPoolClient.ClientSecret,
    };

    return {
      statusCode: 201,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error creating client:', error);
    return errorResponse(500, 'Internal server error');
  }
};