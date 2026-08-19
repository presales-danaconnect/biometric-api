import { defineBackend } from '@aws-amplify/backend';
import { createChannelsTable, createCircuitsTable } from './data/resource';
import { Tags } from 'aws-cdk-lib';

const backend = defineBackend({});

const env = process.env.AWS_BRANCH || 'dev';

const channelsTable = createChannelsTable(backend.stack);
const circuitsTable = createCircuitsTable(backend.stack);

Tags.of(backend.stack).add('Project', 'biometric-api');
Tags.of(backend.stack).add('Environment', env);

backend.addOutput({
  custom: {
    channelsTableName: channelsTable.tableName,
    circuitsTableName: circuitsTable.tableName,
  },
});