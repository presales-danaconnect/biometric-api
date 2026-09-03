import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  ListUserPoolClientsCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  UpdateSecretCommand,
} from '@aws-sdk/client-secrets-manager';

const cognitoClient = new CognitoIdentityProviderClient({});
const secretsClient = new SecretsManagerClient({});

interface CreateClientRequest {
  code_client: string;
  username: string;
  danaconnect?: {
    clientId: string;
    clientSecret: string;
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

function errorResponse(statusCode: number, message: string) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({ error: message }),
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const adminKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return errorResponse(401, 'Unauthorized: Missing or invalid x-admin-key header');
    }

    if (!event.body) return errorResponse(400, 'Missing request body');

    let body: CreateClientRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse(400, 'Invalid JSON in request body');
    }

    const { code_client, username, danaconnect } = body;
    if (!code_client || !username) {
      return errorResponse(400, 'Missing required fields: code_client, username');
    }

    const userPoolId = process.env.USER_POOL_ID;
    if (!userPoolId) return errorResponse(500, 'Missing USER_POOL_ID environment variable');

    const clientName = `${code_client}-client`;

    // Verificar si ya existe un App Client con ese nombre
    const listResponse = await cognitoClient.send(
      new ListUserPoolClientsCommand({
        UserPoolId: userPoolId,
        MaxResults: 60,
      })
    );

    const existing = listResponse.UserPoolClients?.find(
      (c) => c.ClientName === clientName
    );

    if (existing) {
      return errorResponse(
        409,
        `Client '${clientName}' already exists. Delete it first if you need new credentials.`
      );
    }

    // Crear App Client
    const createResponse = await cognitoClient.send(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: clientName,
        GenerateSecret: true,
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthFlows: ['client_credentials'],
        AllowedOAuthScopes: ['biometric-danaconnect/access'],
        SupportedIdentityProviders: ['COGNITO'],
      })
    );

    if (!createResponse.UserPoolClient?.ClientId || !createResponse.UserPoolClient?.ClientSecret) {
      return errorResponse(500, 'Failed to create Cognito App Client');
    }

    // Save DANAconnect credentials if provided
    if (danaconnect?.clientId && danaconnect?.clientSecret) {
      const secretName = process.env.DANACONNECT_SECRET_NAME;
      if (secretName) {
        try {
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

          credentials[code_client] = {
            clientId: danaconnect.clientId,
            clientSecret: danaconnect.clientSecret,
          };

          const updateSecretCommand = new UpdateSecretCommand({
            SecretId: secretName,
            SecretString: JSON.stringify(credentials),
          });

          await secretsClient.send(updateSecretCommand);
        } catch (error) {
          console.error('Error saving DANAconnect credentials:', error);
        }
      }
    }

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        clientId: createResponse.UserPoolClient.ClientId,
        clientSecret: createResponse.UserPoolClient.ClientSecret,
      }),
    };
  } catch (error) {
    console.error('Error creating client:', error);
    return errorResponse(500, 'Internal server error');
  }
};