import {
  All,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AutomationService } from './automation.service';

const baseIdParam = 'baseId';
const workflowIdParam = 'workflowId';
const categoryParam = 'category';
const nodeIdParam = 'nodeId';

const workflowIdRoute = ':workflowId';
const workflowActiveRoute = `${workflowIdRoute}/active`;
const workflowActiveSnapshotRoute = `${workflowIdRoute}/active-snapshot`;
const workflowTriggerRoute = `${workflowIdRoute}/trigger`;
const workflowActionRoute = `${workflowIdRoute}/action`;
const workflowLogicRoute = `${workflowIdRoute}/logic`;
const workflowNodeRoute = `${workflowIdRoute}/:${categoryParam}/:${nodeIdParam}`;
const workflowWebhookTokenRoute = `${workflowIdRoute}/trigger/:${nodeIdParam}/generate-webhook-token`;
const workflowTestRoute = `${workflowIdRoute}/test`;
const workflowTestNodeRoute = `${workflowTestRoute}/:${nodeIdParam}`;
const workflowRunRoute = `${workflowIdRoute}/run`;
const workflowRunSummaryRoute = `${workflowRunRoute}/summary`;

const automationReadPermission = 'automation|read';
const automationCreatePermission = 'automation|create';
const automationUpdatePermission = 'automation|update';
const automationDeletePermission = 'automation|delete';

@Controller('api/base/:baseId/workflow')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Permissions(automationReadPermission)
  @Get()
  async list(@Param(baseIdParam) baseId: string, @Query('onlyFirst') onlyFirst?: string) {
    return this.automationService.list(baseId, onlyFirst === 'true');
  }

  @Permissions(automationCreatePermission)
  @Post()
  @EmitControllerEvent(Events.WORKFLOW_CREATE)
  async create(
    @Param(baseIdParam) baseId: string,
    @Body(new ZodValidationPipe(workflowRoSchema)) ro: IWorkflowRo
  ) {
    return this.automationService.create(baseId, ro);
  }

  @Permissions(automationReadPermission)
  @Get(workflowIdRoute)
  async get(@Param(baseIdParam) baseId: string, @Param(workflowIdParam) workflowId: string) {
    return this.automationService.get(baseId, workflowId);
  }

  @Permissions(automationUpdatePermission)
  @Put(workflowIdRoute)
  @EmitControllerEvent(Events.WORKFLOW_UPDATE)
  async update(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Body(new ZodValidationPipe(updateWorkflowRoSchema)) ro: IUpdateWorkflowRo
  ) {
    return this.automationService.update(baseId, workflowId, ro);
  }

  @Permissions(automationDeletePermission)
  @Delete(workflowIdRoute)
  @EmitControllerEvent(Events.WORKFLOW_DELETE)
  async delete(@Param(baseIdParam) baseId: string, @Param(workflowIdParam) workflowId: string) {
    return this.automationService.delete(baseId, workflowId);
  }

  @Permissions(automationUpdatePermission)
  @Put(workflowActiveRoute)
  @EmitControllerEvent(Events.WORKFLOW_UPDATE)
  async active(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Body(new ZodValidationPipe(activeWorkflowRoSchema)) ro: IActiveWorkflowRo
  ) {
    return this.automationService.updateActive(baseId, workflowId, ro);
  }

  @Permissions(automationReadPermission)
  @Get(workflowActiveSnapshotRoute)
  async activeSnapshot(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string
  ) {
    return this.automationService.getActiveSnapshot(baseId, workflowId);
  }

  @Permissions(automationCreatePermission)
  @Post(workflowTriggerRoute)
  async createTrigger(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowNodeRoSchema)) ro: ICreateWorkflowGraphNodeRo
  ) {
    return this.automationService.createNode(baseId, workflowId, 'trigger', ro);
  }

  @Permissions(automationCreatePermission)
  @Post(workflowActionRoute)
  async createAction(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowNodeRoSchema)) ro: ICreateWorkflowGraphNodeRo
  ) {
    return this.automationService.createNode(baseId, workflowId, 'action', ro);
  }

  @Permissions(automationCreatePermission)
  @Post(workflowLogicRoute)
  async createLogic(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowNodeRoSchema)) ro: ICreateWorkflowGraphNodeRo
  ) {
    return this.automationService.createNode(baseId, workflowId, 'logic', ro);
  }

  @Permissions(automationUpdatePermission)
  @Post(workflowWebhookTokenRoute)
  async generateWebhookToken(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Param(nodeIdParam) nodeId: string
  ) {
    return this.automationService.generateWebhookToken(baseId, workflowId, nodeId);
  }

  @Permissions(automationUpdatePermission)
  @Put(workflowNodeRoute)
  async updateNode(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Param(categoryParam) category: 'trigger' | 'action' | 'logic',
    @Param(nodeIdParam) nodeId: string,
    @Body(new ZodValidationPipe(updateWorkflowNodeRoSchema)) ro: IUpdateWorkflowGraphNodeRo
  ) {
    return this.automationService.updateNode(baseId, workflowId, category, nodeId, ro);
  }

  @Permissions(automationDeletePermission)
  @Delete(workflowNodeRoute)
  async deleteNode(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Param(categoryParam) category: 'trigger' | 'action' | 'logic',
    @Param(nodeIdParam) nodeId: string
  ) {
    return this.automationService.deleteNode(baseId, workflowId, category, nodeId);
  }

  @Permissions(automationUpdatePermission)
  @Post(workflowTestRoute)
  async test(@Param(baseIdParam) baseId: string, @Param(workflowIdParam) workflowId: string) {
    return this.automationService.runManualTest(baseId, workflowId);
  }

  @Permissions(automationUpdatePermission)
  @Post(workflowTestNodeRoute)
  async testNode(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Param(nodeIdParam) nodeId: string
  ) {
    return this.automationService.runManualTest(baseId, workflowId, nodeId);
  }

  @Permissions(automationReadPermission)
  @Get(workflowRunRoute)
  async runs(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.automationService.listRuns(baseId, workflowId, query);
  }

  @Permissions(automationReadPermission)
  @Get(workflowRunSummaryRoute)
  async runSummary(@Param(baseIdParam) baseId: string, @Param(workflowIdParam) workflowId: string) {
    return this.automationService.getRunSummary(baseId, workflowId);
  }
}

@Public()
@Controller('api/webhook/base/:baseId/workflow')
export class AutomationWebhookController {
  constructor(private readonly automationService: AutomationService) {}

  @All(workflowIdRoute)
  async receiveWebhook(
    @Param(baseIdParam) baseId: string,
    @Param(workflowIdParam) workflowId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization?: string
  ) {
    return this.automationService.receiveWebhook(baseId, workflowId, { body, authorization });
  }
}
