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
 * Safely creates a LambdaIntegration, returning undefined if lambda is not provided
 */
function safeIntegration(lambda?: IFunction): LambdaIntegration | undefined {
  return lambda ? new LambdaIntegration(lambda) : undefined;
}

/**
 * Creates the API Gateway with all endpoints for biometric and admin APIs
 */
export function createApiGateway(
  scope: Construct,
  config: ApiGatewayConfig,
  lambdas?: ApiLambdaFunctions
): ApiGatewayOutputs {
  const env = getEnv();
  const apiName = `biometric-api-${env}-gateway`;

  // Create REST API with regional endpoint
  const api = new RestApi(scope, 'BiometricApiGateway', {
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
    deployOptions: {
      throttlingRateLimit: 100,
      throttlingBurstLimit: 200,
    },
  });

  // Create Cognito authorizer for biometric endpoints
  const cognitoAuthorizer = new CognitoUserPoolsAuthorizer(
    scope,
    'BiometricCognitoAuthorizer',
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
  const oauthIntegration = safeIntegration(lambdas?.oauthToken);
  if (oauthIntegration) {
    tokenResource.addMethod('POST', oauthIntegration, getMethodOptions(false));
  }

  // ========== Biometric API (Cognito Authorizer) ==========
  const biometricResource = api.root.addResource('api').addResource('biometric');

  // GET /api/biometric/get_config/{circuit_id}
  const getConfigIntegration = safeIntegration(lambdas?.getConfig);
  if (getConfigIntegration) {
    const getConfigResource = biometricResource
      .addResource('get_config')
      .addResource('{circuit_id}');
    getConfigResource.addMethod(
      'GET',
      getConfigIntegration,
      {
        authorizationType: AuthorizationType.COGNITO,
        authorizer: cognitoAuthorizer,
      }
    );
  }

  // POST /api/biometric/start_circuit/{channel_id}
  const startCircuitIntegration = safeIntegration(lambdas?.startCircuit);
  if (startCircuitIntegration) {
    const startCircuitResource = biometricResource
      .addResource('start_circuit')
      .addResource('{channel_id}');
    startCircuitResource.addMethod(
      'POST',
      startCircuitIntegration,
      {
        authorizationType: AuthorizationType.COGNITO,
        authorizer: cognitoAuthorizer,
      }
    );
  }

  // POST /api/biometric/process_circuit/{circuit_id}
  const processCircuitIntegration = safeIntegration(lambdas?.processCircuit);
  if (processCircuitIntegration) {
    const processCircuitResource = biometricResource
      .addResource('process_circuit')
      .addResource('{circuit_id}');
    processCircuitResource.addMethod(
      'POST',
      processCircuitIntegration,
      {
        authorizationType: AuthorizationType.COGNITO,
        authorizer: cognitoAuthorizer,
      }
    );
  }

  // ========== Admin API (x-admin-key header validation in Lambda) ==========
  const adminResource = api.root.addResource('api').addResource('admin');

  // POST /api/admin/clients/create
  const adminClientsCreateIntegration = safeIntegration(lambdas?.adminClientsCreate);
  if (adminClientsCreateIntegration) {
    const clientsResource = adminResource.addResource('clients');
    const createClientsResource = clientsResource.addResource('create');
    createClientsResource.addMethod(
      'POST',
      adminClientsCreateIntegration,
      getMethodOptions(false)
    );
  }

  // POST /api/admin/channels
  const adminChannelsCreateIntegration = safeIntegration(lambdas?.adminChannelsCreate);
  if (adminChannelsCreateIntegration) {
    const channelsResource = adminResource.addResource('channels');
    channelsResource.addMethod(
      'POST',
      adminChannelsCreateIntegration,
      getMethodOptions(false)
    );
  }

  // GET /api/admin/channels/{id}
  const adminChannelsGetIntegration = safeIntegration(lambdas?.adminChannelsGet);
  if (adminChannelsGetIntegration) {
    const channelsResource = adminResource.addResource('channels');
    const getChannelResource = channelsResource.addResource('{id}');
    getChannelResource.addMethod(
      'GET',
      adminChannelsGetIntegration,
      getMethodOptions(false)
    );
  }

  // PUT /api/admin/channels/{id}
  const adminChannelsUpdateIntegration = safeIntegration(lambdas?.adminChannelsUpdate);
  if (adminChannelsUpdateIntegration) {
    const channelsResource = adminResource.addResource('channels');
    const getChannelResource = channelsResource.addResource('{id}');
    getChannelResource.addMethod(
      'PUT',
      adminChannelsUpdateIntegration,
      getMethodOptions(false)
    );
  }

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
 * Method options factory for endpoints without Cognito auth
 */
function getMethodOptions(requireAuth: boolean): MethodOptions {
  const options: MethodOptions = {
    requestValidatorOptions: {
      validateRequestParameters: true,
      validateRequestBody: true,
    },
  };

  return options;
}