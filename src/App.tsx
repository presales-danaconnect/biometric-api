import { useState } from 'react'
import './App.css'

// Types
interface Endpoint {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
  auth: 'none' | 'bearer' | 'admin' | 'internal'
  headers?: { name: string; required: boolean; value: string }[]
  params?: { name: string; type: string; required: boolean; description: string }[]
  body?: object
  response: object
  curl: string
}

// Sample channel settings from real project
const channelSettings = {
  steps: ['liveness', 'ocr', 'data-verification', 'compare-faces'],
  baseUrl: 'https://digicert.verification-platform.com',
  webhookUrl: 'https://api.digicert.com/callback/biometric',
  projectId: '201208',
  redirectUrl: 'https://app.digicert.com/result',
  ui: {
    headerTitle: 'Identity Verification',
    headerLogoUrl: 'https://cdn.digicert.com/logo.png',
    bgColor: '#FCFCFC',
    footerPrivacyPolicyUrl: 'https://digicert.com/privacy',
    footerWebsiteUrl: 'https://digicert.com',
    colors: {
      primary: '#0a1a3c',
      background: '#eff3f9',
      headerBackground: '#ffffff',
      footerBackground: '#0a1a3c',
      headerFontColor: '#111827',
      footerFontColor: '#ffffff'
    },
    layout: {
      headerAlign: 'center' as const,
      footerAlign: 'center' as const
    }
  },
  thresholds: {
    livenessConfidenceThreshold: 80,
    compareFacesSimilarityThreshold: 80,
    ocrConfidenceThreshold: 70,
    maxAttempts: 3,
    requiresBackDocument: false,
    documentType: 1
  }
}

// Sample person data
const personData = {
  name: 'Juan Pérez',
  documentNumber: '12345678',
  email: 'juan@email.com'
}

// Step results
const livenessResult = {
  success: true,
  confidence: 95,
  s3Key: 'cliente001/uuid-123/liveness-reference.jpg'
}

const ocrResult = {
  success: true,
  extractedData: {
    nombre: 'JOHN',
    apellido: 'DOE',
    documentNumber: '12345678',
    fechaNacimiento: '01-01-1990',
    fechaVencimiento: '01-01-2030',
    nacionalidad: 'VENEZOLANO'
  }
}

const dataVerificationResult = {
  success: true,
  matches: {
    documentNumber: true,
    name: true
  },
  confidence: 95,
  reason: 'Document number and name match'
}

const compareFacesResult = {
  success: true,
  similarity: 91
}

// Webhook payload - Success example
const webhookPayloadSuccess = {
  circuitId: '550e8400-e29b-41d4-a716-446655440000',
  channelId: '550e8400-e29b-41d4-a716-446655440001',
  channelType: 'full',
  status: 'completed',
  person: {
    name: 'John Doe',
    documentNumber: '12345678',
    email: 'john@example.com'
  },
  geolocation: 'Av. Principal 123, Ciudad de México, México',
  wamid: 'wamid.xxx123',
  result: {
    liveness: livenessResult,
    ocr: ocrResult,
    'compare-faces': compareFacesResult,
    'data-verification': dataVerificationResult
  },
  completedAt: '2026-09-02T10:30:00.000Z'
}

// Webhook payload - Failed example
const webhookPayloadFailed = {
  circuitId: '550e8400-e29b-41d4-a716-446655440000',
  channelId: '550e8400-e29b-41d4-a716-446655440001',
  channelType: 'full',
  status: 'failed',
  person: {
    name: 'John Doe',
    documentNumber: '12345678',
    email: 'john@example.com'
  },
  geolocation: 'Av. Principal 123, Ciudad de México, México',
  wamid: 'wamid.xxx123',
  result: {
    liveness: livenessResult,
    ocr: ocrResult,
    'compare-faces': {
      success: false,
      errorCode: 'MAX_ATTEMPTS_REACHED',
      similarity: 0
    },
    'data-verification': dataVerificationResult
  },
  completedAt: '2026-09-02T10:45:00.000Z'
}

// Error codes documentation
const errorCodesDoc = {
  liveness: [
    { errorCode: '(none)', description: 'confidence < threshold → circuit status: failed' }
  ],
  ocr: [
    { errorCode: 'NOT_A_DOCUMENT', description: 'Image is not a valid identity document' }
  ],
  'compare-faces': [
    { errorCode: 'LOW_SIMILARITY', description: 'Faces do not match, similarity > 0' },
    { errorCode: 'NO_FACE_IN_IMAGE', description: 'No face detected in the document' },
    { errorCode: 'MAX_ATTEMPTS_REACHED', description: 'Max attempts exhausted → circuit status: failed' }
  ],
  'data-verification': [
    { errorCode: 'DATA_MISMATCH', description: 'Data does not match person provided' },
    { errorCode: 'MAX_ATTEMPTS_REACHED', description: 'Max attempts exhausted → circuit status: failed' }
  ]
}

// Format JSON for display
function formatJSON(obj: object): string {
  return JSON.stringify(obj, null, 2)
}

// Navigation items
const navItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'client', label: 'Client Integration', children: [
    { id: 'auth', label: 'Authentication' },
    { id: 'start-verification', label: 'Start Verification' },
    { id: 'webhooks', label: 'Webhook Events' }
  ]},
  { id: 'admin', label: 'Admin & Support', children: [
    { id: 'admin-api', label: 'Admin API' },
    { id: 'internal-api', label: 'Internal API' }
  ]}
]

// Endpoints data
const endpoints: Endpoint[] = [
  // Auth
  {
    id: 'oauth2-token',
    method: 'POST',
    path: '/oauth2/token',
    description: 'Obtains an access token from Cognito using the Client Credentials flow',
    auth: 'none',
    headers: [
      { name: 'Content-Type', required: true, value: 'application/x-www-form-urlencoded' }
    ],
    body: {
      grant_type: 'client_credentials',
      client_id: '<CLIENT_ID>',
      client_secret: '<CLIENT_SECRET>',
      scope: 'biometric-danaconnect/access'
    },
    response: {
      access_token: 'eyJraWQiOiJrZW4iLCJhbGciOiJSUzI1NiJ9...',
      token_type: 'Bearer',
      expires_in: 3600
    },
    curl: `curl -X POST "https://biometric-api-main.auth.us-east-1.amazoncognito.com/oauth2/token" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials" \\
  -d "client_id=<CLIENT_ID>" \\
  -d "client_secret=<CLIENT_SECRET>" \\
  -d "scope=biometric-danaconnect/access"`
  },
  // Admin
  {
    id: 'admin-clients-create',
    method: 'POST',
    path: '/api/admin/clients/create',
    description: 'Creates a Cognito App Client for an enterprise client',
    auth: 'admin',
    headers: [
      { name: 'x-admin-key', required: true, value: '<ADMIN_KEY>' },
      { name: 'Content-Type', required: true, value: 'application/json' }
    ],
    body: {
      code_client: 'cliente001',
      username: 'admin@cliente.com'
    },
    response: {
      clientId: '7k9j8h7g6f5e4d3c2b1a',
      clientSecret: 'xyzwxyzwxyzwxyzwxyzwxyzwxyzwxyzwxyzwxyzwxyzw'
    },
    curl: `curl -X POST "https://api.biometric.danaconnect.com/api/admin/clients/create" \\
  -H "x-admin-key: <ADMIN_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"code_client": "cliente001", "username": "admin@cliente.com"}'`
  },
  {
    id: 'admin-channels-create',
    method: 'POST',
    path: '/api/admin/channels',
    description: 'Creates a biometric verification channel with its configuration',
    auth: 'admin',
    headers: [
      { name: 'x-admin-key', required: true, value: '<ADMIN_KEY>' },
      { name: 'Content-Type', required: true, value: 'application/json' }
    ],
    body: {
      id_client: 123,
      code_client: 'cliente001',
      username: 'admin@cliente.com',
      name: 'Identity Verification',
      channel_type: 'biometric',
      settings: channelSettings
    },
    response: {
      channelId: '550e8400-e29b-41d4-a716-446655440000',
      createdAt: '2025-08-20T10:00:00.000Z'
    },
    curl: `curl -X POST "https://api.biometric.danaconnect.com/api/admin/channels" \\
  -H "x-admin-key: <ADMIN_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"id_client": 123, "code_client": "cliente001", "name": "Verification", "settings": {...}}'`
  },
  {
    id: 'admin-channels-get',
    method: 'GET',
    path: '/api/admin/channels/{id}',
    description: 'Gets the complete configuration of a channel',
    auth: 'admin',
    headers: [
      { name: 'x-admin-key', required: true, value: '<ADMIN_KEY>' }
    ],
    params: [
      { name: 'id', type: 'uuid', required: true, description: 'Channel ID' }
    ],
    response: {
      channel_id: '550e8400-e29b-41d4-a716-446655440000',
      code_client: 'cliente001',
      settings: channelSettings
    },
    curl: `curl -X GET "https://api.biometric.danaconnect.com/api/admin/channels/550e8400-e29b-41d4-a716-446655440000" \\
  -H "x-admin-key: <ADMIN_KEY>"`
  },
  {
    id: 'admin-channels-update',
    method: 'PUT',
    path: '/api/admin/channels/{id}',
    description: 'Updates a channel configuration with deep merge',
    auth: 'admin',
    headers: [
      { name: 'x-admin-key', required: true, value: '<ADMIN_KEY>' },
      { name: 'Content-Type', required: true, value: 'application/json' }
    ],
    params: [
      { name: 'id', type: 'uuid', required: true, description: 'Channel ID' }
    ],
    body: {
      name: 'Updated Verification',
      settings: {
        thresholds: {
          livenessConfidenceThreshold: 85
        }
      }
    },
    response: {
      channel_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Updated Verification',
      settings: channelSettings
    },
    curl: `curl -X PUT "https://api.biometric.danaconnect.com/api/admin/channels/550e8400-e29b-41d4-a716-446655440000" \\
  -H "x-admin-key: <ADMIN_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Updated Verification", "settings": {"thresholds": {"livenessConfidenceThreshold": 85}}}'`
  },
  // Biometric
  {
    id: 'start-circuit',
    method: 'POST',
    path: '/api/biometric/start_circuit/{channel_id}',
    description: 'Starts a new biometric verification circuit',
    auth: 'bearer',
    headers: [
      { name: 'Authorization', required: true, value: 'Bearer <ACCESS_TOKEN>' },
      { name: 'Content-Type', required: true, value: 'application/json' }
    ],
    params: [
      { name: 'channel_id', type: 'uuid', required: true, description: 'Channel ID' }
    ],
    body: {
      person: personData
    },
    response: {
      circuitId: '550e8400-e29b-41d4-a716-446655440000',
      link: 'https://verificacion.cliente.com/?circuit=550e8400-e29b-41d4-a716-446655440000'
    },
    curl: `curl -X POST "https://api.biometric.danaconnect.com/api/biometric/start_circuit/550e8400-e29b-41d4-a716-446655440001" \\
  -H "Authorization: Bearer <ACCESS_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"person": {"name": "Juan Pérez", "documentNumber": "12345678", "email": "juan@email.com"}}'`
  },
  {
    id: 'get-config',
    method: 'GET',
    path: '/api/biometric/get_config/{circuit_id}',
    description: 'Gets UI config and thresholds for the frontend',
    auth: 'internal',
    headers: [
      { name: 'x-internal-key', required: true, value: '<INTERNAL_KEY>' }
    ],
    params: [
      { name: 'circuit_id', type: 'uuid', required: true, description: 'Circuit ID' }
    ],
    response: {
      circuitId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'pending',
      currentStep: null,
      stepsCompleted: [],
      steps: ['liveness', 'ocr', 'data-verification', 'compare-faces'],
      channelType: 'biometric',
      ui: channelSettings.ui,
      thresholds: channelSettings.thresholds
    },
    curl: `curl -X GET "https://api.biometric.danaconnect.com/api/biometric/get_config/550e8400-e29b-41d4-a716-446655440000" \\
  -H "x-internal-key: <INTERNAL_KEY>"`
  },
  {
    id: 'upload-url',
    method: 'GET',
    path: '/api/biometric/upload-url/{circuit_id}',
    description: 'Generates a presigned URL for uploading document images to S3',
    auth: 'internal',
    headers: [
      { name: 'x-internal-key', required: true, value: '<INTERNAL_KEY>' }
    ],
    params: [
      { name: 'circuit_id', type: 'uuid', required: true, description: 'Circuit ID' },
      { name: 'type', type: 'string', required: true, description: 'front or back' }
    ],
    response: {
      uploadUrl: 'https://biometric-api-dev-documents.s3.amazonaws.com/cliente001/uuid/front.jpg?...',
      s3Key: 'cliente001/uuid/front.jpg',
      expiresIn: 600
    },
    curl: `curl -X GET "https://api.biometric.danaconnect.com/api/biometric/upload-url/550e8400-e29b-41d4-a716-446655440000?type=front" \\
  -H "x-internal-key: <INTERNAL_KEY>"`
  },
  {
    id: 'process-circuit',
    method: 'POST',
    path: '/api/biometric/process_circuit/{circuit_id}',
    description: 'Executes a biometric verification step',
    auth: 'internal',
    headers: [
      { name: 'x-internal-key', required: true, value: '<INTERNAL_KEY>' },
      { name: 'Content-Type', required: true, value: 'application/json' }
    ],
    params: [
      { name: 'circuit_id', type: 'uuid', required: true, description: 'Circuit ID' }
    ],
    body: {
      step: 'liveness',
      data: {
        sessionId: 'rekognition-session-id'
      },
      geolocation: 'Calle Av. Principal 123, Ciudad de México, México'
    },
    response: {
      circuitId: '550e8400-e29b-41d4-a716-446655440000',
      step: 'liveness',
      stepResult: livenessResult,
      status: 'in_progress',
      stepsCompleted: ['liveness'],
      nextStep: 'ocr'
    },
    curl: `curl -X POST "https://api.biometric.danaconnect.com/api/biometric/process_circuit/550e8400-e29b-41d4-a716-446655440000" \\
  -H "x-internal-key: <INTERNAL_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"step": "liveness", "data": {"sessionId": "rekognition-session-id"}}'`
  }
]

function App() {
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set())

  const toggleEndpoint = (id: string) => {
    const newExpanded = new Set(expandedEndpoints)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedEndpoints(newExpanded)
  }

  const scrollTo = (id: string) => {
    const element = document.getElementById(id)
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Reusable endpoint card renderer
  const renderEndpointCard = (endpoint: Endpoint) => (
    <div
      key={endpoint.id}
      id={`endpoint-${endpoint.id}`}
      className={`endpoint-card ${expandedEndpoints.has(endpoint.id) ? 'expanded' : ''}`}
    >
      <div className="endpoint-header" onClick={() => toggleEndpoint(endpoint.id)}>
        <span className={`endpoint-method method-${endpoint.method.toLowerCase()}`}>
          {endpoint.method}
        </span>
        <span className="endpoint-path">{endpoint.path}</span>
        <span className="endpoint-description">{endpoint.description}</span>
        <span className={`auth-badge ${endpoint.auth}`}>
          {endpoint.auth === 'none' && endpoint.id === 'oauth2-token' && '🔑 client_id + client_secret'}
          {endpoint.auth === 'bearer' && '🔐 Bearer token'}
          {endpoint.auth === 'internal' && '🔐 x-internal-key'}
          {endpoint.auth === 'admin' && '🔑 x-admin-key'}
        </span>
        <span className="endpoint-toggle">▼</span>
      </div>
      <div className="endpoint-details">
        {endpoint.headers && (
          <div className="endpoint-section">
            <h4>Headers</h4>
            <table className="params-table">
              <thead>
                <tr>
                  <th>Header</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {endpoint.headers.map(h => (
                  <tr key={h.name}>
                    <td>
                      <span className="param-name">{h.name}</span>
                      {h.required && <span className="param-required">required</span>}
                    </td>
                    <td><code>{h.value}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {endpoint.params && (
          <div className="endpoint-section">
            <h4>Path Parameters</h4>
            <table className="params-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Type</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {endpoint.params.map(p => (
                  <tr key={p.name}>
                    <td>
                      <span className="param-name">{p.name}</span>
                      {p.required && <span className="param-required">required</span>}
                    </td>
                    <td><span className="param-type">{p.type}</span></td>
                    <td>{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {endpoint.body && (
          <div className="endpoint-section">
            <h4>Request Body</h4>
            <div className="code-wrapper">
              <pre><code>{formatJSON(endpoint.body)}</code></pre>
            </div>
          </div>
        )}
        <div className="endpoint-section">
          <h4>Response</h4>
          <div className="response-block">
            <span className="response-status success">● {endpoint.method === 'POST' ? '201 Created' : '200 OK'}</span>
            <div className="code-wrapper">
              <pre><code>{formatJSON(endpoint.response)}</code></pre>
            </div>
          </div>
        </div>
        <div className="endpoint-section">
          <h4>cURL</h4>
          <div className="code-wrapper">
            <pre className="curl-block"><code>{endpoint.curl}</code></pre>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-text">biometric-api</span>
          <span className="logo-badge">v1.0</span>
        </div>
        <nav className="header-nav">
          {navItems.map(item => (
            <a key={item.id} href={`#${item.id}`} onClick={(e) => { e.preventDefault(); scrollTo(item.id) }}>
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      {/* Main Layout */}
      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          {navItems.map(item => (
            <div key={item.id} className="sidebar-section">
              <div 
                className="sidebar-title"
                onClick={() => scrollTo(item.id)}
              >
                {item.label}
              </div>
              {item.children && (
                <div className="sidebar-children">
                  {item.children.map(child => (
                    <div
                      key={child.id}
                      className="sidebar-child"
                      onClick={() => scrollTo(child.id)}
                    >
                      {child.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </aside>

        {/* Content */}
        <main className="content">
          {/* Overview */}
          <div id="overview">
            <h1 className="page-title">biometric-api Documentation</h1>
            <p className="page-description">
              Biometric SDK as a service (SaaS) that allows any company to integrate identity verifications via modern REST API.
            </p>
            <img
              src="/biometric_api_flow.png"
              alt="biometric-api Architecture"
              style={{ width: '100%', borderRadius: '8px', marginTop: '16px', border: '1px solid #e5e7eb' }}
            />
          </div>

          {/* Client Integration Section */}
          <section id="client">
            <h1 className="page-title">Client Integration</h1>
            
            <h2 id="auth">Authentication</h2>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Obtain an access token using the OAuth2 Client Credentials flow.
            </p>
            {endpoints.filter(e => e.id === 'oauth2-token').map(renderEndpointCard)}

            <h2 id="start-verification">Start Verification</h2>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Start a new biometric verification circuit for a customer.
            </p>
            {endpoints.filter(e => e.id === 'start-circuit').map(renderEndpointCard)}

            <h2 id="webhooks">Webhook Events</h2>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              When a circuit reaches 'completed' or 'failed' status, a POST request is sent to the configured webhookUrl.
            </p>
            
            <div className="endpoint-card expanded">
              <div className="endpoint-section">
                <h4>Webhook Payload - Success Example</h4>
                <div className="code-wrapper">
                  <pre><code>{formatJSON(webhookPayloadSuccess)}</code></pre>
                </div>
              </div>
              <div className="endpoint-section">
                <h4>Webhook Payload - Failed Example</h4>
                <div className="code-wrapper">
                  <pre><code>{formatJSON(webhookPayloadFailed)}</code></pre>
                </div>
              </div>
              <div className="endpoint-section">
                <h4>Error Codes by Step</h4>
                <table className="params-table">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th>Error Code</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(errorCodesDoc).map(([step, codes]) => (
                      codes.map((code, idx) => (
                        <tr key={`${step}-${code.errorCode}`}>
                          <td><span className="param-name">{step}</span></td>
                          <td><code>{code.errorCode}</code></td>
                          <td>{code.description}</td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="endpoint-section">
                <h4>Step Retry Behavior</h4>
                <p style={{ marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  When a step fails with retryable errors:
                </p>
                <ul style={{ marginLeft: '20px', color: 'var(--text-secondary)' }}>
                  <li>The step is NOT added to steps_completed</li>
                  <li>The circuit status remains 'in_progress'</li>
                  <li>User must retry the failed step</li>
                  <li>If maxAttempts is reached, circuit status changes to 'failed'</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Admin & Support Section */}
          <section id="admin">
            <h1 className="page-title">Admin & Support</h1>
            
            <h2 id="admin-api">Admin API</h2>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Endpoints for client and channel configuration. Require <code>x-admin-key</code> header.
            </p>
            {endpoints.filter(e => e.auth === 'admin').map(renderEndpointCard)}

            <h2 id="internal-api">Internal API</h2>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Internal endpoints for the biometric verification flow. Require <code>x-internal-key</code> header.
            </p>
            {endpoints.filter(e => e.auth === 'internal').map(renderEndpointCard)}
          </section>
        </main>
      </div>
    </div>
  )
}

export default App