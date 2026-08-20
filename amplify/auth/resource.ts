import { Construct } from 'constructs';
import {
  UserPool,
  UserPoolDomain,
  UserPoolResourceServer,
  UserPoolClient,
  OAuthScope,
} from 'aws-cdk-lib/aws-cognito';
import { Tags } from 'aws-cdk-lib';

/**
 * Environment configuration
 */
function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

/**
 * Common tags applied to all Cognito resources
 */
function applyTags(construct: Construct): void {
  const env = getEnv();
  Tags.of(construct).add('Project', 'biometric-api');
  Tags.of(construct).add('Environment', env);
  Tags.of(construct).add('Owner', 'danaconnect');
}

/**
 * Create Cognito User Pool for machine-to-machine authentication
 */
export function createCognitoUserPool(scope: Construct): {
  userPool: UserPool;
  userPoolDomain: UserPoolDomain;
  userPoolClient: UserPoolClient;
} {
  const env = getEnv();
  const userPoolId = `biometric-api-${env}-userpool`;
  const domainName = `biometric-api-${env}`;
  const resourceServerIdentifier = 'https://biometric.danaconnect.com';

  // Create User Pool (no user registration, only for token validation)
  const userPool = new UserPool(scope, 'UserPool', {
    userPoolName: userPoolId,
    // No self-registration - only for machine-to-machine auth
    selfSignUpEnabled: false,
    // Sign-up is disabled for machine-to-machine use case
    signInAliases: {
      username: false,
      email: false,
      phone: false,
    },
    // Keep users out of the pool - tokens issued via Client Credentials only
    enableSmsRole: false,
  });

  applyTags(userPool);

  // Create Resource Server with custom scopes
  const resourceServer = new UserPoolResourceServer(scope, 'ResourceServer', {
    identifier: resourceServerIdentifier,
    userPool: userPool,
    scopes: [
      new OAuthScope({
        scopeName: 'biometric/start_circuit',
        description: 'Create and start biometric circuits',
      }),
      new OAuthScope({
        scopeName: 'biometric/read',
        description: 'Read biometric configuration and status',
      }),
    ],
  });

  applyTags(resourceServer);

  // Create Client Credentials client
  const userPoolClient = new UserPoolClient(scope, 'UserPoolClient', {
    userPool: userPool,
    clientName: `biometric-api-${env}-client`,
    // Client Credentials flow - no user authentication
    authFlows: {
      userPoolClientBasic: false,
      userPoolClientSRP: false,
      custom: false,
      // Enable Client Credentials flow
      adminUserPassword: false,
    },
    // OAuth configuration for Client Credentials
    oAuth: {
      flows: {
        authorizationCodeGrant: false,
        implicitCodeGrant: false,
        clientCredentials: true,
      },
      scopes: [
        OAuthScope.resourceServer(resourceServer, 'biometric/start_circuit'),
        OAuthScope.resourceServer(resourceServer, 'biometric/read'),
      ],
      // No callback URLs needed for Client Credentials
      callbackUrls: [],
      logoutUrls: [],
    },
    // Prevent token issues - Client Credentials doesn't use refresh tokens
    preventUserExistenceErrors: true,
    // No write access - machine-to-machine only
    readAttributes: [],
    writeAttributes: [],
  });

  applyTags(userPoolClient);

  // Create User Pool Domain (for token endpoint URL)
  const userPoolDomain = new UserPoolDomain(scope, 'UserPoolDomain', {
    userPool: userPool,
    cognitoDomain: {
      domainPrefix: domainName,
    },
  });

  applyTags(userPoolDomain);

  return { userPool, userPoolDomain, userPoolClient };
}

/**
 * Get Cognito token URL for Client Credentials flow
 */
export function getCognitoTokenUrl(
  userPoolDomain: UserPoolDomain,
  region: string
): string {
  const domainPrefix = userPoolDomain.domain.domainPrefix;
  return `https://${domainPrefix}.auth.${region}.amazoncognito.com/oauth2/token`;
}