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
    nombre: 'JUAN PEREZ',
    apellido: 'GARCIA',
    documentNumber: '12345678',
    fechaNacimiento: '1990-05-15',
    fechaVencimiento: '2030-05-15',
    nacionalidad: 'MEX'
  }
}

const dataVerificationResult = {
  success: true,
  matches: {
    documentNumber: true,
    name: true
  }
}

const compareFacesResult = {
  success: true,
  similarity: 92
}

// Webhook payload
const webhookPayload = {
  circuitId: '550e8400-e29b-41d4-a716-446655440000',
  channelId: '550e8400-e29b-41d4-a716-446655440001',
  channelType: 'biometric',
  status: 'completed',
  person: personData,
  geolocation: 'Calle Av. Principal 123, Ciudad de México, México',
  result: {
    liveness: livenessResult,
    ocr: ocrResult,
    'data-verification': dataVerificationResult,
    'compare-faces': compareFacesResult
  },
  completedAt: '2025-08-20T10:30:00.000Z'
}

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

// Format JSON for display
function formatJSON(obj: object): string {
  return JSON.stringify(obj, null, 2)
}

function App() {
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set())
  const [activeSection, setActiveSection] = useState('auth')

  const toggleEndpoint = (id: string) => {
    const newExpanded = new Set(expandedEndpoints)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedEndpoints(newExpanded)
  }

  const scrollToEndpoint = (id: string) => {
    setExpandedEndpoints(prev => new Set([...prev, id]))
    const element = document.getElementById(`endpoint-${id}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const sections = [
    { id: 'auth', title: 'Authentication', endpoints: ['oauth2-token'] },
    { id: 'admin', title: 'Admin API', endpoints: ['admin-clients-create', 'admin-channels-create', 'admin-channels-get', 'admin-channels-update'] },
    { id: 'biometric', title: 'Biometric API', endpoints: ['start-circuit', 'get-config', 'upload-url', 'process-circuit'] }
  ]

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-text">biometric-api</span>
          <span className="logo-badge">v1.0</span>
        </div>
        <nav className="header-nav">
          <a href="#overview">Overview</a>
          <a href="#getting-started">Getting Started</a>
          <a href="#docs">Documentation</a>
        </nav>
      </header>

      {/* Main Layout */}
      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          {sections.map(section => (
            <div key={section.id} className="sidebar-section">
              <div className="sidebar-title">{section.title}</div>
              {section.endpoints.map(endpointId => {
                const endpoint = endpoints.find(e => e.id === endpointId)
                if (!endpoint) return null
                return (
                  <div
                    key={endpointId}
                    className={`sidebar-item ${activeSection === section.id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveSection(section.id)
                      scrollToEndpoint(endpointId)
                    }}
                  >
                    <span className={`method-badge method-${endpoint.method.toLowerCase()}`}>
                      {endpoint.method}
                    </span>
                    <span>{endpoint.path.split('/').pop()?.replace('{id}', 'id').replace('{circuit_id}', 'id').replace('{channel_id}', 'id') || ''}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </aside>

        {/* Content */}
        <main className="content">
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

          {/* Auth Section */}
          <section id="docs">
            <h1 className="page-title">API Reference</h1>
            <h2 className="section-title">Authentication</h2>
            {endpoints.filter(e => e.auth === 'none').map(endpoint => (
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
                    {endpoint.auth === 'none' ? (endpoint.id === 'oauth2-token' ? '🔑 client_id + client_secret' : '🔓 Public') : ''}
                    {endpoint.auth === 'internal' ? '🔐 x-internal-key' : ''}
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
                      <span className="response-status success">● 201 Created</span>
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
            ))}
          </section>

          {/* Admin API Section */}
          <h2 className="section-title">Admin API</h2>
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
            Endpoints for client and channel configuration. Require <code>x-admin-key</code> header.
          </p>
          {endpoints.filter(e => e.auth === 'admin').map(endpoint => (
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
                <span className={`auth-badge admin`}>🔑 x-admin-key</span>
                <span className="endpoint-toggle">▼</span>
              </div>
              <div className="endpoint-details">
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
                      {endpoint.headers?.map(h => (
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
                    <span className="response-status success">● {endpoint.method === 'POST' ? '201 Created' : endpoint.method === 'PUT' ? '200 OK' : '200 OK'}</span>
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
          ))}

          {/* Biometric API Section */}
          <h2 className="section-title">Biometric API</h2>
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
            Endpoints for the biometric verification flow. The <code>get_config</code>, <code>upload-url</code>, and <code>process_circuit</code> endpoints use the <code>x-internal-key</code> header (for portal frontend use). The <code>start_circuit</code> endpoint uses Bearer token with scope <code>biometric-danaconnect/access</code>.
          </p>
          {endpoints.filter(e => e.auth === 'internal').map(endpoint => (
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
                <span className={`auth-badge internal`}>🔐 x-internal-key</span>
                <span className="endpoint-toggle">▼</span>
              </div>
              <div className="endpoint-details">
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
                      {endpoint.headers?.map(h => (
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
                {endpoint.params && (
                  <div className="endpoint-section">
                    <h4>Path / Query Parameters</h4>
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
          ))}

          {/* Webhook Section */}
          <h2 className="section-title">Completion Webhook</h2>
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
            When a circuit is completed, a POST is sent to the configured webhookUrl.
          </p>
          <div className="endpoint-card expanded">
            <div className="endpoint-section">
              <h4>Webhook Payload (POST to webhookUrl)</h4>
              <div className="code-wrapper">
                <pre><code>{formatJSON(webhookPayload)}</code></pre>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App