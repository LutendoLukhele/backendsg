// src/services/tool/ToolOrchestrator.ts

import { BaseService } from '../base/BaseService';
import { ToolConfig, ToolCall,  } from './tool.types';
import { NangoService } from '../NangoService';

// Define a generic ToolResult type that can hold any record.
export type ToolResult = Record<string, any>;

export class ToolOrchestrator extends BaseService {
    private activeTools: Map<string, ToolCall>;
    private nangoService: NangoService;

    constructor(config: ToolConfig) {
        // Merge a default logger if one isn't provided in config.
        const defaultLogger = {
            info: console.log,
            error: console.error,
            warn: console.warn,
            debug: console.debug,
        };
        const serviceConfig = { ...config, logger: (config as any).logger || defaultLogger };
        super(serviceConfig);
        this.activeTools = new Map();
        this.nangoService = config.nangoService;
    }

    async executeTool(toolCall: ToolCall): Promise<ToolResult> {
        try {
            this.logger.info('Executing tool', { tool: toolCall.name, args: toolCall.arguments });
            this.activeTools.set(toolCall.sessionId, toolCall);

            const result = await this.executeNangoAction(toolCall);
            
            this.activeTools.delete(toolCall.sessionId);
            return {
                status: 'success',
                data: result
            };
        } catch (error: any) {
            this.logger.error('Tool execution failed', { error: error.message || error, toolCall });
            this.activeTools.delete(toolCall.sessionId);
            return {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private async executeNangoAction(toolCall: ToolCall): Promise<any> {
        const { name, arguments: args } = toolCall;
        const { operation, entityType, identifier, fields } = args; // Directly destructure arguments

        // Basic validation
        if (!operation || !entityType) {
            throw new Error('Missing required fields: operation and entityType');
        }

        this.logger.info('Executing tool action', { tool: name, entityType, operation, fields, identifier });

        switch (name) {
            case 'create_entity':
                if (!fields || typeof fields !== 'object') {
                    throw new Error('Missing or invalid fields for create_entity');
                }
                return await this.nangoService.triggerSalesforceAction(
                    operation,
                    entityType,
                    fields
                );
            
            case 'update_entity':
                if (!identifier || !fields) {
                    throw new Error('Missing required fields: identifier and fields for update_entity');
                }
                return await this.nangoService.triggerSalesforceAction(
                    operation,
                    entityType,
                    identifier,
                    fields
                );
            
            case 'fetch_entity':
                if (!identifier) {
                    throw new Error('Missing required field: identifier for fetch_entity');
                }
                // Passing fields as string array if provided, else empty array
                return await this.nangoService.triggerSalesforceAction(
                    operation,
                    entityType,
                    identifier,
                    fields || []
                );
            
            // Handle existing specific tools if any
            case 'salesforce.createContact':
                return await this.nangoService.triggerSalesforceAction(
                    'create',
                    'Contact',
                    fields
                );
            case 'salesforce.updateContact':
                return await this.nangoService.triggerSalesforceAction(
                    'update',
                    'Contact',
                    identifier,
                    fields
                );
            case 'salesforce.fetchContact':
                return await this.nangoService.triggerSalesforceAction(
                    'fetch',
                    'Contact',
                    identifier,
                    fields || []
                );
            case 'salesforce.fetchEmails':
                return await this.nangoService.fetchEmails(toolCall.sessionId);
            
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    getActiveTools(): Map<string, ToolCall> {
        return new Map(this.activeTools);
    }
}
