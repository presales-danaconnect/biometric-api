import { defineBackend } from '@aws-amplify/backend';
import { createCognitoUserPool, getCognitoTokenUrl } from './auth/resource';
import { createChannelsTable, createCircuitsTable } from './data/resource';
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
  },
});