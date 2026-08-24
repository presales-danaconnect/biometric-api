import { Duration, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  RestApi,
  AuthorizationType,
  LambdaIntegration,
  MethodOptions,
  EndpointType,
  IResource,
  CfnDeployment,
  CfnResource,
  CfnAuthorizer,
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
      stageName: env,
      throttlingRateLimit: 100,
      throttlingBurstLimit: 200,
    },
  });

  Tags.of(api).add('Project', 'biometric-api');
  Tags.of(api).add('Environment', env);

  // Create CfnAuthorizer for Cognito user pool
  const cfnAuthorizer = new CfnAuthorizer(scope, 'BiometricCognitoAuthorizer', {
    restApiId: api.restApiId,
    name: `biometric-api-${env}-authorizer`,
    type: 'COGNITO_USER_POOLS',
    identitySource: 'method.request.header.Authorization',
    providerArns: [config.userPool.userPoolArn],
  });

  // Cognito authorizer options
  const cognitoOptions: MethodOptions = {
    authorizationType: AuthorizationType.COGNITO,
    authorizer: { authorizerId: cfnAuthorizer.ref },
  };

  // No auth options for admin endpoints
  const noAuthOptions: MethodOptions = {
    authorizationType: AuthorizationType.NONE,
  };

  // POST /oauth2/token
  const oauthResource = api.root.addResource('oauth2');
  const tokenResource = oauthResource.addResource('token');
  const oauthIntegration = safeIntegration(lambdas?.oauthToken);
  if (oauthIntegration) {
    tokenResource.addMethod('POST', oauthIntegration, noAuthOptions);
  }

  // /api
  const apiResource: IResource = api.root.addResource('api');

  // /api/biometric
  const biometricResource = apiResource.addResource('biometric');

  // GET /api/biometric/get_config/{circuit_id}
  const getConfigIntegration = safeIntegration(lambdas?.getConfig);
  if (getConfigIntegration) {
    biometricResource
      .addResource('get_config')
      .addResource('{circuit_id}')
      .addMethod('GET', getConfigIntegration, cognitoOptions);
  }

  // POST /api/biometric/start_circuit/{channel_id}
  const startCircuitIntegration = safeIntegration(lambdas?.startCircuit);
  if (startCircuitIntegration) {
    biometricResource
      .addResource('start_circuit')
      .addResource('{channel_id}')
      .addMethod('POST', startCircuitIntegration, cognitoOptions);
  }

  // POST /api/biometric/process_circuit/{circuit_id}
  const processCircuitIntegration = safeIntegration(lambdas?.processCircuit);
  if (processCircuitIntegration) {
    biometricResource
      .addResource('process_circuit')
      .addResource('{circuit_id}')
      .addMethod('POST', processCircuitIntegration, cognitoOptions);
  }

  // /api/admin
  const adminResource = apiResource.addResource('admin');

  // POST /api/admin/clients/create
  const adminClientsCreateIntegration = safeIntegration(lambdas?.adminClientsCreate);
  if (adminClientsCreateIntegration) {
    adminResource
      .addResource('clients')
      .addResource('create')
      .addMethod('POST', adminClientsCreateIntegration, noAuthOptions);
  }

  // /api/admin/channels
  const channelsResource = adminResource.addResource('channels');

  // POST /api/admin/channels
  const adminChannelsCreateIntegration = safeIntegration(lambdas?.adminChannelsCreate);
  if (adminChannelsCreateIntegration) {
    channelsResource.addMethod('POST', adminChannelsCreateIntegration, noAuthOptions);
  }

  // /api/admin/channels/{id}
  const channelIdResource = channelsResource.addResource('{id}');

  // GET /api/admin/channels/{id}
  const adminChannelsGetIntegration = safeIntegration(lambdas?.adminChannelsGet);
  if (adminChannelsGetIntegration) {
    channelIdResource.addMethod('GET', adminChannelsGetIntegration, noAuthOptions);
  }

  // PUT /api/admin/channels/{id}
  const adminChannelsUpdateIntegration = safeIntegration(lambdas?.adminChannelsUpdate);
  if (adminChannelsUpdateIntegration) {
    channelIdResource.addMethod('PUT', adminChannelsUpdateIntegration, noAuthOptions);
  }

  // Force deployment to depend on authorizer
  const cfnDeployment = api.latestDeployment?.node.defaultChild as CfnDeployment;
  if (cfnDeployment) {
    cfnDeployment.addDependency(cfnAuthorizer);
  }

  const apiGatewayUrl = `https://${api.restApiId}.execute-api.${config.region}.amazonaws.com/${env}`;

  return {
    apiGatewayUrl,
    apiGatewayId: api.restApiId,
    apiGatewayName: apiName,
  };
}