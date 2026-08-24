import { Duration, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  RestApi,
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  MethodOptions,
  EndpointType,
  IResource,
  CfnDeployment,
  CfnStage,
  CfnResource,
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
    // Remove deployOptions to create explicit CfnDeployment
  });

  Tags.of(api).add('Project', 'biometric-api');
  Tags.of(api).add('Environment', env);

  // Create Cognito authorizer
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

  // Attach authorizer to API before creating methods
  cognitoAuthorizer._attachToApi(api);

  // Cognito authorizer options
  const cognitoOptions: MethodOptions = {
    authorizationType: AuthorizationType.COGNITO,
    authorizer: cognitoAuthorizer,
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

  // Create explicit CfnDeployment that depends on the authorizer
  const deployment = new CfnDeployment(scope, 'BiometricApiDeployment', {
    restApiId: api.restApiId,
  });

  // Deployment must depend on the authorizer
  deployment.addDependency(cognitoAuthorizer.node.defaultChild as CfnResource);

  // Create explicit CfnStage
  new CfnStage(scope, 'BiometricApiStage', {
    restApiId: api.restApiId,
    deploymentId: deployment.ref,
    stageName: env,
  });

  const apiGatewayUrl = `https://${api.restApiId}.execute-api.${config.region}.amazonaws.com/${env}`;

  return {
    apiGatewayUrl,
    apiGatewayId: api.restApiId,
    apiGatewayName: apiName,
  };
}