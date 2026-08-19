import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { createChannelsTable, createCircuitsTable } from './data/resource';
import { Tags } from 'aws-cdk-lib';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
});

// Create DynamoDB tables for channels and circuits
const channelsTable = createChannelsTable(backend.stack);
const circuitsTable = createCircuitsTable(backend.stack);

// Apply tags to all resources in the stack
const env = process.env.AWS_BRANCH || 'dev';
Tags.of(backend.stack).add('Project', 'biometric-api');
Tags.of(backend.stack).add('Environment', env);
Tags.of(backend.stack).add('Owner', 'danaconnect');

// Add table names as output for reference by Lambda functions
backend.addOutput({
  custom: {
    channelsTableName: channelsTable.tableName,
    circuitsTableName: circuitsTable.tableName,
  },
});