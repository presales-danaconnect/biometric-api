import { defineBackend } from '@aws-amplify/backend';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { SecretStringGenerator } from 'aws-cdk-lib/aws-secretsmanager';
import { createCognitoUserPool, getCognitoTokenUrl } from './auth/resource';
import { createChannelsTable, createCircuitsTable } from './data/resource';
import { createApiGateway, ApiLambdaFunctions } from './api/resource';
import { createAdminCreateClientFunction } from './functions/fn-admin-create-client/resource';
import { createAdminCreateChannelFunction } from './functions/fn-admin-create-channel/resource';
import { createAdminGetChannelFunction } from './functions/fn-admin-get-channel/resource';
import { createAdminUpdateChannelFunction } from './functions/fn-admin-update-channel/resource';
import { createGetConfigFunction } from './functions/fn-get-config/resource';
import { createStartCircuitFunction } from './functions/fn-start-circuit/resource';
import { createUploadUrlFunction } from './functions/fn-upload-url/resource';
import { createProcessCircuitFunction } from './functions/fn-process-circuit/resource';
import { createAdminUpdateDanaconnectFunction } from './functions/fn-admin-update-danaconnect/resource';
import { createDocumentsBucket } from './storage/resource';
import { Stack, Tags } from 'aws-cdk-lib';

const backend = defineBackend({});

const env = process.env.AWS_BRANCH || 'dev';
const region = Stack.of(backend.stack).region;

// Create Secrets Manager secret for DANAconnect credentials
const danaconnectSecret = new secretsmanager.Secret(backend.stack, 'DanaconnectCredentials', {
  secretName: `biometric/${env}/danaconnect-credentials`,
  secretStringValue: SecretStringGenerator.fromSecretString('{}'),
});
danaconnectSecret.node.addDependency(backend.auth.resources?.userPool || backend.auth);

// Create DynamoDB tables
const channelsTable = createChannelsTable(backend.stack);
const circuitsTable = createCircuitsTable(backend.stack);

// Create S3 bucket for documents
const { bucket: documentsBucket, bucketName } = createDocumentsBucket(backend.stack);

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
const fnAdminUpdateDanaconnect = createAdminUpdateDanaconnectFunction(
  backend.stack,
  channelsTable,
  danaconnectSecret
);

// Create Lambda functions for Biometric API
const fnGetConfig = createGetConfigFunction(
  backend.stack,
  circuitsTable,
  channelsTable
);
const fnStartCircuit = createStartCircuitFunction(
  backend.stack,
  circuitsTable,
  channelsTable
);
const fnUploadUrl = createUploadUrlFunction(
  backend.stack,
  documentsBucket,
  circuitsTable,
  channelsTable
);
const fnProcessCircuit = createProcessCircuitFunction(
  backend.stack,
  documentsBucket,
  circuitsTable,
  channelsTable,
  danaconnectSecret
);

// Create API Gateway with Lambda integrations
const lambdas: ApiLambdaFunctions = {
  adminClientsCreate: fnAdminCreateClient,
  adminChannelsCreate: fnAdminCreateChannel,
  adminChannelsGet: fnAdminGetChannel,
  adminChannelsUpdate: fnAdminUpdateChannel,
  adminDanaconnectUpdate: fnAdminUpdateDanaconnect,
  getConfig: fnGetConfig,
  startCircuit: fnStartCircuit,
  uploadUrl: fnUploadUrl,
  processCircuit: fnProcessCircuit,
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
    // S3 bucket
    documentsBucketName: bucketName,
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
    fnAdminUpdateDanaconnectName: fnAdminUpdateDanaconnect.functionName,
    fnGetConfigName: fnGetConfig.functionName,
    fnStartCircuitName: fnStartCircuit.functionName,
    fnUploadUrlName: fnUploadUrl.functionName,
    fnProcessCircuitName: fnProcessCircuit.functionName,
  },
});