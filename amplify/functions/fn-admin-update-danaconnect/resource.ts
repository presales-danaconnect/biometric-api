import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Tags } from 'aws-cdk-lib';

const env = process.env.AWS_BRANCH || 'dev';

export function createAdminUpdateDanaconnectFunction(
  scope: Construct,
  channelsTable: Table,
  danaconnectSecret: Secret
): NodejsFunction {
  const functionName = `biometric-${env}-fn-admin-update-danaconnect`;

  const fn = new NodejsFunction(scope, 'FnAdminUpdateDanaconnect', {
    functionName,
    entry: './amplify/functions/fn-admin-update-danaconnect/handler.ts',
    runtime: Runtime.NODEJS_20_X,
    handler: 'handler',
    timeout: Duration.seconds(10),
    memorySize: 256,
    environment: {
      CHANNELS_TABLE_NAME: channelsTable.tableName,
      DANACONNECT_SECRET_NAME: danaconnectSecret.secretName,
      DANACONNECT_AUTH_URL: process.env.DANACONNECT_AUTH_URL || 'https://auth.danaconnect.com/oauth2/token',
      DANACONNECT_API_URL: process.env.DANACONNECT_API_URL || 'https://appserv.danaconnect.com/api/2.0/rest/conversation/ProjectID',
    },
  });

  // IAM policy for DynamoDB
  fn.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'dynamodb:UpdateItem',
        'dynamodb:GetItem',
      ],
      resources: [channelsTable.tableArn],
    })
  );

  // IAM policy for Secrets Manager
  fn.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:UpdateSecret',
      ],
      resources: [danaconnectSecret.secretArn],
    })
  );

  // Tag the function
  Tags.of(fn).add('Project', 'biometric-api');
  Tags.of(fn).add('Environment', env);
  Tags.of(fn).add('Owner', 'danaconnect');

  return fn;
}