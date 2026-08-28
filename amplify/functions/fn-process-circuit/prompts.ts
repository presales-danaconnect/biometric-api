export const OCR_PROMPT = `Analiza esta imagen. Primero determina si es un documento de identidad válido 
(cédula, pasaporte, licencia de conducir, DNI, etc).

Responde SOLO con un JSON con esta estructura exacta, sin texto adicional:

Si ES un documento válido:
{
  "isDocument": true,
  "nombre": "...",
  "apellido": "...",
  "documentNumber": "...",
  "fechaNacimiento": "...",
  "fechaVencimiento": "...",
  "nacionalidad": "..."
}

Si NO es un documento válido:
{
  "isDocument": false
}

Sin texto adicional, solo el JSON.`;