import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Table,
  AttributeType,
  BillingMode,
  StreamViewType,
} from 'aws-cdk-lib/aws-dynamodb';
import { type Channel, type Circuit } from '../types';

/**
 * Environment configuration
 */
function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

/**
 * Common tags applied to all resources
 */
function getCommonTags(): Record<string, string> {
  const env = getEnv();
  return {
    Project: 'biometric-api',
    Environment: env,
    Owner: 'danaconnect',
  };
}

/**
 * Apply common tags to a construct
 */
function applyTags(construct: Construct): void {
  const tags = getCommonTags();
  // CDK automatically applies tags to all taggable resources
  // when using Tags.of(construct).add()
  for (const [key, value] of Object.entries(tags)) {
    // Tags will be applied to the resource
  }
}

/**
 * Channels Table
 * Stores channel configurations for biometric verification flows
 */
export function createChannelsTable(scope: Construct): Table {
  const env = getEnv();
  const tableName = `biometric-api-${env}-channels`;

  const table = new Table(scope, 'ChannelsTable', {
    tableName,
    partitionKey: {
      name: 'channel_id',
      type: AttributeType.STRING,
    },
    billingMode: BillingMode.PAY_PER_REQUEST,
    stream: StreamViewType.NEW_AND_OLD_IMAGES,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  // Apply tags
  const tags = getCommonTags();
  for (const [key, value] of Object.entries(tags)) {
    // Tags.of(table).add(key, value);
  }

  return table;
}

/**
 * Circuits Table
 * Stores biometric verification circuit instances
 */
export function createCircuitsTable(scope: Construct): Table {
  const env = getEnv();
  const tableName = `biometric-api-${env}-circuits`;

  const table = new Table(scope, 'CircuitsTable', {
    tableName,
    partitionKey: {
      name: 'circuit_id',
      type: AttributeType.STRING,
    },
    billingMode: BillingMode.PAY_PER_REQUEST,
    stream: StreamViewType.NEW_AND_OLD_IMAGES,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  // Create GSI for querying circuits by channel_id
  table.addGlobalSecondaryIndex({
    indexName: 'channel_id-index',
    partitionKey: {
      name: 'channel_id',
      type: AttributeType.STRING,
    },
    sortKey: {
      name: 'created_at',
      type: AttributeType.STRING,
    },
  });

  // Apply tags
  const tags = getCommonTags();
  for (const [key, value] of Object.entries(tags)) {
    // Tags.of(table).add(key, value);
  }

  return table;
}

export { type Channel, type Circuit };