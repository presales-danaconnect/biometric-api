import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Table as DynamoTable } from 'aws-cdk-lib/aws-dynamodb';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export function createProcessCircuitFunction(
  scope: Construct,
  documentsBucket: IBucket,
  circuitsTable: DynamoTable,
  channelsTable: DynamoTable,
  danaconnectSecret?: Secret
): NodejsFunction {
  const env = getEnv();
  const functionName = `biometric-api-${env}-fn-process-circuit`;

  const fn = new NodejsFunction(scope, 'FnProcessCircuit', {
    functionName,
    entry: './amplify/functions/fn-process-circuit/handler.ts',
    runtime: Runtime.NODEJS_20_X,
    handler: 'handler',
    timeout: Duration.seconds(30),
    memorySize: 512,
    environment: {
      CIRCUITS_TABLE_NAME: circuitsTable.tableName,
      CHANNELS_TABLE_NAME: channelsTable.tableName,
      DOCUMENTS_BUCKET_NAME: documentsBucket.bucketName,
      BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      LIVENESS_THRESHOLD: '80',
      COMPARE_FACES_THRESHOLD: '80',
      INTERNAL_KEY: process.env.INTERNAL_KEY || '',
      DANACONNECT_SECRET_NAME: danaconnectSecret?.secretName || '',
    },
  });

  // Add IAM permissions for DynamoDB
  circuitsTable.grantReadData(fn);
  circuitsTable.grantWriteData(fn);
  channelsTable.grantReadData(fn);

  // Add IAM permissions for Rekognition
  fn.addToRolePolicy(
    new PolicyStatement({
      actions: [
        'rekognition:GetFaceLivenessSessionResults',
        'rekognition:CompareFaces',
      ],
      resources: ['*'],
    })
  );

  // Add IAM permissions for Bedrock
  const region = process.env.AWS_REGION || 'us-east-1';
  fn.addToRolePolicy(
    new PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0`,
        `arn:aws:bedrock:${region}:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0`,
      ],
    })
  );

  // Add IAM permissions for S3
  documentsBucket.grantReadWrite(fn);

  // Add IAM permissions for Secrets Manager (DANAconnect credentials)
  if (danaconnectSecret) {
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [danaconnectSecret.secretArn],
      })
    );
  }

  // Apply tags
  Tags.of(fn).add('Project', 'biometric-api');
  Tags.of(fn).add('Environment', env);
  Tags.of(fn).add('Owner', 'danaconnect');

  return fn;
}