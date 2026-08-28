import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime, Duration } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export function createAdminCreateChannelFunction(
  scope: Construct,
  channelsTable: Table
): NodejsFunction {
  const env = getEnv();
  const functionName = `biometric-api-${env}-fn-admin-create-channel`;

  const fn = new NodejsFunction(scope, 'FnAdminCreateChannel', {
    functionName,
    entry: './amplify/functions/fn-admin-create-channel/handler.ts',
    runtime: Runtime.NODEJS_20_X,
    handler: 'handler',
    timeout: Duration.seconds(10),
    memorySize: 256,
    environment: {
      ADMIN_KEY: process.env.ADMIN_KEY || 'default-admin-key-change-me',
      CHANNELS_TABLE_NAME: channelsTable.tableName,
    },
  });

  // Add IAM permissions for DynamoDB
  channelsTable.grantWriteData(fn);

  // Apply tags
  Tags.of(fn).add('Project', 'biometric-api');
  Tags.of(fn).add('Environment', env);
  Tags.of(fn).add('Owner', 'danaconnect');

  return fn;
}