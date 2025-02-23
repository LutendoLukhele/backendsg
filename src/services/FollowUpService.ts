// src/services/FollowUpService.ts

import { EventEmitter } from 'events';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

interface ToolResult {
    status: 'success' | 'error';
    data?: any;
    error?: string;
}

interface FollowUpRequest {
    toolName: string;
    toolResult: any;
    sessionId: string;
}

interface ChatCompletionChunk {
    type: 'content' | 'tool_result' | 'error';
    content: string;
    toolCallId?: string;
}

export class FollowUpService extends EventEmitter {
    private client: any; // Replace with your actual chat client type (e.g., OpenAI client)
    private model: string;
    private maxTokens: number;
    private logger: winston.Logger;

    constructor(client: any, model: string, maxTokens: number) {
        super();
        this.client = client;
        this.model = model;
        this.maxTokens = maxTokens;

        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [new winston.transports.Console()],
        });

        // Listen for follow-up requests
        this.on('generate_follow_up', this.handleFollowUp);
    }

    /**
     * Handles the follow-up response generation.
     * @param request - The follow-up request containing tool details and session ID.
     */
    private async handleFollowUp(request: FollowUpRequest) {
        const { toolName, toolResult, sessionId } = request;
        const followUpId = uuidv4();

        try {
            this.logger.info('Generating follow-up response', { followUpId, sessionId });

            // Construct follow-up messages
            const followUpMessages = [
                {
                    role: 'system',
                    content: 'Process the tool result and provide a natural response.'
                },
                {
                    role: 'function',
                    name: toolName,
                    content: JSON.stringify(toolResult)
                }
            ];

            // Create a follow-up stream using the chat client
            const followUpStream = await this.client.chat.completions.create({
                model: this.model,
                messages: followUpMessages,
                max_tokens: this.maxTokens,
                stream: true
            });

            let buffer = '';
            for await (const chunk of followUpStream) {
                const followUpDelta = chunk.choices[0]?.delta;
                if (followUpDelta?.content) {
                    buffer += followUpDelta.content;
                    if (buffer.match(/[.!?]\s/) || buffer.length > 50) { // Adjust conditions as needed
                        this.emit('send_chunk', sessionId, {
                            type: 'content',
                            content: JSON.stringify({ text: buffer.trim() })
                        } as ChatCompletionChunk);
                        buffer = '';
                    }
                }
            }

            // Send any remaining buffer
            if (buffer) {
                this.emit('send_chunk', sessionId, {
                    type: 'content',
                    content: JSON.stringify({ text: buffer.trim() })
                } as ChatCompletionChunk);
            }

            this.logger.info('Follow-up response generated successfully', { followUpId, sessionId });
        } catch (error: any) {
            this.logger.error('Follow-up response generation failed:', {
                error: error.message || 'Unknown error',
                followUpId,
                sessionId
            });

            this.emit('send_chunk', sessionId, {
                type: 'error',
                content: JSON.stringify({
                    message: 'Error generating follow-up response',
                    error: error instanceof Error ? error.message : 'Unknown error'
                }),
                toolCallId: followUpId
            } as ChatCompletionChunk);
        }
    }

    /**
     * Triggers follow-up response generation for a given tool execution result.
     * @param request - The follow-up request.
     */
    public triggerFollowUp(request: FollowUpRequest) {
        this.emit('generate_follow_up', request);
    }
}
