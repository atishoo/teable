import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  activeWorkflowRoSchema,
  createWorkflowNodeRoSchema,
  updateWorkflowNodeRoSchema,
  updateWorkflowRoSchema,
  workflowRoSchema,
} from '@teable/openapi';
import type {
  IActiveWorkflowRo,
  ICreateWorkflowGraphNodeRo,
  IUpdateWorkflowGraphNodeRo,
  IUpdateWorkflowRo,
  IWorkflowRo,
} from '@teable/openapi';
import { EmitControllerEvent } from '../../event-emitter/decorators/emit-controller-event.decorator';
import { Events } from '../../event-emitter/events';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { AutomationService } from './automation.service';

@Controller('api/base/:baseId/workflow')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Permissions('automation|read')
  @Get()
  async list(@Param('baseId') baseId: string, @Query('onlyFirst') onlyFirst?: string) {
    return this.automationService.list(baseId, onlyFirst === 'true');
  }

  @Permissions('automation|create')
  @Post()
  @EmitControllerEvent(Events.WORKFLOW_CREATE)
  async create(
    @Param('baseId') baseId: string,
    @Body(new ZodValidationPipe(workflowRoSchema)) ro: IWorkflowRo
  ) {
    return this.automationService.create(baseId, ro);
  }

  @Permissions('automation|read')
  @Get(':workflowId')
  async get(@Param('baseId') baseId: string, @Param('workflowId') workflowId: string) {
    return this.automationService.get(baseId, workflowId);
  }

  @Permissions('automation|update')
  @Put(':workflowId')
  @EmitControllerEvent(Events.WORKFLOW_UPDATE)
  async update(
    @Param('baseId') baseId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(updateWorkflowRoSchema)) ro: IUpdateWorkflowRo
  ) {
    return this.automationService.update(baseId, workflowId, ro);
  }

  @Permissions('automation|delete')
  @Delete(':workflowId')
  @EmitControllerEvent(Events.WORKFLOW_DELETE)
  async delete(@Param('baseId') baseId: string, @Param('workflowId') workflowId: string) {
    return this.automationService.delete(baseId, workflowId);
  }

  @Permissions('automation|update')
  @Put(':workflowId/active')
  @EmitControllerEvent(Events.WORKFLOW_UPDATE)
  async active(
    @Param('baseId') baseId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(activeWorkflowRoSchema)) ro: IActiveWorkflowRo
  ) {
    return this.automationService.updateActive(baseId, workflowId, ro);
  }

  @Permissions('automation|read')
  @Get(':workflowId/active-snapshot')
  async activeSnapshot(@Param('baseId') baseId: string, @Param('workflowId') workflowId: string) {
    return this.automationService.getActiveSnapshot(baseId, workflowId);
  }

  @Permissions('automation|create')
  @Post(':workflowId/trigger')
  async createTrigger(
    @Param('baseId') baseId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowNodeRoSchema)) ro: ICreateWorkflowGraphNodeRo
  ) {
    return this.automationService.createNode(baseId, workflowId, 'trigger', ro);
  }

  @Permissions('automation|create')
  @Post(':workflowId/action')
  async createAction(
    @Param('baseId') baseId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowNodeRoSchema)) ro: ICreateWorkflowGraphNodeRo
  ) {
    return this.automationService.createNode(baseId, workflowId, 'action', ro);
  }

  @Permissions('automation|create')
  @Post(':workflowId/logic')
  async createLogic(
    @Param('baseId') baseId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowNodeRoSchema)) ro: ICreateWorkflowGraphNodeRo
  ) {
    return this.automationService.createNode(baseId, workflowId, 'logic', ro);
  }

  @Permissions('automation|update')
  @Put(':workflowId/:category/:nodeId')
  async updateNode(
    @Param('baseId') baseId: string,
    @Param('workflowId') workflowId: string,
    @Param('category') category: 'trigger' | 'action' | 'logic',
    @Param('nodeId') nodeId: string,
    @Body(new ZodValidationPipe(updateWorkflowNodeRoSchema)) ro: IUpdateWorkflowGraphNodeRo
  ) {
    return this.automationService.updateNode(baseId, workflowId, category, nodeId, ro);
  }

  @Permissions('automation|delete')
  @Delete(':workflowId/:category/:nodeId')
  async deleteNode(
    @Param('baseId') baseId: string,
    @Param('workflowId') workflowId: string,
    @Param('category') category: 'trigger' | 'action' | 'logic',
    @Param('nodeId') nodeId: string
  ) {
    return this.automationService.deleteNode(baseId, workflowId, category, nodeId);
  }

  @Permissions('automation|update')
  @Post(':workflowId/test')
  async test(@Param('baseId') baseId: string, @Param('workflowId') workflowId: string) {
    return this.automationService.runManualTest(baseId, workflowId);
  }

  @Permissions('automation|update')
  @Post(':workflowId/test/:nodeId')
  async testNode(
    @Param('baseId') baseId: string,
    @Param('workflowId') workflowId: string,
    @Param('nodeId') nodeId: string
  ) {
    return this.automationService.runManualTest(baseId, workflowId, nodeId);
  }

  @Permissions('automation|read')
  @Get(':workflowId/run')
  async runs(@Param('baseId') baseId: string, @Param('workflowId') workflowId: string) {
    return this.automationService.listRuns(baseId, workflowId);
  }
}
