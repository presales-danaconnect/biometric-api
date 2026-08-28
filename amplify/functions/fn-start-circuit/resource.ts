import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export function createStartCircuitFunction(
  scope: Construct,
  circuitsTable: Table,
  channelsTable: Table
): NodejsFunction {
  const env = getEnv();
  const functionName = `biometric-api-${env}-fn-start-circuit`;

  const fn = new NodejsFunction(scope, 'FnStartCircuit', {
    functionName,
    entry: './amplify/functions/fn-start-circuit/handler.ts',
    runtime: Runtime.NODEJS_20_X,
    handler: 'handler',
    timeout: Duration.seconds(10),
    memorySize: 256,
    environment: {
      CIRCUITS_TABLE_NAME: circuitsTable.tableName,
      CHANNELS_TABLE_NAME: channelsTable.tableName,
    },
  });

  // Add IAM permissions for DynamoDB
  channelsTable.grantReadData(fn);
  circuitsTable.grantWriteData(fn);

  // Apply tags
  Tags.of(fn).add('Project', 'biometric-api');
  Tags.of(fn).add('Environment', env);
  Tags.of(fn).add('Owner', 'danaconnect');

  return fn;
}