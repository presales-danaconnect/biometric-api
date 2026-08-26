import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export function createAdminCreateClientFunction(
  scope: Construct
): NodejsFunction {
  const env = getEnv();
  const functionName = `biometric-api-${env}-fn-admin-create-client`;

  const fn = new NodejsFunction(scope, 'FnAdminCreateClient', {
    functionName,
    entry: './amplify/functions/fn-admin-create-client/handler.ts',
    runtime: Runtime.NODEJS_20_X,
    handler: 'handler',
    environment: {
      ADMIN_KEY: process.env.ADMIN_KEY || 'default-admin-key-change-me',
      USER_POOL_ID: process.env.USER_POOL_ID || '',
    },
  });

  fn.addToRolePolicy(
    new PolicyStatement({
      actions: [
        'cognito-idp:CreateUserPoolClient',
        'cognito-idp:DescribeUserPoolClient',
        'cognito-idp:ListUserPoolClients',
      ],
      resources: ['*'],
    })
  );

  Tags.of(fn).add('Project', 'biometric-api');
  Tags.of(fn).add('Environment', env);

  return fn;
}
