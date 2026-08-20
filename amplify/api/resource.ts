import { Duration, Tags, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  RestApi,
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  MethodOptions,
  EndpointType,
  IResource,
} from 'aws-cdk-lib/aws-apigateway';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { IFunction } from 'aws-cdk-lib/aws-lambda';

function getEnv(): string {
  return process.env.AWS_BRANCH || 'dev';
}

export interface ApiGatewayConfig {
  userPool: IUserPool;
  userPoolDomain: string;
  region: string;
}

export interface ApiLambdaFunctions {
  oauthToken?: IFunction;
  getConfig?: IFunction;
  startCircuit?: IFunction;
  processCircuit?: IFunction;
  adminClientsCreate?: IFunction;
  adminChannelsCreate?: IFunction;
  adminChannelsGet?: IFunction;
  adminChannelsUpdate?: IFunction;
}

export interface ApiGatewayOutputs {
  apiGatewayUrl: string;
  apiGatewayId: string;
  apiGatewayName: string;
}

function safeIntegration(lambda?: IFunction): LambdaIntegration | undefined {
  return lambda ? new LambdaIntegration(lambda) : undefined;
}

function noAuthOptions(): MethodOptions {
  return {
    authorizationType: AuthorizationType.NONE,
  };
}

export function createApiGateway(
  scope: Construct,
  config: ApiGatewayConfig,
  lambdas?: ApiLambdaFunctions
): ApiGatewayOutputs {
  const env = getEnv();
  const apiName = `biometric-api-${env}-gateway`;

  const api = new RestApi(scope, 'BiometricApiGateway', {
    restApiName: apiName,
    endpointTypes: [EndpointType.REGIONAL],
    defaultCorsPreflightOptions: {
      allowOrigins: ['*'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
      allowCredentials: false,
      maxAge: Duration.hours(1),
    },
    deployOptions: {
      throttlingRateLimit: 100,
      throttlingBurstLimit: 200,
    },
  });

  Tags.of(api).add('Project', 'biometric-api');
  Tags.of(api).add('Environment', env);

  // Authorizer must be created after RestApi and attached to it
  const cognitoAuthorizer = new CognitoUserPoolsAuthorizer(
    scope,
    'BiometricCognitoAuthorizer',
    {
      cognitoUserPools: [config.userPool],
      authorizerName: `biometric-api-${env}-authorizer`,
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: Duration.minutes(5),
    }
  );
  cognitoAuthorizer._attachToApi(api);

  const cognitoOptions = (authorizer: CognitoUserPoolsAuthorizer): MethodOptions => ({
    authorizationType: AuthorizationType.COGNITO,
    authorizer,
  });

  // POST /oauth2/token
  const oauthResource = api.root.addResource('oauth2');
  const tokenResource = oauthResource.addResource('token');
  const oauthIntegration = safeIntegration(lambdas?.oauthToken);
  if (oauthIntegration) {
    tokenResource.addMethod('POST', oauthIntegration, noAuthOptions());
  }

  // /api (recurso compartido)
  const apiResource: IResource = api.root.addResource('api');

  // /api/biometric
  const biometricResource = apiResource.addResource('biometric');

  // GET /api/biometric/get_config/{circuit_id}
  const getConfigIntegration = safeIntegration(lambdas?.getConfig);
  if (getConfigIntegration) {
    biometricResource
      .addResource('get_config')
      .addResource('{circuit_id}')
      .addMethod('GET', getConfigIntegration, cognitoOptions(cognitoAuthorizer));
  }

  // POST /api/biometric/start_circuit/{channel_id}
  const startCircuitIntegration = safeIntegration(lambdas?.startCircuit);
  if (startCircuitIntegration) {
    biometricResource
      .addResource('start_circuit')
      .addResource('{channel_id}')
      .addMethod('POST', startCircuitIntegration, cognitoOptions(cognitoAuthorizer));
  }

  // POST /api/biometric/process_circuit/{circuit_id}
  const processCircuitIntegration = safeIntegration(lambdas?.processCircuit);
  if (processCircuitIntegration) {
    biometricResource
      .addResource('process_circuit')
      .addResource('{circuit_id}')
      .addMethod('POST', processCircuitIntegration, cognitoOptions(cognitoAuthorizer));
  }

  // /api/admin
  const adminResource = apiResource.addResource('admin');

  // POST /api/admin/clients/create
  const adminClientsCreateIntegration = safeIntegration(lambdas?.adminClientsCreate);
  if (adminClientsCreateIntegration) {
    adminResource
      .addResource('clients')
      .addResource('create')
      .addMethod('POST', adminClientsCreateIntegration, noAuthOptions());
  }

  // /api/admin/channels
  const channelsResource = adminResource.addResource('channels');

  // POST /api/admin/channels
  const adminChannelsCreateIntegration = safeIntegration(lambdas?.adminChannelsCreate);
  if (adminChannelsCreateIntegration) {
    channelsResource.addMethod('POST', adminChannelsCreateIntegration, noAuthOptions());
  }

  // /api/admin/channels/{id}
  const channelIdResource = channelsResource.addResource('{id}');

  // GET /api/admin/channels/{id}
  const adminChannelsGetIntegration = safeIntegration(lambdas?.adminChannelsGet);
  if (adminChannelsGetIntegration) {
    channelIdResource.addMethod('GET', adminChannelsGetIntegration, noAuthOptions());
  }

  // PUT /api/admin/channels/{id}
  const adminChannelsUpdateIntegration = safeIntegration(lambdas?.adminChannelsUpdate);
  if (adminChannelsUpdateIntegration) {
    channelIdResource.addMethod('PUT', adminChannelsUpdateIntegration, noAuthOptions());
  }

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