import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Table as DynamoTable } from 'aws-cdk-lib/aws-dynamodb';
import { Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export function createUploadUrlFunction(
  scope: Construct,
  documentsBucket: IBucket,
  circuitsTable: DynamoTable,
  channelsTable: DynamoTable
): NodejsFunction {
  const env = getEnv();
  const functionName = `biometric-api-${env}-fn-upload-url`;

  const fn = new NodejsFunction(scope, 'FnUploadUrl', {
    functionName,
    entry: './amplify/functions/fn-upload-url/handler.ts',
    runtime: Runtime.NODEJS_20_X,
    handler: 'handler',
    environment: {
      DOCUMENTS_BUCKET_NAME: documentsBucket.bucketName,
      CIRCUITS_TABLE_NAME: circuitsTable.tableName,
      CHANNELS_TABLE_NAME: channelsTable.tableName,
    },
  });

  // Add IAM permissions for S3
  documentsBucket.grantWrite(fn);

  // Add IAM permissions for DynamoDB
  circuitsTable.grantReadData(fn);
  channelsTable.grantReadData(fn);

  // Apply tags
  Tags.of(fn).add('Project', 'biometric-api');
  Tags.of(fn).add('Environment', env);
  Tags.of(fn).add('Owner', 'danaconnect');

  return fn;
}