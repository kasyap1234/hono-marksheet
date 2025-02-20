import { Hono } from 'hono'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { swaggerUI } from '@hono/swagger-ui'
import 'dotenv/config'

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const app = new Hono()

// Swagger documentation
const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Image Analysis API',
    version: '1.0.0',
    description: 'API for analyzing images using Gemini AI'
  },
  paths: {
    '/': {
      get: {
        summary: 'Welcome endpoint',
        responses: {
          '200': {
            description: 'Welcome message',
            content: {
              'text/plain': {
                schema: {
                  type: 'string'
                }
              }
            }
          }
        }
      }
    },
    '/upload-image': {
      post: {
        summary: 'Upload and analyze an image',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  image: {
                    type: 'string',
                    format: 'binary',
                    description: 'Image file to analyze'
                  }
                },
                required: ['image']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Successful image analysis',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    extracted_data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          label: {
                            type: 'string',
                            description: 'Type of extracted field'
                          },
                          text: {
                            type: 'string',
                            description: 'Extracted text content'
                          },
                          box: {
                            type: 'array',
                            items: {
                              type: 'number'
                            },
                            description: 'Bounding box coordinates [x1, y1, x2, y2]'
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Invalid input',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string'
                    }
                  }
                }
              }
            }
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string'
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

// Add Swagger UI
app.get('/swagger', swaggerUI({ url: '/swagger.json' }))
app.get('/swagger.json', (c) => {
  return c.json(swaggerSpec)
})

// Existing routes
app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.post('/upload-image', async (c) => {
  try {
    const body = await c.req.formData()
    const image = body.get('image')

    if (!image || !(image instanceof File)) {
      return c.json({ error: 'No image file provided' }, 400)
    }

    if (!image.type.startsWith('image/')) {
      return c.json({ error: 'File must be an image' }, 400)
    }

    // Convert image to bytes
    const imageBytes = await image.arrayBuffer()

    // Initialize Gemini Pro Vision model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    // Create prompt for image analysis
    const prompt = `
     Analyze this image and extract student name, father name, school name and total marks(if present)
      Return ONLY a valid JSON object with no additional text or markdown formatting.
      Your response should follow this exact format:
      {
        "extracted_data": [
          {
            "label": "field_name",
            "text": "extracted_text",
            "box": [x1, y1, x2, y2]
          }
        ]
      }
    `
    

    // Generate content
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: Buffer.from(imageBytes).toString('base64'),
          mimeType: image.type
        }
      }
    ])

    const response = await result.response
    const text = response.text()

    // return c.json({
    //   description: text
    // }, 200)
    try {
      const cleanJson = text.replace(/```json\n|\n```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);
      return c.json(parsedData, 200);
    }
   catch (parseError) {
    console.error('Error:', parseError)
    return c.json({ error: 'Error processing image' }, 500)
  }
} catch(error){
  console.error(error)
}
})

export default app


