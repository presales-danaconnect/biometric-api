import { Construct } from 'constructs';
import {
  UserPool,
  UserPoolDomain,
  UserPoolResourceServer,
  UserPoolClient,
  OAuthScope,
  ResourceServerScope,
  ClientAttributes,
} from 'aws-cdk-lib/aws-cognito';
import { RemovalPolicy, Tags } from 'aws-cdk-lib';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

function applyTags(construct: Construct): void {
  const env = getEnv();
  Tags.of(construct).add('Project', 'biometric-api');
  Tags.of(construct).add('Environment', env);
}

export function createCognitoUserPool(scope: Construct): {
  userPool: UserPool;
  userPoolDomain: string;
  userPoolClient: UserPoolClient;
} {
  const env = getEnv();
  const userPoolId = `biometric-api-${env}-userpool`;
  const domainPrefix = `biometric-api-${env}`;
  const resourceServerIdentifier = 'biometric-danaconnect';

  const startCircuitScope = new ResourceServerScope({
    scopeName: 'start_circuit',
    scopeDescription: 'Create and start biometric circuits',
  });

  const readScope = new ResourceServerScope({
    scopeName: 'read',
    scopeDescription: 'Read biometric configuration and status',
  });

  const userPool = new UserPool(scope, 'UserPool', {
    userPoolName: userPoolId,
    selfSignUpEnabled: false,
    signInAliases: {
      username: false,
      email: false,
      phone: false,
    },
    enableSmsRole: false,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  applyTags(userPool);

  const resourceServer = new UserPoolResourceServer(scope, 'ResourceServer', {
    identifier: resourceServerIdentifier,
    userPool: userPool,
    scopes: [startCircuitScope, readScope],
  });

  applyTags(resourceServer);

  const userPoolClient = new UserPoolClient(scope, 'UserPoolClient', {
    userPool: userPool,
    userPoolClientName: `biometric-api-${env}-client`,
    generateSecret: true,
    authFlows: {
      custom: false,
      userPassword: false,
      userSrp: false,
    },
    oAuth: {
      flows: {
        authorizationCodeGrant: false,
        implicitCodeGrant: false,
        clientCredentials: true,
      },
      scopes: [
        OAuthScope.resourceServer(resourceServer, startCircuitScope),
        OAuthScope.resourceServer(resourceServer, readScope),
      ],
      callbackUrls: [],
      logoutUrls: [],
    },
    preventUserExistenceErrors: true,
    readAttributes: new ClientAttributes(),
    writeAttributes: new ClientAttributes(),
  });

  applyTags(userPoolClient);

  new UserPoolDomain(scope, 'UserPoolDomain', {
    userPool: userPool,
    cognitoDomain: {
      domainPrefix: domainPrefix,
    },
  });

  return { userPool, userPoolDomain: domainPrefix, userPoolClient };
}

export function getCognitoTokenUrl(domainPrefix: string, region: string): string {
  return `https://${domainPrefix}.auth.${region}.amazoncognito.com/oauth2/token`;
}