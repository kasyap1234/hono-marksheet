import { Hono } from 'hono'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { swaggerUI } from '@hono/swagger-ui'
import 'dotenv/config'
import { createCanvas, loadImage } from 'canvas'
import sharp from 'sharp'

// Add these interfaces at the top of the file
interface BoundingBox {
  label: string;
  text: string | null;
  box: number[];
}

interface DetectionResponse {
  extracted_data: BoundingBox[];
}

// Add these utility functions at the top
interface ImageDimensions {
  width: number;
  height: number;
}

async function getImageDimensions(buffer: Buffer): Promise<ImageDimensions> {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0
  };
}

// Add this interface
interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

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
    },
    '/draw': {
      post: {
        summary: 'Upload an image and return image with bounding boxes',
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
            description: 'Successful image analysis with bounding boxes',
            content: {
              'image/png': {
                schema: {
                  type: 'string',
                  format: 'binary'
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
app.get('/swagger', swaggerUI({ url: '/swagger.json' }));
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
    Detect student name, father name, school name, total marks (if present) , with no more than 20 items,output a json list where each entry contains the 2D bounding box in "box_2d" ,label and value
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


// Modify the /draw endpoint
app.post('/draw', async (c) => {
  try {
    const body = await c.req.formData();
    const image = body.get('image');

    if (!image || !(image instanceof File)) {
      return c.json({ error: 'No image file provided' }, 400);
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const originalDimensions = await getImageDimensions(imageBuffer);
    
    // Match Google's max dimension
    const MAX_DIMENSION = 640; // Changed from 1024 to match Google's implementation
    
    const scale = Math.min(
      MAX_DIMENSION / originalDimensions.width,
      MAX_DIMENSION / originalDimensions.height
    );
    
    // Process image while maintaining aspect ratio
    const processedImage = await sharp(imageBuffer)
      .resize({
        width: Math.round(originalDimensions.width * scale),
        height: Math.round(originalDimensions.height * scale),
        fit: 'contain'
      })
      .png()
      .toBuffer();

    // Create canvas with processed dimensions
    const processedDimensions = await getImageDimensions(processedImage);
    const canvas = createCanvas(processedDimensions.width, processedDimensions.height);
    const ctx = canvas.getContext('2d');

    // Load and draw processed image
    const img = await loadImage(processedImage);
    ctx.drawImage(img, 0, 0);

    // Update prompt to match Google's coordinate system
    const prompt = `
    Analyze this image and extract student name, father name, school name and total marks.
    Return the bounding boxes in the following format:
    {
      "extracted_data": [
        {
          "label": "field_type",
          "text": "extracted_text",
          "box_2d": [ymin, xmin, ymax, xmax]
        }
      ]
    }
    Note: Coordinates should be normalized between 0 and 1000
    Example: [100, 200, 300, 400] means:
    - ymin = 10% from top (100/1000)
    - xmin = 20% from left (200/1000)
    - ymax = 30% from top (300/1000)
    - xmax = 40% from left (400/1000)
    `;

    const model = genAI.getGenerativeModel({model: "gemini-2.0-flash-exp"});
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: processedImage.toString('base64'),
          mimeType: 'image/png'
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();

    try {
      const cleanJson = text.replace(/```json\n|\n```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);

      // Process boxes using Google's coordinate system
      parsedData.extracted_data.forEach((item: any) => {
        if (item.box_2d && item.box_2d.length === 4) {
          const [ymin, xmin, ymax, xmax] = item.box_2d;
          
          // First normalize to 0-1 range (like Google's implementation)
          const normalizedBox = {
            x: xmin / 1000,
            y: ymin / 1000,
            width: (xmax - xmin) / 1000,
            height: (ymax - ymin) / 1000
          };
          
          // Then scale to canvas dimensions
          const x = normalizedBox.x * processedDimensions.width;
          const y = normalizedBox.y * processedDimensions.height;
          const width = normalizedBox.width * processedDimensions.width;
          const height = normalizedBox.height * processedDimensions.height;

          // Draw box with correct coordinates
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);

          // Draw label with better visibility
          const label = `${item.label}: ${item.text || ''}`;
          ctx.font = '12px Arial'; // Increased font size
          const metrics = ctx.measureText(label);
          const padding = 4;

          // Background for label
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fillRect(
            x,
            y - 20, // Position above box
            metrics.width + padding * 2,
            20
          );

          // Text
          ctx.fillStyle = 'red';
          ctx.fillText(label, x + padding, y - 6);
        }
      });

      // Convert to JPEG for output
      const outputBuffer = await sharp(canvas.toBuffer('image/png'))
        .jpeg({ quality: 90 })
        .toBuffer();

      c.header('Content-Type', 'image/jpeg');
      return c.body(outputBuffer);

    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return c.json({ error: 'Invalid response format' }, 500);
    }

  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Error processing image' }, 500);
  }
});

export default app;
