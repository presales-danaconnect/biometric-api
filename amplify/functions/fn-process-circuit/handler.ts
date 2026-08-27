import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';
import {
  RekognitionClient,
  GetFaceLivenessSessionResultsCommand,
  CompareFacesCommand,
} from '@aws-sdk/client-rekognition';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

const dynamoClient = new DynamoDBClient({});
const rekognitionClient = new RekognitionClient({});
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3Client = new S3Client({});

interface StepData {
  sessionId?: string;
}

interface ProcessCircuitRequest {
  step: 'liveness' | 'ocr' | 'data-verification' | 'compare-faces';
  data?: StepData;
  geolocation?: string;
}

interface Person {
  name?: string;
  documentNumber?: string;
  email?: string;
}

interface StepResult {
  success: boolean;
  confidence?: number;
  similarity?: number;
  s3Key?: string;
  extractedData?: {
    nombre?: string;
    apellido?: string;
    documentNumber?: string;
    fechaNacimiento?: string;
    fechaVencimiento?: string;
    nacionalidad?: string;
  };
  matches?: {
    documentNumber: boolean;
    name: boolean;
  };
  error?: string;
}

interface CircuitItem {
  circuit_id: string;
  channel_id: string;
  channel_type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  current_step?: string;
  steps_completed: string[];
  person?: Person;
  result: Record<string, StepResult>;
  created_at: string;
  expires_at: string;
  completed_at?: string;
  geolocation?: string;
}

interface ChannelSettings {
  steps: string[];
  baseUrl: string;
  webhookUrl?: string;
  projectId?: string;
  redirectUrl?: string;
  ui: Record<string, unknown>;
  thresholds: {
    livenessConfidenceThreshold: number;
    compareFacesSimilarityThreshold: number;
    ocrConfidenceThreshold: number;
    maxAttempts: number;
    requiresBackDocument: boolean;
  };
}

interface ChannelItem {
  channel_id: string;
  code_client: string;
  settings: ChannelSettings;
}

interface ProcessCircuitResponse {
  circuitId: string;
  step: string;
  stepResult: StepResult;
  status: string;
  stepsCompleted: string[];
  nextStep: string | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-internal-key',
  'Content-Type': 'application/json',
};

interface ErrorResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function errorResponse(statusCode: number, message: string): ErrorResponse {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({ error: message }),
  };
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compareNames(name1?: string, name2?: string): boolean {
  if (!name1 || !name2) return false;
  const normalized1 = normalizeString(name1);
  const normalized2 = normalizeString(name2);
  return normalized1 === normalized2 || normalized1.includes(normalized2) || normalized2.includes(normalized1);
}

async function downloadS3Object(bucket: string, key: string): Promise<Buffer | null> {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    if (!response.Body) return null;
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (error) {
    console.error(`Error downloading S3 object ${key}:`, error);
    return null;
  }
}

async function uploadToS3(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
}

async function getLivenessResult(sessionId: string, threshold: number): Promise<StepResult> {
  const command = new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId });
  const response = await rekognitionClient.send(command);

  if (!response.Confidence) {
    return { success: false, error: 'No confidence score returned' };
  }

  const confidence = Math.round(response.Confidence);
  const success = confidence >= threshold;

  return {
    success,
    confidence,
    error: success ? undefined : `Confidence ${confidence} below threshold ${threshold}`,
  };
}

async function performOcr(bucket: string, codeClient: string, circuitId: string, requiresBack: boolean): Promise<StepResult> {
  const frontImage = await downloadS3Object(bucket, `${codeClient}/${circuitId}/front.jpg`);
  if (!frontImage) {
    return { success: false, error: 'front.jpg not found in S3' };
  }

  const images: string[] = [frontImage.toString('base64')];
  let backImage: Buffer | null = null;

  if (requiresBack) {
    backImage = await downloadS3Object(bucket, `${codeClient}/${circuitId}/back.jpg`);
    if (backImage) {
      images.push(backImage.toString('base64'));
    }
  }

  const prompt = `You are a document OCR assistant. Extract data from this identity document and return ONLY a JSON object with:
- nombre: The person's first name
- apellido: The person's last name  
- documentNumber: The document number
- fechaNacimiento: Date of birth in YYYY-MM-DD format
- fechaVencimiento: Expiration date in YYYY-MM-DD format
- nacionalidad: Nationality/country

If a field cannot be read, set it to null.
Return ONLY the JSON, no text, no markdown, no code blocks.`;

  const requestBody = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.map((img) => ({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: img },
          })),
        ],
      },
    ],
  });

  const command = new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    contentType: 'application/json',
    body: requestBody,
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const extractedText = responseBody.content?.[0]?.text || '';

  // Parse JSON from response
  const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { success: false, error: 'Failed to parse OCR response' };
  }

  let extractedData;
  try {
    extractedData = JSON.parse(jsonMatch[0]);
  } catch {
    return { success: false, error: 'Invalid JSON in OCR response' };
  }

  return { success: true, extractedData };
}

async function performDataVerification(circuit: CircuitItem): Promise<StepResult> {
  const ocrResult = circuit.result.ocr;
  if (!ocrResult || !ocrResult.extractedData) {
    return { success: false, error: 'OCR must be executed before data verification' };
  }

  const ocr = ocrResult.extractedData;
  const person = circuit.person;

  if (!person) {
    return { success: false, error: 'No person data in circuit' };
  }

  const documentNumberMatch = person.documentNumber === ocr.documentNumber;
  const nameMatch = compareNames(person.name, ocr.nombre);

  return {
    success: documentNumberMatch && nameMatch,
    matches: {
      documentNumber: documentNumberMatch,
      name: nameMatch,
    },
  };
}

async function performCompareFaces(
  bucket: string,
  codeClient: string,
  circuitId: string,
  threshold: number
): Promise<StepResult> {
  const referenceImage = await downloadS3Object(bucket, `${codeClient}/${circuitId}/liveness-reference.jpg`);
  if (!referenceImage) {
    return { success: false, error: 'liveness-reference.jpg not found (run liveness first)' };
  }

  const frontImage = await downloadS3Object(bucket, `${codeClient}/${circuitId}/front.jpg`);
  if (!frontImage) {
    return { success: false, error: 'front.jpg not found' };
  }

  const command = new CompareFacesCommand({
    SourceImage: { Bytes: referenceImage },
    TargetImage: { Bytes: frontImage },
    SimilarityThreshold: threshold,
  });

  const response = await rekognitionClient.send(command);

  if (!response.FaceMatches || response.FaceMatches.length === 0) {
    return { success: false, similarity: 0 };
  }

  const similarity = response.FaceMatches[0].Similarity || 0;
  return {
    success: similarity >= threshold,
    similarity: Math.round(similarity),
  };
}

async function callWebhook(webhookUrl: string, circuit: CircuitItem, channel: ChannelItem): Promise<void> {
  try {
    const payload = {
      circuitId: circuit.circuit_id,
      channelId: circuit.channel_id,
      channelType: circuit.channel_type,
      status: circuit.status,
      person: circuit.person,
      geolocation: circuit.geolocation,
      result: circuit.result,
      completedAt: circuit.completed_at,
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Error calling webhook:', error);
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // Validate x-internal-key header
    const internalKey = event.headers['x-internal-key'] || event.headers['X-Internal-Key'];
    if (!internalKey || internalKey !== process.env.INTERNAL_KEY) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const circuitId = event.pathParameters?.circuit_id;
    if (!circuitId) {
      return errorResponse(400, 'Missing circuit ID in path');
    }

    if (!event.body) {
      return errorResponse(400, 'Missing request body');
    }

    let body: ProcessCircuitRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse(400, 'Invalid JSON in request body');
    }

    const { step, data, geolocation } = body;
    const validSteps = ['liveness', 'ocr', 'data-verification', 'compare-faces'];

    if (!validSteps.includes(step)) {
      return errorResponse(400, `Invalid step: ${step}`);
    }

    const circuitsTableName = process.env.CIRCUITS_TABLE_NAME;
    const channelsTableName = process.env.CHANNELS_TABLE_NAME;
    const documentsBucketName = process.env.DOCUMENTS_BUCKET_NAME;
    const livenessThreshold = parseInt(process.env.LIVENESS_THRESHOLD || '80', 10);
    const compareFacesThreshold = parseInt(process.env.COMPARE_FACES_THRESHOLD || '80', 10);

    if (!circuitsTableName || !channelsTableName || !documentsBucketName) {
      return errorResponse(500, 'Missing environment variables');
    }

    // Get circuit
    const getCircuitCommand = new GetItemCommand({
      TableName: circuitsTableName,
      Key: { circuit_id: { S: circuitId } },
    });

    const circuitResponse = await dynamoClient.send(getCircuitCommand);
    if (!circuitResponse.Item) {
      return errorResponse(404, 'Circuit not found');
    }

    const circuit = unmarshall(circuitResponse.Item) as CircuitItem;

    if (circuit.status === 'completed' || circuit.status === 'failed') {
      return errorResponse(409, 'Circuit has already been processed');
    }

    // Get channel
    const getChannelCommand = new GetItemCommand({
      TableName: channelsTableName,
      Key: { channel_id: { S: circuit.channel_id } },
    });

    const channelResponse = await dynamoClient.send(getChannelCommand);
    if (!channelResponse.Item) {
      return errorResponse(404, 'Channel not found');
    }

    const channel = unmarshall(channelResponse.Item) as ChannelItem;

    // Validate step is in channel's steps
    if (!channel.settings.steps.includes(step)) {
      return errorResponse(400, `Step ${step} not configured for this channel`);
    }

    // Check if step was already completed
    if (circuit.steps_completed.includes(step)) {
      return errorResponse(409, `Step ${step} already completed`);
    }

    // Get previous step and check order
    const stepIndex = channel.settings.steps.indexOf(step);
    const previousSteps = channel.settings.steps.slice(0, stepIndex);

    for (const prevStep of previousSteps) {
      if (!circuit.steps_completed.includes(prevStep)) {
        return errorResponse(400, `Previous step ${prevStep} must be completed first`);
      }
    }

    // Execute step
    let stepResult: StepResult;

    switch (step) {
      case 'liveness':
        if (!data?.sessionId) {
          return errorResponse(400, 'sessionId required for liveness step');
        }
        stepResult = await getLivenessResult(data.sessionId, channel.settings.thresholds.livenessConfidenceThreshold);

        // If successful, download reference image and upload to S3
        if (stepResult.success && stepResult.confidence !== undefined) {
          // Get reference image from Rekognition would go here
          // For now, we'll assume the frontend handles the upload
        }
        break;

      case 'ocr':
        stepResult = await performOcr(
          documentsBucketName,
          channel.code_client,
          circuitId,
          channel.settings.thresholds.requiresBackDocument
        );
        break;

      case 'data-verification':
        stepResult = await performDataVerification(circuit);
        break;

      case 'compare-faces':
        stepResult = await performCompareFaces(
          documentsBucketName,
          channel.code_client,
          circuitId,
          channel.settings.thresholds.compareFacesSimilarityThreshold
        );
        break;

      default:
        return errorResponse(400, `Unknown step: ${step}`);
    }

    // Calculate next step
    const nextStepIndex = stepIndex + 1;
    const nextStep = nextStepIndex < channel.settings.steps.length
      ? channel.settings.steps[nextStepIndex]
      : null;

    // Determine new status
    let newStatus: 'in_progress' | 'completed' | 'failed' = 'in_progress';
    const allStepsCompleted = nextStep === null;

    if (allStepsCompleted) {
      // Check if any step failed
      const stepsToCheck = channel.settings.steps.filter((s) => !circuit.steps_completed.includes(s) && s !== step);
      const allSuccessful = stepsToCheck.every((s) => stepResult.success);
      newStatus = stepResult.success && allSuccessful ? 'completed' : 'failed';
    }

    // Build update expression
    const updateParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, unknown> = {};

    updateParts.push('#result.#step = :stepResult');
    expressionAttributeNames['#result'] = 'result';
    expressionAttributeNames['#step'] = step;
    expressionAttributeValues[':stepResult'] = stepResult;

    updateParts.push('#steps_completed = list_append(if_not_exists(#steps_completed, :empty_list), :newStep)');
    expressionAttributeNames['#steps_completed'] = 'steps_completed';
    expressionAttributeValues[':emptyList'] = [];
    expressionAttributeValues[':newStep'] = [step];

    if (newStatus === 'completed' || newStatus === 'failed') {
      updateParts.push('#status = :newStatus');
      updateParts.push('#completed_at = :completedAt');
      expressionAttributeValues[':newStatus'] = newStatus;
      expressionAttributeValues[':completedAt'] = new Date().toISOString();
    } else {
      updateParts.push('#status = :newStatus');
      expressionAttributeValues[':newStatus'] = newStatus;
    }

    if (geolocation && !circuit.geolocation) {
      updateParts.push('#geolocation = :geolocation');
      expressionAttributeNames['#geolocation'] = 'geolocation';
      expressionAttributeValues[':geolocation'] = geolocation;
    }

    // Update circuit
    const updateCommand = new UpdateItemCommand({
      TableName: circuitsTableName,
      Key: { circuit_id: { S: circuitId } },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues, { removeUndefinedValues: true }),
      ReturnValues: 'ALL_NEW',
    });

    const updateResponse = await dynamoClient.send(updateCommand);
    const updatedCircuit = unmarshall(updateResponse.Attributes || {}) as CircuitItem;

    // Call webhook if completed or failed
    if ((newStatus === 'completed' || newStatus === 'failed') && channel.settings.webhookUrl) {
      await callWebhook(channel.settings.webhookUrl, updatedCircuit, channel);
    }

    const response: ProcessCircuitResponse = {
      circuitId,
      step,
      stepResult,
      status: newStatus,
      stepsCompleted: [...circuit.steps_completed, step],
      nextStep,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error processing circuit:', error);
    return errorResponse(500, 'Internal server error');
  }
};