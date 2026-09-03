import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export function createAdminCreateClientFunction(
  scope: Construct,
  danaconnectSecret?: Secret
): NodejsFunction {
  const env = getEnv();
  const functionName = `biometric-api-${env}-fn-admin-create-client`;

  const fn = new NodejsFunction(scope, 'FnAdminCreateClient', {
    functionName,
    entry: './amplify/functions/fn-admin-create-client/handler.ts',
    runtime: Runtime.NODEJS_20_X,
    handler: 'handler',
    timeout: Duration.seconds(10),
    memorySize: 256,
    environment: {
      ADMIN_KEY: process.env.ADMIN_KEY || 'default-admin-key-change-me',
      USER_POOL_ID: process.env.USER_POOL_ID || '',
      DANACONNECT_SECRET_NAME: danaconnectSecret?.secretName || '',
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

  // IAM policy for Secrets Manager (DANAconnect credentials)
  if (danaconnectSecret) {
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
  }

  Tags.of(fn).add('Project', 'biometric-api');
  Tags.of(fn).add('Environment', env);

  return fn;
}