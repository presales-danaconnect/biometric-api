import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export function createAdminUpdateChannelFunction(
  scope: Construct,
  channelsTable: Table
): NodejsFunction {
  const env = getEnv();
  const functionName = `biometric-api-${env}-fn-admin-update-channel`;

  const fn = new NodejsFunction(scope, 'FnAdminUpdateChannel', {
    functionName,
    entry: './amplify/functions/fn-admin-update-channel/handler.ts',
    runtime: Runtime.NODEJS_20_X,
    handler: 'handler',
    environment: {
      ADMIN_KEY: process.env.ADMIN_KEY || 'default-admin-key-change-me',
      CHANNELS_TABLE_NAME: channelsTable.tableName,
    },
  });

  fn.addToRolePolicy(
    new PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
      ],
      resources: [channelsTable.tableArn],
    })
  );

  Tags.of(fn).add('Project', 'biometric-api');
  Tags.of(fn).add('Environment', env);

  return fn;
}