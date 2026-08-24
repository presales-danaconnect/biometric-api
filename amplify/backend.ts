import { defineBackend } from '@aws-amplify/backend';
import { createCognitoUserPool, getCognitoTokenUrl } from './auth/resource';
import { createChannelsTable, createCircuitsTable } from './data/resource';
import { createApiGateway, ApiLambdaFunctions } from './api/resource';
import { createAdminCreateClientFunction } from './functions/fn-admin-create-client/resource';
import { createAdminCreateChannelFunction } from './functions/fn-admin-create-channel/resource';
import { createAdminGetChannelFunction } from './functions/fn-admin-get-channel/resource';
import { createAdminUpdateChannelFunction } from './functions/fn-admin-update-channel/resource';
import { Stack, Tags } from 'aws-cdk-lib';

const backend = defineBackend({});

const env = process.env.AWS_BRANCH || 'dev';
const region = Stack.of(backend.stack).region;

// Create DynamoDB tables
const channelsTable = createChannelsTable(backend.stack);
const circuitsTable = createCircuitsTable(backend.stack);

// Create Cognito User Pool for machine-to-machine auth
const { userPool, userPoolDomain, userPoolClient } = createCognitoUserPool(
  backend.stack
);

// Apply tags to all resources
Tags.of(backend.stack).add('Project', 'biometric-api');
Tags.of(backend.stack).add('Environment', env);
Tags.of(backend.stack).add('Owner', 'danaconnect');

// Create Lambda functions for Admin API
const fnAdminCreateClient = createAdminCreateClientFunction(backend.stack);
const fnAdminCreateChannel = createAdminCreateChannelFunction(
  backend.stack,
  channelsTable
);
const fnAdminGetChannel = createAdminGetChannelFunction(
  backend.stack,
  channelsTable
);
const fnAdminUpdateChannel = createAdminUpdateChannelFunction(
  backend.stack,
  channelsTable
);

// Create API Gateway with Lambda integrations
const lambdas: ApiLambdaFunctions = {
  adminClientsCreate: fnAdminCreateClient,
  adminChannelsCreate: fnAdminCreateChannel,
  adminChannelsGet: fnAdminGetChannel,
  adminChannelsUpdate: fnAdminUpdateChannel,
};

const apiGateway = createApiGateway(backend.stack, {
  userPool,
  userPoolDomain,
  region,
}, lambdas);

// Add outputs for Lambda functions and API Gateway
backend.addOutput({
  custom: {
    // DynamoDB table names
    channelsTableName: channelsTable.tableName,
    circuitsTableName: circuitsTable.tableName,
    // Cognito configuration
    userPoolId: userPool.userPoolId,
    userPoolDomain: userPoolDomain,
    cognitoTokenUrl: getCognitoTokenUrl(userPoolDomain, region),
    cognitoClientId: userPoolClient.userPoolClientId,
    // API Gateway configuration
    apiGatewayUrl: apiGateway.apiGatewayUrl,
    apiGatewayId: apiGateway.apiGatewayId,
    apiGatewayName: apiGateway.apiGatewayName,
    // Lambda function names
    fnAdminCreateClientName: fnAdminCreateClient.functionName,
    fnAdminCreateChannelName: fnAdminCreateChannel.functionName,
    fnAdminGetChannelName: fnAdminGetChannel.functionName,
    fnAdminUpdateChannelName: fnAdminUpdateChannel.functionName,
  },
});