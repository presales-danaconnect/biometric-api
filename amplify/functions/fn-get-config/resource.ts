import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export function createGetConfigFunction(
  scope: Construct,
  circuitsTable: Table,
  channelsTable: Table
): NodejsFunction {
  const env = getEnv();
  const functionName = `biometric-api-${env}-fn-get-config`;

  const fn = new NodejsFunction(scope, 'FnGetConfig', {
    functionName,
    entry: './amplify/functions/fn-get-config/handler.ts',
    runtime: Runtime.NODEJS_20_X,
    handler: 'handler',
    environment: {
      CIRCUITS_TABLE_NAME: circuitsTable.tableName,
      CHANNELS_TABLE_NAME: channelsTable.tableName,
      INTERNAL_KEY: process.env.INTERNAL_KEY || '',
    },
  });

  // Add IAM permissions for DynamoDB
  circuitsTable.grantReadData(fn);
  channelsTable.grantReadData(fn);

  // Apply tags
  Tags.of(fn).add('Project', 'biometric-api');
  Tags.of(fn).add('Environment', env);
  Tags.of(fn).add('Owner', 'danaconnect');

  return fn;
}