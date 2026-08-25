import { Construct } from 'constructs';
import { Bucket, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { RemovalPolicy, Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export interface DocumentsBucketOutput {
  bucket: Bucket;
  bucketName: string;
}

export function createDocumentsBucket(scope: Construct): DocumentsBucketOutput {
  const env = getEnv();
  const bucketName = `biometric-api-${env}-documents`;

  const bucket = new Bucket(scope, 'DocumentsBucket', {
    bucketName,
    removalPolicy: RemovalPolicy.DESTROY,
    cors: [
      {
        allowedOrigins: ['*'], // Configure based on requirements
        allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.POST],
        allowedHeaders: ['*'],
        exposedHeaders: [],
      },
    ],
    blockPublicAccess: {
      blockPublicAcls: false,
      blockPublicPolicy: false,
      ignorePublicAcls: false,
      restrictPublicBuckets: false,
    },
  });

  // Apply tags
  Tags.of(bucket).add('Project', 'biometric-api');
  Tags.of(bucket).add('Environment', env);
  Tags.of(bucket).add('Owner', 'danaconnect');

  return {
    bucket,
    bucketName,
  };
}