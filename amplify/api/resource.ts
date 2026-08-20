import { Stack, Duration, Tags, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  RestApi,
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  MethodOptions,
  EndpointType,
} from 'aws-cdk-lib/aws-apigateway';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { IFunction } from 'aws-cdk-lib/aws-lambda';

/**
 * Environment configuration
 */
function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

/**
 * API Gateway configuration options
 */
export interface ApiGatewayConfig {
  userPool: IUserPool;
  userPoolDomain: string;
  region: string;
}

/**
 * Lambda functions for API endpoints
 */
export interface ApiLambdaFunctions {
  // OAuth
  oauthToken: IFunction;
  // Biometric
  getConfig: IFunction;
  startCircuit: IFunction;
  processCircuit: IFunction;
  // Admin
  adminClientsCreate: IFunction;
  adminChannelsCreate: IFunction;
  adminChannelsGet: IFunction;
  adminChannelsUpdate: IFunction;
}

/**
 * API Gateway outputs exposed via addOutput
 */
export interface ApiGatewayOutputs {
  apiGatewayUrl: string;
  apiGatewayId: string;
  apiGatewayName: string;
}

/**
 * Creates the API Gateway with all endpoints for biometric and admin APIs
 */
export function createApiGateway(
  scope: Construct,
  config: ApiGatewayConfig,
  lambdas: ApiLambdaFunctions
): ApiGatewayOutputs {
  const env = getEnv();
  const apiName = `biometric-api-${env}-gateway`;

  // Create REST API with regional endpoint
  const api = new RestApi(scope, 'BiometricApi', {
    restApiName: apiName,
    endpointTypes: [EndpointType.REGIONAL],
    defaultCorsPreflightOptions: {
      allowOrigins: ['*'], // Configure based on requirements
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'x-admin-key',
        'X-Requested-With',
      ],
      allowCredentials: false,
      maxAge: Duration.hours(1),
    },
    defaultThrottling: {
      rateLimit: 100,
      burstLimit: 200,
    },
  });

  // Create Cognito authorizer for biometric endpoints
  const cognitoAuthorizer = new CognitoUserPoolsAuthorizer(
    scope,
    'CognitoAuthorizer',
    {
      cognitoUserPools: [config.userPool],
      authorizerName: 'biometric-cognito-authorizer',
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: Duration.minutes(5),
    }
  );

  // Apply tags to API Gateway
  Tags.of(scope).add('Project', 'biometric-api');
  Tags.of(scope).add('Environment', env);
  Tags.of(scope).add('Owner', 'danaconnect');

  // ========== Public OAuth Endpoint (no auth required) ==========
  const oauthResource = api.root.addResource('oauth2');
  const tokenResource = oauthResource.addResource('token');

  // POST /oauth2/token - Cognito token endpoint (proxied, no auth)
  tokenResource.addMethod(
    'POST',
    new LambdaIntegration(lambdas.oauthToken),
    getMethodOptions(false)
  );

  // ========== Biometric API (Cognito Authorizer) ==========
  const biometricResource = api.root.addResource('api').addResource('biometric');

  // GET /api/biometric/get_config/{circuit_id}
  const getConfigResource = biometricResource
    .addResource('get_config')
    .addResource('{circuit_id}');
  getConfigResource.addMethod(
    'GET',
    new LambdaIntegration(lambdas.getConfig),
    getMethodOptions(true, cognitoAuthorizer)
  );

  // POST /api/biometric/start_circuit/{channel_id}
  const startCircuitResource = biometricResource
    .addResource('start_circuit')
    .addResource('{channel_id}');
  startCircuitResource.addMethod(
    'POST',
    new LambdaIntegration(lambdas.startCircuit),
    getMethodOptions(true, cognitoAuthorizer)
  );

  // POST /api/biometric/process_circuit/{circuit_id}
  const processCircuitResource = biometricResource
    .addResource('process_circuit')
    .addResource('{circuit_id}');
  processCircuitResource.addMethod(
    'POST',
    new LambdaIntegration(lambdas.processCircuit),
    getMethodOptions(true, cognitoAuthorizer)
  );

  // ========== Admin API (x-admin-key header validation in Lambda) ==========
  const adminResource = api.root.addResource('api').addResource('admin');

  // POST /api/admin/clients/create
  const clientsResource = adminResource.addResource('clients');
  const createClientsResource = clientsResource.addResource('create');
  createClientsResource.addMethod(
    'POST',
    new LambdaIntegration(lambdas.adminClientsCreate),
    getMethodOptions(false)
  );

  // POST /api/admin/channels
  const channelsResource = adminResource.addResource('channels');
  channelsResource.addMethod(
    'POST',
    new LambdaIntegration(lambdas.adminChannelsCreate),
    getMethodOptions(false)
  );

  // GET /api/admin/channels/{id}
  const getChannelResource = channelsResource.addResource('{id}');
  getChannelResource.addMethod(
    'GET',
    new LambdaIntegration(lambdas.adminChannelsGet),
    getMethodOptions(false)
  );

  // PUT /api/admin/channels/{id}
  getChannelResource.addMethod(
    'PUT',
    new LambdaIntegration(lambdas.adminChannelsUpdate),
    getMethodOptions(false)
  );

  // Export outputs via CfnOutput for visibility
  const apiGatewayUrl = `https://${api.restApiId}.execute-api.${config.region}.amazonaws.com/${env}`;

  new CfnOutput(scope, 'ApiGatewayUrl', {
    value: apiGatewayUrl,
    description: 'API Gateway URL',
  });

  new CfnOutput(scope, 'ApiGatewayId', {
    value: api.restApiId,
    description: 'API Gateway ID',
  });

  return {
    apiGatewayUrl,
    apiGatewayId: api.restApiId,
    apiGatewayName: apiName,
  };
}

/**
 * Method options factory for consistent configuration
 */
function getMethodOptions(
  requireAuth: boolean,
  authorizer?: CognitoUserPoolsAuthorizer
): MethodOptions {
  const options: MethodOptions = {
    requestValidatorOptions: {
      validateRequestParameters: true,
      validateRequestBody: true,
    },
  };

  if (requireAuth && authorizer) {
    options.authorizationType = AuthorizationType.COGNITO;
    options.authorizer = authorizer;
  }

  return options;
}