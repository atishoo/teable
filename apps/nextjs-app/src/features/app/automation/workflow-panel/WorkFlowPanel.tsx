import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CellValueType,
  ColorUtils,
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  type ITimeZoneString,
  TimeFormatting,
  ViewType,
} from '@teable/core';
import {
  A as FieldTextIcon,
  Calendar as FieldCalendarIcon,
  CheckCircle2 as FieldSingleSelectIcon,
  CheckSquare as FieldCheckboxIcon,
  ChevronRight as TeableChevronRight,
  Clock4 as FieldCreatedTimeIcon,
  Code as FieldFormulaIcon,
  ConditionalLookup as FieldConditionalLookupIcon,
  ConditionalRollup as FieldConditionalRollupIcon,
  File as FieldAttachmentIcon,
  Hash as FieldNumberIcon,
  History as FieldLastModifiedTimeIcon,
  Layers as FieldRollupIcon,
  Link as FieldLinkIcon,
  ListChecks as FieldMultipleSelectIcon,
  ListOrdered as FieldAutoNumberIcon,
  LongText as FieldLongTextIcon,
  MousePointerClick as FieldButtonIcon,
  Object as VariableObjectIcon,
  Search as FieldLookupIcon,
  Star as FieldRatingIcon,
  User as FieldUserIcon,
  UserEdit as FieldLastModifiedByIcon,
  UserPlus as FieldCreatedByIcon,
} from '@teable/icons';
import {
  getBaseAll,
  getFields,
  getRecords as getTableRecords,
  getTableList,
  getUserCollaborators,
  getWorkflow,
  getWorkflowRunSummary,
  listWorkflowRuns,
  testWorkflow,
  updateWorkflow,
  updateWorkflowActive,
  BaseNodeResourceType,
  type IBaseNodeTreeVo,
  type IWorkflowEdge,
  type IWorkflowNode,
  type IWorkflowRunListRo,
  type IWorkflowRunVo,
  type IWorkflowVo,
} from '@teable/openapi';
import { DateEditor, RatingEditor, UserAvatar, ViewSelect } from '@teable/sdk/components';
import {
  DateRangePicker,
  type IDateRangeValue,
} from '@teable/sdk/components/filter/view-filter/component/filterDatePicker/DateRangePicker';
import { ReactQueryKeys } from '@teable/sdk/config';
import {
  Badge,
  Button,
  Checkbox,
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  sonner,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@teable/ui-lib/shadcn';
import {
  ArrowDownUp,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleMinus,
  Clock,
  Copy,
  Bell,
  GitBranch,
  Globe2,
  Hash,
  Link2,
  Maximize2,
  Mail,
  Minus,
  MoreHorizontal,
  MousePointerClick,
  Play,
  Plus,
  PlusCircle,
  Pencil,
  RefreshCw,
  Search,
  Send,
  SquareMousePointer,
  TriangleAlert,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useTranslation } from 'next-i18next';
import {
  forwardRef,
  type ChangeEvent,
  type ComponentType,
  type PointerEvent,
  type ReactNode,
  type SVGProps,
  type WheelEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BaseNodeMore } from '@/features/app/blocks/base/base-side-bar/BaseNodeMore';

export interface WorkFlowPanelRef {
  getWorkflow?: () => unknown | undefined;
  checkCanActive?: () => {
    canActive: boolean;
    message: string;
  };
  activeWorkflow?: () => Promise<void>;
}

interface WorkFlowPanelProps {
  baseId: string;
  workflowId: string;
  headLeft?: ReactNode;
}

type WorkflowNodeCategory = Extract<IWorkflowNode['category'], 'trigger' | 'action' | 'logic'>;
type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
type FieldValueKind =
  | 'number'
  | 'singleSelect'
  | 'multipleSelect'
  | 'user'
  | 'date'
  | 'checkbox'
  | 'attachment'
  | 'link'
  | 'text';

interface INodeCatalogItem {
  type: string;
  category: WorkflowNodeCategory;
  labelKey: string;
  labelDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
  icon: IconComponent;
}

interface IVariableOption {
  label: string;
  value: string;
  group: string;
  groupNodeId?: string;
  groupNodeType?: string;
  groupNodeStatus?: 'incomplete' | 'success' | 'untested' | 'expired';
  groupNodeStatusLabel?: string;
  groupNodeDescription?: string;
  field?: TableField;
  parentFieldId?: string;
  sourceOnly?: boolean;
  valueKind?: FieldValueKind;
  icon?: IconComponent;
  iconClassName?: string;
  iconWrapperClassName?: string;
}

type VariableTextToken =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'variable';
      value: string;
    };

type TableField = {
  id: string;
  name: string;
  type?: string;
  options?: unknown;
  cellValueType?: string;
  isMultipleCellValue?: boolean;
  isLookup?: boolean;
  isConditionalLookup?: boolean;
  isComputed?: boolean;
  recordCreate?: boolean;
  recordRead?: boolean;
};

type FilterRow = {
  fieldId: string;
  operator: string;
  value: unknown;
};

type FilterGroup = {
  conjunction: string;
  filterSet: FilterItem[];
};

type FilterItem = FilterRow | FilterGroup;

type RuntimeConditionRow = {
  left: string;
  operator: string;
  value: unknown;
};

type RuntimeConditionGroup = {
  conjunction: string;
  filterSet: RuntimeConditionItem[];
};

type RuntimeConditionItem = RuntimeConditionRow | RuntimeConditionGroup;

type NodeTestResult = {
  signature: string;
  testedAt: string;
  node: IWorkflowNode;
};

type WorkflowRunStep = NonNullable<IWorkflowRunVo['steps']>[number];

type TestResultRow = {
  label: string;
  value?: string;
  children?: TestResultRow[];
  raw?: unknown;
  defaultOpen?: boolean;
};

type PanelTranslate = (
  key: string,
  defaultValue: string,
  values?: Record<string, unknown>
) => string;

const WORKFLOW_PANEL_I18N_PREFIX = 'automation.workflowPanel';
const usePanelTranslate = (): PanelTranslate => {
  const { t } = useTranslation('common');
  return useCallback(
    (key, defaultValue, values) =>
      t(`${WORKFLOW_PANEL_I18N_PREFIX}.${key}`, { defaultValue, ...values }) as string,
    [t]
  );
};

const TRIGGER_NODES: INodeCatalogItem[] = [
  {
    type: 'buttonClick',
    category: 'trigger',
    labelKey: 'nodes.buttonClick.label',
    labelDefault: 'When button clicked',
    descriptionKey: 'nodes.buttonClick.description',
    descriptionDefault: 'Run automation when a button is clicked',
    icon: MousePointerClick,
  },
  {
    type: 'recordCreated',
    category: 'trigger',
    labelKey: 'nodes.recordCreated.label',
    labelDefault: 'When record created',
    descriptionKey: 'nodes.recordCreated.description',
    descriptionDefault: 'Run automation when a record is created',
    icon: PlusCircle,
  },
  {
    type: 'recordUpdated',
    category: 'trigger',
    labelKey: 'nodes.recordUpdated.label',
    labelDefault: 'When record updated',
    descriptionKey: 'nodes.recordUpdated.description',
    descriptionDefault: 'Run automation when specific records change',
    icon: RefreshCw,
  },
  {
    type: 'recordCreatedOrUpdated',
    category: 'trigger',
    labelKey: 'nodes.recordCreatedOrUpdated.label',
    labelDefault: 'When record created or updated',
    descriptionKey: 'nodes.recordCreatedOrUpdated.description',
    descriptionDefault: 'Run automation when a record is created or updated',
    icon: SquareMousePointer,
  },
  {
    type: 'recordMatchesConditions',
    category: 'trigger',
    labelKey: 'nodes.recordMatchesConditions.label',
    labelDefault: 'When record matches conditions',
    descriptionKey: 'nodes.recordMatchesConditions.description',
    descriptionDefault: 'Run automation when a record starts matching conditions',
    icon: CheckCircle2,
  },
  {
    type: 'formSubmitted',
    category: 'trigger',
    labelKey: 'nodes.formSubmitted.label',
    labelDefault: 'When form submitted',
    descriptionKey: 'nodes.formSubmitted.description',
    descriptionDefault: 'Run automation when a new record is submitted from a specified form',
    icon: Send,
  },
];

const ACTION_NODES: INodeCatalogItem[] = [
  {
    type: 'createRecord',
    category: 'action',
    labelKey: 'nodes.createRecord.label',
    labelDefault: 'Create record',
    descriptionKey: 'nodes.createRecord.description',
    descriptionDefault: 'Create a new record in the specified table',
    icon: PlusCircle,
  },
  {
    type: 'getRecords',
    category: 'action',
    labelKey: 'nodes.getRecords.label',
    labelDefault: 'Get records',
    descriptionKey: 'nodes.getRecords.description',
    descriptionDefault: 'Find up to 1000 records by specific conditions or a view',
    icon: Search,
  },
  {
    type: 'updateRecord',
    category: 'action',
    labelKey: 'nodes.updateRecord.label',
    labelDefault: 'Update record',
    descriptionKey: 'nodes.updateRecord.description',
    descriptionDefault: 'Update specified field values in an existing record',
    icon: RefreshCw,
  },
  {
    type: 'sendEmail',
    category: 'action',
    labelKey: 'nodes.sendEmail.label',
    labelDefault: 'Send email',
    descriptionKey: 'nodes.sendEmail.description',
    descriptionDefault: 'Send a custom email',
    icon: Mail,
  },
  {
    type: 'httpRequest',
    category: 'action',
    labelKey: 'nodes.httpRequest.label',
    labelDefault: 'HTTP request',
    descriptionKey: 'nodes.httpRequest.description',
    descriptionDefault: 'Connect to external services through APIs and exchange data',
    icon: Globe2,
  },
];

const LOGIC_NODES: INodeCatalogItem[] = [
  {
    type: 'condition',
    category: 'logic',
    labelKey: 'nodes.condition.label',
    labelDefault: 'When conditions match...',
    descriptionKey: 'nodes.condition.description',
    descriptionDefault: 'Decide whether to continue by condition',
    icon: GitBranch,
  },
];

const NODE_CATALOG = [...TRIGGER_NODES, ...ACTION_NODES, ...LOGIC_NODES];
const NODE_LABELS = Object.fromEntries(NODE_CATALOG.map((item) => [item.type, item.labelDefault]));
const NODE_ICONS = Object.fromEntries(NODE_CATALOG.map((item) => [item.type, item.icon]));
const NODE_CATALOG_MAP = Object.fromEntries(NODE_CATALOG.map((item) => [item.type, item]));
const NODE_DESCRIPTIONS = Object.fromEntries(
  NODE_CATALOG.map((item) => [item.type, item.descriptionDefault])
);
const TRIGGER_NODE_MAP = Object.fromEntries(TRIGGER_NODES.map((item) => [item.type, item]));
const ACTION_NODE_MAP = Object.fromEntries(ACTION_NODES.map((item) => [item.type, item]));

const DEFAULT_NODE_ICON_STYLE = {
  iconClassName: 'text-muted-foreground',
  wrapperClassName: 'border-border bg-muted/30',
};

const NODE_ICON_STYLES: Record<string, typeof DEFAULT_NODE_ICON_STYLE> = {
  buttonClick: {
    iconClassName: 'text-blue-600',
    wrapperClassName: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40',
  },
  recordCreated: {
    iconClassName: 'text-pink-600',
    wrapperClassName: 'border-pink-200 bg-pink-50 dark:border-pink-900 dark:bg-pink-950/40',
  },
  recordUpdated: {
    iconClassName: 'text-emerald-600',
    wrapperClassName:
      'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40',
  },
  recordCreatedOrUpdated: {
    iconClassName: 'text-violet-600',
    wrapperClassName: 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40',
  },
  recordMatchesConditions: {
    iconClassName: 'text-teal-600',
    wrapperClassName: 'border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40',
  },
  formSubmitted: {
    iconClassName: 'text-orange-600',
    wrapperClassName: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40',
  },
  createRecord: {
    iconClassName: 'text-fuchsia-600',
    wrapperClassName:
      'border-fuchsia-200 bg-fuchsia-50 dark:border-fuchsia-900 dark:bg-fuchsia-950/40',
  },
  getRecords: {
    iconClassName: 'text-amber-600',
    wrapperClassName: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
  },
  updateRecord: {
    iconClassName: 'text-green-600',
    wrapperClassName: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40',
  },
  sendEmail: {
    iconClassName: 'text-sky-600',
    wrapperClassName: 'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40',
  },
  httpRequest: {
    iconClassName: 'text-red-600',
    wrapperClassName: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
  },
  condition: {
    iconClassName: 'text-indigo-600',
    wrapperClassName: 'border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40',
  },
};

const getNodeIconStyle = (type?: string) =>
  (type && NODE_ICON_STYLES[type]) || DEFAULT_NODE_ICON_STYLE;

const getNodeCatalogItem = (type: string): INodeCatalogItem =>
  NODE_CATALOG_MAP[type] ?? {
    type,
    category: 'action',
    labelKey: 'nodes.unknown.label',
    labelDefault: type,
    descriptionKey: 'nodes.unknown.description',
    descriptionDefault: type,
    icon: SquareMousePointer,
  };

const getNodeItemLabel = (item: INodeCatalogItem, tr?: PanelTranslate) =>
  tr ? tr(item.labelKey, item.labelDefault) : item.labelDefault;

const getNodeItemDescription = (item: INodeCatalogItem, tr?: PanelTranslate) =>
  tr ? tr(item.descriptionKey, item.descriptionDefault) : item.descriptionDefault;

const getNodeLabel = (node: Pick<IWorkflowNode, 'type'>, tr?: PanelTranslate) => {
  const item = NODE_CATALOG_MAP[node.type];
  return item ? getNodeItemLabel(item, tr) : NODE_LABELS[node.type] || node.type;
};

const getNodeDescription = (node: IWorkflowNode, tr?: PanelTranslate) => {
  const note = node.category === 'action' ? node.config?.note : undefined;
  if (typeof note === 'string' && note.trim()) return note;
  const item = NODE_CATALOG_MAP[node.type];
  return item ? getNodeItemDescription(item, tr) : NODE_DESCRIPTIONS[node.type] || node.type;
};

const NodeIconBadge = (props: { type?: string; className?: string; iconClassName?: string }) => {
  const Icon = (props.type && NODE_ICONS[props.type]) || SquareMousePointer;
  const style = getNodeIconStyle(props.type);
  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md border',
        style.wrapperClassName,
        props.className
      )}
    >
      <Icon className={cn('size-4', style.iconClassName, props.iconClassName)} />
    </span>
  );
};

const NodePlainIcon = (props: { type?: string; className?: string }) => {
  const Icon = (props.type && NODE_ICONS[props.type]) || SquareMousePointer;
  const style = getNodeIconStyle(props.type);
  return <Icon className={cn('size-4 shrink-0', style.iconClassName, props.className)} />;
};

const NodeTypeSelectValue = (props: { item: INodeCatalogItem }) => {
  const tr = usePanelTranslate();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left">
      <NodeIconBadge className="size-6 rounded" iconClassName="size-3.5" type={props.item.type} />
      <span className="min-w-0 truncate text-sm">{getNodeItemLabel(props.item, tr)}</span>
    </div>
  );
};

const NodeTypeSelectItem = (props: { item: INodeCatalogItem; selected: boolean }) => {
  const tr = usePanelTranslate();
  const label = getNodeItemLabel(props.item, tr);
  return (
    <SelectItem
      className="h-auto cursor-pointer rounded-md p-0 pr-0 hover:bg-muted/80 focus:bg-muted/80 data-[state=checked]:bg-muted/80 dark:hover:bg-white/10 dark:focus:bg-white/10 dark:data-[state=checked]:bg-white/10 [&>span:first-child]:hidden"
      textValue={label}
      value={props.item.type}
    >
      <span className="flex w-full min-w-0 items-center gap-2 px-3 py-2">
        <span className="flex size-4 shrink-0 items-center justify-center">
          {props.selected && <Check className="size-4 text-foreground" />}
        </span>
        <NodeIconBadge className="size-6 rounded" iconClassName="size-3.5" type={props.item.type} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{label}</span>
          <span className="block truncate text-xs leading-5 text-muted-foreground">
            {getNodeItemDescription(props.item, tr)}
          </span>
        </span>
      </span>
    </SelectItem>
  );
};

const NodeTypeSelectGroup = (props: {
  title: string;
  items: INodeCatalogItem[];
  value: string;
}) => (
  <div className="space-y-1 p-1">
    <div className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">{props.title}</div>
    {props.items.map((item) => (
      <NodeTypeSelectItem key={item.type} item={item} selected={props.value === item.type} />
    ))}
  </div>
);

const workflowQueryKey = (baseId: string, workflowId: string) =>
  ['workflow', baseId, workflowId] as const;
const workflowRunQueryKey = (baseId: string, workflowId: string, params: IWorkflowRunListRo) =>
  ['workflow-run', baseId, workflowId, params] as const;
const workflowRunSummaryQueryKey = (baseId: string, workflowId: string) =>
  ['workflow-run-summary', baseId, workflowId] as const;
const RUN_HISTORY_TAKE = 100;

const getWorkflowDraftSignature = (name: string, nodes: IWorkflowNode[], edges: IWorkflowEdge[]) =>
  JSON.stringify({ name, nodes, edges });

const getWorkflowRuntimeNodes = (nodes: IWorkflowNode[]) => nodes.map(cloneWorkflowNode);

const getWorkflowRuntimeSignature = (nodes: IWorkflowNode[], edges: IWorkflowEdge[]) =>
  JSON.stringify({ nodes: getWorkflowRuntimeNodes(nodes), edges });

const getWorkflowActiveRuntimeSignature = (workflow?: IWorkflowVo) => {
  const snapshot = workflow?.activeSnapshot;
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    const graph = snapshot as { nodes?: unknown; edges?: unknown };
    if (Array.isArray(graph.nodes)) {
      return getWorkflowRuntimeSignature(
        graph.nodes as IWorkflowNode[],
        Array.isArray(graph.edges) ? (graph.edges as IWorkflowEdge[]) : []
      );
    }
  }
  return getWorkflowRuntimeSignature(workflow?.nodes ?? [], workflow?.edges ?? []);
};

const EMPTY_SELECT_VALUE = '__empty__';
const CONDITION_TRUE_HANDLE = 'true';
const CONDITION_FALSE_HANDLE = 'false';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.1;
const WORKFLOW_NODE_WIDTH = 370;
const CONDITION_LAYOUT_WIDTH = 960;
const CONDITION_BRANCH_WIDTH = 440;
const CONDITION_BRANCH_GAP = 80;
const CONDITION_BRANCH_CENTER_LEFT = CONDITION_BRANCH_WIDTH / 2;
const CONDITION_BRANCH_CENTER_RIGHT = CONDITION_LAYOUT_WIDTH - CONDITION_BRANCH_WIDTH / 2;
const CONDITION_NODE_LEFT_X = (CONDITION_LAYOUT_WIDTH - WORKFLOW_NODE_WIDTH) / 2;
const CONDITION_NODE_RIGHT_X = CONDITION_NODE_LEFT_X + WORKFLOW_NODE_WIDTH;
const CONDITION_NODE_ROW_HEIGHT = 112;
const CONDITION_NODE_CENTER_Y = 38;
const CONDITION_BRANCH_LINE_HEIGHT = CONDITION_NODE_ROW_HEIGHT - CONDITION_NODE_CENTER_Y;

const RUNTIME_OPERATORS = [
  {
    value: 'notEmpty',
    labelKey: 'operators.notEmpty',
    labelDefault: 'Is not empty',
    needsValue: false,
  },
  { value: 'empty', labelKey: 'operators.empty', labelDefault: 'Is empty', needsValue: false },
  { value: 'equal', labelKey: 'operators.equal', labelDefault: 'Equals', needsValue: true },
  {
    value: 'notEqual',
    labelKey: 'operators.notEqual',
    labelDefault: 'Does not equal',
    needsValue: true,
  },
  { value: 'contains', labelKey: 'operators.contains', labelDefault: 'Contains', needsValue: true },
  { value: 'gt', labelKey: 'operators.gt', labelDefault: 'Greater than', needsValue: true },
  {
    value: 'gte',
    labelKey: 'operators.gte',
    labelDefault: 'Greater than or equal to',
    needsValue: true,
  },
  { value: 'lt', labelKey: 'operators.lt', labelDefault: 'Less than', needsValue: true },
  {
    value: 'lte',
    labelKey: 'operators.lte',
    labelDefault: 'Less than or equal to',
    needsValue: true,
  },
];

const VARIABLE_MODIFIERS = [
  { value: 'upper', labelKey: 'modifiers.upper', labelDefault: 'Uppercase' },
  { value: 'lower', labelKey: 'modifiers.lower', labelDefault: 'Lowercase' },
  { value: 'capitalize', labelKey: 'modifiers.capitalize', labelDefault: 'Capitalize' },
  { value: 'trim', labelKey: 'modifiers.trim', labelDefault: 'Trim spaces' },
  { value: 'length', labelKey: 'modifiers.length', labelDefault: 'Length' },
  { value: 'string', labelKey: 'modifiers.string', labelDefault: 'To string' },
  { value: 'json', labelKey: 'modifiers.json', labelDefault: 'To JSON string' },
  { value: 'urlEncode', labelKey: 'modifiers.urlEncode', labelDefault: 'URL encode' },
];

type FilterOperatorOption = {
  value: string;
  labelKey: string;
  labelDefault: string;
  needsValue: boolean;
};

const TEXT_FILTER_OPERATORS: FilterOperatorOption[] = [
  { value: 'is', labelKey: 'operators.is', labelDefault: 'Equals', needsValue: true },
  { value: 'isNot', labelKey: 'operators.isNot', labelDefault: 'Does not equal', needsValue: true },
  { value: 'contains', labelKey: 'operators.contains', labelDefault: 'Contains', needsValue: true },
  {
    value: 'doesNotContain',
    labelKey: 'operators.doesNotContain',
    labelDefault: 'Does not contain',
    needsValue: true,
  },
  { value: 'isEmpty', labelKey: 'operators.isEmpty', labelDefault: 'Is empty', needsValue: false },
  {
    value: 'isNotEmpty',
    labelKey: 'operators.isNotEmpty',
    labelDefault: 'Is not empty',
    needsValue: false,
  },
];

const NUMBER_FILTER_OPERATORS: FilterOperatorOption[] = [
  { value: 'is', labelKey: 'operators.symbolEqual', labelDefault: '=', needsValue: true },
  { value: 'isNot', labelKey: 'operators.symbolNotEqual', labelDefault: '≠', needsValue: true },
  { value: 'isGreater', labelKey: 'operators.symbolGreater', labelDefault: '>', needsValue: true },
  {
    value: 'isGreaterEqual',
    labelKey: 'operators.symbolGreaterEqual',
    labelDefault: '≥',
    needsValue: true,
  },
  { value: 'isLess', labelKey: 'operators.symbolLess', labelDefault: '<', needsValue: true },
  {
    value: 'isLessEqual',
    labelKey: 'operators.symbolLessEqual',
    labelDefault: '≤',
    needsValue: true,
  },
  { value: 'isEmpty', labelKey: 'operators.isEmpty', labelDefault: 'Is empty', needsValue: false },
  {
    value: 'isNotEmpty',
    labelKey: 'operators.isNotEmpty',
    labelDefault: 'Is not empty',
    needsValue: false,
  },
];

const SINGLE_OPTION_FILTER_OPERATORS: FilterOperatorOption[] = [
  { value: 'is', labelKey: 'operators.is', labelDefault: 'Equals', needsValue: true },
  { value: 'isNot', labelKey: 'operators.isNot', labelDefault: 'Does not equal', needsValue: true },
  { value: 'isAnyOf', labelKey: 'operators.isAnyOf', labelDefault: 'Is any of', needsValue: true },
  {
    value: 'isNoneOf',
    labelKey: 'operators.isNoneOf',
    labelDefault: 'Is none of',
    needsValue: true,
  },
  { value: 'isEmpty', labelKey: 'operators.isEmpty', labelDefault: 'Is empty', needsValue: false },
  {
    value: 'isNotEmpty',
    labelKey: 'operators.isNotEmpty',
    labelDefault: 'Is not empty',
    needsValue: false,
  },
];

const MULTIPLE_OPTION_FILTER_OPERATORS: FilterOperatorOption[] = [
  {
    value: 'hasAnyOf',
    labelKey: 'operators.hasAnyOf',
    labelDefault: 'Has any of',
    needsValue: true,
  },
  {
    value: 'hasAllOf',
    labelKey: 'operators.hasAllOf',
    labelDefault: 'Has all of',
    needsValue: true,
  },
  { value: 'isExactly', labelKey: 'operators.isExactly', labelDefault: 'Equals', needsValue: true },
  {
    value: 'isNotExactly',
    labelKey: 'operators.isNotExactly',
    labelDefault: 'Does not equal',
    needsValue: true,
  },
  {
    value: 'hasNoneOf',
    labelKey: 'operators.hasNoneOf',
    labelDefault: 'Has none of',
    needsValue: true,
  },
  { value: 'isEmpty', labelKey: 'operators.isEmpty', labelDefault: 'Is empty', needsValue: false },
  {
    value: 'isNotEmpty',
    labelKey: 'operators.isNotEmpty',
    labelDefault: 'Is not empty',
    needsValue: false,
  },
];

const DATE_FILTER_OPERATORS: FilterOperatorOption[] = [
  { value: 'is', labelKey: 'operators.is', labelDefault: 'Equals', needsValue: true },
  { value: 'isNot', labelKey: 'operators.isNot', labelDefault: 'Does not equal', needsValue: true },
  {
    value: 'isWithIn',
    labelKey: 'operators.isWithin',
    labelDefault: 'Is within',
    needsValue: true,
  },
  {
    value: 'isBefore',
    labelKey: 'operators.isBefore',
    labelDefault: 'Is before',
    needsValue: true,
  },
  { value: 'isAfter', labelKey: 'operators.isAfter', labelDefault: 'Is after', needsValue: true },
  {
    value: 'isOnOrBefore',
    labelKey: 'operators.isOnOrBefore',
    labelDefault: 'Is on or before',
    needsValue: true,
  },
  {
    value: 'isOnOrAfter',
    labelKey: 'operators.isOnOrAfter',
    labelDefault: 'Is on or after',
    needsValue: true,
  },
  { value: 'isEmpty', labelKey: 'operators.isEmpty', labelDefault: 'Is empty', needsValue: false },
  {
    value: 'isNotEmpty',
    labelKey: 'operators.isNotEmpty',
    labelDefault: 'Is not empty',
    needsValue: false,
  },
];

const CHECKBOX_FILTER_OPERATORS: FilterOperatorOption[] = [
  { value: 'is', labelKey: 'operators.is', labelDefault: 'Equals', needsValue: true },
];

const ATTACHMENT_FILTER_OPERATORS: FilterOperatorOption[] = [
  { value: 'isEmpty', labelKey: 'operators.isEmpty', labelDefault: 'Is empty', needsValue: false },
  {
    value: 'isNotEmpty',
    labelKey: 'operators.isNotEmpty',
    labelDefault: 'Is not empty',
    needsValue: false,
  },
];

const LINK_FILTER_OPERATORS: FilterOperatorOption[] = [
  { value: 'is', labelKey: 'operators.is', labelDefault: 'Equals', needsValue: true },
  { value: 'isNot', labelKey: 'operators.isNot', labelDefault: 'Does not equal', needsValue: true },
  { value: 'isAnyOf', labelKey: 'operators.isAnyOf', labelDefault: 'Is any of', needsValue: true },
  {
    value: 'isNoneOf',
    labelKey: 'operators.isNoneOf',
    labelDefault: 'Is none of',
    needsValue: true,
  },
  { value: 'contains', labelKey: 'operators.contains', labelDefault: 'Contains', needsValue: true },
  {
    value: 'doesNotContain',
    labelKey: 'operators.doesNotContain',
    labelDefault: 'Does not contain',
    needsValue: true,
  },
  { value: 'isEmpty', labelKey: 'operators.isEmpty', labelDefault: 'Is empty', needsValue: false },
  {
    value: 'isNotEmpty',
    labelKey: 'operators.isNotEmpty',
    labelDefault: 'Is not empty',
    needsValue: false,
  },
];

const RECORD_FILTER_OPERATORS = [
  ...TEXT_FILTER_OPERATORS,
  ...NUMBER_FILTER_OPERATORS,
  ...SINGLE_OPTION_FILTER_OPERATORS,
  ...MULTIPLE_OPTION_FILTER_OPERATORS,
  ...DATE_FILTER_OPERATORS,
  ...CHECKBOX_FILTER_OPERATORS,
  ...ATTACHMENT_FILTER_OPERATORS,
  ...LINK_FILTER_OPERATORS,
];

const MULTIPLE_VALUE_OPERATORS = new Set([
  'isAnyOf',
  'isNoneOf',
  'hasAnyOf',
  'hasAllOf',
  'isExactly',
  'isNotExactly',
  'hasNoneOf',
]);

const EMPTY_FILTER_OPERATORS = new Set(['empty', 'notEmpty', 'isEmpty', 'isNotEmpty']);

const getLabelOptionText = (
  option: { labelKey: string; labelDefault: string },
  tr?: PanelTranslate
) => (tr ? tr(option.labelKey, option.labelDefault) : option.labelDefault);

const panelText = (
  tr: PanelTranslate | undefined,
  key: string,
  defaultValue: string,
  values?: Record<string, unknown>
) => (tr ? tr(key, defaultValue, values) : defaultValue);

const newNodeId = (category: WorkflowNodeCategory) => {
  const prefix = category === 'trigger' ? 'wft' : category === 'logic' ? 'wfd' : 'wfa';
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
};

const formatTime = (value?: string | null) => {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
};

const formatRelativeTime = (value?: string | null, tr?: PanelTranslate) => {
  if (!value) return '-';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return formatTime(value);
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return panelText(tr, 'relativeTime.justNow', 'Just now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return tr
      ? tr('relativeTime.minutesAgo', '{{count}} minutes ago', { count: minutes })
      : `${minutes} minutes ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return tr
      ? tr('relativeTime.hoursAgo', '{{count}} hours ago', { count: hours })
      : `${hours} hours ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return tr
      ? tr('relativeTime.daysAgo', '{{count}} days ago', { count: days })
      : `${days} days ago`;
  }
  return formatTime(value);
};

const formatDuration = (ms?: number) => {
  if (!Number.isFinite(ms)) return '-';
  const value = Number(ms);
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} s`;
  }
  return `${Math.max(0, Math.round(value))} ms`;
};

const getRunDuration = (run: IWorkflowRunVo) => {
  const stepDuration = run.steps?.reduce((sum, step) => sum + (step.spent ?? 0), 0) ?? 0;
  if (stepDuration > 0) return stepDuration;
  if (!run.finishedTime) return undefined;
  const started = new Date(run.startedTime).getTime();
  const finished = new Date(run.finishedTime).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return undefined;
  return Math.max(0, finished - started);
};

const getRunStatusMeta = (status: IWorkflowRunVo['status'] | string, tr?: PanelTranslate) => {
  switch (status) {
    case 'success':
      return {
        label: panelText(tr, 'runStatus.success', 'Run succeeded'),
        className: 'text-emerald-600',
        Icon: Check,
      };
    case 'failed':
      return {
        label: panelText(tr, 'runStatus.failed', 'Run failed'),
        className: 'text-destructive',
        Icon: X,
      };
    case 'running':
      return {
        label: panelText(tr, 'runStatus.running', 'Running'),
        className: 'text-amber-600',
        Icon: RefreshCw,
      };
    case 'waiting':
      return {
        label: panelText(tr, 'runStatus.waiting', 'Waiting'),
        className: 'text-sky-500',
        Icon: Clock,
      };
    case 'skipped':
      return {
        label: panelText(tr, 'runStatus.skipped', 'Canceled'),
        className: 'text-muted-foreground',
        Icon: Minus,
      };
    default:
      return { label: status, className: 'text-muted-foreground', Icon: Minus };
  }
};

const RUN_STATUS_FILTERS = [
  { value: 'all', labelKey: 'runStatusFilter.all', labelDefault: 'All statuses' },
  { value: 'success', labelKey: 'runStatus.success', labelDefault: 'Run succeeded' },
  { value: 'failed', labelKey: 'runStatus.failed', labelDefault: 'Run failed' },
  { value: 'running', labelKey: 'runStatus.running', labelDefault: 'Running' },
  { value: 'waiting', labelKey: 'runStatus.waiting', labelDefault: 'Waiting' },
  { value: 'skipped', labelKey: 'runStatus.skipped', labelDefault: 'Canceled' },
];

const RUN_DURATION_FILTERS = [
  { value: 'all', labelKey: 'runDurationFilter.all', labelDefault: 'All durations' },
  { value: 'lt_5s', labelKey: 'runDurationFilter.lt5s', labelDefault: '< 5 seconds' },
  { value: '5_10s', labelKey: 'runDurationFilter.5to10s', labelDefault: '5 - 10 seconds' },
  { value: '10_30s', labelKey: 'runDurationFilter.10to30s', labelDefault: '10 - 30 seconds' },
  {
    value: '30s_1m',
    labelKey: 'runDurationFilter.30sTo1m',
    labelDefault: '30 seconds - 1 minute',
  },
  { value: '1_5m', labelKey: 'runDurationFilter.1to5m', labelDefault: '1 - 5 minutes' },
  { value: 'gt_5m', labelKey: 'runDurationFilter.gt5m', labelDefault: '> 5 minutes' },
];

const getRunDateRangeParams = (range: IDateRangeValue | null) => {
  if (!range?.exactDate) return {};
  const from = new Date(range.exactDate).getTime();
  const to = range.exactDateEnd
    ? new Date(range.exactDateEnd).getTime()
    : from + 24 * 60 * 60 * 1000 - 1;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return {};
  return {
    startedTimeFrom: new Date(Math.min(from, to)).toISOString(),
    startedTimeTo: new Date(Math.max(from, to)).toISOString(),
  };
};

const getRunStepInputRows = (
  step: WorkflowRunStep,
  node: IWorkflowNode | undefined,
  tables: { id: string; name: string }[],
  fields: TableField[],
  tr?: PanelTranslate
): TestResultRow[] => {
  const input = isPlainRecord(step.input) ? step.input : {};
  const rows: TestResultRow[] = [];
  const inputFields = isPlainRecord(input.fields) ? input.fields : undefined;
  const tableId = typeof input.tableId === 'string' ? input.tableId : node?.config?.tableId;

  if (inputFields) {
    rows.push({
      label: panelText(tr, 'resultLabels.fieldValues', 'Field values'),
      children: Object.entries(inputFields).map(([fieldId, value]) => ({
        label: getFieldLabel(fields, fieldId),
        value: formatCellValue(value),
      })),
    });
  }
  if (typeof tableId === 'string') {
    rows.push({
      label: panelText(tr, 'resultLabels.table', 'Table'),
      value: getTableLabel(tables, tableId) || tableId,
    });
  }
  rows.push({
    label: panelText(tr, 'resultLabels.rawData', 'Raw data'),
    raw: step.input ?? {},
  });
  return rows;
};

const getRecordLikeOutput = (output: unknown) => {
  if (Array.isArray(output)) return output.find(isPlainRecord);
  if (!isPlainRecord(output)) return undefined;
  if (Array.isArray(output.records)) return output.records.find(isPlainRecord);
  return output;
};

const getFieldValueRows = (
  values: Record<string, unknown>,
  fields: TableField[]
): TestResultRow[] =>
  Object.entries(values).map(([fieldId, value]) => ({
    label: getFieldLabel(fields, fieldId),
    value: formatCellValue(value),
  }));

const getTriggerUserRows = (user: unknown, tr?: PanelTranslate): TestResultRow[] => {
  if (!isPlainRecord(user)) return [];
  const children = [
    { label: 'ID', value: typeof user.id === 'string' ? user.id : undefined },
    { label: panelText(tr, 'resultLabels.name', 'Name'), value: formatCellValue(user.name) },
    { label: panelText(tr, 'resultLabels.email', 'Email'), value: formatCellValue(user.email) },
  ].filter((row) => row.value) as TestResultRow[];
  return children.length
    ? [{ label: panelText(tr, 'resultLabels.triggerUser', 'Trigger user'), children }]
    : [];
};

const getTriggerRecordRows = (
  recordValue: unknown,
  fields: TableField[],
  tr?: PanelTranslate
): TestResultRow[] => {
  if (!isPlainRecord(recordValue)) return [];
  const record = recordValue as Record<string, unknown>;
  const children: TestResultRow[] = [
    {
      label: panelText(tr, 'resultLabels.recordId', 'Record ID'),
      value: formatCellValue(record.id),
    },
    {
      label: panelText(tr, 'resultLabels.recordUrl', 'Record URL'),
      value: formatCellValue(record.url),
    },
    {
      label: panelText(tr, 'resultLabels.recordName', 'Record name'),
      value: formatCellValue(record.name),
    },
  ].filter((row) => row.value);
  if (isPlainRecord(record.fields)) {
    children.push({
      label: panelText(tr, 'resultLabels.fieldValues', 'Field values'),
      children: getFieldValueRows(record.fields, fields),
    });
  }
  return [{ label: panelText(tr, 'resultLabels.record', 'Record'), children }];
};

const getOutputTableId = (step: WorkflowRunStep, node?: IWorkflowNode) => {
  if (isPlainRecord(step.input) && typeof step.input.tableId === 'string') {
    return step.input.tableId;
  }
  return typeof node?.config?.tableId === 'string' ? node.config.tableId : undefined;
};

const getOutputRecordRows = (
  outputRecord: Record<string, unknown> | undefined,
  tableId: string | undefined,
  baseId: string,
  fields: TableField[],
  tr?: PanelTranslate
) => {
  const rows: TestResultRow[] = [];
  if (outputRecord?.id) {
    rows.push({
      label: panelText(tr, 'resultLabels.recordId', 'Record ID'),
      value: String(outputRecord.id),
    });
  }
  if (outputRecord?.url) {
    rows.push({
      label: panelText(tr, 'resultLabels.recordUrl', 'Record URL'),
      value: String(outputRecord.url),
    });
  } else if (outputRecord?.id && tableId) {
    rows.push({
      label: panelText(tr, 'resultLabels.recordUrl', 'Record URL'),
      value: `/base/${baseId}/table/${tableId}?recordId=${String(outputRecord.id)}`,
    });
  }
  if (outputRecord?.name || outputRecord?.title) {
    rows.push({
      label: panelText(tr, 'resultLabels.recordName', 'Record name'),
      value: String(outputRecord.name ?? outputRecord.title),
    });
  }
  if (isPlainRecord(outputRecord?.fields)) {
    rows.push({
      label: panelText(tr, 'resultLabels.fieldValues', 'Field values'),
      children: getFieldValueRows(outputRecord.fields, fields),
    });
  }
  return rows;
};

const getRunStepOutputRows = (
  step: WorkflowRunStep,
  node: IWorkflowNode | undefined,
  baseId: string,
  fields: TableField[],
  tr?: PanelTranslate
): TestResultRow[] => {
  const output = isPlainRecord(step.output) ? step.output : undefined;
  const triggerRows =
    step.category === 'trigger' && output
      ? [...getTriggerUserRows(output.user, tr), ...getTriggerRecordRows(output.record, fields, tr)]
      : [];
  if (triggerRows.length) {
    return [
      ...triggerRows,
      { label: panelText(tr, 'resultLabels.rawData', 'Raw data'), raw: step.output ?? {} },
    ];
  }

  const outputRecord = getRecordLikeOutput(step.output) as Record<string, unknown> | undefined;
  const rows = getOutputRecordRows(outputRecord, getOutputTableId(step, node), baseId, fields, tr);
  if (!rows.length && step.output !== undefined) {
    rows.push({
      label: panelText(tr, 'resultLabels.returnValue', 'Return value'),
      value: formatCellValue(step.output),
    });
  }
  rows.push({
    label: panelText(tr, 'resultLabels.rawData', 'Raw data'),
    raw: step.output ?? {},
  });
  return rows;
};

const getRunStepCallRows = (
  step: WorkflowRunStep,
  node?: IWorkflowNode,
  tr?: PanelTranslate
): TestResultRow[] => [
  { label: panelText(tr, 'resultLabels.nodeId', 'Node ID'), value: step.nodeId },
  { label: panelText(tr, 'resultLabels.nodeType', 'Node type'), value: step.type },
  {
    label: panelText(tr, 'resultLabels.nodeName', 'Node name'),
    value: node ? getNodeLabel(node, tr) : step.type,
  },
  {
    label: panelText(tr, 'resultLabels.executionStatus', 'Execution status'),
    value: getRunStatusMeta(step.status, tr).label,
  },
  {
    label: panelText(tr, 'resultLabels.duration', 'Duration'),
    value: formatDuration(step.spent),
  },
];

const cloneWorkflowNode = (node: IWorkflowNode): IWorkflowNode => {
  const cloned = JSON.parse(JSON.stringify(node)) as IWorkflowNode;
  delete cloned.testResult;
  return cloned;
};

const getNodeSignature = (node: IWorkflowNode) =>
  JSON.stringify({
    type: node.type,
    category: node.category,
    config: node.config ?? {},
  });

const isNodeTestResult = (value: unknown): value is NodeTestResult => {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.signature === 'string' &&
    typeof value.testedAt === 'string' &&
    isPlainRecord(value.node)
  );
};

const getValidNodeTestResult = (
  node: IWorkflowNode,
  nodeTestResults: Record<string, NodeTestResult>
) => {
  const currentSignature = getNodeSignature(node);
  const localResult = nodeTestResults[node.id];
  if (localResult?.signature === currentSignature) return localResult;
  const persistedResult = isNodeTestResult(node.testResult) ? node.testResult : undefined;
  return persistedResult?.signature === currentSignature ? persistedResult : undefined;
};

const getAnyNodeTestResult = (
  node: IWorkflowNode,
  nodeTestResults: Record<string, NodeTestResult>
) => nodeTestResults[node.id] ?? (isNodeTestResult(node.testResult) ? node.testResult : undefined);

const getNodeTestResultState = (
  node: IWorkflowNode,
  nodeTestResults: Record<string, NodeTestResult>
) => {
  const result = getAnyNodeTestResult(node, nodeTestResults);
  if (!result) return 'missing' as const;
  return result.signature === getNodeSignature(node) ? ('current' as const) : ('expired' as const);
};

const clampZoom = (value: number) => {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const hasText = (value: unknown) => {
  return typeof value === 'string' ? Boolean(value.trim()) : value !== undefined && value !== null;
};

const hasFilterValue = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainRecord(value)) {
    if (typeof value.mode === 'string') {
      return Boolean(
        value.mode &&
          (value.exactDate ||
            value.exactDateEnd ||
            value.numberOfDays ||
            value.mode !== 'exactDate')
      );
    }
    return Object.keys(value).length > 0;
  }
  return hasText(value);
};

const operatorNeedsValue = (operator?: string) => !EMPTY_FILTER_OPERATORS.has(operator ?? '');

const hasRecordKeys = (value: unknown) => {
  return isPlainRecord(value) && Object.keys(value).length > 0;
};

const edgeMatchesHandle = (edge: IWorkflowEdge, handle?: string) => {
  if (handle === undefined) return !edge.sourceHandle;
  return edge.sourceHandle === handle;
};

const getNodeDefaultEdge = (nodeId: string, edges: IWorkflowEdge[]) => {
  return edges.find((edge) => edge.source === nodeId && !edge.sourceHandle);
};

const isConditionComplete = (condition: unknown): boolean => {
  if (!isPlainRecord(condition)) return false;
  if (Array.isArray(condition.filterSet)) {
    const filters = condition.filterSet.filter(isPlainRecord);
    return Boolean(filters.length) && filters.every(isConditionComplete);
  }
  const operator = String(condition.operator ?? 'notEmpty');
  if (!hasText(condition.fieldId ?? condition.left)) return false;
  return !operatorNeedsValue(operator) || hasFilterValue(condition.value ?? condition.right);
};

const hasConditionItems = (condition: unknown): boolean => {
  if (!isPlainRecord(condition)) return false;
  if (Array.isArray(condition.filterSet)) {
    return condition.filterSet.some(hasConditionItems);
  }
  return hasText(condition.fieldId ?? condition.left);
};

const isOptionalConditionComplete = (condition: unknown) => {
  return !hasConditionItems(condition) || isConditionComplete(condition);
};

const getFindMode = (config: Record<string, unknown>) => {
  if (hasText(config.findMode)) return String(config.findMode);
  if (hasText(config.viewId)) return 'view';
  return hasConditionItems(config.filter) ? 'condition' : '';
};

const NODE_COMPLETION_CHECKS: Record<string, (config: Record<string, unknown>) => boolean> = {
  buttonClick: (config) =>
    hasText(config.tableId) &&
    isOptionalConditionComplete(config.filter) &&
    Array.isArray(config.watchFieldIds) &&
    config.watchFieldIds.length > 0,
  formSubmitted: (config) => hasText(config.tableId) && hasText(config.viewId),
  recordCreated: (config) => hasText(config.tableId) && isOptionalConditionComplete(config.filter),
  recordCreatedOrUpdated: (config) =>
    hasText(config.tableId) && isOptionalConditionComplete(config.filter),
  recordUpdated: (config) => hasText(config.tableId),
  recordMatchesConditions: (config) =>
    hasText(config.tableId) && isConditionComplete(config.filter),
  createRecord: (config) => hasText(config.tableId) && hasRecordKeys(config.fields),
  updateRecord: (config) =>
    hasText(config.tableId) && hasText(config.recordId) && hasRecordKeys(config.fields),
  getRecords: (config) => {
    const findMode = getFindMode(config);
    return (
      hasText(config.tableId) &&
      hasText(findMode) &&
      Number(config.take ?? 100) > 0 &&
      (findMode !== 'view' || hasText(config.viewId)) &&
      (findMode !== 'condition' || isOptionalConditionComplete(config.filter))
    );
  },
  sendEmail: (config) => hasText(config.to) && hasText(config.subject) && hasText(config.body),
  httpRequest: (config) => hasText(config.method) && hasText(config.url),
  condition: (config) => isConditionComplete(config),
};

const isWorkflowNodeComplete = (node: IWorkflowNode) => {
  const config = node.config ?? {};
  return NODE_COMPLETION_CHECKS[node.type]?.(config) ?? true;
};

const getWorkflowNodeEditStatus = (
  node: IWorkflowNode,
  nodeTestResults: Record<string, NodeTestResult>,
  tr?: PanelTranslate
) => {
  if (!isWorkflowNodeComplete(node)) {
    return {
      type: 'incomplete' as const,
      label: tr
        ? tr('nodeStatus.incomplete', 'Required fields are incomplete')
        : 'Required fields are incomplete',
      iconClassName: 'text-destructive',
      Icon: TriangleAlert,
    };
  }
  if (getValidNodeTestResult(node, nodeTestResults)) {
    return {
      type: 'success' as const,
      label: panelText(tr, 'nodeStatus.testSucceeded', 'Test run succeeded'),
      iconClassName: 'text-emerald-600',
      Icon: CheckCircle2,
    };
  }
  if (getNodeTestResultState(node, nodeTestResults) === 'expired') {
    return {
      type: 'expired' as const,
      label: tr
        ? tr('nodeStatus.testExpired', 'The test result has expired. Run the test step again.')
        : 'The test result has expired. Run the test step again.',
      iconClassName: 'text-amber-600',
      Icon: TriangleAlert,
    };
  }
  return {
    type: 'untested' as const,
    label: panelText(tr, 'nodeStatus.untested', 'Complete but not tested'),
    iconClassName: 'text-amber-600',
    Icon: TriangleAlert,
  };
};

const validateWorkflow = (nodes: IWorkflowNode[], tr?: PanelTranslate) => {
  const hasTrigger = nodes.some((node) => node.category === 'trigger');
  if (!hasTrigger) {
    return {
      canRun: false,
      message: tr
        ? tr('validation.needTrigger', 'At least one trigger is required')
        : 'At least one trigger is required',
    };
  }

  const hasAction = nodes.some((node) => node.category === 'action');
  if (!hasAction) {
    return {
      canRun: false,
      message: tr
        ? tr('validation.needAction', 'At least one action node is required')
        : 'At least one action node is required',
    };
  }

  const incompleteNode = nodes.find((node) => !isWorkflowNodeComplete(node));
  if (incompleteNode) {
    return {
      canRun: false,
      message: tr
        ? tr(
            'validation.completeNodeRequiredConfig',
            'Complete required configuration for "{{node}}" first',
            {
              node: getNodeLabel(incompleteNode, tr),
            }
          )
        : `Complete required configuration for "${getNodeLabel(incompleteNode)}" first`,
    };
  }

  return { canRun: true, message: '' };
};

const getDefaultConfig = (type: string, tableId?: string): Record<string, unknown> => {
  switch (type) {
    case 'buttonClick':
      return { tableId, filter: { conjunction: 'and', filterSet: [] }, watchFieldIds: [] };
    case 'recordCreated':
    case 'recordCreatedOrUpdated':
      return { tableId, filter: { conjunction: 'and', filterSet: [] } };
    case 'recordUpdated':
      return { tableId, watchFieldIds: [] };
    case 'formSubmitted':
      return { tableId, viewId: '' };
    case 'recordMatchesConditions':
      return { tableId, filter: { conjunction: 'and', filterSet: [] } };
    case 'createRecord':
    case 'updateRecord':
      return { tableId, fields: {} };
    case 'getRecords':
      return {
        tableId,
        filter: { conjunction: 'and', filterSet: [] },
      };
    case 'sendEmail':
      return { to: '', cc: '', bcc: '', senderName: '', replyTo: '', subject: '', body: '' };
    case 'httpRequest':
      return { method: '', url: '', headers: {}, bodyType: 'none' };
    case 'condition':
      return { conjunction: 'and', filterSet: [] };
    default:
      return {};
  }
};

const fromOptionValue = (value: string) => (value === EMPTY_SELECT_VALUE ? '' : value);

const recordToRows = (value: unknown) => {
  if (!isPlainRecord(value)) return [];
  return Object.entries(value).map(([key, item]) => ({
    key,
    value: item === undefined || item === null ? '' : String(item),
  }));
};

const rowsToRecord = (rows: { key: string; value: string }[]) => {
  return Object.fromEntries(
    rows.filter((row) => row.key.trim()).map((row) => [row.key, row.value])
  );
};

const omitUndefined = (record: Record<string, unknown>) => {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
};

const replaceItemAt = <T,>(items: T[], index: number, item: T) => {
  return items.map((current, itemIndex) => (itemIndex === index ? item : current));
};

const removeItemAt = <T,>(items: T[], index: number) => {
  return items.filter((_, itemIndex) => itemIndex !== index);
};

const isFilterGroup = (item: FilterItem): item is FilterGroup => {
  return Array.isArray((item as FilterGroup).filterSet);
};

const normalizeFilterRow = (filter: Record<string, unknown>): FilterRow => ({
  fieldId: typeof filter.fieldId === 'string' ? filter.fieldId : '',
  operator: typeof filter.operator === 'string' ? filter.operator : 'is',
  value: filter.value === undefined ? '' : filter.value,
});

const normalizeFilterGroup = (filter: unknown): FilterGroup => {
  if (!isPlainRecord(filter)) return { conjunction: 'and', filterSet: [] };
  if (!Array.isArray(filter.filterSet)) {
    return typeof filter.fieldId === 'string'
      ? { conjunction: 'and', filterSet: [normalizeFilterRow(filter)] }
      : { conjunction: 'and', filterSet: [] };
  }

  return {
    conjunction: typeof filter.conjunction === 'string' ? filter.conjunction : 'and',
    filterSet: filter.filterSet
      .filter(isPlainRecord)
      .map((item) =>
        Array.isArray(item.filterSet) ? normalizeFilterGroup(item) : normalizeFilterRow(item)
      ),
  };
};

const buildFilterItem = (item: FilterItem): Record<string, unknown> => {
  if (isFilterGroup(item)) {
    return {
      conjunction: item.conjunction || 'and',
      filterSet: item.filterSet.map(buildFilterItem),
    };
  }

  return {
    fieldId: item.fieldId,
    operator: item.operator || 'is',
    value: operatorNeedsValue(item.operator) ? item.value : null,
  };
};

const buildFilter = (group: FilterGroup) => {
  return {
    conjunction: group.conjunction || 'and',
    filterSet: group.filterSet.map(buildFilterItem),
  };
};

const isRuntimeConditionGroup = (item: RuntimeConditionItem): item is RuntimeConditionGroup => {
  return Array.isArray((item as RuntimeConditionGroup).filterSet);
};

const normalizeRuntimeOperatorValue = (operator: unknown) => {
  if (operator === 'equal' || operator === 'eq') return 'is';
  if (operator === 'notEqual' || operator === 'neq') return 'isNot';
  if (operator === 'empty') return 'isEmpty';
  if (operator === 'notEmpty') return 'isNotEmpty';
  return typeof operator === 'string' ? operator : 'contains';
};

const normalizeRuntimeConditionRow = (condition: Record<string, unknown>): RuntimeConditionRow => {
  const left = condition.left
    ? String(condition.left)
    : condition.fieldId
      ? `{{trigger.record.fields.${String(condition.fieldId)}}}`
      : '';
  return {
    left,
    operator: normalizeRuntimeOperatorValue(condition.operator),
    value:
      condition.value === undefined && condition.right === undefined
        ? ''
        : condition.value ?? condition.right,
  };
};

const normalizeRuntimeConditionGroup = (condition: unknown): RuntimeConditionGroup => {
  if (!isPlainRecord(condition)) {
    return { conjunction: 'and', filterSet: [] };
  }
  if (!Array.isArray(condition.filterSet)) {
    return {
      conjunction: 'and',
      filterSet: [normalizeRuntimeConditionRow(condition)],
    };
  }

  const filterSet = condition.filterSet
    .filter(isPlainRecord)
    .map((item) =>
      Array.isArray(item.filterSet)
        ? normalizeRuntimeConditionGroup(item)
        : normalizeRuntimeConditionRow(item)
    );

  return {
    conjunction: typeof condition.conjunction === 'string' ? condition.conjunction : 'and',
    filterSet,
  };
};

const buildRuntimeConditionItem = (item: RuntimeConditionItem): Record<string, unknown> => {
  if (isRuntimeConditionGroup(item)) {
    return {
      conjunction: item.conjunction || 'and',
      filterSet: item.filterSet.map(buildRuntimeConditionItem),
    };
  }

  const operator = [...RECORD_FILTER_OPERATORS, ...RUNTIME_OPERATORS].find(
    (option) => option.value === item.operator
  );
  return {
    left: item.left,
    operator: item.operator || '',
    value: operator?.needsValue === false ? null : item.value,
  };
};

const buildRuntimeCondition = (group: RuntimeConditionGroup) => {
  return {
    conjunction: group.conjunction || 'and',
    filterSet: group.filterSet.map(buildRuntimeConditionItem),
  };
};

const toTableField = (field: {
  id: string;
  name: string;
  type?: string;
  options?: unknown;
  cellValueType?: string;
  isMultipleCellValue?: boolean;
  isLookup?: boolean;
  isConditionalLookup?: boolean;
  isComputed?: boolean;
  recordCreate?: boolean;
  recordRead?: boolean;
}): TableField => ({
  id: field.id,
  name: field.name,
  type: field.type,
  options: field.options,
  cellValueType: field.cellValueType,
  isMultipleCellValue: field.isMultipleCellValue,
  isLookup: field.isLookup,
  isConditionalLookup: field.isConditionalLookup,
  isComputed: field.isComputed,
  recordCreate: field.recordCreate,
  recordRead: field.recordRead,
});

const isFilterableField = (field: TableField) => field.type !== FieldType.Button;

const FIELD_WRITE_DISABLED_REASON_BY_TYPE: Partial<
  Record<FieldType, { key: string; defaultValue: string }>
> = {
  [FieldType.Formula]: {
    key: 'fieldDisabled.formula',
    defaultValue: 'Formula fields are not writable',
  },
  [FieldType.Rollup]: {
    key: 'fieldDisabled.rollup',
    defaultValue: 'Rollup fields are not writable',
  },
  [FieldType.ConditionalRollup]: {
    key: 'fieldDisabled.rollup',
    defaultValue: 'Rollup fields are not writable',
  },
  [FieldType.AutoNumber]: {
    key: 'fieldDisabled.autoNumber',
    defaultValue: 'Auto number fields are not writable',
  },
  [FieldType.CreatedTime]: {
    key: 'fieldDisabled.system',
    defaultValue: 'System fields are not writable',
  },
  [FieldType.LastModifiedTime]: {
    key: 'fieldDisabled.system',
    defaultValue: 'System fields are not writable',
  },
  [FieldType.CreatedBy]: {
    key: 'fieldDisabled.system',
    defaultValue: 'System fields are not writable',
  },
  [FieldType.LastModifiedBy]: {
    key: 'fieldDisabled.system',
    defaultValue: 'System fields are not writable',
  },
};

const getFieldWriteDisabledReason = (field: TableField, tr?: PanelTranslate) => {
  if (field.recordCreate === false) {
    return panelText(tr, 'fieldDisabled.noWritePermission', 'No write permission');
  }
  if (field.type === FieldType.Button) {
    return panelText(tr, 'fieldDisabled.button', 'Button fields are not writable');
  }
  if (field.isLookup || field.isConditionalLookup) {
    return panelText(tr, 'fieldDisabled.lookup', 'Lookup fields are not writable');
  }
  if (field.isComputed) {
    return panelText(tr, 'fieldDisabled.computed', 'Computed fields are not writable');
  }
  const reason = FIELD_WRITE_DISABLED_REASON_BY_TYPE[field.type as FieldType];
  return reason ? panelText(tr, reason.key, reason.defaultValue) : undefined;
};

const isMultipleUserField = (field?: TableField) => {
  const options = field?.options as { isMultiple?: boolean } | undefined;
  return Boolean(field?.isMultipleCellValue || options?.isMultiple);
};

const getFieldValueKind = (field?: TableField): FieldValueKind => {
  switch (field?.type) {
    case FieldType.Number:
    case FieldType.AutoNumber:
    case FieldType.Rating:
      return 'number';
    case FieldType.SingleSelect:
      return 'singleSelect';
    case FieldType.MultipleSelect:
      return 'multipleSelect';
    case FieldType.User:
    case FieldType.CreatedBy:
    case FieldType.LastModifiedBy:
      return 'user';
    case FieldType.Date:
    case FieldType.CreatedTime:
    case FieldType.LastModifiedTime:
      return 'date';
    case FieldType.Checkbox:
      return 'checkbox';
    case FieldType.Attachment:
      return 'attachment';
    case FieldType.Link:
      return 'link';
    case FieldType.Formula:
    case FieldType.Rollup:
    case FieldType.ConditionalRollup:
      if (field.cellValueType === CellValueType.Number) return 'number';
      if (field.cellValueType === CellValueType.DateTime) return 'date';
      if (field.cellValueType === CellValueType.Boolean) return 'checkbox';
      return 'text';
    default:
      return 'text';
  }
};

const getRecordFilterOperatorsByKind = (
  kind: FieldValueKind,
  field?: TableField
): FilterOperatorOption[] => {
  switch (kind) {
    case 'number':
      return NUMBER_FILTER_OPERATORS;
    case 'singleSelect':
      return SINGLE_OPTION_FILTER_OPERATORS;
    case 'multipleSelect':
      return MULTIPLE_OPTION_FILTER_OPERATORS;
    case 'user':
      return isMultipleUserField(field)
        ? MULTIPLE_OPTION_FILTER_OPERATORS
        : SINGLE_OPTION_FILTER_OPERATORS;
    case 'date':
      return DATE_FILTER_OPERATORS;
    case 'checkbox':
      return CHECKBOX_FILTER_OPERATORS;
    case 'attachment':
      return ATTACHMENT_FILTER_OPERATORS;
    case 'link':
      return LINK_FILTER_OPERATORS;
    default:
      return TEXT_FILTER_OPERATORS;
  }
};

const getRecordFilterOperatorsByField = (field?: TableField): FilterOperatorOption[] =>
  getRecordFilterOperatorsByKind(getFieldValueKind(field), field);

const getVariableValueKind = (option?: IVariableOption): FieldValueKind =>
  option?.field ? getFieldValueKind(option.field) : option?.valueKind ?? 'text';

const getDefaultRuntimeOperator = (kind: FieldValueKind, field?: TableField) => {
  if (kind === 'checkbox') return 'is';
  if (kind === 'text') return 'contains';
  return getRecordFilterOperatorsByKind(kind, field)[0]?.value ?? 'contains';
};

const getDefaultFilterOperator = (field?: TableField) =>
  getRecordFilterOperatorsByField(field)[0]?.value ?? 'is';

const getDefaultDateFilterValue = (operator?: string) => ({
  mode: operator === 'isWithIn' ? 'nextNumberOfDays' : 'exactDate',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

const getDefaultFilterValueByKind = (kind: FieldValueKind, operator?: string): unknown => {
  if (!operatorNeedsValue(operator)) return null;
  if (MULTIPLE_VALUE_OPERATORS.has(operator ?? '')) return [];
  switch (kind) {
    case 'checkbox':
      return null;
    case 'date':
      return getDefaultDateFilterValue(operator);
    case 'number':
      return '';
    default:
      return '';
  }
};

const getDefaultFilterValue = (field?: TableField, operator?: string): unknown =>
  getDefaultFilterValueByKind(getFieldValueKind(field), operator);

const getTableLabel = (tables: { id: string; name: string }[], tableId?: string) => {
  if (!tableId) return '';
  return tables.find((table) => table.id === tableId)?.name ?? tableId;
};

const getFieldLabel = (fields: TableField[], fieldId?: string) => {
  if (!fieldId) return '';
  return fields.find((field) => field.id === fieldId)?.name ?? fieldId;
};

const getFieldListLabel = (fields: TableField[], fieldIds: unknown) => {
  if (!Array.isArray(fieldIds)) return '';
  return fieldIds
    .filter((fieldId): fieldId is string => typeof fieldId === 'string')
    .map((fieldId) => getFieldLabel(fields, fieldId))
    .filter(Boolean)
    .join('、');
};

const formatFilterSummaryValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map(formatFilterSummaryValue).filter(Boolean).join('、');
  }
  if (isPlainRecord(value)) {
    if (typeof value.exactDate === 'string') return value.exactDate;
    if (typeof value.mode === 'string') return value.mode;
    return JSON.stringify(value);
  }
  return value === null || value === undefined ? '' : String(value);
};

const getConditionSummary = (
  condition: unknown,
  fields: TableField[],
  tr?: PanelTranslate
): string => {
  if (!isPlainRecord(condition)) return '';
  if (Array.isArray(condition.filterSet)) {
    const labels = condition.filterSet
      .map((item) => getConditionSummary(item, fields, tr))
      .filter(Boolean);
    return labels.join(
      condition.conjunction === 'or'
        ? ` ${panelText(tr, 'conjunction.or', 'or')} `
        : ` ${panelText(tr, 'conjunction.and', 'and')} `
    );
  }
  const field = getFieldLabel(fields, String(condition.fieldId ?? condition.left ?? ''));
  const operator = [...RECORD_FILTER_OPERATORS, ...RUNTIME_OPERATORS].find(
    (item) => item.value === condition.operator
  );
  const value = condition.value ?? condition.right;
  return [field, operator ? getLabelOptionText(operator, tr) : '', formatFilterSummaryValue(value)]
    .filter(Boolean)
    .join(' ');
};

const buildTestInputRows = (
  node: IWorkflowNode,
  tables: { id: string; name: string }[],
  fields: TableField[],
  tr?: PanelTranslate
): TestResultRow[] => {
  const config = node.config ?? {};
  const tableId = typeof config.tableId === 'string' ? config.tableId : '';
  const rows: TestResultRow[] = [];

  if (tableId) {
    rows.push({
      label: panelText(tr, 'resultLabels.table', 'Table'),
      value: getTableLabel(tables, tableId),
    });
  }
  if ('watchFieldIds' in config) {
    rows.push({
      label: panelText(tr, 'resultLabels.watchFields', 'Watch fields'),
      value: getFieldListLabel(fields, config.watchFieldIds),
    });
  }
  if (hasText(config.viewId)) {
    rows.push({
      label: panelText(tr, 'resultLabels.view', 'View'),
      value: String(config.viewId),
    });
  }
  if (hasText(config.recordId)) {
    rows.push({
      label: panelText(tr, 'resultLabels.recordId', 'Record ID'),
      value: String(config.recordId),
    });
  }
  if (hasText(config.method)) {
    rows.push({
      label: panelText(tr, 'resultLabels.requestMethod', 'Request method'),
      value: String(config.method),
    });
  }
  if (hasText(config.url)) {
    rows.push({
      label: panelText(tr, 'resultLabels.requestUrl', 'Request URL'),
      value: String(config.url),
    });
  }
  if (hasText(config.to)) {
    rows.push({
      label: panelText(tr, 'resultLabels.recipients', 'Recipients'),
      value: String(config.to),
    });
  }
  if (hasText(config.subject)) {
    rows.push({
      label: panelText(tr, 'resultLabels.subject', 'Subject'),
      value: String(config.subject),
    });
  }
  if (hasConditionItems(config.filter)) {
    rows.push({
      label: panelText(tr, 'resultLabels.condition', 'Condition'),
      value: getConditionSummary(config.filter, fields, tr),
      raw: config.filter,
    });
  }
  if (hasRecordKeys(config.fields)) {
    rows.push({ label: panelText(tr, 'resultLabels.fields', 'Fields'), raw: config.fields });
  }
  if (hasRecordKeys(config.headers)) {
    rows.push({
      label: panelText(tr, 'resultLabels.requestHeaders', 'Request headers'),
      raw: config.headers,
    });
  }
  if (hasText(config.body)) {
    rows.push({
      label: panelText(tr, 'resultLabels.requestBody', 'Request body'),
      value: String(config.body),
    });
  }

  rows.push({
    label: panelText(tr, 'resultLabels.rawData', 'Raw data'),
    raw: {
      type: node.type,
      name: getNodeLabel(node, tr),
      config,
    },
  });

  return rows;
};

const buildTestOutputRows = (
  node: IWorkflowNode,
  tables: { id: string; name: string }[],
  fields: TableField[],
  baseId: string,
  tr?: PanelTranslate
): TestResultRow[] => {
  const config = node.config ?? {};
  const tableId = typeof config.tableId === 'string' ? config.tableId : '';
  const tableName = getTableLabel(tables, tableId);
  const rows: TestResultRow[] = [];

  if (node.category === 'trigger') {
    rows.push({
      label: panelText(tr, 'resultLabels.triggerUser', 'Trigger user'),
      children: [
        {
          label: panelText(tr, 'resultLabels.source', 'Source'),
          value: panelText(tr, 'resultLabels.currentUser', 'Current user'),
        },
        { label: panelText(tr, 'resultLabels.step', 'Step'), value: getNodeLabel(node, tr) },
      ],
    });
    rows.push({
      label: panelText(tr, 'resultLabels.record', 'Record'),
      children: [
        ...(tableName
          ? [{ label: panelText(tr, 'resultLabels.table', 'Table'), value: tableName }]
          : []),
        {
          label: panelText(tr, 'resultLabels.source', 'Source'),
          value: tr
            ? tr('resultLabels.testRecordContext', 'Test record context')
            : 'Test record context',
        },
        ...(tableId
          ? [
              {
                label: panelText(tr, 'resultLabels.tableUrl', 'Table URL'),
                value: `/base/${baseId}/table/${tableId}`,
              },
            ]
          : []),
      ],
    });
  } else {
    rows.push({
      label: panelText(tr, 'resultLabels.stepStatus', 'Step status'),
      value: panelText(tr, 'resultLabels.success', 'Success'),
    });
    if (tableName) {
      rows.push({
        label: panelText(tr, 'resultLabels.targetTable', 'Target table'),
        value: tableName,
      });
    }
    if (hasRecordKeys(config.fields)) {
      rows.push({
        label: panelText(tr, 'resultLabels.fields', 'Fields'),
        children: Object.entries(config.fields as Record<string, unknown>).map(
          ([fieldId, value]) => ({
            label: getFieldLabel(fields, fieldId),
            value: value === undefined || value === null ? '' : String(value),
          })
        ),
      });
    }
  }

  rows.push({
    label: panelText(tr, 'resultLabels.rawData', 'Raw data'),
    raw: {
      status: 'success',
      nodeId: node.id,
      nodeType: node.type,
      nodeName: getNodeLabel(node, tr),
      tableId: tableId || undefined,
      tableName: tableName || undefined,
    },
  });

  return rows;
};

const buildGraphNodeOrder = (nodes: IWorkflowNode[], edges: IWorkflowEdge[]) => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const result: IWorkflowNode[] = [];
  const visited = new Set<string>();
  const visit = (node?: IWorkflowNode) => {
    if (!node || visited.has(node.id)) return;
    visited.add(node.id);
    result.push(node);

    const outgoing = edges.filter((edge) => edge.source === node.id);
    const orderedEdges =
      node.type === 'condition'
        ? [
            ...outgoing.filter((edge) => edgeMatchesHandle(edge, CONDITION_TRUE_HANDLE)),
            ...outgoing.filter((edge) => edgeMatchesHandle(edge, CONDITION_FALSE_HANDLE)),
            ...outgoing.filter((edge) => !edge.sourceHandle),
          ]
        : outgoing;

    orderedEdges.forEach((edge) => visit(nodeById.get(edge.target)));
  };

  visit(nodes.find((node) => node.category === 'trigger'));
  nodes.forEach((node) => visit(node));
  return result;
};

const getUpstreamNodes = (
  selectedNodeId: string | undefined,
  edges: IWorkflowEdge[],
  graphNodeOrder: IWorkflowNode[]
) => {
  if (!selectedNodeId) return [];
  const ancestorIds = new Set<string>();
  const stack = edges.filter((edge) => edge.target === selectedNodeId).map((edge) => edge.source);
  while (stack.length) {
    const nodeId = stack.pop()!;
    if (ancestorIds.has(nodeId)) continue;
    ancestorIds.add(nodeId);
    edges
      .filter((edge) => edge.target === nodeId)
      .forEach((edge) => {
        stack.push(edge.source);
      });
  }

  return graphNodeOrder.filter((node) => ancestorIds.has(node.id));
};

const getObjectFieldVariableChildren = (
  group: string,
  field: TableField,
  path: string,
  meta: Partial<IVariableOption>,
  tr?: PanelTranslate
): IVariableOption[] => {
  const addChild = (
    label: string,
    key: string,
    valueKind: FieldValueKind = 'text',
    icon: IconComponent = FieldTextIcon
  ) => ({
    group,
    label,
    value: `{{${path}.${key}}}`,
    parentFieldId: field.id,
    valueKind,
    icon,
    iconClassName: 'text-muted-foreground',
    iconWrapperClassName: 'border-0 bg-transparent',
    groupNodeId: meta.groupNodeId,
    groupNodeType: meta.groupNodeType,
    groupNodeStatus: meta.groupNodeStatus,
    groupNodeStatusLabel: meta.groupNodeStatusLabel,
    groupNodeDescription: meta.groupNodeDescription,
  });

  switch (field.type) {
    case FieldType.User:
    case FieldType.CreatedBy:
    case FieldType.LastModifiedBy:
      return [
        addChild('id', 'id'),
        addChild('title', 'title'),
        addChild('email', 'email'),
        addChild('avatarUrl', 'avatarUrl'),
      ];
    case FieldType.Attachment:
      return [
        addChild('id', 'id'),
        addChild('name', 'name'),
        addChild('path', 'path'),
        addChild('token', 'token'),
        addChild('size', 'size', 'number', FieldNumberIcon),
        addChild('mimetype', 'mimetype'),
        addChild('width', 'width', 'number', FieldNumberIcon),
        addChild('height', 'height', 'number', FieldNumberIcon),
      ];
    case FieldType.Link:
      return [
        addChild(panelText(tr, 'variables.recordId', 'Record ID'), 'id'),
        addChild(panelText(tr, 'variables.recordName', 'Record name'), 'title'),
      ];
    default:
      return [];
  }
};

const buildVariableOptions = (
  upstreamNodes: IWorkflowNode[],
  triggerFields: TableField[],
  nodeTestResults: Record<string, NodeTestResult>,
  tr?: PanelTranslate
) => {
  const options: IVariableOption[] = [];
  const add = (group: string, label: string, path: string, meta: Partial<IVariableOption> = {}) => {
    options.push({ group, label, value: `{{${path}}}`, ...meta });
  };
  const nodeMeta = (node: IWorkflowNode): Partial<IVariableOption> => {
    const style = getNodeIconStyle(node.type);
    const status = getWorkflowNodeEditStatus(node, nodeTestResults, tr);
    return {
      groupNodeId: node.id,
      groupNodeType: node.type,
      groupNodeStatus: status.type,
      groupNodeStatusLabel: status.label,
      groupNodeDescription: getNodeDescription(node, tr),
      icon: NODE_ICONS[node.type] ?? SquareMousePointer,
      iconClassName: style.iconClassName,
      iconWrapperClassName: style.wrapperClassName,
    };
  };
  const nodeGroup = (node: IWorkflowNode) => {
    const index = upstreamNodes.findIndex((item) => item.id === node.id);
    const label = getNodeLabel(node, tr);
    return `${index + 1}. ${label}`;
  };
  const fieldMeta = (trigger: IWorkflowNode, field: TableField): Partial<IVariableOption> => {
    const meta = nodeMeta(trigger);
    return {
      ...meta,
      field,
      valueKind: getFieldValueKind(field),
      icon: getFieldIcon(field),
      iconClassName: 'text-muted-foreground',
      iconWrapperClassName: 'border-0 bg-transparent',
    };
  };
  const leafMeta = (
    node: IWorkflowNode,
    valueKind: FieldValueKind,
    icon: IconComponent
  ): Partial<IVariableOption> => ({
    ...nodeMeta(node),
    valueKind,
    icon,
    iconClassName: 'text-muted-foreground',
    iconWrapperClassName: 'border-0 bg-transparent',
  });

  const trigger = upstreamNodes.find((node) => node.category === 'trigger');
  const triggerTableId =
    typeof trigger?.config?.tableId === 'string' && trigger.config.tableId
      ? trigger.config.tableId
      : undefined;
  if (trigger && !triggerTableId) {
    const group = nodeGroup(trigger);
    const meta = nodeMeta(trigger);
    options.push({
      group,
      label: getNodeLabel(trigger, tr),
      value: '',
      sourceOnly: true,
      ...meta,
    });
  }
  if (trigger && triggerTableId) {
    const group = nodeGroup(trigger);
    triggerFields.filter(isFilterableField).forEach((field) => {
      const path = `trigger.record.fields.${field.id}`;
      const meta = fieldMeta(trigger, field);
      add(group, field.name || field.id, path, meta);
      options.push(...getObjectFieldVariableChildren(group, field, path, meta, tr));
    });
    add(
      group,
      panelText(tr, 'variables.recordId', 'Record ID'),
      'trigger.record.id',
      leafMeta(trigger, 'text', FieldTextIcon)
    );
    add(
      group,
      panelText(tr, 'variables.recordUrl', 'Record URL'),
      'trigger.record.url',
      leafMeta(trigger, 'text', FieldLinkIcon)
    );
    add(
      group,
      panelText(tr, 'variables.recordName', 'Record name'),
      'trigger.record.name',
      leafMeta(trigger, 'text', FieldTextIcon)
    );
    add(
      group,
      panelText(tr, 'variables.createdById', 'Created by ID'),
      'trigger.record.createdBy',
      leafMeta(trigger, 'text', FieldCreatedByIcon)
    );
    add(
      group,
      panelText(tr, 'variables.lastModifiedById', 'Last modified by ID'),
      'trigger.record.lastModifiedBy',
      leafMeta(trigger, 'text', FieldLastModifiedByIcon)
    );
    add(
      group,
      panelText(tr, 'variables.createdTime', 'Created time'),
      'trigger.record.createdTime',
      leafMeta(trigger, 'date', FieldCreatedTimeIcon)
    );
    add(
      group,
      panelText(tr, 'variables.lastModifiedTime', 'Last modified time'),
      'trigger.record.lastModifiedTime',
      leafMeta(trigger, 'date', FieldLastModifiedTimeIcon)
    );
    add(
      group,
      panelText(tr, 'variables.autoNumber', 'Auto number'),
      'trigger.record.autoNumber',
      leafMeta(trigger, 'number', FieldAutoNumberIcon)
    );
    add(group, 'id', 'trigger.user.id', leafMeta(trigger, 'text', FieldTextIcon));
    add(group, 'name', 'trigger.user.name', leafMeta(trigger, 'text', FieldTextIcon));
    add(group, 'email', 'trigger.user.email', leafMeta(trigger, 'text', FieldTextIcon));
    add(group, 'avatarUrl', 'trigger.user.avatarUrl', leafMeta(trigger, 'text', FieldTextIcon));
  }

  upstreamNodes
    .filter((node) => node.category !== 'trigger')
    .forEach((node) => {
      const group = nodeGroup(node);
      const objectMeta = leafMeta(node, 'text', VariableObjectIcon);
      add(
        group,
        panelText(tr, 'variables.fullOutput', 'Full output'),
        `nodes.${node.id}`,
        objectMeta
      );
      if (node.category === 'logic') {
        add(
          group,
          panelText(tr, 'variables.conditionResult', 'Condition result'),
          `logic.${node.id}.result`,
          leafMeta(node, 'checkbox', CheckCircle2)
        );
      }
      if (node.category !== 'action') return;
      if (['createRecord', 'getRecords'].includes(node.type)) {
        add(
          group,
          panelText(tr, 'variables.firstRecordId', 'First record ID'),
          `action.${node.id}.0.id`,
          leafMeta(node, 'text', Link2)
        );
        add(
          group,
          tr
            ? tr('variables.firstRecordFields', 'First record fields object')
            : 'First record fields object',
          `action.${node.id}.0.fields`,
          objectMeta
        );
      } else if (node.type === 'updateRecord') {
        add(
          group,
          panelText(tr, 'variables.recordId', 'Record ID'),
          `action.${node.id}.id`,
          leafMeta(node, 'text', Link2)
        );
        add(
          group,
          panelText(tr, 'variables.recordFields', 'Record fields object'),
          `action.${node.id}.fields`,
          objectMeta
        );
      } else if (node.type === 'httpRequest') {
        add(
          group,
          panelText(tr, 'variables.httpStatus', 'HTTP status code'),
          `action.${node.id}.status`,
          leafMeta(node, 'number', Hash)
        );
        add(
          group,
          panelText(tr, 'variables.httpBody', 'HTTP response body'),
          `action.${node.id}.body`,
          objectMeta
        );
        add(
          group,
          panelText(tr, 'variables.httpOk', 'HTTP success'),
          `action.${node.id}.ok`,
          leafMeta(node, 'checkbox', CheckCircle2)
        );
      } else if (node.type === 'sendEmail') {
        add(
          group,
          panelText(tr, 'variables.emailSentResult', 'Email sent result'),
          `action.${node.id}.sent`,
          leafMeta(node, 'checkbox', CheckCircle2)
        );
      }
    });

  return options;
};

const parseVariableExpression = (value?: string) => {
  const text = value?.trim();
  if (!text?.startsWith('{{') || !text.endsWith('}}')) return undefined;
  const expression = text.slice(2, -2).trim();
  const [path, ...modifiers] = expression
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!path) return undefined;
  const validModifierValues = new Set(VARIABLE_MODIFIERS.map((item) => item.value));
  return {
    path,
    modifiers: modifiers.filter((modifier) => validModifierValues.has(modifier)),
  };
};

const formatVariableExpression = (path: string, modifiers: string[] = []) => {
  return `{{${[path, ...modifiers].join('|')}}}`;
};

const getVariableOption = (variables: IVariableOption[], value?: string) => {
  const parsed = parseVariableExpression(value);
  if (!parsed) return undefined;
  return variables.find(
    (item) => !item.sourceOnly && parseVariableExpression(item.value)?.path === parsed.path
  );
};

const getVariableLabel = (variables: IVariableOption[], value?: string, tr?: PanelTranslate) => {
  const parsed = parseVariableExpression(value);
  if (!parsed) return value ?? '';
  const option = getVariableOption(variables, value);
  const modifierLabels = getVariableModifierLabels(parsed.modifiers, tr);
  const label = option ? `${option.group}|${option.label}` : parsed.path;
  return [label, modifierLabels].filter(Boolean).join(' · ');
};

const getVariableModifierLabels = (modifiers: string[], tr?: PanelTranslate) =>
  modifiers
    .map((modifier) => {
      const item = VARIABLE_MODIFIERS.find((current) => current.value === modifier);
      return item ? getLabelOptionText(item, tr) : undefined;
    })
    .filter(Boolean)
    .join(' / ');

const formatToggledVariableModifier = (value: string, modifier: string) => {
  const parsed = parseVariableExpression(value);
  if (!parsed) return value;
  const nextModifiers = parsed.modifiers.includes(modifier)
    ? parsed.modifiers.filter((item) => item !== modifier)
    : [...parsed.modifiers, modifier];
  return formatVariableExpression(parsed.path, nextModifiers);
};

const splitVariableText = (value: string): VariableTextToken[] => {
  const tokens: VariableTextToken[] = [];
  let cursor = 0;
  const pattern = /\{\{[^{}]+\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) {
      tokens.push({ type: 'text', value: value.slice(cursor, match.index) });
    }
    tokens.push({ type: 'variable', value: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) {
    tokens.push({ type: 'text', value: value.slice(cursor) });
  }
  return tokens.length ? tokens : [{ type: 'text', value }];
};

const hasVariableTextToken = (value: string) =>
  splitVariableText(value).some((token) => token.type === 'variable');

const readVariableTextNode = (node: ChildNode): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as HTMLElement;
  if (element.dataset.variableValue) return element.dataset.variableValue;
  if (element.tagName === 'BR') return '\n';
  return Array.from(element.childNodes).map(readVariableTextNode).join('');
};

const FieldBlock = (props: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
  description?: string;
  required?: boolean;
}) => {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">
          {props.required && <span className="mr-1 text-destructive">*</span>}
          {props.label}
        </Label>
        {props.action}
      </div>
      {props.description && (
        <div className="text-xs leading-relaxed text-muted-foreground">{props.description}</div>
      )}
      {props.children}
    </div>
  );
};

const PanelSection = (props: { title: string; children: ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t pt-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 py-1 text-left text-sm font-medium">
        <span>{props.title}</span>
        <ChevronDown className={cn('size-4 text-muted-foreground', !open && '-rotate-90')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-3">{props.children}</CollapsibleContent>
    </Collapsible>
  );
};

const LoopButton = (props: { onClick: () => void }) => {
  const tr = usePanelTranslate();
  return (
    <Button
      className="h-7 px-2 text-xs font-normal"
      size="sm"
      type="button"
      variant="outline"
      onClick={props.onClick}
    >
      {tr('actions.loop', 'Loop')}
    </Button>
  );
};

const FIELD_TYPE_ICONS: Partial<Record<FieldType, IconComponent>> = {
  [FieldType.SingleLineText]: FieldTextIcon,
  [FieldType.LongText]: FieldLongTextIcon,
  [FieldType.Number]: FieldNumberIcon,
  [FieldType.SingleSelect]: FieldSingleSelectIcon,
  [FieldType.MultipleSelect]: FieldMultipleSelectIcon,
  [FieldType.Date]: FieldCalendarIcon,
  [FieldType.Checkbox]: FieldCheckboxIcon,
  [FieldType.User]: FieldUserIcon,
  [FieldType.Attachment]: FieldAttachmentIcon,
  [FieldType.Link]: FieldLinkIcon,
  [FieldType.Formula]: FieldFormulaIcon,
  [FieldType.Rollup]: FieldRollupIcon,
  [FieldType.ConditionalRollup]: FieldConditionalRollupIcon,
  [FieldType.CreatedTime]: FieldCreatedTimeIcon,
  [FieldType.LastModifiedTime]: FieldLastModifiedTimeIcon,
  [FieldType.CreatedBy]: FieldCreatedByIcon,
  [FieldType.LastModifiedBy]: FieldLastModifiedByIcon,
  [FieldType.AutoNumber]: FieldAutoNumberIcon,
  [FieldType.Rating]: FieldRatingIcon,
  [FieldType.Button]: FieldButtonIcon,
};

function getFieldIcon(field?: TableField) {
  if (field?.isLookup) {
    return field.isConditionalLookup ? FieldConditionalLookupIcon : FieldLookupIcon;
  }
  return FIELD_TYPE_ICONS[field?.type as FieldType] ?? FieldTextIcon;
}

type SelectChoice = {
  name: string;
  color?: string;
};

const getSelectChoices = (field?: TableField): SelectChoice[] => {
  const options = field?.options;
  if (!isPlainRecord(options) || !Array.isArray(options.choices)) {
    return [];
  }
  return options.choices
    .filter(isPlainRecord)
    .map((choice) => ({
      name: typeof choice.name === 'string' ? choice.name : '',
      color: typeof choice.color === 'string' ? choice.color : undefined,
    }))
    .filter((choice) => choice.name);
};

const FieldOptionContent = (props: { field: TableField; disabledReason?: string }) => {
  const Icon = getFieldIcon(props.field);
  return (
    <span className="inline-flex min-w-0 flex-1 items-center gap-1 truncate align-middle">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[13px] leading-4">
        {props.field.name || props.field.id}
      </span>
      {props.disabledReason && (
        <span className="shrink-0 text-[11px] text-muted-foreground">{props.disabledReason}</span>
      )}
    </span>
  );
};

const SelectChoiceBadge = (props: { choice: SelectChoice }) => {
  const backgroundColor = props.choice.color ? ColorUtils.getHexForColor(props.choice.color) : null;
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full items-center overflow-hidden rounded-full px-2 text-xs',
        !backgroundColor && 'bg-muted text-foreground'
      )}
      style={
        backgroundColor
          ? {
              backgroundColor,
              color: ColorUtils.shouldUseLightTextOnColor(props.choice.color ?? '')
                ? '#ffffff'
                : '#000000',
            }
          : undefined
      }
      title={props.choice.name}
    >
      <span className="truncate">{props.choice.name}</span>
    </span>
  );
};

const TableSelect = (props: {
  value?: string;
  tables: { id: string; name: string }[];
  onChange: (value: string) => void;
}) => {
  const tr = usePanelTranslate();
  return (
    <Select value={props.value ?? ''} onValueChange={props.onChange}>
      <SelectTrigger>
        <SelectValue placeholder={tr('placeholders.select', 'Select...')} />
      </SelectTrigger>
      <SelectContent>
        {props.tables.map((table) => (
          <SelectItem key={table.id} value={table.id}>
            {table.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const BaseSelect = (props: {
  value?: string;
  bases: { id: string; name: string }[];
  onChange: (value: string) => void;
}) => {
  const tr = usePanelTranslate();
  return (
    <Select value={props.value ?? ''} onValueChange={props.onChange}>
      <SelectTrigger>
        <SelectValue placeholder={tr('placeholders.select', 'Select...')} />
      </SelectTrigger>
      <SelectContent>
        {props.bases.map((base) => (
          <SelectItem key={base.id} value={base.id}>
            {base.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const CrossDatabaseAccessConfig = (props: {
  value?: string;
  bases: { id: string; name: string }[];
  onChange: (value: string) => void;
  onCancel: () => void;
}) => {
  const tr = usePanelTranslate();
  return (
    <FieldBlock
      label={tr('fields.database', 'Database')}
      action={
        <Button
          className="h-7 px-2 text-xs font-normal"
          size="sm"
          type="button"
          variant="outline"
          onClick={props.onCancel}
        >
          {tr('actions.cancel', 'Cancel')}
        </Button>
      }
      description={tr(
        'descriptions.crossDatabaseAccess',
        'The external database will be accessed with the permissions and identity of the automation configurator. If the configurator loses access to the target database, the automation will fail.'
      )}
    >
      <BaseSelect bases={props.bases} value={props.value} onChange={props.onChange} />
    </FieldBlock>
  );
};

const LoopConfigBlock = (props: {
  value?: string;
  variables: IVariableOption[];
  onChange: (value: string) => void;
  onCancel: () => void;
}) => {
  const tr = usePanelTranslate();
  return (
    <FieldBlock
      label={tr('fields.loop', 'Loop')}
      required
      action={
        <Button
          className="h-7 px-2 text-xs font-normal"
          size="sm"
          type="button"
          variant="outline"
          onClick={props.onCancel}
        >
          {tr('actions.cancel', 'Cancel')}
        </Button>
      }
      description={tr(
        'descriptions.loopSource',
        'Select an array variable as the loop source. The action will execute for each item in the array. When selecting variables inside the array in action parameters, each loop gets the value of a single item instead of the whole array.'
      )}
    >
      <RuntimeVariableSelectButton
        className="!h-9 !w-full"
        value={props.value}
        variables={props.variables}
        placeholder={tr('placeholders.select', 'Select...')}
        onChange={props.onChange}
      />
    </FieldBlock>
  );
};

const RecordFilterOperatorSelect = (props: {
  value?: string;
  operators: FilterOperatorOption[];
  triggerClassName?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) => {
  const tr = usePanelTranslate();
  const value = props.operators.some((operator) => operator.value === props.value)
    ? props.value
    : props.allowEmpty
      ? undefined
      : props.operators[0]?.value;
  return (
    <Select
      value={props.allowEmpty ? value ?? '' : value ?? 'is'}
      onValueChange={props.onChange}
      disabled={props.disabled}
    >
      <SelectTrigger className={cn('min-w-0', props.triggerClassName)} disabled={props.disabled}>
        <SelectValue placeholder={tr('placeholders.select', 'Select...')} />
      </SelectTrigger>
      <SelectContent>
        {props.operators.map((operator) => (
          <SelectItem key={operator.value} value={operator.value}>
            {getLabelOptionText(operator, tr)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const MethodSelect = (props: { value?: string; onChange: (value: string) => void }) => {
  const tr = usePanelTranslate();
  return (
    <Select value={props.value ?? ''} onValueChange={props.onChange}>
      <SelectTrigger>
        <SelectValue placeholder={tr('placeholders.select', 'Select...')} />
      </SelectTrigger>
      <SelectContent>
        {['GET', 'POST', 'HEAD', 'PATCH', 'PUT', 'DELETE'].map((method) => (
          <SelectItem key={method} value={method}>
            {method}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const BodyTypeSelect = (props: { value?: string; onChange: (value: string) => void }) => {
  return (
    <Select value={props.value ?? 'none'} onValueChange={props.onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        <SelectItem value="formData">form-data</SelectItem>
        <SelectItem value="urlencoded">x-www-form-urlencoded</SelectItem>
        <SelectItem value="rawText">raw text</SelectItem>
        <SelectItem value="json">JSON</SelectItem>
      </SelectContent>
    </Select>
  );
};

const FieldSelect = (props: {
  value?: string;
  fields: TableField[];
  placeholder?: string;
  triggerClassName?: string;
  showEmptyOption?: boolean;
  onChange: (value: string) => void;
}) => {
  const tr = usePanelTranslate();
  const selectedField = props.fields.find((field) => field.id === props.value);
  const showEmptyOption = props.showEmptyOption ?? true;
  const selectValue = props.value || (showEmptyOption ? EMPTY_SELECT_VALUE : undefined);

  return (
    <Select value={selectValue} onValueChange={(value) => props.onChange(fromOptionValue(value))}>
      <SelectTrigger
        className={cn(
          'min-w-0 [&>span]:!flex [&>span]:min-w-0 [&>span]:items-center',
          props.triggerClassName
        )}
      >
        {selectedField ? (
          <FieldOptionContent field={selectedField} />
        ) : (
          <span className="truncate text-muted-foreground">
            {props.placeholder ?? tr('placeholders.selectField', 'Select field')}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        {showEmptyOption && (
          <SelectItem value={EMPTY_SELECT_VALUE}>
            {tr('placeholders.notSelected', 'Not selected')}
          </SelectItem>
        )}
        {props.fields.map((field) => (
          <SelectItem key={field.id} value={field.id}>
            <FieldOptionContent field={field} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const VariableOptionIcon = (props: {
  option?: IVariableOption;
  className?: string;
  iconClassName?: string;
}) => {
  const nodeStyle = getNodeIconStyle(props.option?.groupNodeType);
  const Icon =
    props.option?.icon ||
    (props.option?.groupNodeType && NODE_ICONS[props.option.groupNodeType]) ||
    Type;
  return (
    <span
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md border',
        props.option?.iconWrapperClassName ?? nodeStyle.wrapperClassName,
        props.className
      )}
    >
      <Icon
        className={cn(
          'size-4',
          props.option?.iconClassName ?? nodeStyle.iconClassName,
          props.iconClassName
        )}
      />
    </span>
  );
};

const VariableReferenceLabel = (props: {
  option?: IVariableOption;
  value: string;
  fallback?: string;
}) => {
  const tr = usePanelTranslate();
  const parsed = parseVariableExpression(props.value);
  const modifierLabels = parsed ? getVariableModifierLabels(parsed.modifiers, tr) : '';
  const label = props.option?.label || props.fallback || props.value;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 truncate">
      {props.option?.group && (
        <>
          <span className="min-w-0 truncate font-light">{props.option.group}</span>
          <span className="shrink-0 text-muted-foreground">|</span>
        </>
      )}
      <VariableOptionIcon
        className="size-4 rounded-none border-0 bg-transparent"
        iconClassName="size-3.5"
        option={props.option}
      />
      <span className="truncate font-normal">{label}</span>
      {modifierLabels && (
        <span className="shrink-0 font-normal text-muted-foreground">· {modifierLabels}</span>
      )}
    </span>
  );
};

const VariableSourceStatus = (props: { option?: IVariableOption }) => {
  if (!props.option?.groupNodeStatus || !props.option.groupNodeStatusLabel) return null;
  const status =
    props.option.groupNodeStatus === 'success'
      ? { Icon: CheckCircle2, className: 'text-emerald-600' }
      : props.option.groupNodeStatus === 'untested' || props.option.groupNodeStatus === 'expired'
        ? { Icon: TriangleAlert, className: 'text-amber-600' }
        : { Icon: TriangleAlert, className: 'text-destructive' };
  const { Icon } = status;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-auto inline-flex size-5 shrink-0 items-center justify-center">
            <Icon className={cn('size-4', status.className)} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{props.option.groupNodeStatusLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const VariablePicker = (props: {
  variables: IVariableOption[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  trigger?: ReactNode;
}) => {
  const tr = usePanelTranslate();
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setActiveGroup(undefined);
      setKeyword('');
    }
  };
  const grouped = props.variables.reduce<Record<string, IVariableOption[]>>((acc, item) => {
    acc[item.group] = [...(acc[item.group] ?? []), item];
    return acc;
  }, {});
  const groupNames = Object.keys(grouped);
  const selectedGroup = activeGroup && grouped[activeGroup] ? activeGroup : groupNames[0];
  const selectedOptions = selectedGroup
    ? grouped[selectedGroup].filter((item) => !item.sourceOnly)
    : [];
  const keywordValue = keyword.trim().toLowerCase();
  const filteredOptions = selectedOptions.filter(
    (item) =>
      !keywordValue ||
      item.label.toLowerCase().includes(keywordValue) ||
      item.value.toLowerCase().includes(keywordValue)
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {props.trigger ?? (
          <Button disabled={props.disabled || !props.variables.length} size="sm" variant="outline">
            <Plus className="size-4" />
            {tr('actions.variable', 'Variable')}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[520px] p-0" data-no-pan="true">
        <div className="grid h-80 grid-cols-[190px_1fr]">
          <div className="overflow-hidden border-r">
            <div className="flex h-11 items-center border-b px-3 text-sm text-muted-foreground">
              {tr('variablePicker.useDataSource', 'Use data source...')}
            </div>
            <ScrollArea className="h-[276px]">
              <div className="p-2">
                {groupNames.map((group, index) => {
                  const firstOption = grouped[group]?.[0];
                  const nodeStyle = getNodeIconStyle(firstOption?.groupNodeType);
                  const sourceOption = firstOption?.groupNodeType
                    ? {
                        ...firstOption,
                        icon: NODE_ICONS[firstOption.groupNodeType] ?? firstOption.icon,
                        iconClassName: nodeStyle.iconClassName,
                        iconWrapperClassName: nodeStyle.wrapperClassName,
                      }
                    : firstOption;
                  return (
                    <button
                      key={group}
                      className={cn(
                        'flex h-8 w-full cursor-pointer select-none items-center gap-1 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                        selectedGroup === group && 'bg-accent'
                      )}
                      type="button"
                      onClick={() => setActiveGroup(group)}
                    >
                      <span className="w-4 shrink-0 text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <VariableOptionIcon
                        className="size-4 rounded-none border-0 bg-transparent"
                        option={sourceOption}
                      />
                      <span className="truncate">{group.replace(/^\d+\.\s*/, '')}</span>
                      <VariableSourceStatus option={firstOption} />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
          <div className="overflow-hidden">
            <div className="flex h-11 items-center border-b px-3 text-sm">
              {tr('variablePicker.selectData', 'Select data')}
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="h-10 rounded-none border-0 pl-8 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                value={keyword}
                placeholder={tr('placeholders.commandSearch', 'Type a command or search...')}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <ScrollArea className="h-[230px]">
              <div className="px-2 py-1">
                {filteredOptions.some((item) => item.field) && (
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {tr('variablePicker.insertFromField', 'Insert from field')}
                  </div>
                )}
                {filteredOptions.map((item) => (
                  <button
                    key={`${item.group}-${item.value}`}
                    className="relative flex h-8 w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    type="button"
                    onClick={() => {
                      props.onSelect(item.value);
                      handleOpenChange(false);
                    }}
                  >
                    <VariableOptionIcon
                      className="mr-2 size-4 rounded-none border-0 bg-transparent"
                      option={item}
                    />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                ))}
                {!filteredOptions.length && (
                  <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                    {tr('empty.noResults', 'No results found')}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const getVariablePath = (option?: IVariableOption) => parseVariableExpression(option?.value)?.path;

const isTriggerFieldVariable = (option: IVariableOption) =>
  Boolean(option.field && getVariablePath(option)?.startsWith('trigger.record.fields.'));

const isTriggerRecordMetadataVariable = (option: IVariableOption) => {
  const path = getVariablePath(option);
  return Boolean(path?.startsWith('trigger.record.') && !path.startsWith('trigger.record.fields.'));
};

const isTriggerUserVariable = (option: IVariableOption) =>
  Boolean(getVariablePath(option)?.startsWith('trigger.user.'));

const isRuntimeConditionVariable = (option: IVariableOption) =>
  option.sourceOnly || Boolean(getVariablePath(option));

const RuntimePickerDrillItem = (props: {
  label: string;
  description?: string;
  option?: IVariableOption;
  onClick: () => void;
}) => {
  const option: IVariableOption = props.option ?? {
    group: '',
    label: props.label,
    value: '',
    icon: VariableObjectIcon,
    iconClassName: 'text-muted-foreground',
    iconWrapperClassName: 'border-0 bg-transparent',
  };
  return (
    <button
      className="relative flex min-h-8 w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
      type="button"
      onClick={props.onClick}
    >
      <VariableOptionIcon
        className="mr-2 size-4 rounded-none border-0 bg-transparent"
        option={option}
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="block truncate">{props.label}</span>
        {props.description && (
          <span className="block truncate text-xs text-muted-foreground">{props.description}</span>
        )}
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
};

const RuntimePickerOption = (props: {
  option: IVariableOption;
  selected?: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) => (
  <button
    className={cn(
      'relative flex h-8 w-full select-none items-center rounded-sm px-2 py-1.5 text-left text-sm',
      props.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-accent',
      props.selected && 'bg-accent'
    )}
    disabled={props.disabled}
    type="button"
    onClick={() => props.onSelect(props.option.value)}
  >
    <VariableOptionIcon
      className="mr-2 size-4 rounded-none border-0 bg-transparent"
      option={props.option}
    />
    <span className="min-w-0 truncate">{props.option.label}</span>
  </button>
);

const RuntimeVariablePicker = (props: {
  variables: IVariableOption[];
  onSelect: (value: string) => void;
  selectedValue?: string;
  disabled?: boolean;
  isOptionDisabled?: (option: IVariableOption) => boolean;
  trigger: ReactNode;
}) => {
  const tr = usePanelTranslate();
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [view, setView] = useState<'root' | 'record' | 'fields' | 'objectField' | 'user'>('root');
  const [objectFieldId, setObjectFieldId] = useState<string>();
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setActiveGroup(undefined);
      setKeyword('');
      setView('root');
      setObjectFieldId(undefined);
    }
  };
  const isOptionDisabled = (option: IVariableOption) => props.isOptionDisabled?.(option) ?? false;
  const handleSelect = (value: string) => {
    props.onSelect(value);
    handleOpenChange(false);
  };
  const grouped = props.variables.reduce<Record<string, IVariableOption[]>>((acc, item) => {
    acc[item.group] = [...(acc[item.group] ?? []), item];
    return acc;
  }, {});
  const groupNames = Object.keys(grouped);
  const selectedGroup = activeGroup && grouped[activeGroup] ? activeGroup : groupNames[0];
  const selectedOptions = selectedGroup ? grouped[selectedGroup] : [];
  const rightOptions = selectedOptions.filter((item) => !item.sourceOnly);
  const keywordValue = keyword.trim().toLowerCase();
  const selectedPath = parseVariableExpression(props.selectedValue)?.path;
  const isSelectedOption = (option: IVariableOption) =>
    Boolean(selectedPath && parseVariableExpression(option.value)?.path === selectedPath);
  const filteredOptions = rightOptions.filter(
    (item) =>
      !keywordValue ||
      item.label.toLowerCase().includes(keywordValue) ||
      item.value.toLowerCase().includes(keywordValue)
  );
  const triggerFields = rightOptions.filter(isTriggerFieldVariable);
  const recordMetadata = rightOptions.filter(isTriggerRecordMetadataVariable);
  const triggerUser = rightOptions.filter(isTriggerUserVariable);
  const objectChildren = rightOptions.filter((item) => item.parentFieldId === objectFieldId);
  const hasTriggerTree = Boolean(
    triggerFields.length || recordMetadata.length || triggerUser.length
  );
  const renderSection = (title: string, options: IVariableOption[]) =>
    options.length ? (
      <>
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{title}</div>
        {options.map((item) => {
          const children = item.field?.id
            ? rightOptions.filter((option) => option.parentFieldId === item.field?.id)
            : [];
          if (children.length) {
            return (
              <RuntimePickerDrillItem
                key={`${item.group}-${item.value}`}
                label={item.label}
                option={{
                  ...item,
                  icon: VariableObjectIcon,
                  iconClassName: 'text-muted-foreground',
                  iconWrapperClassName: 'border-0 bg-transparent',
                }}
                onClick={() => {
                  setObjectFieldId(item.field?.id);
                  setView('objectField');
                }}
              />
            );
          }
          return (
            <RuntimePickerOption
              key={`${item.group}-${item.value}`}
              option={item}
              disabled={isOptionDisabled(item)}
              selected={isSelectedOption(item)}
              onSelect={handleSelect}
            />
          );
        })}
      </>
    ) : null;

  const renderRightContent = () => {
    if (keywordValue) {
      return (
        <>
          {renderSection(tr('variablePicker.searchResults', 'Search results'), filteredOptions)}
          {!filteredOptions.length && (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              {tr('empty.noResults', 'No results found')}
            </div>
          )}
        </>
      );
    }

    if (!hasTriggerTree) {
      return (
        <>
          {renderSection(tr('variablePicker.selectData', 'Select data'), rightOptions)}
          {!rightOptions.length && (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              {tr('empty.noResults', 'No results found')}
            </div>
          )}
        </>
      );
    }

    if (view === 'record') {
      return (
        <>
          {triggerFields.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {tr('resultLabels.fields', 'Fields')}
              </div>
              <RuntimePickerDrillItem
                label={tr('resultLabels.fieldValues', 'Field values')}
                onClick={() => setView('fields')}
              />
            </>
          )}
          {renderSection(tr('variablePicker.metadata', 'Metadata'), recordMetadata)}
        </>
      );
    }

    if (view === 'fields') {
      return (
        <>
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {tr('resultLabels.fields', 'Fields')}
          </div>
          {triggerFields.map((item) => {
            const children = item.field?.id
              ? rightOptions.filter((option) => option.parentFieldId === item.field?.id)
              : [];
            if (children.length) {
              const objectOption = {
                ...item,
                icon: VariableObjectIcon,
                iconClassName: 'text-muted-foreground',
                iconWrapperClassName: 'border-0 bg-transparent',
              };
              return (
                <RuntimePickerDrillItem
                  key={`${item.group}-${item.value}`}
                  label={item.label}
                  option={objectOption}
                  onClick={() => {
                    setObjectFieldId(item.field?.id);
                    setView('objectField');
                  }}
                />
              );
            }
            return (
              <RuntimePickerOption
                key={`${item.group}-${item.value}`}
                option={item}
                disabled={isOptionDisabled(item)}
                selected={isSelectedOption(item)}
                onSelect={handleSelect}
              />
            );
          })}
        </>
      );
    }

    if (view === 'objectField') {
      const field = triggerFields.find((item) => item.field?.id === objectFieldId);
      return renderSection(
        field?.label ?? tr('resultLabels.fieldValues', 'Field values'),
        objectChildren
      );
    }

    if (view === 'user') {
      return renderSection(tr('resultLabels.triggerUser', 'Trigger user'), triggerUser);
    }

    return (
      <>
        {triggerFields.length + recordMetadata.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {tr('variablePicker.insertFromField', 'Insert from field')}
            </div>
            <RuntimePickerDrillItem
              label={tr('resultLabels.record', 'Record')}
              onClick={() => setView('record')}
            />
          </>
        )}
        {triggerUser.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {tr('variablePicker.insertMetadata', 'Insert metadata')}
            </div>
            <RuntimePickerDrillItem
              label={tr('resultLabels.triggerUser', 'Trigger user')}
              onClick={() => setView('user')}
            />
          </>
        )}
      </>
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[520px] rounded-md border bg-popover p-0 shadow-md"
        data-no-pan="true"
      >
        <div className="grid h-80 grid-cols-[190px_1fr]">
          <div className="overflow-hidden border-r">
            <div className="flex h-11 items-center border-b px-3 text-sm text-muted-foreground">
              {tr('variablePicker.useDataSource', 'Use data source...')}
            </div>
            <ScrollArea className="h-[276px]">
              <div className="p-2">
                {groupNames.map((group, index) => {
                  const firstOption = grouped[group]?.[0];
                  const nodeStyle = getNodeIconStyle(firstOption?.groupNodeType);
                  const groupLabel = group.replace(/^\d+\.\s*/, '');
                  const sourceDescription = firstOption?.groupNodeDescription;
                  return (
                    <button
                      key={group}
                      className={cn(
                        'flex h-8 w-full cursor-pointer select-none items-center gap-1 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                        selectedGroup === group && 'bg-accent'
                      )}
                      type="button"
                      onClick={() => {
                        setActiveGroup(group);
                        setView('root');
                        setObjectFieldId(undefined);
                      }}
                    >
                      <span className="w-4 shrink-0 text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <VariableOptionIcon
                        className="size-4 rounded-none border-0 bg-transparent"
                        option={{
                          ...firstOption,
                          icon:
                            (firstOption?.groupNodeType && NODE_ICONS[firstOption.groupNodeType]) ||
                            firstOption?.icon,
                          iconClassName: firstOption?.groupNodeType
                            ? nodeStyle.iconClassName
                            : firstOption?.iconClassName,
                          iconWrapperClassName: firstOption?.groupNodeType
                            ? nodeStyle.wrapperClassName
                            : firstOption?.iconWrapperClassName,
                        }}
                      />
                      {sourceDescription ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate">{groupLabel}</span>
                            </TooltipTrigger>
                            <TooltipContent>{sourceDescription}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="truncate">{groupLabel}</span>
                      )}
                      <VariableSourceStatus option={firstOption} />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
          <div className="overflow-hidden">
            <div className="flex h-11 items-center gap-2 border-b px-3 text-sm">
              {view !== 'root' && !keywordValue && (
                <Button
                  className="size-7 shrink-0"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => {
                    setView(view === 'objectField' ? 'fields' : 'root');
                    if (view === 'objectField') setObjectFieldId(undefined);
                  }}
                >
                  <TeableChevronRight className="size-4 rotate-180" />
                </Button>
              )}
              <span className="min-w-0 flex-1 truncate">
                {tr('variablePicker.selectData', 'Select data')}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="h-10 rounded-none border-0 pl-8 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                value={keyword}
                placeholder={tr('placeholders.commandSearch', 'Type a command or search...')}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <ScrollArea className="h-[230px]">
              <div className="px-2 py-1">{renderRightContent()}</div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const RuntimeVariableSelectButton = (props: {
  value?: string;
  placeholder?: string;
  variables: IVariableOption[];
  className?: string;
  isOptionDisabled?: (option: IVariableOption) => boolean;
  onChange: (value: string) => void;
}) => {
  const option = getVariableOption(props.variables, props.value ?? '');
  const label = option?.label || props.placeholder || '';
  const triggerClassName = cn(
    'relative h-8 w-[156px] flex-none shrink-0 justify-start overflow-hidden px-2 pr-7 text-xs font-normal',
    props.className
  );

  if (props.value && option) {
    return (
      <VariableReferenceEditor
        className={triggerClassName}
        compact
        pickerType="runtime"
        value={props.value}
        variables={props.variables}
        isOptionDisabled={props.isOptionDisabled}
        placeholder={props.placeholder}
        onChange={props.onChange}
      />
    );
  }

  return (
    <RuntimeVariablePicker
      variables={props.variables}
      isOptionDisabled={props.isOptionDisabled}
      onSelect={props.onChange}
      trigger={
        <Button className={triggerClassName} variant="outline">
          {option ? <VariableOptionIcon className="size-4" option={option} /> : null}
          <span className={cn('min-w-0 truncate', !option && 'text-muted-foreground')}>
            {label}
          </span>
          <Plus className="absolute right-2 size-4 rounded-sm bg-blue-600 text-white" />
        </Button>
      }
    />
  );
};

const VariableReferenceEditor = (props: {
  value: string;
  variables: IVariableOption[];
  placeholder?: string;
  className?: string;
  compact?: boolean;
  pickerType?: 'runtime' | 'generic';
  isOptionDisabled?: (option: IVariableOption) => boolean;
  onChange: (value: string) => void;
}) => {
  const tr = usePanelTranslate();
  const [showModifiers, setShowModifiers] = useState(false);
  const parsed = parseVariableExpression(props.value);
  const option = getVariableOption(props.variables, props.value);
  const label =
    (props.compact ? option?.label : getVariableLabel(props.variables, props.value, tr)) ||
    props.placeholder ||
    tr('placeholders.selectVariable', 'Select variable');
  const toggleModifier = (modifier: string) => {
    props.onChange(formatToggledVariableModifier(props.value, modifier));
  };
  const handleSelect = (value: string) => {
    const next = parseVariableExpression(value);
    if (!next) return;
    props.onChange(formatVariableExpression(next.path, parsed?.modifiers ?? []));
  };
  const editTrigger = (
    <Button className="h-9 w-full justify-start gap-2 px-2 font-normal" variant="ghost">
      <Pencil className="size-4" />
      {tr('actions.editVariable', 'Edit variable')}
    </Button>
  );
  const editPicker =
    props.pickerType === 'runtime' ? (
      <RuntimeVariablePicker
        selectedValue={props.value}
        variables={props.variables}
        isOptionDisabled={props.isOptionDisabled}
        onSelect={handleSelect}
        trigger={editTrigger}
      />
    ) : (
      <VariablePicker variables={props.variables} onSelect={handleSelect} trigger={editTrigger} />
    );

  return (
    <Popover onOpenChange={(open) => !open && setShowModifiers(false)}>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            'h-9 w-full min-w-0 flex-1 justify-start px-3 font-normal',
            props.className
          )}
          variant="outline"
        >
          <VariableReferenceLabel fallback={label} option={option} value={props.value} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1" data-no-pan="true">
        {showModifiers ? (
          <>
            <Button
              className="h-9 w-full justify-start gap-2 px-2 font-normal"
              variant="ghost"
              onClick={() => setShowModifiers(false)}
            >
              <TeableChevronRight className="size-4 rotate-180" />
              {tr('modifiers.title', 'Modifiers')}
            </Button>
            <div className="my-1 h-px bg-border" />
            {VARIABLE_MODIFIERS.map((modifier) => (
              <button
                key={modifier.value}
                className="flex h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-accent"
                type="button"
                onClick={() => toggleModifier(modifier.value)}
              >
                <span>{getLabelOptionText(modifier, tr)}</span>
                {parsed?.modifiers.includes(modifier.value) && (
                  <CheckCircle2 className="size-4 text-primary" />
                )}
              </button>
            ))}
          </>
        ) : (
          <>
            {editPicker}
            <Button
              className="h-9 w-full justify-start gap-2 px-2 font-normal"
              variant="ghost"
              onClick={() => setShowModifiers(true)}
            >
              <Type className="size-4" />
              {tr('modifiers.title', 'Modifiers')}
            </Button>
            <Button
              className="h-9 w-full justify-start gap-2 px-2 font-normal"
              variant="ghost"
              onClick={() => props.onChange('')}
            >
              <Trash2 className="size-4" />
              {tr('actions.delete', 'Delete')}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

const InlineVariableToken = (props: {
  value: string;
  variables: IVariableOption[];
  onChange: (value: string) => void;
  onDelete: () => void;
}) => {
  const tr = usePanelTranslate();
  const parsed = parseVariableExpression(props.value);
  const option = getVariableOption(props.variables, props.value);
  const label = getVariableLabel(props.variables, props.value, tr);
  const toggleModifier = (modifier: string) => {
    props.onChange(formatToggledVariableModifier(props.value, modifier));
  };

  return (
    <span contentEditable={false} data-variable-value={props.value}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="mx-0.5 inline-flex max-w-full items-center rounded-md border bg-muted px-2 py-0.5 text-xs text-foreground hover:bg-accent"
            contentEditable={false}
            data-variable-value={props.value}
            type="button"
          >
            <VariableReferenceLabel fallback={label} option={option} value={props.value} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1" data-no-pan="true">
          <RuntimeVariablePicker
            variables={props.variables}
            onSelect={(value) => {
              const next = parseVariableExpression(value);
              if (!next) return;
              props.onChange(formatVariableExpression(next.path, parsed?.modifiers ?? []));
            }}
            trigger={
              <Button className="h-9 w-full justify-start gap-2 px-2 font-normal" variant="ghost">
                <Pencil className="size-4" />
                {tr('actions.editVariable', 'Edit variable')}
              </Button>
            }
          />
          <div className="my-1 h-px bg-border" />
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
            {tr('modifiers.title', 'Modifiers')}
          </div>
          {VARIABLE_MODIFIERS.map((modifier) => (
            <button
              key={modifier.value}
              className="flex h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-accent"
              type="button"
              onClick={() => toggleModifier(modifier.value)}
            >
              <span>{getLabelOptionText(modifier, tr)}</span>
              {parsed?.modifiers.includes(modifier.value) && (
                <CheckCircle2 className="size-4 text-primary" />
              )}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <Button
            className="h-9 w-full justify-start px-2 font-normal"
            variant="ghost"
            onClick={props.onDelete}
          >
            <Trash2 className="size-4" />
            {tr('actions.delete', 'Delete')}
          </Button>
        </PopoverContent>
      </Popover>
    </span>
  );
};

const ValueModePopover = (props: {
  variables: IVariableOption[];
  deferVariablePicker?: boolean;
  onStatic: () => void;
  onVariable: (value: string) => void;
  onVariableMode?: () => void;
}) => {
  const tr = usePanelTranslate();
  const [open, setOpen] = useState(false);
  const handleStatic = () => {
    props.onStatic();
    setOpen(false);
  };
  const handleVariable = (value: string) => {
    props.onVariable(value);
    setOpen(false);
  };
  const handleVariableMode = () => {
    props.onVariableMode?.();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="shrink-0"
          size="icon-xs"
          title={tr('actions.editValueType', 'Edit value type')}
          variant="ghost"
        >
          <Pencil className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1" data-no-pan="true">
        <Button
          className="h-auto w-full justify-start p-2 text-left font-normal"
          variant="ghost"
          onClick={handleStatic}
        >
          <div>
            <div className="text-sm font-medium">{tr('valueMode.static', 'Static value')}</div>
            <div className="text-xs text-muted-foreground">
              {tr(
                'valueMode.staticDescription',
                'Enter a value matching the condition type directly'
              )}
            </div>
          </div>
        </Button>
        {props.deferVariablePicker ? (
          <Button
            className="h-auto w-full justify-start p-2 text-left font-normal"
            variant="ghost"
            onClick={handleVariableMode}
          >
            <div>
              <div className="text-sm font-medium">
                {tr('valueMode.variable', 'Dynamic variable')}
              </div>
              <div className="text-xs text-muted-foreground">
                {tr(
                  'valueMode.variableDescription',
                  'Use variables from steps in the current automation flow'
                )}
              </div>
            </div>
          </Button>
        ) : (
          <RuntimeVariablePicker
            variables={props.variables}
            onSelect={handleVariable}
            trigger={
              <Button
                className="h-auto w-full justify-start p-2 text-left font-normal"
                variant="ghost"
              >
                <div>
                  <div className="text-sm font-medium">
                    {tr('valueMode.variable', 'Dynamic variable')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tr(
                      'valueMode.variableDescription',
                      'Use variables from steps in the current automation flow'
                    )}
                  </div>
                </div>
              </Button>
            }
          />
        )}
      </PopoverContent>
    </Popover>
  );
};

const ConditionValueInput = (props: {
  value?: string;
  variables: IVariableOption[];
  placeholder?: string;
  onChange: (value: string) => void;
}) => {
  return (
    <VariableInput
      value={props.value ?? ''}
      variables={props.variables}
      placeholder={props.placeholder}
      onChange={props.onChange}
    />
  );
};

type ValueOption = {
  value: string;
  label: string;
  labelKey?: string;
  labelDefault?: string;
  content?: ReactNode;
  optionContent?: ReactNode;
  selectedContent?: ReactNode;
};

type DateFilterValue = {
  mode: string;
  timeZone?: string;
  exactDate?: string;
  exactDateEnd?: string;
  numberOfDays?: number;
};

type CollaboratorOption = {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
};

const UserValueOptionContent = (props: { user: CollaboratorOption; avatarClassName?: string }) => {
  const name = props.user.name || props.user.email || props.user.id;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar
        name={name}
        avatar={props.user.avatar ?? undefined}
        className={props.avatarClassName}
      />
      <span className="truncate">{name}</span>
    </span>
  );
};

const UserValueTag = (props: { user: CollaboratorOption }) => (
  <span className="inline-flex h-6 max-w-[9rem] items-center rounded-md border bg-muted/50 px-1.5 text-xs">
    <UserValueOptionContent user={props.user} avatarClassName="size-4" />
  </span>
);

const DATE_MODE_OPTIONS = [
  { value: 'today', labelKey: 'dateMode.today', labelDefault: 'Today' },
  { value: 'tomorrow', labelKey: 'dateMode.tomorrow', labelDefault: 'Tomorrow' },
  { value: 'yesterday', labelKey: 'dateMode.yesterday', labelDefault: 'Yesterday' },
  { value: 'currentWeek', labelKey: 'dateMode.currentWeek', labelDefault: 'This week' },
  { value: 'lastWeek', labelKey: 'dateMode.lastWeek', labelDefault: 'Last week' },
  { value: 'nextWeekPeriod', labelKey: 'dateMode.nextWeek', labelDefault: 'Next week' },
  { value: 'currentMonth', labelKey: 'dateMode.currentMonth', labelDefault: 'This month' },
  { value: 'lastMonth', labelKey: 'dateMode.lastMonth', labelDefault: 'Last month' },
  { value: 'nextMonthPeriod', labelKey: 'dateMode.nextMonth', labelDefault: 'Next month' },
  { value: 'daysAgo', labelKey: 'dateMode.daysAgo', labelDefault: 'Days ago' },
  { value: 'daysFromNow', labelKey: 'dateMode.daysFromNow', labelDefault: 'Days from now' },
  { value: 'exactDate', labelKey: 'dateMode.exactDate', labelDefault: 'Exact date' },
  { value: 'dateRange', labelKey: 'dateMode.dateRange', labelDefault: 'Date range' },
];

const DATE_COMPARE_MODE_OPTIONS = DATE_MODE_OPTIONS.filter(
  (option) => option.value !== 'dateRange'
);

const DATE_WITHIN_MODE_OPTIONS = [
  {
    value: 'pastNumberOfDays',
    labelKey: 'dateMode.pastNumberOfDays',
    labelDefault: 'Past number of days',
  },
  {
    value: 'nextNumberOfDays',
    labelKey: 'dateMode.nextNumberOfDays',
    labelDefault: 'Next number of days',
  },
];

const toStringArray = (value: unknown) => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return typeof value === 'string' && value ? [value] : [];
};

const getStringOption = (value: unknown, key: string): string | undefined => {
  if (!isPlainRecord(value)) return undefined;
  const item = value[key];
  return typeof item === 'string' ? item : undefined;
};

const formatCellValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(formatCellValue).filter(Boolean).join('、');
  if (isPlainRecord(value)) {
    if (typeof value.title === 'string') return value.title;
    if (typeof value.name === 'string') return value.name;
    return JSON.stringify(value);
  }
  return value === undefined || value === null ? '' : String(value);
};

const SearchableValueSelect = (props: {
  value: unknown;
  options: ValueOption[];
  multiple?: boolean;
  placeholder?: string;
  emptyText?: string;
  onChange: (value: unknown) => void;
}) => {
  const tr = usePanelTranslate();
  const [open, setOpen] = useState(false);
  const values = toStringArray(props.value);
  const selectedOptions = props.options.filter((option) => values.includes(option.value));
  const selectedValue = selectedOptions[0];
  const getOptionText = (option: ValueOption) =>
    option.labelKey && option.labelDefault
      ? tr(option.labelKey, option.labelDefault)
      : option.label;
  const renderOptionContent = (option: ValueOption) =>
    option.optionContent ?? option.content ?? getOptionText(option);
  const renderSelectedContent = (option: ValueOption) =>
    option.selectedContent ?? option.content ?? getOptionText(option);
  const toggleValue = (value: string) => {
    if (!props.multiple) {
      props.onChange(value);
      setOpen(false);
      return;
    }
    props.onChange(
      values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="h-8 w-full justify-between overflow-hidden px-2 font-normal"
          role="combobox"
          variant="outline"
        >
          {props.multiple ? (
            <span className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
              {selectedOptions.length ? (
                selectedOptions.map((option) => (
                  <span key={option.value} className="shrink-0">
                    {renderSelectedContent(option)}
                  </span>
                ))
              ) : (
                <span className="truncate text-xs text-muted-foreground">
                  {props.placeholder ?? tr('placeholders.select', 'Select...')}
                </span>
              )}
            </span>
          ) : selectedValue ? (
            <span className="min-w-0 truncate">{renderSelectedContent(selectedValue)}</span>
          ) : (
            <span className="truncate text-sm text-muted-foreground">
              {props.placeholder ?? tr('placeholders.select', 'Select...')}
            </span>
          )}
          <ChevronDown
            className={cn('ml-2 size-4 shrink-0 text-muted-foreground', open && 'rotate-180')}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="min-w-40 max-w-64 p-1" data-no-pan="true">
        <Command>
          <CommandInput
            placeholder={tr('placeholders.search', 'Search...')}
            className="placeholder:text-sm"
          />
          <CommandEmpty>
            {props.emptyText ?? tr('empty.noResults', 'No results found')}
          </CommandEmpty>
          <CommandList className="mt-1">
            <CommandGroup>
              {props.options.map((option) => {
                const selected = values.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={getOptionText(option)}
                    className="truncate text-sm"
                    onSelect={() => toggleValue(option.value)}
                  >
                    <Check
                      className={cn('mr-2 size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
                    />
                    {renderOptionContent(option)}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const SelectChoiceValueInput = (props: {
  value: unknown;
  choices: SelectChoice[];
  multiple?: boolean;
  onChange: (value: unknown) => void;
}) => {
  const options = props.choices.map((choice) => ({
    value: choice.name,
    label: choice.name,
    content: <SelectChoiceBadge choice={choice} />,
  }));
  return (
    <SearchableValueSelect
      value={props.value}
      options={options}
      multiple={props.multiple}
      onChange={props.onChange}
    />
  );
};

const StaticSelectValueInput = (props: {
  value?: string;
  options: { value: string; labelKey?: string; labelDefault?: string; label?: string }[];
  placeholder?: string;
  onChange: (value: string) => void;
}) => {
  const tr = usePanelTranslate();
  return (
    <Select value={props.value ?? ''} onValueChange={props.onChange}>
      <SelectTrigger className="h-8 min-w-0">
        <SelectValue placeholder={props.placeholder ?? tr('placeholders.select', 'Select...')} />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.labelKey && option.labelDefault
              ? tr(option.labelKey, option.labelDefault)
              : option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const normalizeDateFilterValue = (value: unknown, operator: string): DateFilterValue => {
  if (isPlainRecord(value) && typeof value.mode === 'string') {
    return {
      mode: value.mode,
      timeZone: typeof value.timeZone === 'string' ? value.timeZone : undefined,
      exactDate: typeof value.exactDate === 'string' ? value.exactDate : undefined,
      exactDateEnd: typeof value.exactDateEnd === 'string' ? value.exactDateEnd : undefined,
      numberOfDays: typeof value.numberOfDays === 'number' ? value.numberOfDays : undefined,
    };
  }
  if (typeof value === 'string' && value) {
    return {
      ...getDefaultDateFilterValue(operator),
      exactDate: value,
    };
  }
  return getDefaultDateFilterValue(operator);
};

const DateFilterValueInput = (props: {
  field?: TableField;
  operator: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) => {
  const tr = usePanelTranslate();
  const value = normalizeDateFilterValue(props.value, props.operator);
  const modeOptions =
    props.operator === 'isWithIn'
      ? DATE_WITHIN_MODE_OPTIONS
      : ['isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter'].includes(props.operator)
        ? DATE_COMPARE_MODE_OPTIONS
        : DATE_MODE_OPTIONS;
  const updateValue = (patch: Partial<DateFilterValue>) => {
    props.onChange({
      ...value,
      ...patch,
      timeZone: value.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  return (
    <div className="flex w-max items-center gap-2">
      <div className="w-32 shrink-0">
        <StaticSelectValueInput
          value={value.mode}
          options={modeOptions}
          onChange={(mode) => updateValue({ mode, exactDate: undefined, exactDateEnd: undefined })}
        />
      </div>
      {['exactDate', 'exactFormatDate'].includes(value.mode) && (
        <div className="w-40 shrink-0">
          <DateEditor
            value={value.exactDate ?? null}
            options={props.field?.options as never}
            disableTimePicker
            className="h-8 w-40 text-xs"
            onChange={(exactDate) => updateValue({ exactDate: exactDate ?? undefined })}
          />
        </div>
      )}
      {value.mode === 'dateRange' && (
        <div className="shrink-0">
          <DateRangePicker
            value={
              value.exactDate
                ? {
                    exactDate: value.exactDate,
                    exactDateEnd: value.exactDateEnd,
                    timeZone: (value.timeZone ??
                      Intl.DateTimeFormat().resolvedOptions().timeZone) as ITimeZoneString,
                  }
                : null
            }
            options={props.field?.options as never}
            placeholder={tr('placeholders.selectDateRange', 'Select date range')}
            className="h-8 text-xs"
            onChange={(nextValue) =>
              updateValue({
                exactDate: nextValue?.exactDate,
                exactDateEnd: nextValue?.exactDateEnd,
                timeZone: nextValue?.timeZone,
              })
            }
          />
        </div>
      )}
      {['daysAgo', 'daysFromNow', 'pastNumberOfDays', 'nextNumberOfDays'].includes(value.mode) && (
        <Input
          className="h-8 w-24 shrink-0"
          type="number"
          value={value.numberOfDays ?? ''}
          placeholder={tr('placeholders.input', 'Enter')}
          onChange={(e) =>
            updateValue({
              numberOfDays: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
        />
      )}
    </div>
  );
};

const LinkValueInput = (props: {
  field?: TableField;
  value: unknown;
  multiple?: boolean;
  onChange: (value: unknown) => void;
}) => {
  const tr = usePanelTranslate();
  const foreignTableId = getStringOption(props.field?.options, 'foreignTableId');
  const lookupFieldId = getStringOption(props.field?.options, 'lookupFieldId');
  const { data: records = [] } = useQuery({
    queryKey: ['workflow-link-records', foreignTableId, lookupFieldId],
    queryFn: () =>
      getTableRecords(foreignTableId!, {
        fieldKeyType: FieldKeyType.Id,
        projection: lookupFieldId ? [lookupFieldId] : undefined,
        take: 100,
      }).then((res) => res.data.records),
    enabled: Boolean(foreignTableId),
  });
  const options = records.map((record) => {
    const fields = isPlainRecord(record.fields) ? record.fields : {};
    const label = formatCellValue(lookupFieldId ? fields[lookupFieldId] : undefined) || record.id;
    return {
      value: record.id,
      label,
    };
  });

  return (
    <SearchableValueSelect
      value={props.value}
      options={options}
      multiple={props.multiple}
      emptyText={tr('empty.noRecords', 'No records found')}
      onChange={props.onChange}
    />
  );
};

const FieldValueInput = (props: {
  field?: TableField;
  value: unknown;
  variables: IVariableOption[];
  allowVariables: boolean;
  operator: string;
  baseId: string;
  collaborators: CollaboratorOption[];
  placeholder?: string;
  onChange: (value: unknown) => void;
}) => {
  const value = props.value;
  const stringValue = value === undefined || value === null ? '' : String(value);
  const isMultiple = MULTIPLE_VALUE_OPERATORS.has(props.operator);

  switch (getFieldValueKind(props.field)) {
    case 'singleSelect':
    case 'multipleSelect':
      return (
        <SelectChoiceValueInput
          value={value}
          choices={getSelectChoices(props.field)}
          multiple={isMultiple || getFieldValueKind(props.field) === 'multipleSelect'}
          onChange={props.onChange}
        />
      );
    case 'user':
      return (
        <SearchableValueSelect
          value={value}
          options={props.collaborators.map((user) => ({
            value: user.id,
            label: user.name || user.email || user.id,
            selectedContent: <UserValueTag user={user} />,
            optionContent: (
              <UserValueOptionContent
                user={user}
                avatarClassName="box-content size-7 cursor-pointer"
              />
            ),
          }))}
          multiple
          onChange={props.onChange}
        />
      );
    case 'link':
      return (
        <LinkValueInput
          field={props.field}
          value={value}
          multiple={isMultiple}
          onChange={props.onChange}
        />
      );
    case 'checkbox':
      return (
        <div className="flex h-8 min-w-0 items-center justify-center rounded-md border border-input bg-background">
          <Checkbox
            checked={value === true}
            onCheckedChange={(checked) => props.onChange(checked === true ? true : null)}
          />
        </div>
      );
    case 'number':
      if (props.field?.type === FieldType.Rating) {
        return (
          <RatingEditor
            value={typeof value === 'number' ? value : undefined}
            options={
              (isPlainRecord(props.field.options)
                ? props.field.options
                : { icon: 'star', color: 'yellowBright', max: 5 }) as never
            }
            className="h-8 min-w-0 rounded-md border px-2"
            iconClassName="mr-1 size-4"
            onChange={(nextValue) => props.onChange(nextValue ?? null)}
          />
        );
      }
      return (
        <Input
          className="h-8 min-w-0"
          type="number"
          value={stringValue}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
    case 'date':
      return (
        <DateFilterValueInput
          field={props.field}
          operator={props.operator}
          value={value}
          onChange={props.onChange}
        />
      );
    default:
      return props.allowVariables ? (
        <ConditionValueInput
          value={stringValue}
          variables={props.variables}
          placeholder={props.placeholder}
          onChange={props.onChange}
        />
      ) : (
        <Input
          className="h-8 min-w-0"
          value={stringValue}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      );
  }
};

const RuntimeConditionValueInput = (props: {
  field?: TableField;
  kind: FieldValueKind;
  value: unknown;
  variables: IVariableOption[];
  operator: string;
  baseId: string;
  collaborators: CollaboratorOption[];
  placeholder?: string;
  variableMode?: boolean;
  onChange: (value: unknown) => void;
}) => {
  const tr = usePanelTranslate();
  const stringValue = props.value === undefined || props.value === null ? '' : String(props.value);
  const hasVariableValue = typeof props.value === 'string' && parseVariableExpression(props.value);
  const isOptionDisabled =
    props.kind === 'date'
      ? (option: IVariableOption) => getVariableValueKind(option) !== 'date'
      : undefined;
  if (props.variableMode) {
    return (
      <RuntimeVariableSelectButton
        className="h-8 !w-full !flex-1"
        value={hasVariableValue ? stringValue : ''}
        variables={props.variables}
        isOptionDisabled={isOptionDisabled}
        placeholder={tr('placeholders.selectVariable', 'Select variable')}
        onChange={props.onChange}
      />
    );
  }

  if (hasVariableValue) {
    return (
      <VariableReferenceEditor
        className="h-8"
        compact
        pickerType="runtime"
        value={stringValue}
        variables={props.variables}
        isOptionDisabled={isOptionDisabled}
        placeholder={props.placeholder}
        onChange={props.onChange}
      />
    );
  }

  if (props.field) {
    return (
      <FieldValueInput
        field={props.field}
        value={props.value}
        variables={props.variables}
        allowVariables={false}
        operator={props.operator}
        baseId={props.baseId}
        collaborators={props.collaborators}
        placeholder={props.placeholder}
        onChange={props.onChange}
      />
    );
  }

  switch (props.kind) {
    case 'number':
      return (
        <Input
          className="h-8 min-w-0"
          type="number"
          value={stringValue}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
    case 'date':
      return (
        <DateFilterValueInput
          operator={props.operator}
          value={props.value}
          onChange={props.onChange}
        />
      );
    case 'checkbox':
      return (
        <div className="flex h-8 min-w-0 items-center justify-center rounded-md border border-input bg-background">
          <Checkbox
            checked={props.value === true}
            onCheckedChange={(checked) => props.onChange(checked === true ? true : null)}
          />
        </div>
      );
    default:
      return (
        <Input
          className="h-8 min-w-0"
          value={stringValue}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      );
  }
};

const VariableInput = (props: {
  value?: string;
  placeholder?: string;
  variables: IVariableOption[];
  multiline?: boolean;
  onChange: (value: string) => void;
}) => {
  const tr = usePanelTranslate();
  const value = props.value ?? '';
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  const focusEditorEnd = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  const focusEditorEndSoon = () => {
    requestAnimationFrame(() => requestAnimationFrame(focusEditorEnd));
  };
  const getCurrentValue = () => {
    if (hasVariableTextToken(value)) {
      const editor = editorRef.current;
      if (editor) return Array.from(editor.childNodes).map(readVariableTextNode).join('');
    }
    return textareaRef.current?.value ?? value;
  };
  const insertVariable = (variable: string) => {
    const currentValue = getCurrentValue();
    props.onChange(currentValue ? `${currentValue}${variable}` : variable);
    focusEditorEndSoon();
  };
  const replaceToken = (index: number, nextValue: string) => {
    props.onChange(
      splitVariableText(getCurrentValue())
        .map((token, tokenIndex) => (tokenIndex === index ? nextValue : token.value))
        .join('')
    );
  };
  const deleteToken = (index: number) => {
    props.onChange(
      splitVariableText(getCurrentValue())
        .filter((_, tokenIndex) => tokenIndex !== index)
        .map((token) => token.value)
        .join('')
    );
  };
  const syncContentEditable = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = Array.from(editor.childNodes).map(readVariableTextNode).join('');
    if (nextValue !== value) props.onChange(nextValue);
  };

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [value]);

  if (hasVariableTextToken(value)) {
    return (
      <div className="relative" data-no-pan="true">
        <div
          key={value}
          ref={editorRef}
          className="min-h-9 w-full overflow-hidden break-words rounded-md border border-input bg-background px-3 py-1.5 pr-10 text-sm leading-6 outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500/30"
          contentEditable
          role="textbox"
          aria-multiline={props.multiline}
          tabIndex={0}
          aria-label={props.placeholder ?? tr('placeholders.inputContent', 'Input content')}
          suppressContentEditableWarning
          onBlur={syncContentEditable}
          onKeyDown={(event) => {
            if (!props.multiline && event.key === 'Enter') event.preventDefault();
          }}
        >
          {splitVariableText(value).map((token, index) =>
            token.type === 'variable' ? (
              <InlineVariableToken
                key={`${token.value}-${index}`}
                value={token.value}
                variables={props.variables}
                onChange={(nextValue) => replaceToken(index, nextValue)}
                onDelete={() => deleteToken(index)}
              />
            ) : (
              <span key={`text-${index}`} className="whitespace-pre-wrap">
                {token.value}
              </span>
            )
          )}
        </div>
        {!value && (
          <div className="pointer-events-none absolute left-3 top-1.5 text-sm leading-6 text-muted-foreground">
            {props.placeholder}
          </div>
        )}
        <RuntimeVariablePicker
          variables={props.variables}
          onSelect={insertVariable}
          trigger={
            <Button
              className="absolute right-1.5 top-1.5 size-6 rounded-md border border-input bg-background p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              disabled={!props.variables.length}
              size="icon-xs"
              title={tr('actions.selectVariable', 'Select variable')}
              variant="ghost"
            >
              <Plus className="size-4" />
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="relative min-w-0" data-no-pan="true">
      <textarea
        ref={textareaRef}
        className="min-h-9 w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm leading-5 outline-none placeholder:text-muted-foreground focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500/30"
        rows={1}
        value={value}
        placeholder={props.placeholder}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          props.onChange(e.target.value);
          resizeTextarea(e.currentTarget);
        }}
        onKeyDown={(event) => {
          if (!props.multiline && event.key === 'Enter') event.preventDefault();
        }}
      />
      <RuntimeVariablePicker
        variables={props.variables}
        onSelect={insertVariable}
        trigger={
          <Button
            className="absolute right-1.5 top-1.5 size-6 rounded-md border border-input bg-background p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            disabled={!props.variables.length}
            size="icon-xs"
            title={tr('actions.selectVariable', 'Select variable')}
            variant="ghost"
          >
            <Plus className="size-4" />
          </Button>
        }
      />
    </div>
  );
};

const KeyValueEditor = (props: {
  value: unknown;
  keyPlaceholder: string;
  valuePlaceholder?: string;
  variables: IVariableOption[];
  onChange: (value: Record<string, unknown>) => void;
}) => {
  const tr = usePanelTranslate();
  const sourceRows = useMemo(() => recordToRows(props.value), [props.value]);
  const [rows, setRows] = useState(sourceRows);
  const sourceSignature = JSON.stringify(sourceRows);

  useEffect(() => {
    setRows(sourceRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature]);

  const updateRows = (nextRows: { key: string; value: string }[]) => {
    setRows(nextRows);
    props.onChange(rowsToRecord(nextRows));
  };
  const updateRow = (index: number, patch: Partial<{ key: string; value: string }>) => {
    updateRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-2" data-no-pan="true">
      {!rows.length && (
        <div className="text-xs text-muted-foreground">
          {tr('empty.addKeyValueHint', 'Click the add button to add key-value pairs')}
        </div>
      )}
      {rows.map((row, index) => (
        <div
          key={`${row.key}-${index}`}
          className="grid grid-cols-[minmax(120px,1fr)_minmax(0,1.2fr)_auto] gap-2"
        >
          <Input
            value={row.key}
            placeholder={props.keyPlaceholder}
            onChange={(e) => updateRow(index, { key: e.target.value })}
          />
          <ConditionValueInput
            value={row.value}
            variables={props.variables}
            placeholder={props.valuePlaceholder}
            onChange={(value) => updateRow(index, { value })}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => updateRows(rows.filter((_, rowIndex) => rowIndex !== index))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => updateRows([...rows, { key: '', value: '' }])}
      >
        <Plus className="size-4" />
        {tr('actions.add', 'Add')}
      </Button>
    </div>
  );
};

const FieldMappingEditor = (props: {
  value: unknown;
  fields: TableField[];
  variables: IVariableOption[];
  onChange: (value: Record<string, unknown>) => void;
}) => {
  const tr = usePanelTranslate();
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const valueRecord = isPlainRecord(props.value) ? props.value : {};
  const selectedFields = Object.keys(valueRecord).map((fieldId) => ({
    fieldId,
    field: props.fields.find((field) => field.id === fieldId),
  }));
  const remainingFields = props.fields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(valueRecord, field.id)
  );
  const updateField = (fieldId: string, value: string) => {
    props.onChange({ ...valueRecord, [fieldId]: value });
  };
  const removeField = (fieldId: string) => {
    props.onChange(
      Object.fromEntries(Object.entries(valueRecord).filter(([currentId]) => currentId !== fieldId))
    );
  };
  const getDescription = (field: TableField) => {
    switch (field.type) {
      case FieldType.SingleSelect:
        return tr(
          'fieldMapping.singleSelectTip',
          'Enter an option value. If it does not exist, it will be created automatically.'
        );
      case FieldType.MultipleSelect:
        return tr(
          'fieldMapping.multipleSelectTip',
          'Separate multiple option values with commas. If an option value does not exist, it will be created automatically.'
        );
      case FieldType.User:
      case FieldType.CreatedBy:
      case FieldType.LastModifiedBy:
        return tr(
          'fieldMapping.userTip',
          'You can write by user ID, username, or email. Separate multiple values with commas.'
        );
      case FieldType.Attachment:
        return tr(
          'fieldMapping.attachmentTip',
          'Use URLs to pass new attachments, separated by commas. You can also write the ID from an attachment cell, for example by selecting variable Field values -> Attachment field -> id. When using URLs, attachments are automatically appended and will not overwrite the whole cell.'
        );
      case FieldType.Link:
        return tr(
          'fieldMapping.linkTip',
          'Write by the id or title from a linked-record cell, for example by selecting variable Field values -> Link field -> id, or directly write the primary field value of the linked record. Separate multiple values with commas.'
        );
      default:
        return undefined;
    }
  };

  return (
    <div className="space-y-2" data-no-pan="true">
      {selectedFields.map(({ fieldId, field }) => {
        if (!field) {
          const invalidReason = tr(
            'fieldMapping.invalidReason',
            'Field error: this field may have been deleted. Remove this field and add it again.'
          );
          return (
            <div key={fieldId} className="group m-1 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="leading-8 text-red-500">
                  {tr('fieldMapping.invalidTitle', 'Field error')}
                </span>
                <Button
                  className="invisible mr-1 mt-1 group-hover:visible"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => removeField(fieldId)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="flex items-center text-red-500">
                <TriangleAlert className="size-4 shrink-0" />
                <span className="pl-1 text-xs leading-4">{invalidReason}</span>
              </div>
            </div>
          );
        }
        const disabledReason = getFieldWriteDisabledReason(field, tr);
        return (
          <div key={fieldId} className="group">
            <FieldBlock
              label={field.name}
              description={disabledReason ?? getDescription(field)}
              action={
                <Button
                  className="invisible group-hover:visible"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => removeField(fieldId)}
                >
                  <Trash2 className="size-4" />
                </Button>
              }
            >
              {disabledReason ? (
                <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {disabledReason}
                </div>
              ) : (
                <VariableInput
                  value={valueRecord[fieldId] === undefined ? '' : String(valueRecord[fieldId])}
                  variables={props.variables}
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateField(fieldId, value)}
                />
              )}
            </FieldBlock>
          </div>
        );
      })}
      <Popover open={fieldPickerOpen} onOpenChange={setFieldPickerOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" disabled={!remainingFields.length}>
            <Plus className="size-4" />
            {tr('actions.addField', 'Add field')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1" data-no-pan="true">
          <Command>
            <CommandInput
              placeholder={tr('placeholders.searchFields', 'Search fields...')}
              className="placeholder:text-sm"
            />
            <CommandEmpty>{tr('empty.noFieldsToAdd', 'No fields to add')}</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {remainingFields.map((field) => {
                  const disabledReason = getFieldWriteDisabledReason(field, tr);
                  return (
                    <CommandItem
                      key={field.id}
                      value={field.name || field.id}
                      disabled={Boolean(disabledReason)}
                      onSelect={() => {
                        if (disabledReason) return;
                        updateField(field.id, '');
                        setFieldPickerOpen(false);
                      }}
                    >
                      <FieldOptionContent field={field} disabledReason={disabledReason} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

type MailTransportDraft = {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  pass: string;
  sender: string;
  senderName: string;
};

const normalizeMailTransportDraft = (value: unknown): MailTransportDraft => {
  const config = isPlainRecord(value) ? value : {};
  const auth = isPlainRecord(config.auth) ? config.auth : {};
  return {
    host: typeof config.host === 'string' ? config.host : '',
    port: config.port === undefined || config.port === null ? '' : String(config.port),
    secure: Boolean(config.secure),
    user: typeof auth.user === 'string' ? auth.user : '',
    pass: typeof auth.pass === 'string' ? auth.pass : '',
    sender: typeof config.sender === 'string' ? config.sender : '',
    senderName: typeof config.senderName === 'string' ? config.senderName : '',
  };
};

const buildMailTransportConfig = (draft: MailTransportDraft) =>
  omitUndefined({
    host: draft.host.trim(),
    port: draft.port.trim() ? Number(draft.port) : undefined,
    secure: draft.secure,
    auth: {
      user: draft.user.trim(),
      pass: draft.pass,
    },
    sender: draft.sender.trim(),
    senderName: draft.senderName.trim(),
  });

const MailTransportConfigDialog = (props: {
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
}) => {
  const tr = usePanelTranslate();
  const [open, setOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [draft, setDraft] = useState<MailTransportDraft>(() =>
    normalizeMailTransportDraft(props.value)
  );
  const sourceSignature = JSON.stringify(props.value ?? {});

  useEffect(() => {
    if (!open) {
      setDraft(normalizeMailTransportDraft(props.value));
      setTestEmail('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature, open]);

  const updateDraft = (patch: Partial<MailTransportDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const handleConfirm = () => {
    props.onChange(buildMailTransportConfig(draft));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {tr('actions.addConfig', 'Add config')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogTitle>{tr('mailConfig.title', 'Email configuration')}</DialogTitle>
        <DialogDescription className="sr-only">
          {tr('mailConfig.description', 'Configure the SMTP service used by the send email node')}
        </DialogDescription>
        <div className="space-y-4">
          <FieldBlock
            label={tr('mailConfig.host', 'Server address')}
            description={tr(
              'mailConfig.hostDescription',
              'Enter the SMTP mail server address, for example smtp.example.com'
            )}
            required
          >
            <Input
              value={draft.host}
              placeholder={tr('mailConfig.hostPlaceholder', 'Enter server address')}
              onChange={(e) => updateDraft({ host: e.target.value })}
            />
          </FieldBlock>
          <FieldBlock label={tr('mailConfig.port', 'Port')} required>
            <Input
              type="number"
              value={draft.port}
              placeholder={tr('mailConfig.portPlaceholder', 'Enter port')}
              onChange={(e) => updateDraft({ port: e.target.value })}
            />
          </FieldBlock>
          <FieldBlock label="SSL/TLS">
            <Switch checked={draft.secure} onCheckedChange={(secure) => updateDraft({ secure })} />
          </FieldBlock>
          <FieldBlock label={tr('mailConfig.username', 'Username')} required>
            <Input
              value={draft.user}
              placeholder={tr('mailConfig.usernamePlaceholder', 'Enter username')}
              onChange={(e) => updateDraft({ user: e.target.value })}
            />
          </FieldBlock>
          <FieldBlock label={tr('mailConfig.password', 'Password')} required>
            <Input
              type="password"
              value={draft.pass}
              placeholder={tr('mailConfig.passwordPlaceholder', 'Enter password')}
              onChange={(e) => updateDraft({ pass: e.target.value })}
            />
          </FieldBlock>
          <FieldBlock label={tr('mailConfig.senderAddress', 'Sender address')} required>
            <Input
              value={draft.sender}
              placeholder={tr('mailConfig.senderAddressPlaceholder', 'Enter sender address')}
              onChange={(e) => updateDraft({ sender: e.target.value })}
            />
          </FieldBlock>
          <FieldBlock label={tr('mailConfig.senderName', 'Sender name')}>
            <Input
              value={draft.senderName}
              placeholder={tr('mailConfig.senderNamePlaceholder', 'Enter sender name')}
              onChange={(e) => updateDraft({ senderName: e.target.value })}
            />
          </FieldBlock>
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              value={testEmail}
              placeholder={tr('mailConfig.testEmailPlaceholder', 'Enter test email')}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <Button disabled={!testEmail.trim()} variant="outline">
              {tr('actions.send', 'Send')}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tr('actions.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleConfirm}>{tr('actions.confirm', 'Confirm')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FilterBuilder = (props: {
  value: unknown;
  fields: TableField[];
  variables: IVariableOption[];
  baseId: string;
  collaborators: CollaboratorOption[];
  allowVariables?: boolean;
  fitContent?: boolean;
  onChange: (value: Record<string, unknown>) => void;
}) => {
  const group = normalizeFilterGroup(props.value);
  const updateGroup = (nextGroup: FilterGroup) => props.onChange(buildFilter(nextGroup));
  const fields = props.fields.filter(isFilterableField);

  return (
    <div
      className={cn(props.fitContent ? 'w-max min-w-[414px]' : 'min-w-0 overflow-hidden')}
      data-no-pan="true"
    >
      <FilterGroupEditor
        allowVariables={props.allowVariables ?? true}
        group={group}
        fields={fields}
        variables={props.variables}
        baseId={props.baseId}
        collaborators={props.collaborators}
        fitContent={props.fitContent}
        onChange={updateGroup}
      />
    </div>
  );
};

const FilterGroupEditor = (props: {
  group: FilterGroup;
  fields: TableField[];
  variables: IVariableOption[];
  baseId: string;
  collaborators: CollaboratorOption[];
  allowVariables: boolean;
  fitContent?: boolean;
  nested?: boolean;
  onDelete?: () => void;
  onChange: (value: FilterGroup) => void;
}) => {
  const tr = usePanelTranslate();
  const updateItem = (index: number, item: FilterItem) => {
    props.onChange({
      ...props.group,
      filterSet: replaceItemAt(props.group.filterSet, index, item),
    });
  };
  const removeItem = (index: number) => {
    props.onChange({
      ...props.group,
      filterSet: removeItemAt(props.group.filterSet, index),
    });
  };
  const addRow = () => {
    const operator = getDefaultFilterOperator();
    props.onChange({
      ...props.group,
      filterSet: [
        ...props.group.filterSet,
        { fieldId: '', operator, value: getDefaultFilterValue(undefined, operator) },
      ],
    });
  };
  const addGroup = () => {
    props.onChange({
      ...props.group,
      filterSet: [
        ...props.group.filterSet,
        {
          conjunction: 'and',
          filterSet: [
            {
              fieldId: '',
              operator: getDefaultFilterOperator(),
              value: getDefaultFilterValue(undefined, getDefaultFilterOperator()),
            },
          ],
        },
      ],
    });
  };

  const header = (
    <div className="flex items-center">
      <Select
        value={props.group.conjunction || 'and'}
        onValueChange={(conjunction) => props.onChange({ ...props.group, conjunction })}
      >
        <SelectTrigger className="h-6 w-fit min-w-fit gap-0 border-0 !bg-transparent p-0 text-[13px] font-normal text-muted-foreground shadow-none hover:!bg-transparent hover:text-foreground focus:!bg-transparent focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:!bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="and">{tr('conditions.matchAll', 'Match all conditions')}</SelectItem>
          <SelectItem value="or">{tr('conditions.matchAny', 'Match any condition')}</SelectItem>
        </SelectContent>
      </Select>
      {props.nested && (
        <div className="ml-auto flex">
          <Button size="icon-xs" variant="ghost" onClick={addRow}>
            <Plus className="size-4" />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={props.onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
  const items = (
    <div className={cn('space-y-2', props.nested && 'mb-1')}>
      {props.group.filterSet.map((item, index) =>
        isFilterGroup(item) ? (
          <FilterGroupEditor
            key={`filter-group-${index}`}
            allowVariables={props.allowVariables}
            nested
            group={item}
            fields={props.fields}
            variables={props.variables}
            baseId={props.baseId}
            collaborators={props.collaborators}
            fitContent={props.fitContent}
            onChange={(value) => updateItem(index, value)}
            onDelete={() => removeItem(index)}
          />
        ) : (
          <FilterRowEditor
            key={`filter-row-${index}`}
            allowVariables={props.allowVariables}
            row={item}
            fields={props.fields}
            variables={props.variables}
            baseId={props.baseId}
            collaborators={props.collaborators}
            onChange={(value) => updateItem(index, value)}
            onDelete={() => removeItem(index)}
          />
        )
      )}
    </div>
  );
  const emptyText = !props.group.filterSet.length && (
    <div className="text-xs text-muted-foreground">
      {tr('empty.noFilterConditions', 'No filter conditions are applied')}
    </div>
  );
  const hasItems = props.group.filterSet.length > 0;

  if (props.nested) {
    return (
      <div
        className={cn(
          'space-y-2 rounded-lg border border-input bg-muted px-3 py-2',
          props.fitContent ? 'w-max min-w-[414px]' : 'min-w-0'
        )}
        data-no-pan="true"
      >
        {header}
        {items}
        {emptyText}
      </div>
    );
  }

  return (
    <div
      className={cn('space-y-2', props.fitContent ? 'w-max min-w-[414px]' : 'min-w-0')}
      data-no-pan="true"
    >
      {hasItems ? (
        props.fitContent ? (
          <div className="w-max min-w-[414px] pb-2">
            {header}
            {items}
          </div>
        ) : (
          <div className="min-w-0 overflow-x-auto pb-2">
            <div className="w-max min-w-full">
              {header}
              {items}
            </div>
          </div>
        )
      ) : (
        emptyText
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={addRow}>
          <Plus className="size-4" />
          {tr('actions.addCondition', 'Add condition')}
        </Button>
        <Button size="sm" variant="outline" onClick={addGroup}>
          <Plus className="size-4" />
          {tr('actions.addConditionGroup', 'Add condition group')}
        </Button>
      </div>
    </div>
  );
};

const FilterRowEditor = (props: {
  row: FilterRow;
  fields: TableField[];
  variables: IVariableOption[];
  baseId: string;
  collaborators: CollaboratorOption[];
  allowVariables: boolean;
  onChange: (value: FilterRow) => void;
  onDelete: () => void;
}) => {
  const tr = usePanelTranslate();
  const selectedField = props.fields.find((field) => field.id === props.row.fieldId);
  const operators = getRecordFilterOperatorsByField(selectedField);
  const operatorValue = operators.some((operator) => operator.value === props.row.operator)
    ? props.row.operator
    : operators[0]?.value ?? 'is';
  const operator = operators.find((item) => item.value === operatorValue);
  const update = (patch: Partial<FilterRow>) => props.onChange({ ...props.row, ...patch });
  const updateField = (fieldId: string) => {
    const field = props.fields.find((item) => item.id === fieldId);
    const nextOperator = getDefaultFilterOperator(field);
    update({
      fieldId,
      operator: nextOperator,
      value: getDefaultFilterValue(field, nextOperator),
    });
  };
  const updateOperator = (nextOperator: string) => {
    update({
      operator: nextOperator,
      value: getDefaultFilterValue(selectedField, nextOperator),
    });
  };

  return (
    <div className="flex w-full items-start">
      <div className="flex items-center gap-2 self-center rounded-md">
        <FieldSelect
          fields={props.fields}
          value={props.row.fieldId}
          placeholder={tr('placeholders.selectField', 'Select field')}
          showEmptyOption={false}
          triggerClassName="h-8 w-[156px] shrink-0 gap-0 pr-1"
          onChange={updateField}
        />
        <RecordFilterOperatorSelect
          value={operatorValue}
          operators={operators}
          disabled={getFieldValueKind(selectedField) === 'checkbox'}
          triggerClassName="h-8 w-[88px] shrink-0 gap-0 pr-1.5"
          onChange={updateOperator}
        />
        {operator?.needsValue !== false && (
          <div
            className={cn(
              'shrink-0',
              getFieldValueKind(selectedField) === 'date' ? 'w-max' : 'w-40'
            )}
          >
            <FieldValueInput
              field={selectedField}
              value={props.row.value}
              variables={props.variables}
              allowVariables={props.allowVariables}
              operator={operatorValue}
              baseId={props.baseId}
              collaborators={props.collaborators}
              placeholder={tr('placeholders.input', 'Enter')}
              onChange={(value) => update({ value })}
            />
          </div>
        )}
        <Button className="size-8 shrink-0" size="icon-xs" variant="ghost" onClick={props.onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
};

const RuntimeConditionBuilder = (props: {
  value: unknown;
  variables: IVariableOption[];
  baseId: string;
  collaborators: CollaboratorOption[];
  fitContent?: boolean;
  onChange: (value: Record<string, unknown>) => void;
}) => {
  const group = normalizeRuntimeConditionGroup(props.value);
  const updateGroup = (nextGroup: RuntimeConditionGroup) =>
    props.onChange(buildRuntimeCondition(nextGroup));

  return (
    <div className={cn(props.fitContent ? 'w-max min-w-[688px]' : 'min-w-0')} data-no-pan="true">
      <RuntimeConditionGroupEditor
        group={group}
        variables={props.variables}
        baseId={props.baseId}
        collaborators={props.collaborators}
        fitContent={props.fitContent}
        onChange={updateGroup}
      />
    </div>
  );
};

const RuntimeConditionGroupEditor = (props: {
  group: RuntimeConditionGroup;
  variables: IVariableOption[];
  baseId: string;
  collaborators: CollaboratorOption[];
  nested?: boolean;
  fitContent?: boolean;
  onChange: (value: RuntimeConditionGroup) => void;
}) => {
  const tr = usePanelTranslate();
  const updateItem = (index: number, item: RuntimeConditionItem) => {
    const filterSet = props.group.filterSet.slice();
    filterSet[index] = item;
    props.onChange({
      ...props.group,
      filterSet,
    });
  };
  const removeItem = (index: number) => {
    const filterSet = props.group.filterSet.slice();
    filterSet.splice(index, 1);
    props.onChange({
      ...props.group,
      filterSet,
    });
  };
  const addRow = () => {
    props.onChange({
      ...props.group,
      filterSet: [...props.group.filterSet, { left: '', operator: 'contains', value: '' }],
    });
  };
  const addGroup = () => {
    props.onChange({
      ...props.group,
      filterSet: [
        ...props.group.filterSet,
        { conjunction: 'and', filterSet: [{ left: '', operator: 'contains', value: '' }] },
      ],
    });
  };

  const header = (
    <div className="flex items-center gap-2">
      <Select
        value={props.group.conjunction || 'and'}
        onValueChange={(conjunction) => props.onChange({ ...props.group, conjunction })}
      >
        <SelectTrigger className="h-6 w-fit min-w-fit gap-0 border-0 !bg-transparent p-0 text-[13px] font-normal text-muted-foreground shadow-none hover:!bg-transparent hover:text-foreground focus:!bg-transparent focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:!bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="and">{tr('conditions.matchAll', 'Match all conditions')}</SelectItem>
          <SelectItem value="or">{tr('conditions.matchAny', 'Match any condition')}</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex-1" />
      <Button
        size="icon-xs"
        title={tr('actions.addCondition', 'Add condition')}
        variant="ghost"
        onClick={addRow}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
  const items = (
    <div className="space-y-2">
      {props.group.filterSet.map((item, index) =>
        isRuntimeConditionGroup(item) ? (
          <div key={`group-${index}`} className="grid grid-cols-[1fr_auto] gap-2">
            <RuntimeConditionGroupEditor
              nested
              fitContent={props.fitContent}
              group={item}
              variables={props.variables}
              baseId={props.baseId}
              collaborators={props.collaborators}
              onChange={(value) => updateItem(index, value)}
            />
            <Button size="icon-xs" variant="ghost" onClick={() => removeItem(index)}>
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <RuntimeConditionRowEditor
            key={`row-${index}`}
            row={item}
            variables={props.variables}
            baseId={props.baseId}
            collaborators={props.collaborators}
            onChange={(value) => updateItem(index, value)}
            onDelete={() => removeItem(index)}
          />
        )
      )}
    </div>
  );
  const emptyText = !props.group.filterSet.length && (
    <div className="text-xs text-muted-foreground">
      {tr('empty.noFilterConditions', 'No filter conditions are applied')}
    </div>
  );
  const addButtons = (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={addRow}>
        <Plus className="size-4" />
        {tr('actions.addCondition', 'Add condition')}
      </Button>
      {!props.nested && (
        <Button size="sm" variant="outline" onClick={addGroup}>
          <Plus className="size-4" />
          {tr('actions.addConditionGroup', 'Add condition group')}
        </Button>
      )}
    </div>
  );

  if (props.nested) {
    return (
      <div
        className={cn(
          'space-y-2 rounded-md border bg-muted/20 p-2',
          props.fitContent ? 'w-max min-w-[688px]' : 'min-w-0'
        )}
      >
        {header}
        {items}
        {emptyText}
        {addButtons}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', props.fitContent ? 'w-max min-w-[688px]' : 'min-w-0')}>
      {props.group.filterSet.length ? (
        props.fitContent ? (
          <div className="w-max min-w-[688px] pb-2">
            {header}
            {items}
          </div>
        ) : (
          <div className="min-w-0 overflow-x-auto pb-2">
            <div className="w-max min-w-full">
              {header}
              {items}
            </div>
          </div>
        )
      ) : (
        emptyText
      )}
      {addButtons}
    </div>
  );
};

const RuntimeConditionRowEditor = (props: {
  row: RuntimeConditionRow;
  variables: IVariableOption[];
  baseId: string;
  collaborators: CollaboratorOption[];
  onChange: (value: RuntimeConditionRow) => void;
  onDelete: () => void;
}) => {
  const tr = usePanelTranslate();
  const conditionVariables = props.variables.filter(isRuntimeConditionVariable);
  const selectedVariable =
    getVariableOption(conditionVariables, props.row.left) ??
    getVariableOption(props.variables, props.row.left);
  const selectedField = selectedVariable?.field;
  const selectedKind = getVariableValueKind(selectedVariable);
  const operators = selectedVariable
    ? getRecordFilterOperatorsByKind(selectedKind, selectedField)
    : [];
  const operator = operators.find((item) => item.value === props.row.operator);
  const operatorValue = operators.some((item) => item.value === props.row.operator)
    ? props.row.operator
    : '';
  const valueIsVariable =
    typeof props.row.value === 'string' && parseVariableExpression(props.row.value);
  const [valueMode, setValueMode] = useState<'static' | 'variable'>(
    valueIsVariable ? 'variable' : 'static'
  );
  const valueWidth = selectedKind === 'date' ? 'w-max' : selectedVariable ? 'w-40' : 'w-[132px]';
  const update = (patch: Partial<RuntimeConditionRow>) =>
    props.onChange({ ...props.row, ...patch });
  useEffect(() => {
    if (valueIsVariable) {
      setValueMode('variable');
    }
  }, [valueIsVariable]);
  const updateLeft = (left: string) => {
    const nextOption = getVariableOption(props.variables, left);
    const nextKind = getVariableValueKind(nextOption);
    const nextOperator = getDefaultRuntimeOperator(nextKind, nextOption?.field);
    setValueMode('static');
    update({
      left,
      operator: nextOperator,
      value: getDefaultFilterValueByKind(nextKind, nextOperator),
    });
  };
  const updateOperator = (nextOperator: string) => {
    setValueMode('static');
    update({
      operator: nextOperator,
      value: getDefaultFilterValueByKind(selectedKind, nextOperator),
    });
  };
  const needsValue = !operatorValue || operator?.needsValue !== false;
  const updateStaticValue = () => {
    setValueMode('static');
    update({ value: getDefaultFilterValueByKind(selectedKind, operatorValue || 'is') });
  };
  const updateVariableValue = (value: string) => {
    setValueMode('variable');
    update({ value });
  };
  const switchToVariableValue = () => {
    setValueMode('variable');
    update({ value: '' });
  };

  return (
    <div className="flex w-full items-start">
      <div className="flex items-center gap-1.5 self-center rounded-md">
        <RuntimeVariableSelectButton
          className="h-8 !w-[112px]"
          value={props.row.left}
          variables={conditionVariables}
          placeholder={tr('variablePicker.selectData', 'Select data')}
          onChange={updateLeft}
        />
        {selectedVariable && (
          <RecordFilterOperatorSelect
            allowEmpty
            value={operatorValue}
            operators={operators}
            disabled={selectedKind === 'checkbox'}
            triggerClassName="h-8 w-[88px] shrink-0 gap-0 pr-1.5"
            onChange={updateOperator}
          />
        )}
        {!selectedVariable && (
          <span className="w-10 shrink-0 text-center text-sm text-foreground">
            {tr('operators.contains', 'Contains')}
          </span>
        )}
        {needsValue && (
          <div className={cn('shrink-0', valueWidth)}>
            <RuntimeConditionValueInput
              field={selectedField}
              kind={selectedKind}
              value={props.row.value}
              variables={props.variables}
              operator={operatorValue || 'is'}
              baseId={props.baseId}
              collaborators={props.collaborators}
              placeholder={tr('placeholders.input', 'Enter')}
              variableMode={valueMode === 'variable'}
              onChange={(value) => update({ value })}
            />
          </div>
        )}
        {needsValue && (
          <ValueModePopover
            deferVariablePicker
            variables={props.variables}
            onStatic={updateStaticValue}
            onVariable={updateVariableValue}
            onVariableMode={switchToVariableValue}
          />
        )}
        <Button className="size-8 shrink-0" size="icon-xs" variant="ghost" onClick={props.onDelete}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
};

const WatchFieldEditor = (props: {
  value: unknown;
  fields: TableField[];
  placeholder?: string;
  emptyText?: string | false;
  onChange: (value: string[]) => void;
}) => {
  const tr = usePanelTranslate();
  const selected = Array.isArray(props.value)
    ? props.value.filter((item): item is string => typeof item === 'string')
    : [];
  const remaining = props.fields.filter((field) => !selected.includes(field.id));
  const selectedFields = selected.map(
    (fieldId) => props.fields.find((field) => field.id === fieldId)?.name ?? fieldId
  );
  const selectedLabel = selectedFields.join('、');

  return (
    <div className="space-y-2" data-no-pan="true">
      <Select
        value={EMPTY_SELECT_VALUE}
        onValueChange={(fieldId) => {
          const nextFieldId = fromOptionValue(fieldId);
          if (nextFieldId) props.onChange([...selected, nextFieldId]);
        }}
      >
        <SelectTrigger>
          <span className={cn('truncate', !selectedLabel && 'text-muted-foreground')}>
            {selectedLabel || props.placeholder || tr('actions.addField', 'Add field')}
          </span>
        </SelectTrigger>
        <SelectContent>
          {remaining.length ? (
            remaining.map((field) => (
              <SelectItem key={field.id} value={field.id}>
                {field.name || field.id}
              </SelectItem>
            ))
          ) : (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {tr('empty.noResults', 'No results found')}
            </div>
          )}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-2">
        {selected.map((fieldId) => {
          const field = props.fields.find((item) => item.id === fieldId);
          return (
            <Badge key={fieldId} className="gap-1" variant="secondary">
              {field?.name ?? fieldId}
              <button
                type="button"
                onClick={() => props.onChange(selected.filter((item) => item !== fieldId))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          );
        })}
      </div>
      {!selected.length && props.emptyText !== false && (
        <div className="text-xs text-muted-foreground">
          {props.emptyText ??
            tr(
              'descriptions.watchAllFields',
              'When none are selected, all fields will be watched.'
            )}
        </div>
      )}
    </div>
  );
};

const copyResultJson = async (value: unknown, tr?: PanelTranslate) => {
  const text = JSON.stringify(value, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    sonner.toast.success(panelText(tr, 'toast.copySuccess', 'Copied successfully'));
  } catch {
    sonner.toast(panelText(tr, 'toast.copyFailed', 'Copy failed'));
  }
};

const ResultRawBlock = (props: { value: unknown }) => {
  const tr = usePanelTranslate();
  return (
    <div className="relative bg-muted/40">
      <Button
        className="absolute right-2 top-2"
        size="icon-xs"
        title={tr('actions.copy', 'Copy')}
        variant="ghost"
        onClick={() => copyResultJson(props.value, tr)}
      >
        <Copy className="size-4" />
      </Button>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-4 pr-10 text-xs leading-relaxed">
        {JSON.stringify(props.value, null, 2)}
      </pre>
    </div>
  );
};

const ResultDataRow = (props: { row: TestResultRow; level?: number }) => {
  const hasDetail = Boolean(props.row.children?.length || props.row.raw !== undefined);
  const [open, setOpen] = useState(Boolean(props.row.defaultOpen));
  const paddingLeft = 16 + (props.level ?? 0) * 16;

  return (
    <div className="divide-y">
      <button
        className={cn(
          'flex w-full select-text items-center px-4 py-2 text-left text-xs hover:bg-secondary',
          !hasDetail && 'cursor-auto'
        )}
        style={{ paddingLeft }}
        type="button"
        onClick={() => hasDetail && setOpen((current) => !current)}
      >
        <span className="flex min-w-0 grow gap-2">
          <span className="shrink-0 font-semibold">{props.row.label}</span>
          {props.row.value && (
            <span className="line-clamp-3 break-all text-muted-foreground">{props.row.value}</span>
          )}
        </span>
        {hasDetail &&
          (open ? <ChevronDown className="size-3" /> : <TeableChevronRight className="size-3" />)}
      </button>
      {open && props.row.children?.length
        ? props.row.children.map((child) => (
            <ResultDataRow
              key={`${props.row.label}-${child.label}`}
              row={child}
              level={(props.level ?? 0) + 1}
            />
          ))
        : null}
      {open && props.row.raw !== undefined && <ResultRawBlock value={props.row.raw} />}
    </div>
  );
};

const ResultSection = (props: { title: string; rows: TestResultRow[] }) => (
  <div className="space-y-2 py-1">
    <h3 className="text-sm font-bold">{props.title}</h3>
    <div className="divide-y rounded-md border">
      {props.rows.map((row) => (
        <ResultDataRow key={row.label} row={row} />
      ))}
    </div>
  </div>
);

const WorkflowRunStepDetail = (props: {
  baseId: string;
  fields: TableField[];
  node?: IWorkflowNode;
  runStartedTime: string;
  step: WorkflowRunStep;
  tables: { id: string; name: string }[];
}) => {
  const tr = usePanelTranslate();
  const [open, setOpen] = useState(false);
  const statusMeta = getRunStatusMeta(props.step.status, tr);
  const nodeLabel = props.node ? getNodeLabel(props.node, tr) : props.step.type;

  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex w-full items-center gap-2 p-4 text-left text-sm font-medium hover:bg-muted"
        onClick={() => setOpen((current) => !current)}
      >
        <NodePlainIcon type={props.step.type} />
        <span className="min-w-0 flex-1 truncate">{nodeLabel}</span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-2 text-[13px]',
            statusMeta.className
          )}
        >
          <statusMeta.Icon className="size-4" />
          {statusMeta.label}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90'
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 text-xs">
          <div className="space-y-2">
            <div
              className={cn(
                'flex flex-row items-start gap-2 rounded-md border bg-muted px-4 py-3 text-sm',
                statusMeta.className
              )}
            >
              <statusMeta.Icon className="size-4" />
              <span>
                {props.step.status === 'success'
                  ? tr('runStatus.runSuccessful', 'Run successful')
                  : statusMeta.label}
              </span>
            </div>
            <div className="space-x-1 text-xs text-muted-foreground">
              <span>{tr('resultLabels.ranAt', 'Ran at')}</span>
              <span>{formatRelativeTime(props.runStartedTime, tr)}</span>
            </div>
            <div className="space-x-1 text-xs text-muted-foreground">
              <span>{tr('resultLabels.duration', 'Duration')}</span>
              <span>{formatDuration(props.step.spent)}</span>
            </div>
            {props.step.error && (
              <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                {props.step.error}
              </div>
            )}
            <ResultSection
              title={tr('resultLabels.input', 'Input')}
              rows={getRunStepInputRows(props.step, props.node, props.tables, props.fields, tr)}
            />
            <ResultSection
              title={tr('resultLabels.output', 'Output')}
              rows={getRunStepOutputRows(props.step, props.node, props.baseId, props.fields, tr)}
            />
            <ResultSection
              title={tr('resultLabels.callDetails', 'Call details')}
              rows={getRunStepCallRows(props.step, props.node, tr)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const NodePickerButton = (props: { item: INodeCatalogItem; onClick: () => void }) => {
  const tr = usePanelTranslate();
  return (
    <button
      className="flex w-full select-none items-center gap-2 rounded-md p-2 text-left hover:bg-accent"
      type="button"
      onClick={props.onClick}
    >
      <NodeIconBadge type={props.item.type} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{getNodeItemLabel(props.item, tr)}</div>
        <div className="truncate text-xs text-muted-foreground">
          {getNodeItemDescription(props.item, tr)}
        </div>
      </div>
    </button>
  );
};

const AddNodePopover = (props: {
  onSelect: (item: INodeCatalogItem) => void;
  disabled?: boolean;
}) => {
  const tr = usePanelTranslate();
  const [open, setOpen] = useState(false);
  const groups = [
    { title: tr('nodeGroups.actions', 'Actions'), items: ACTION_NODES },
    { title: tr('nodeGroups.logic', 'Logic'), items: LOGIC_NODES },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="size-7 shrink-0 !rounded-full border bg-background p-0 shadow-sm"
          disabled={props.disabled}
          size="icon-xs"
          variant="outline"
        >
          <Plus className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-2">
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.title} className="space-y-1">
              <div className="px-2 text-xs text-muted-foreground">{group.title}</div>
              {group.items.map((item) => (
                <NodePickerButton
                  key={item.type}
                  item={item}
                  onClick={() => {
                    props.onSelect(item);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const WorkFlowPanel = forwardRef<WorkFlowPanelRef, WorkFlowPanelProps>((props, ref) => {
  const { baseId, workflowId, headLeft } = props;
  const { t } = useTranslation('common');
  const tr = usePanelTranslate();
  const queryClient = useQueryClient();
  const [workflowName, setWorkflowName] = useState('');
  const [nodes, setNodes] = useState<IWorkflowNode[]>([]);
  const [edges, setEdges] = useState<IWorkflowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [nodeTestResults, setNodeTestResults] = useState<Record<string, NodeTestResult>>({});
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [isRunHistoryOpen, setIsRunHistoryOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string>();
  const [runStatusFilter, setRunStatusFilter] = useState('all');
  const [runDurationFilter, setRunDurationFilter] = useState('all');
  const [runDateRange, setRunDateRange] = useState<IDateRangeValue | null>(null);
  const [isRunOverviewOpen, setIsRunOverviewOpen] = useState(true);
  const [nodeDescriptionDraft, setNodeDescriptionDraft] = useState('');
  const workflowNameInputRef = useRef<HTMLInputElement>(null);
  const loadedWorkflowIdRef = useRef<string>();
  const lastSavedDraftSignatureRef = useRef('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const panStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);

  const { data: workflow, isLoading } = useQuery({
    queryKey: workflowQueryKey(baseId, workflowId),
    queryFn: () => getWorkflow(baseId, workflowId).then((res) => res.data),
    enabled: Boolean(baseId && workflowId),
  });

  const { data: tables = [] } = useQuery({
    queryKey: ReactQueryKeys.tableList(baseId),
    queryFn: () => getTableList(baseId).then((res) => res.data),
    enabled: Boolean(baseId),
  });

  const { data: bases = [] } = useQuery({
    queryKey: ['workflow-base-all'],
    queryFn: () => getBaseAll().then((res) => res.data),
  });

  const runListParams = useMemo<IWorkflowRunListRo>(() => {
    const params: IWorkflowRunListRo = {
      skip: 0,
      take: RUN_HISTORY_TAKE,
    };
    if (runStatusFilter !== 'all') {
      params.status = runStatusFilter as IWorkflowRunListRo['status'];
    }
    if (runDurationFilter !== 'all') {
      params.duration = runDurationFilter;
    }
    return {
      ...params,
      ...getRunDateRangeParams(runDateRange),
    };
  }, [runDateRange, runDurationFilter, runStatusFilter]);

  const { data: runList, refetch: refetchRuns } = useQuery({
    queryKey: workflowRunQueryKey(baseId, workflowId, runListParams),
    queryFn: () => listWorkflowRuns(baseId, workflowId, runListParams).then((res) => res.data),
    enabled: Boolean(baseId && workflowId && isRunHistoryOpen),
  });

  const { data: runSummary, refetch: refetchRunSummary } = useQuery({
    queryKey: workflowRunSummaryQueryKey(baseId, workflowId),
    queryFn: () => getWorkflowRunSummary(baseId, workflowId).then((res) => res.data),
    enabled: Boolean(baseId && workflowId && isRunHistoryOpen),
  });

  const { data: collaborators = [] } = useQuery({
    queryKey: ['workflow-base-collaborators', baseId],
    queryFn: () =>
      getUserCollaborators(baseId, {
        includeSystem: true,
        skip: 0,
        take: 100,
      }).then((res) =>
        res.data.users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
        }))
      ),
    enabled: Boolean(baseId),
  });

  useEffect(() => {
    if (!workflow) return;
    if (loadedWorkflowIdRef.current === workflow.id) return;
    const nextName = workflow.name ?? t('noun.automation');
    const nextNodes = workflow.nodes ?? [];
    const nextEdges = workflow.edges ?? [];
    loadedWorkflowIdRef.current = workflow.id;
    lastSavedDraftSignatureRef.current = getWorkflowDraftSignature(nextName, nextNodes, nextEdges);
    setWorkflowName(nextName);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId(nextNodes[0]?.id);
    setNodeTestResults(
      Object.fromEntries(
        nextNodes
          .map((node) => [node.id, getValidNodeTestResult(node, {})] as const)
          .filter((item): item is readonly [string, NodeTestResult] => Boolean(item[1]))
      )
    );
  }, [workflow, t]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId]
  );
  useEffect(() => {
    setNodeDescriptionDraft(
      typeof selectedNode?.config?.note === 'string' ? selectedNode.config.note : ''
    );
  }, [selectedNode?.config?.note, selectedNode?.id]);

  const selectedConfigExternalBaseValue =
    typeof selectedNode?.config?.externalBaseId === 'string'
      ? selectedNode.config.externalBaseId
      : undefined;
  const selectedExternalBaseId = selectedConfigExternalBaseValue || undefined;
  const shouldLoadExternalTables = Boolean(
    selectedExternalBaseId && selectedExternalBaseId !== baseId
  );

  const { data: externalTables = [] } = useQuery({
    queryKey: selectedExternalBaseId
      ? ReactQueryKeys.tableList(selectedExternalBaseId)
      : ['workflow-external-tables', 'empty'],
    queryFn: () => getTableList(selectedExternalBaseId!).then((res) => res.data),
    enabled: shouldLoadExternalTables,
  });

  const configTables = shouldLoadExternalTables ? externalTables : tables;
  const knownTables = useMemo(() => {
    const tableMap = new Map(tables.map((table) => [table.id, table]));
    externalTables.forEach((table) => tableMap.set(table.id, table));
    return Array.from(tableMap.values());
  }, [externalTables, tables]);

  const firstTableId = tables[0]?.id;
  const triggerTableId = useMemo(() => {
    const trigger = nodes.find((node) => node.category === 'trigger');
    return typeof trigger?.config?.tableId === 'string' ? trigger.config.tableId : undefined;
  }, [nodes]);
  const selectedConfigTableId =
    typeof selectedNode?.config?.tableId === 'string' ? selectedNode.config.tableId : undefined;

  const { data: triggerFields = [] } = useQuery({
    queryKey: triggerTableId
      ? ReactQueryKeys.fieldList(triggerTableId)
      : ['workflow-trigger-fields', 'empty'],
    queryFn: () => getFields(triggerTableId!).then((res) => res.data.map(toTableField)),
    enabled: Boolean(triggerTableId),
  });

  const { data: selectedTableFields = [] } = useQuery({
    queryKey: selectedConfigTableId
      ? ReactQueryKeys.fieldList(selectedConfigTableId)
      : ['workflow-selected-fields', 'empty'],
    queryFn: () => getFields(selectedConfigTableId!).then((res) => res.data.map(toTableField)),
    enabled: Boolean(selectedConfigTableId),
  });

  const configFields =
    selectedConfigTableId && selectedConfigTableId === triggerTableId
      ? triggerFields
      : selectedTableFields;
  const workflowFields = useMemo(() => {
    const fieldMap = new Map<string, TableField>();
    [...triggerFields, ...selectedTableFields].forEach((field) => fieldMap.set(field.id, field));
    return Array.from(fieldMap.values());
  }, [selectedTableFields, triggerFields]);
  const buttonFields = useMemo(
    () => configFields.filter((field) => field.type === FieldType.Button),
    [configFields]
  );

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const graphNodeOrder = useMemo(() => buildGraphNodeOrder(nodes, edges), [edges, nodes]);
  const graphNodeIndexMap = useMemo(
    () => new Map(graphNodeOrder.map((node, index) => [node.id, index])),
    [graphNodeOrder]
  );

  const upstreamNodes = useMemo(
    () => getUpstreamNodes(selectedNode?.id, edges, graphNodeOrder),
    [edges, graphNodeOrder, selectedNode?.id]
  );
  const variableOptions = useMemo(
    () => buildVariableOptions(upstreamNodes, triggerFields, nodeTestResults, tr),
    [nodeTestResults, tr, triggerFields, upstreamNodes]
  );
  const collaboratorById = useMemo(
    () => new Map(collaborators.map((collaborator) => [collaborator.id, collaborator])),
    [collaborators]
  );
  const lastModifiedUserId = workflow?.lastModifiedBy ?? workflow?.activeBy ?? undefined;
  const lastModifiedUser = lastModifiedUserId
    ? collaboratorById.get(lastModifiedUserId)
    : undefined;
  const lastModifiedUserName =
    lastModifiedUser?.name ||
    lastModifiedUser?.email ||
    lastModifiedUserId ||
    tr('runHistory.lastModifiedUserFallback', 'the person who last updated this automation');

  const savedWorkflowName = workflowName.trim() || t('noun.automation');
  const workflowSignature = useMemo(
    () => getWorkflowRuntimeSignature(nodes, edges),
    [edges, nodes]
  );
  const activeRuntimeSignature = useMemo(
    () => getWorkflowActiveRuntimeSignature(workflow),
    [workflow]
  );
  const draftSignature = useMemo(
    () => getWorkflowDraftSignature(savedWorkflowName, nodes, edges),
    [edges, nodes, savedWorkflowName]
  );
  const workflowValidation = useMemo(() => validateWorkflow(nodes, tr), [nodes, tr]);
  const hasPassedAllNodeTests =
    Boolean(nodes.length) && nodes.every((node) => getValidNodeTestResult(node, nodeTestResults));
  const getNodeStatus = useCallback(
    (node: IWorkflowNode) => getWorkflowNodeEditStatus(node, nodeTestResults, tr),
    [nodeTestResults, tr]
  );
  const updateWorkflowBaseNodeCache = useCallback(
    (data: IWorkflowVo) => {
      queryClient.setQueryData<IBaseNodeTreeVo>(ReactQueryKeys.baseNodeTree(baseId), (current) => {
        if (!current) return current;
        return {
          ...current,
          nodes: current.nodes.map((node) =>
            node.resourceType === BaseNodeResourceType.Workflow && node.resourceId === workflowId
              ? {
                  ...node,
                  resourceMeta: {
                    ...node.resourceMeta,
                    name: data.name ?? t('noun.automation'),
                    isActive: Boolean(data.isActive),
                  },
                }
              : node
          ),
        };
      });
    },
    [baseId, queryClient, t, workflowId]
  );

  const saveDraft = useCallback(
    async (options?: {
      silent?: boolean;
      name?: string;
      nodes?: IWorkflowNode[];
      edges?: IWorkflowEdge[];
    }) => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setIsSaving(true);
      const nameToSave = options?.name ?? savedWorkflowName;
      const nodesToSave = options?.nodes ?? nodes;
      const edgesToSave = options?.edges ?? edges;
      try {
        const res = await updateWorkflow(baseId, workflowId, {
          name: nameToSave,
          nodes: nodesToSave,
          edges: edgesToSave,
        });
        queryClient.setQueryData(workflowQueryKey(baseId, workflowId), res.data);
        updateWorkflowBaseNodeCache(res.data);
        lastSavedDraftSignatureRef.current = getWorkflowDraftSignature(
          nameToSave,
          nodesToSave,
          edgesToSave
        );
        if (!options?.silent) {
          sonner.toast(t('actions.saveSucceed'));
        }
        return res.data;
      } finally {
        setIsSaving(false);
      }
    },
    [
      baseId,
      edges,
      nodes,
      queryClient,
      savedWorkflowName,
      t,
      updateWorkflowBaseNodeCache,
      workflowId,
    ]
  );

  useEffect(() => {
    if (!workflow || loadedWorkflowIdRef.current !== workflow.id) return;
    if (draftSignature === lastSavedDraftSignatureRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void saveDraft({ silent: true });
    }, 800);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [draftSignature, saveDraft, workflow]);

  const activeMutation = useMutation({
    mutationFn: async (params: {
      method: 'activate' | 'deactivate' | 'discard';
      successMessage: string;
    }) => {
      if (params.method === 'discard' && autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (params.method === 'activate') {
        await saveDraft({ silent: true });
      }
      return updateWorkflowActive(baseId, workflowId, { method: params.method }).then(
        (res) => res.data
      );
    },
    onSuccess: (data, params) => {
      queryClient.setQueryData(workflowQueryKey(baseId, workflowId), data);
      updateWorkflowBaseNodeCache(data);
      queryClient.invalidateQueries({ queryKey: ReactQueryKeys.baseNodeTree(baseId) });
      if (params.method === 'discard') {
        const nextName = data.name ?? t('noun.automation');
        const nextNodes = data.nodes ?? [];
        const nextEdges = data.edges ?? [];
        lastSavedDraftSignatureRef.current = getWorkflowDraftSignature(
          nextName,
          nextNodes,
          nextEdges
        );
        setWorkflowName(nextName);
        setNodes(nextNodes);
        setEdges(nextEdges);
        setSelectedNodeId((current) =>
          nextNodes.some((node) => node.id === current) ? current : nextNodes[0]?.id
        );
        setNodeTestResults(
          Object.fromEntries(
            nextNodes
              .map((node) => [node.id, getValidNodeTestResult(node, {})] as const)
              .filter((item): item is readonly [string, NodeTestResult] => Boolean(item[1]))
          )
        );
      }
      sonner.toast(params.successMessage);
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const signature = workflowSignature;
      await saveDraft({ silent: true });
      const data = await testWorkflow(baseId, workflowId).then((res) => res.data);
      return { data, signature };
    },
    onSuccess: ({ data }) => {
      if (data.status !== 'success') {
        refetchRuns();
        refetchRunSummary();
        sonner.toast(data.error || tr('toast.testRunFailed', 'Test run failed'));
        return;
      }
      const nextResults = Object.fromEntries(
        nodes.map((node) => [
          node.id,
          {
            signature: getNodeSignature(node),
            testedAt: new Date().toISOString(),
            node: cloneWorkflowNode(node),
          },
        ])
      );
      const nextNodes = nodes.map((node) => ({
        ...node,
        testResult: nextResults[node.id],
      }));
      setNodeTestResults(nextResults);
      setNodes(nextNodes);
      void saveDraft({ silent: true, nodes: nextNodes });
      refetchRuns();
      refetchRunSummary();
      sonner.toast(tr('toast.testRunCompleted', 'Test run completed'));
    },
  });

  const checkCanActive = useCallback(() => {
    if (!workflowValidation.canRun) {
      return {
        canActive: false,
        message: workflowValidation.message,
      };
    }
    const expiredNode = nodes.find(
      (node) => getNodeTestResultState(node, nodeTestResults) === 'expired'
    );
    if (expiredNode) {
      return {
        canActive: false,
        message: tr(
          'validation.nodeTestExpired',
          'The test result for "{{node}}" has expired. Run the test step again.',
          {
            node: getNodeLabel(expiredNode, tr),
          }
        ),
      };
    }
    if (!hasPassedAllNodeTests) {
      return {
        canActive: false,
        message: tr('validation.completeAllNodeTests', 'Complete tests for all nodes first'),
      };
    }
    return { canActive: true, message: '' };
  }, [hasPassedAllNodeTests, nodeTestResults, nodes, tr, workflowValidation]);

  const handleActivate = useCallback(async () => {
    const check = checkCanActive();
    if (!check.canActive) {
      sonner.toast(check.message);
      return;
    }
    await activeMutation.mutateAsync({
      method: 'activate',
      successMessage: tr('toast.automationActivated', 'Automation enabled'),
    });
  }, [activeMutation, checkCanActive, tr]);

  const handlePublish = useCallback(async () => {
    const check = checkCanActive();
    if (!check.canActive) {
      sonner.toast(check.message);
      return;
    }
    await activeMutation.mutateAsync({
      method: 'activate',
      successMessage: tr('toast.automationUpdated', 'Automation updated'),
    });
  }, [activeMutation, checkCanActive, tr]);

  const handleDiscardDraft = useCallback(async () => {
    await activeMutation.mutateAsync({
      method: 'discard',
      successMessage: tr('toast.resetToPublished', 'Reset to published version'),
    });
  }, [activeMutation, tr]);

  const handleActiveToggle = useCallback(
    async (checked: boolean) => {
      if (checked) {
        await handleActivate();
        return;
      }
      await activeMutation.mutateAsync({
        method: 'deactivate',
        successMessage: tr('toast.automationDeactivated', 'Automation disabled'),
      });
    },
    [activeMutation, handleActivate, tr]
  );

  const handleTest = useCallback(() => {
    if (!workflowValidation.canRun) {
      sonner.toast(workflowValidation.message);
      return;
    }
    testMutation.mutate();
  }, [testMutation, workflowValidation]);

  const handleTestSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    if (!isWorkflowNodeComplete(selectedNode)) {
      sonner.toast(
        tr(
          'validation.completeCurrentNode',
          'Complete required configuration for the current node first'
        )
      );
      return;
    }
    const result = {
      signature: getNodeSignature(selectedNode),
      testedAt: new Date().toISOString(),
      node: cloneWorkflowNode(selectedNode),
    };
    const nextNodes = nodes.map((node) =>
      node.id === selectedNode.id ? { ...node, testResult: result } : node
    );
    setNodeTestResults((current) => ({ ...current, [selectedNode.id]: result }));
    setNodes(nextNodes);
    void saveDraft({ silent: true, nodes: nextNodes });
    sonner.toast(tr('toast.testStepCompleted', 'Test step completed'));
  }, [nodes, saveDraft, selectedNode, tr]);

  const copyNodeId = useCallback(
    async (nodeId: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(nodeId);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = nodeId;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        sonner.toast.success(tr('toast.copySuccess', 'Copied successfully'));
      } catch {
        sonner.toast(tr('toast.copyNodeIdFailed', 'Failed to copy node ID'));
      }
    },
    [tr]
  );

  useImperativeHandle(
    ref,
    () => ({
      getWorkflow: () => ({
        ...(workflow ?? {}),
        name: workflowName,
        nodes,
        edges,
      }),
      checkCanActive,
      activeWorkflow: handleActivate,
    }),
    [checkCanActive, edges, handleActivate, nodes, workflow, workflowName]
  );

  const updateNode = (nodeId: string, patch: Partial<IWorkflowNode>) => {
    setNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
    );
  };

  const updateNodeConfig = (key: string, value: unknown) => {
    if (!selectedNode) return;
    updateNode(selectedNode.id, {
      config: omitUndefined({
        ...(selectedNode.config ?? {}),
        [key]: value,
      }),
    });
  };

  const updateConditionConfig = (value: Record<string, unknown>, nestedKey?: 'filter') => {
    if (!selectedNode) return;
    if (nestedKey) {
      updateNodeConfig(
        nestedKey,
        omitUndefined({
          ...((selectedNode.config?.[nestedKey] as Record<string, unknown>) ?? {}),
          ...value,
        })
      );
      return;
    }
    updateNode(selectedNode.id, {
      config: omitUndefined({
        ...(selectedNode.config ?? {}),
        ...value,
      }),
    });
  };

  const changeSelectedTriggerType = (type: string) => {
    if (!selectedNode || selectedNode.category !== 'trigger') return;
    const item = TRIGGER_NODE_MAP[type];
    if (!item) return;
    updateNode(selectedNode.id, {
      type: item.type,
      name: getNodeItemLabel(item, tr),
      description: getNodeItemDescription(item, tr),
      config: getDefaultConfig(item.type),
    });
  };

  const changeSelectedActionType = (type: string) => {
    if (!selectedNode || selectedNode.category !== 'action') return;
    const item = ACTION_NODE_MAP[type];
    if (!item) return;
    const currentTableId =
      typeof selectedNode.config?.tableId === 'string' ? selectedNode.config.tableId : firstTableId;
    updateNode(selectedNode.id, {
      type: item.type,
      name: getNodeItemLabel(item, tr),
      description: getNodeItemDescription(item, tr),
      config: getDefaultConfig(item.type, currentTableId),
    });
  };

  const updateSelectedTable = (tableId: string) => {
    if (!selectedNode) return;
    const nextConfig: Record<string, unknown> = {
      ...(selectedNode.config ?? {}),
      tableId,
    };
    if (selectedNode.type === 'formSubmitted') {
      nextConfig.viewId = '';
    }
    if (['buttonClick', 'recordUpdated'].includes(selectedNode.type)) {
      nextConfig.watchFieldIds = [];
    }
    if (
      [
        'buttonClick',
        'recordCreated',
        'recordCreatedOrUpdated',
        'recordMatchesConditions',
      ].includes(selectedNode.type)
    ) {
      nextConfig.filter = { conjunction: 'and', filterSet: [] };
    }
    updateNode(selectedNode.id, { config: omitUndefined(nextConfig) });
  };

  const updateSelectedExternalBase = (externalBaseId: string) => {
    if (!selectedNode) return;
    const nextConfig: Record<string, unknown> = {
      ...(selectedNode.config ?? {}),
      externalBaseId,
      tableId: '',
    };
    if (selectedNode.type === 'formSubmitted') {
      nextConfig.viewId = '';
    }
    if (['buttonClick', 'recordUpdated'].includes(selectedNode.type)) {
      nextConfig.watchFieldIds = [];
    }
    if (
      [
        'buttonClick',
        'recordCreated',
        'recordCreatedOrUpdated',
        'recordMatchesConditions',
      ].includes(selectedNode.type)
    ) {
      nextConfig.filter = { conjunction: 'and', filterSet: [] };
    }
    updateNode(selectedNode.id, { config: omitUndefined(nextConfig) });
  };

  const addNode = (item: INodeCatalogItem, parentNodeId?: string, sourceHandle?: string) => {
    const node: IWorkflowNode = {
      id: newNodeId(item.category),
      type: item.type,
      category: item.category,
      name: getNodeItemLabel(item, tr),
      config: getDefaultConfig(item.type, item.category === 'trigger' ? undefined : firstTableId),
      createdTime: new Date().toISOString(),
    };

    let nextNodes = [...nodes, node];
    let nextEdges = edges;

    if (item.category === 'trigger') {
      const triggerIds = nodes
        .filter((current) => current.category === 'trigger')
        .map((current) => current.id);
      const firstChild =
        graphNodeOrder.find((current) => current.category !== 'trigger') ??
        nodes.find((current) => current.category !== 'trigger');

      nextNodes = [node, ...nodes.filter((current) => current.category !== 'trigger')];
      nextEdges = edges.filter(
        (edge) => !triggerIds.includes(edge.source) && !triggerIds.includes(edge.target)
      );
      if (firstChild) {
        nextEdges = [{ source: node.id, target: firstChild.id }, ...nextEdges];
      }
    } else {
      const parent =
        nodes.find((current) => current.id === parentNodeId) ??
        selectedNode ??
        graphNodeOrder[graphNodeOrder.length - 1];
      if (parent) {
        const outgoingEdges = edges.filter(
          (edge) =>
            edge.source === parent.id &&
            (parent.type === 'condition' ? edgeMatchesHandle(edge, sourceHandle) : true)
        );
        nextEdges = [
          ...edges.filter((edge) => !outgoingEdges.includes(edge)),
          { source: parent.id, target: node.id, sourceHandle },
          ...outgoingEdges.map((edge) => ({
            source: node.id,
            target: edge.target,
            targetHandle: edge.targetHandle,
          })),
        ];
      }
    }

    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId(node.id);
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    const incomingEdges = edges.filter((edge) => edge.target === selectedNode.id);
    const outgoingEdges = edges.filter((edge) => edge.source === selectedNode.id);
    const nextNodes = nodes.filter((node) => node.id !== selectedNode.id);
    const reconnectedEdges =
      selectedNode.category === 'trigger'
        ? []
        : incomingEdges.flatMap((incoming) =>
            outgoingEdges.map((outgoing) => ({
              source: incoming.source,
              target: outgoing.target,
              sourceHandle: incoming.sourceHandle,
              targetHandle: outgoing.targetHandle,
            }))
          );

    const nextEdges = [
      ...edges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id),
      ...reconnectedEdges.filter((edge) => edge.source !== edge.target),
    ].filter(
      (edge, index, list) =>
        list.findIndex(
          (item) =>
            item.source === edge.source &&
            item.target === edge.target &&
            item.sourceHandle === edge.sourceHandle &&
            item.targetHandle === edge.targetHandle
        ) === index
    );

    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId(incomingEdges[0]?.source ?? outgoingEdges[0]?.target ?? nextNodes[0]?.id);
  };

  const renderConditionEditor = (nestedKey?: 'filter', required?: boolean) => {
    const config = nestedKey
      ? (selectedNode?.config?.[nestedKey] as Record<string, unknown>) ?? {}
      : selectedNode?.config ?? {};
    const update = (value: Record<string, unknown>) => updateConditionConfig(value, nestedKey);
    const renderEditor = (fitContent?: boolean) =>
      nestedKey ? (
        <FilterBuilder
          allowVariables={selectedNode?.category !== 'trigger'}
          value={config}
          fields={configFields}
          variables={variableOptions}
          baseId={baseId}
          collaborators={collaborators}
          fitContent={fitContent}
          onChange={update}
        />
      ) : (
        <RuntimeConditionBuilder
          value={config}
          variables={variableOptions}
          baseId={baseId}
          collaborators={collaborators}
          fitContent={fitContent}
          onChange={(value) =>
            update({
              ...value,
              fieldId: undefined,
              left: undefined,
              operator: undefined,
              right: undefined,
              value: undefined,
            })
          }
        />
      );
    const expandAction = (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            title={tr('actions.expandConditionEditor', 'Expand condition editor')}
          >
            <Maximize2 className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="!w-fit min-w-[464px] !max-w-[calc(100vw-2rem)] overflow-x-visible p-6">
          <DialogTitle className="sr-only">{tr('conditions.edit', 'Edit condition')}</DialogTitle>
          <div className="w-max" data-no-pan="true">
            {renderEditor(true)}
          </div>
        </DialogContent>
      </Dialog>
    );

    return (
      <FieldBlock
        label={tr('resultLabels.condition', 'Condition')}
        required={required}
        action={expandAction}
      >
        {renderEditor()}
      </FieldBlock>
    );
  };

  // Keep node configuration rendering centralized until each node type is split out.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  const renderNodeConfig = () => {
    if (!selectedNode) {
      return null;
    }

    const config = selectedNode.config ?? {};
    const selectedNodeResult = getAnyNodeTestResult(selectedNode, nodeTestResults);
    const selectedNodeResultState = getNodeTestResultState(selectedNode, nodeTestResults);
    const selectedNodeResultIsCurrent = selectedNodeResultState === 'current';
    const resultNode = selectedNodeResult?.node ?? selectedNode;
    const isTableNode = [
      'buttonClick',
      'recordCreated',
      'recordUpdated',
      'recordCreatedOrUpdated',
      'recordMatchesConditions',
      'formSubmitted',
      'createRecord',
      'getRecords',
      'updateRecord',
    ].includes(selectedNode.type);
    const hasCrossDatabaseConfig = Object.prototype.hasOwnProperty.call(config, 'externalBaseId');
    const hasLoopConfig = Object.prototype.hasOwnProperty.call(config, 'loopSource');
    const showGenericLoopConfig =
      hasLoopConfig &&
      selectedNode.category === 'action' &&
      !['createRecord', 'updateRecord'].includes(selectedNode.type);

    return (
      <div className="space-y-4">
        {selectedNode.category === 'trigger' && (
          <FieldBlock label={tr('fields.triggerType', 'Trigger type')} required>
            <Select value={selectedNode.type} onValueChange={changeSelectedTriggerType}>
              <SelectTrigger>
                <NodeTypeSelectValue item={getNodeCatalogItem(selectedNode.type)} />
              </SelectTrigger>
              <SelectContent className="w-[392px] p-0">
                <NodeTypeSelectGroup
                  title={tr('nodeGroups.triggers', 'Triggers')}
                  items={TRIGGER_NODES}
                  value={selectedNode.type}
                />
              </SelectContent>
            </Select>
            <div className="text-xs leading-relaxed text-muted-foreground">
              {getNodeDescription(selectedNode, tr)}
            </div>
          </FieldBlock>
        )}

        {selectedNode.category === 'action' && (
          <FieldBlock label={tr('fields.actionType', 'Action type')} required>
            <Select value={selectedNode.type} onValueChange={changeSelectedActionType}>
              <SelectTrigger>
                <NodeTypeSelectValue item={getNodeCatalogItem(selectedNode.type)} />
              </SelectTrigger>
              <SelectContent className="w-[392px] p-0">
                <NodeTypeSelectGroup
                  title={tr('nodeGroups.manualBuild', 'Manual build')}
                  items={ACTION_NODES}
                  value={selectedNode.type}
                />
              </SelectContent>
            </Select>
            <div className="text-xs leading-relaxed text-muted-foreground">
              {getNodeDescription(selectedNode, tr)}
            </div>
          </FieldBlock>
        )}

        {selectedNode.category === 'action' && (
          <PanelSection title={tr('sections.label', 'Label')}>
            <FieldBlock label={tr('fields.description', 'Description')}>
              <Input
                value={nodeDescriptionDraft}
                placeholder={tr('placeholders.inputDescription', 'Enter description')}
                onBlur={(e) => updateNodeConfig('note', e.currentTarget.value)}
                onChange={(e) => setNodeDescriptionDraft(e.target.value)}
              />
            </FieldBlock>
          </PanelSection>
        )}

        <PanelSection title={tr('sections.config', 'Configuration')}>
          {isTableNode && selectedNode.category === 'action' && hasCrossDatabaseConfig && (
            <CrossDatabaseAccessConfig
              bases={bases}
              value={String(config.externalBaseId ?? '')}
              onChange={updateSelectedExternalBase}
              onCancel={() => updateNodeConfig('externalBaseId', undefined)}
            />
          )}

          {isTableNode && (
            <FieldBlock
              label={tr('resultLabels.table', 'Table')}
              required
              action={
                selectedNode.category === 'action' && !hasCrossDatabaseConfig ? (
                  <Button
                    className="h-7 px-2 text-xs font-normal"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => updateNodeConfig('externalBaseId', '')}
                  >
                    {tr('actions.crossDatabaseAccess', 'Cross-database access')}
                  </Button>
                ) : undefined
              }
            >
              <TableSelect
                tables={configTables}
                value={String(config.tableId ?? '')}
                onChange={updateSelectedTable}
              />
            </FieldBlock>
          )}

          {showGenericLoopConfig && (
            <LoopConfigBlock
              value={String(config.loopSource ?? '')}
              variables={variableOptions}
              onChange={(value) => updateNodeConfig('loopSource', value)}
              onCancel={() => updateNodeConfig('loopSource', undefined)}
            />
          )}

          {selectedNode.type === 'buttonClick' && selectedConfigTableId && (
            <>
              {renderConditionEditor('filter')}
              <FieldBlock
                label={tr('fields.watchFields', 'Watch fields')}
                description={tr('descriptions.selectButtonField', 'Select a button field')}
                required
              >
                <WatchFieldEditor
                  fields={buttonFields}
                  value={config.watchFieldIds}
                  placeholder={tr('actions.addField', 'Add field')}
                  emptyText={
                    buttonFields.length
                      ? false
                      : tr('empty.noButtonFields', 'The current table has no button fields.')
                  }
                  onChange={(watchFieldIds) => updateNodeConfig('watchFieldIds', watchFieldIds)}
                />
              </FieldBlock>
            </>
          )}

          {selectedNode.type === 'recordUpdated' && selectedConfigTableId && (
            <FieldBlock
              label={tr('fields.watchFields', 'Watch fields')}
              description={tr(
                'descriptions.watchFields',
                'Updates to selected fields will trigger the automation. When all fields are watched, newly created fields will also be watched.'
              )}
              required
            >
              <WatchFieldEditor
                fields={configFields}
                value={config.watchFieldIds}
                placeholder={tr('actions.addField', 'Add field')}
                onChange={(watchFieldIds) => updateNodeConfig('watchFieldIds', watchFieldIds)}
              />
            </FieldBlock>
          )}

          {['recordCreated', 'recordCreatedOrUpdated'].includes(selectedNode.type) &&
            selectedConfigTableId &&
            renderConditionEditor('filter')}

          {selectedNode.type === 'recordMatchesConditions' &&
            selectedConfigTableId &&
            renderConditionEditor('filter', true)}

          {selectedNode.type === 'formSubmitted' && selectedConfigTableId && (
            <FieldBlock label={tr('fields.form', 'Form')} required>
              <ViewSelect
                tableId={selectedConfigTableId}
                typeFilter={ViewType.Form}
                value={String(config.viewId ?? '') || null}
                onChange={(viewId) => updateNodeConfig('viewId', viewId ?? '')}
                selectPlaceholder={tr('placeholders.select', 'Select...')}
                className="my-0 h-9 w-full max-w-none"
              />
            </FieldBlock>
          )}

          {selectedNode.type === 'createRecord' && (
            <>
              {hasLoopConfig && (
                <LoopConfigBlock
                  value={String(config.loopSource ?? '')}
                  variables={variableOptions}
                  onChange={(value) => updateNodeConfig('loopSource', value)}
                  onCancel={() => updateNodeConfig('loopSource', undefined)}
                />
              )}
              <FieldBlock
                label={tr('resultLabels.fields', 'Fields')}
                required
                action={
                  !hasLoopConfig ? (
                    <LoopButton onClick={() => updateNodeConfig('loopSource', '')} />
                  ) : undefined
                }
              >
                <FieldMappingEditor
                  value={config.fields}
                  fields={configFields}
                  variables={variableOptions}
                  onChange={(value) => updateNodeConfig('fields', value)}
                />
              </FieldBlock>
            </>
          )}

          {selectedNode.type === 'getRecords' && (
            <>
              <FieldBlock label={tr('fields.findRecordsBy', 'Find records by')} required>
                <Select
                  value={getFindMode(config)}
                  onValueChange={(findMode) => {
                    updateNode(selectedNode.id, {
                      config: omitUndefined({
                        ...(selectedNode.config ?? {}),
                        findMode,
                        viewId: findMode === 'view' ? selectedNode.config?.viewId : '',
                        filter:
                          findMode === 'condition'
                            ? selectedNode.config?.filter ?? { conjunction: 'and', filterSet: [] }
                            : undefined,
                      }),
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tr('placeholders.select', 'Select...')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="condition">
                      {tr('resultLabels.condition', 'Condition')}
                    </SelectItem>
                    <SelectItem value="view">{tr('resultLabels.view', 'View')}</SelectItem>
                  </SelectContent>
                </Select>
              </FieldBlock>
              {getFindMode(config) === 'view' && selectedConfigTableId && (
                <FieldBlock label={tr('resultLabels.view', 'View')} required>
                  <ViewSelect
                    tableId={selectedConfigTableId}
                    value={String(config.viewId ?? '') || null}
                    onChange={(viewId) => updateNodeConfig('viewId', viewId ?? '')}
                    className="my-0 h-9 w-full max-w-none"
                  />
                </FieldBlock>
              )}
              {getFindMode(config) === 'condition' && (
                <FieldBlock label={tr('resultLabels.condition', 'Condition')}>
                  <FilterBuilder
                    value={config.filter}
                    fields={configFields}
                    variables={variableOptions}
                    baseId={baseId}
                    collaborators={collaborators}
                    onChange={(value) => updateNodeConfig('filter', value)}
                  />
                </FieldBlock>
              )}
              <FieldBlock label={tr('fields.skip', 'Skip')}>
                <VariableInput
                  value={String(config.skip ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('skip', value)}
                />
              </FieldBlock>
              <FieldBlock
                label={tr('fields.queryLimit', 'Query limit')}
                description={tr(
                  'descriptions.queryLimit',
                  'Each query returns up to 1000 records.'
                )}
              >
                <VariableInput
                  value={String(config.take ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('take', value)}
                />
              </FieldBlock>
            </>
          )}

          {selectedNode.type === 'updateRecord' && (
            <>
              {hasLoopConfig && (
                <LoopConfigBlock
                  value={String(config.loopSource ?? '')}
                  variables={variableOptions}
                  onChange={(value) => updateNodeConfig('loopSource', value)}
                  onCancel={() => updateNodeConfig('loopSource', undefined)}
                />
              )}
              <FieldBlock
                label={tr('resultLabels.recordId', 'Record ID')}
                description={tr(
                  'descriptions.recordId',
                  'The ID of the record to update. To update a record from a previous step, use the + menu to select the step and its record ID.'
                )}
                required
                action={
                  !hasLoopConfig ? (
                    <LoopButton onClick={() => updateNodeConfig('loopSource', '')} />
                  ) : undefined
                }
              >
                <VariableInput
                  value={String(config.recordId ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('recordId', value)}
                />
              </FieldBlock>
              <FieldBlock
                label={tr('resultLabels.fields', 'Fields')}
                required
                action={
                  !hasLoopConfig ? (
                    <LoopButton onClick={() => updateNodeConfig('loopSource', '')} />
                  ) : undefined
                }
              >
                <FieldMappingEditor
                  value={config.fields}
                  fields={configFields}
                  variables={variableOptions}
                  onChange={(value) => updateNodeConfig('fields', value)}
                />
              </FieldBlock>
            </>
          )}

          {selectedNode.type === 'sendEmail' && (
            <>
              <FieldBlock label={tr('fields.customMailServer', 'Custom mail server')}>
                <div className="flex flex-wrap gap-2">
                  <MailTransportConfigDialog
                    value={config.mailTransportConfig}
                    onChange={(value) => updateNodeConfig('mailTransportConfig', value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateNodeConfig('mailTransportConfig', undefined)}
                  >
                    {tr('actions.reset', 'Reset')}
                  </Button>
                </div>
              </FieldBlock>
              <FieldBlock
                label={tr('fields.recipients', 'Recipients')}
                required
                action={
                  !hasLoopConfig ? (
                    <LoopButton onClick={() => updateNodeConfig('loopSource', '')} />
                  ) : undefined
                }
              >
                <VariableInput
                  value={String(config.to ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('to', value)}
                />
              </FieldBlock>
              <FieldBlock label={tr('fields.cc', 'Cc')}>
                <VariableInput
                  value={String(config.cc ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('cc', value)}
                />
              </FieldBlock>
              <FieldBlock label={tr('fields.bcc', 'Bcc')}>
                <VariableInput
                  value={String(config.bcc ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('bcc', value)}
                />
              </FieldBlock>
              <FieldBlock label={tr('fields.senderName', 'Sender name')}>
                <VariableInput
                  value={String(config.senderName ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('senderName', value)}
                />
              </FieldBlock>
              <FieldBlock label={tr('fields.replyTo', 'Reply-to email')}>
                <VariableInput
                  value={String(config.replyTo ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('replyTo', value)}
                />
              </FieldBlock>
              <FieldBlock label={tr('fields.subject', 'Subject')} required>
                <VariableInput
                  value={String(config.subject ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('subject', value)}
                />
              </FieldBlock>
              <FieldBlock
                label={tr('fields.body', 'Body')}
                required
                action={
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="h-7 px-2 text-xs font-normal" size="sm" variant="outline">
                        {tr('actions.edit', 'Edit')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogTitle>{tr('fields.editBody', 'Edit body')}</DialogTitle>
                      <VariableInput
                        value={String(config.body ?? '')}
                        variables={variableOptions}
                        multiline
                        placeholder={tr(
                          'placeholders.inputOrSelectVariable',
                          'Input / select variable'
                        )}
                        onChange={(value) => updateNodeConfig('body', value)}
                      />
                    </DialogContent>
                  </Dialog>
                }
              >
                <VariableInput
                  value={String(config.body ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('body', value)}
                />
              </FieldBlock>
            </>
          )}

          {selectedNode.type === 'httpRequest' && (
            <>
              <FieldBlock
                label={tr('fields.requestMethod', 'Request method')}
                required
                action={
                  !hasLoopConfig ? (
                    <LoopButton onClick={() => updateNodeConfig('loopSource', '')} />
                  ) : undefined
                }
              >
                <MethodSelect
                  value={String(config.method ?? '')}
                  onChange={(method) => updateNodeConfig('method', method)}
                />
              </FieldBlock>
              <FieldBlock label={tr('fields.requestUrl', 'Request URL')} required>
                <VariableInput
                  value={String(config.url ?? '')}
                  variables={variableOptions}
                  multiline
                  placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                  onChange={(value) => updateNodeConfig('url', value)}
                />
              </FieldBlock>
              <FieldBlock label={tr('fields.requestHeaders', 'Request headers')}>
                <KeyValueEditor
                  value={config.headers}
                  keyPlaceholder="Header"
                  valuePlaceholder={tr('fields.value', 'Value')}
                  variables={variableOptions}
                  onChange={(value) => updateNodeConfig('headers', value)}
                />
              </FieldBlock>
              <FieldBlock label="Body">
                <BodyTypeSelect
                  value={String(config.bodyType ?? 'none')}
                  onChange={(bodyType) => updateNodeConfig('bodyType', bodyType)}
                />
              </FieldBlock>
              {String(config.bodyType ?? 'none') !== 'none' && (
                <FieldBlock label={tr('fields.requestBody', 'Request body')}>
                  <VariableInput
                    value={String(config.body ?? '')}
                    variables={variableOptions}
                    multiline
                    placeholder={tr(
                      'placeholders.inputOrSelectVariable',
                      'Input / select variable'
                    )}
                    onChange={(value) => updateNodeConfig('body', value)}
                  />
                </FieldBlock>
              )}
            </>
          )}

          {selectedNode.type === 'condition' && renderConditionEditor()}
        </PanelSection>

        <PanelSection title={tr('sections.testStep', 'Test step')}>
          <div className="text-xs leading-relaxed text-muted-foreground">
            {tr(
              'descriptions.testStep',
              'Test this step to confirm its configuration is correct. After a successful test, this step can enable automation.'
            )}
          </div>
          {selectedNode.type === 'sendEmail' && (
            <FieldBlock label={tr('fields.unsubscribeList', 'Unsubscribe list')}>
              <Input
                placeholder={tr('placeholders.inputOrSelectVariable', 'Input / select variable')}
                disabled
              />
            </FieldBlock>
          )}
          <div className="flex justify-end gap-2">
            {selectedNode.type === 'sendEmail' && (
              <Button
                size="sm"
                variant="outline"
                disabled={!isWorkflowNodeComplete(selectedNode)}
                onClick={handleTestSelectedNode}
              >
                {tr('actions.generatePreview', 'Generate preview')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!isWorkflowNodeComplete(selectedNode)}
              onClick={handleTestSelectedNode}
            >
              <Play className="size-4" />
              {selectedNode.type === 'sendEmail'
                ? tr('actions.runWithConfig', 'Run with config')
                : tr('actions.runTest', 'Run test')}
            </Button>
          </div>
        </PanelSection>

        {selectedNodeResult && (
          <PanelSection title={tr('sections.result', 'Result')}>
            <div className="space-y-3 text-xs">
              {!selectedNodeResultIsCurrent && (
                <div className="rounded-md border border-yellow-300 bg-yellow-50 px-2 py-1 text-center text-sm text-yellow-600">
                  {tr(
                    'nodeStatus.testExpired',
                    'The test result has expired. Run the test step again.'
                  )}
                </div>
              )}
              <div className="flex flex-row items-start gap-2 rounded-md border bg-muted px-4 py-3 text-sm text-emerald-600">
                <CheckCircle2 className="mt-1 size-4 shrink-0" />
                {tr('runStatus.runSuccessful', 'Run successful')}
              </div>
              <div className="space-x-1 text-xs text-muted-foreground">
                <span>{tr('resultLabels.ranAt', 'Ran at')}</span>
                <span>{formatRelativeTime(selectedNodeResult.testedAt, tr)}</span>
              </div>
              <ResultSection
                title={tr('resultLabels.input', 'Input')}
                rows={buildTestInputRows(resultNode, knownTables, configFields, tr)}
              />
              <ResultSection
                title={tr('resultLabels.output', 'Output')}
                rows={buildTestOutputRows(resultNode, knownTables, configFields, baseId, tr)}
              />
            </div>
          </PanelSection>
        )}
      </div>
    );
  };

  const renderTriggerPicker = () => (
    <div className="w-72 rounded-lg border bg-background p-4 shadow-sm">
      <div className="mb-3 text-sm text-muted-foreground">
        {tr('canvas.selectTrigger', 'Select a trigger:')}
      </div>
      <div className="space-y-1">
        {TRIGGER_NODES.map((item) => (
          <NodePickerButton key={item.type} item={item} onClick={() => addNode(item)} />
        ))}
      </div>
    </div>
  );

  const renderWorkflowNode = (node: IWorkflowNode, index: number) => {
    const status = getNodeStatus(node);
    const StatusIcon = status.Icon;
    const nodeTableName = knownTables.find((table) => table.id === node.config?.tableId)?.name;
    const nodeDescription = (() => {
      const customDescription =
        typeof node.config?.note === 'string' ? node.config.note.trim() : '';
      if (customDescription) return customDescription;
      if (!nodeTableName) return getNodeDescription(node, tr);
      switch (node.type) {
        case 'recordCreated':
          return tr(
            'canvas.nodeDescriptions.recordCreatedWithTable',
            'When a record is created in {{table}}',
            {
              table: nodeTableName,
            }
          );
        case 'recordUpdated':
          return tr(
            'canvas.nodeDescriptions.recordUpdatedWithTable',
            'When a record in {{table}} is updated',
            {
              table: nodeTableName,
            }
          );
        case 'recordCreatedOrUpdated':
          return tr(
            'canvas.nodeDescriptions.recordCreatedOrUpdatedWithTable',
            'When a record in {{table}} is created or updated',
            { table: nodeTableName }
          );
        case 'recordMatchesConditions':
          return tr(
            'canvas.nodeDescriptions.recordMatchesConditionsWithTable',
            'When a record in {{table}} matches conditions',
            {
              table: nodeTableName,
            }
          );
        case 'buttonClick':
          return tr(
            'canvas.nodeDescriptions.buttonClickWithTable',
            'When a button in {{table}} is clicked',
            {
              table: nodeTableName,
            }
          );
        case 'formSubmitted':
          return tr(
            'canvas.nodeDescriptions.formSubmittedWithTable',
            'When a form in {{table}} is submitted',
            {
              table: nodeTableName,
            }
          );
        case 'createRecord':
          return tr(
            'canvas.nodeDescriptions.createRecordWithTable',
            'Create a new record in {{table}}.',
            {
              table: nodeTableName,
            }
          );
        case 'updateRecord':
          return tr(
            'canvas.nodeDescriptions.updateRecordWithTable',
            'Update a record in {{table}}.',
            {
              table: nodeTableName,
            }
          );
        case 'getRecords':
          return tr('canvas.nodeDescriptions.getRecordsWithTable', 'Get records from {{table}}.', {
            table: nodeTableName,
          });
        default:
          return getNodeDescription(node, tr);
      }
    })();
    const categoryLabel =
      node.category === 'trigger'
        ? tr('nodeGroups.trigger', 'Trigger')
        : node.category === 'logic'
          ? tr('nodeGroups.logicDecision', 'Logic decision')
          : tr('nodeGroups.action', 'Action');
    const categoryClassName =
      node.category === 'trigger'
        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
        : node.category === 'logic'
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300';
    return (
      <button
        className={cn(
          'flex h-[90px] w-[370px] max-w-full select-none items-center gap-3 rounded-lg border bg-background p-4 text-left shadow-sm transition hover:border-primary/60 hover:shadow-md',
          selectedNodeId === node.id && 'border-blue-500 shadow-md ring-1 ring-blue-500/40'
        )}
        type="button"
        onClick={() => setSelectedNodeId(node.id)}
      >
        <NodeIconBadge className="size-10" iconClassName="size-5" type={node.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
          <div className="truncate text-sm font-medium leading-5">
            {index + 1}. {getNodeLabel(node, tr)}
          </div>
          <div className="line-clamp-2 break-all text-xs font-normal leading-4 text-muted-foreground">
            {nodeDescription}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-center">
          <Badge className={cn('shrink-0 border font-normal', categoryClassName)} variant="outline">
            {categoryLabel}
          </Badge>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center"
                  aria-label={status.label}
                >
                  <StatusIcon className={cn('size-4', status.iconClassName)} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{status.label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </button>
    );
  };

  const renderNodeConnector = (node: IWorkflowNode, sourceHandle?: string) => (
    <div className="flex h-16 flex-col items-center">
      <div className="h-5 w-px bg-border" />
      <AddNodePopover onSelect={(item) => addNode(item, node.id, sourceHandle)} />
      <div className="h-5 w-px bg-border" />
    </div>
  );

  const renderEndMarker = () => (
    <div
      className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm"
      title={tr('canvas.end', 'End')}
    >
      <Minus className="size-4" />
    </div>
  );

  const renderConditionBranch = (
    node: IWorkflowNode,
    sourceHandle: string,
    visited: Set<string>
  ) => {
    const edge = edges.find(
      (item) => item.source === node.id && edgeMatchesHandle(item, sourceHandle)
    );
    const nextNode = edge ? nodeById.get(edge.target) : undefined;
    return (
      <div
        className="relative flex min-w-[440px] flex-col items-center"
        style={{ width: CONDITION_BRANCH_WIDTH }}
      >
        {renderNodeConnector(node, sourceHandle)}
        {nextNode && renderNodeFlow(nextNode, visited, { showEnd: false })}
        <div className="min-h-8 flex-1 border-l border-border" />
      </div>
    );
  };

  const renderConditionMerge = (node: IWorkflowNode, visited: Set<string>, showEnd: boolean) => {
    const nextEdge = getNodeDefaultEdge(node.id, edges);
    const nextNode = nextEdge ? nodeById.get(nextEdge.target) : undefined;

    return (
      <>
        <div className="relative h-16" style={{ width: CONDITION_LAYOUT_WIDTH }}>
          <div
            className="absolute top-0 h-px bg-border"
            style={{
              left: CONDITION_BRANCH_CENTER_LEFT,
              width: CONDITION_BRANCH_CENTER_RIGHT - CONDITION_BRANCH_CENTER_LEFT,
            }}
          />
          <div className="absolute left-1/2 top-0 h-5 w-px bg-border" />
          <div className="absolute left-1/2 top-5 -translate-x-1/2">
            <AddNodePopover onSelect={(item) => addNode(item, node.id)} />
          </div>
          <div className="absolute left-1/2 top-10 h-6 w-px bg-border" />
        </div>
        {nextNode ? (
          renderNodeFlow(nextNode, visited, { showEnd })
        ) : showEnd ? (
          renderEndMarker()
        ) : (
          <div className="h-6" />
        )}
      </>
    );
  };

  const renderNodeFlow = (
    node: IWorkflowNode,
    visited = new Set<string>(),
    options: { showEnd?: boolean } = {}
  ): ReactNode => {
    if (visited.has(node.id)) {
      return (
        <div className="rounded-md border border-dashed bg-background px-4 py-3 text-xs text-muted-foreground">
          {tr('canvas.referencedNode', 'Referenced node {{node}}', {
            node: getNodeLabel(node, tr),
          })}
        </div>
      );
    }

    const nextVisited = new Set(visited);
    nextVisited.add(node.id);
    const index = graphNodeIndexMap.get(node.id) ?? 0;
    const showEnd = options.showEnd ?? true;

    if (node.type === 'condition') {
      return (
        <div className="flex flex-col items-center">
          <div
            className="relative flex flex-col items-center"
            style={{ width: CONDITION_LAYOUT_WIDTH }}
          >
            <div
              className="relative flex w-full items-start justify-center"
              style={{ height: CONDITION_NODE_ROW_HEIGHT }}
            >
              {renderWorkflowNode(node, index)}
              <div
                className="absolute h-px bg-border"
                style={{
                  top: CONDITION_NODE_CENTER_Y,
                  left: CONDITION_BRANCH_CENTER_LEFT,
                  width: CONDITION_NODE_LEFT_X - CONDITION_BRANCH_CENTER_LEFT,
                }}
              />
              <div
                className="absolute h-px bg-border"
                style={{
                  top: CONDITION_NODE_CENTER_Y,
                  left: CONDITION_NODE_RIGHT_X,
                  width: CONDITION_BRANCH_CENTER_RIGHT - CONDITION_NODE_RIGHT_X,
                }}
              />
              <div
                className="absolute w-px bg-border"
                style={{
                  top: CONDITION_NODE_CENTER_Y,
                  left: CONDITION_BRANCH_CENTER_LEFT,
                  height: CONDITION_BRANCH_LINE_HEIGHT,
                }}
              />
              <div
                className="absolute w-px bg-border"
                style={{
                  top: CONDITION_NODE_CENTER_Y,
                  left: CONDITION_BRANCH_CENTER_RIGHT,
                  height: CONDITION_BRANCH_LINE_HEIGHT,
                }}
              />
              <div
                className="absolute -translate-y-1/2 select-none rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground"
                style={{ top: CONDITION_NODE_CENTER_Y, left: CONDITION_NODE_LEFT_X - 54 }}
              >
                {tr('conditions.trueBranch', 'Matches')}
              </div>
              <div
                className="absolute -translate-y-1/2 select-none rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground"
                style={{ top: CONDITION_NODE_CENTER_Y, left: CONDITION_NODE_RIGHT_X + 10 }}
              >
                {tr('conditions.falseBranch', 'Does not match')}
              </div>
            </div>
            <div
              className="grid items-stretch"
              style={{
                gap: CONDITION_BRANCH_GAP,
                gridTemplateColumns: `${CONDITION_BRANCH_WIDTH}px ${CONDITION_BRANCH_WIDTH}px`,
              }}
            >
              {renderConditionBranch(node, CONDITION_TRUE_HANDLE, nextVisited)}
              {renderConditionBranch(node, CONDITION_FALSE_HANDLE, nextVisited)}
            </div>
          </div>
          {renderConditionMerge(node, nextVisited, showEnd)}
        </div>
      );
    }

    const nextEdge = getNodeDefaultEdge(node.id, edges);
    const nextNode = nextEdge ? nodeById.get(nextEdge.target) : undefined;
    return (
      <div className="flex flex-col items-center">
        {renderWorkflowNode(node, index)}
        {renderNodeConnector(node)}
        {nextNode
          ? renderNodeFlow(nextNode, nextVisited, { showEnd })
          : showEnd && renderEndMarker()}
      </div>
    );
  };

  const changeZoom = (delta: number) => {
    setViewport((current) => ({ ...current, scale: clampZoom(current.scale + delta) }));
  };

  const resetViewport = () => {
    setViewport({ x: 0, y: 0, scale: 1 });
  };

  const handleCanvasPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button,input,textarea,a,[role="combobox"],[data-no-pan="true"]')) return;
    panStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: viewport.x,
      startY: viewport.y,
    };
    setIsPanning(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some synthetic pointer events do not have an active pointer to capture.
    }
  };

  const handleCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setViewport((current) => ({
      ...current,
      x: start.startX + event.clientX - start.x,
      y: start.startY + event.clientY - start.y,
    }));
  };

  const handleCanvasPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (panStartRef.current?.pointerId === event.pointerId) {
      panStartRef.current = null;
      setIsPanning(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>) => {
    changeZoom(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  };

  const renderCanvas = () => {
    if (isLoading) {
      return (
        <div className="flex min-h-full items-center justify-center text-sm text-muted-foreground">
          {tr('states.loading', 'Loading...')}
        </div>
      );
    }

    const trigger = nodes.find((node) => node.category === 'trigger');
    if (!trigger) {
      return <div className="flex items-start justify-center pt-10">{renderTriggerPicker()}</div>;
    }

    return <div className="flex justify-center px-8 py-10">{renderNodeFlow(trigger)}</div>;
  };

  const isActive = Boolean((workflow as IWorkflowVo | undefined)?.isActive);
  const hasUnpublishedChanges = Boolean(isActive && workflowSignature !== activeRuntimeSignature);
  const activeCheck = checkCanActive();
  const canActive = activeCheck.canActive;
  const canRunTest = workflowValidation.canRun;
  const activeSwitchDisabled = activeMutation.isPending || (!isActive && !canActive);
  const activeDisabledReason = activeMutation.isPending
    ? tr('states.updatingAutomationStatus', 'Updating automation status')
    : !isActive && !canActive
      ? activeCheck.message
      : '';
  const allRuns = runList?.runs ?? [];
  const runs = allRuns;
  const runStats = {
    success: runSummary?.success ?? 0,
    failed: runSummary?.failed ?? 0,
    running: runSummary?.running ?? 0,
    waiting: runSummary?.waiting ?? 0,
    skipped: runSummary?.skipped ?? 0,
  };
  const averageRunDuration = runSummary?.averageDuration;
  const hasRunHistory = Boolean(runSummary?.rowCount ?? runList?.rowCount ?? 0);
  const averageRunDurationText = formatDuration(averageRunDuration);
  const [averageRunDurationAmount, averageRunDurationUnit] = averageRunDurationText.split(' ');
  const runStatusFilterLabel =
    getLabelOptionText(
      RUN_STATUS_FILTERS.find((item) => item.value === runStatusFilter) ?? RUN_STATUS_FILTERS[0],
      tr
    ) || tr('runStatusFilter.status', 'Status');
  const runDurationFilterLabel =
    getLabelOptionText(
      RUN_DURATION_FILTERS.find((item) => item.value === runDurationFilter) ??
        RUN_DURATION_FILTERS[0],
      tr
    ) || tr('runDurationFilter.duration', 'Duration');

  return (
    <div className="flex size-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        {headLeft}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Switch
                  checked={isActive}
                  disabled={activeSwitchDisabled}
                  onCheckedChange={handleActiveToggle}
                />
              </span>
            </TooltipTrigger>
            {activeDisabledReason && <TooltipContent>{activeDisabledReason}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
        <Input
          ref={workflowNameInputRef}
          className="h-8 max-w-72 border-0 px-1 text-base font-medium shadow-none focus-visible:ring-0"
          value={workflowName}
          placeholder={t('noun.automation')}
          onChange={(e) => setWorkflowName(e.target.value)}
        />
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={!canRunTest || isSaving || testMutation.isPending}
          onClick={handleTest}
        >
          <Play className="size-4" />
          {tr('actions.runTest', 'Run test')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setIsRunHistoryOpen(true);
            if (isRunHistoryOpen) {
              void refetchRuns();
              void refetchRunSummary();
            }
          }}
        >
          {tr('actions.runHistory', 'Run history')}
        </Button>
        <BaseNodeMore
          resourceType={BaseNodeResourceType.Workflow}
          resourceId={workflowId}
          contentAlign="end"
          onRename={() => {
            workflowNameInputRef.current?.focus();
            workflowNameInputRef.current?.select();
          }}
        >
          <Button size="icon-sm" variant="ghost" aria-label={tr('actions.more', 'More')}>
            <MoreHorizontal className="size-4" />
          </Button>
        </BaseNodeMore>
      </div>

      {hasUnpublishedChanges && (
        <div className="relative z-10 border-b bg-background px-3 py-2">
          <div className="flex min-h-10 items-center gap-2 rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow-sm dark:bg-amber-950/40 dark:text-amber-100">
            <TriangleAlert className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {tr(
                'publish.unpublishedChanges',
                'You have unpublished changes that need to be applied to the live automation. Click Update to apply them.'
              )}
            </span>
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={activeMutation.isPending || isSaving}
              onClick={handleDiscardDraft}
            >
              {tr('actions.reset', 'Reset')}
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={activeMutation.isPending || isSaving || !canActive}
              title={!canActive ? activeCheck.message : undefined}
              onClick={handlePublish}
            >
              {tr('actions.update', 'Update')}
            </Button>
          </div>
        </div>
      )}

      {canActive && !isActive && (
        <div className="relative z-10 border-b bg-background px-3 py-2">
          <div className="relative flex min-h-10 items-center gap-2 rounded-md border border-blue-600 bg-blue-50 px-3 py-2 text-sm text-blue-950 shadow-sm dark:bg-blue-950/40 dark:text-blue-100">
            <span className="absolute -top-[5px] left-5 size-2 rotate-45 border-l border-t border-blue-600 bg-blue-50 dark:bg-blue-950" />
            <Bell className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {tr(
                'publish.readyButInactive',
                'This automation flow is configured but not enabled. It will take effect after being enabled.'
              )}
            </span>
            <Button size="sm" disabled={activeMutation.isPending} onClick={handleActivate}>
              {tr('actions.enableNow', 'Enable now')}
            </Button>
          </div>
        </div>
      )}

      <Sheet open={isRunHistoryOpen} onOpenChange={setIsRunHistoryOpen}>
        <SheetContent side="right" className="flex w-[400px] max-w-full flex-col gap-0 p-0">
          <div className="border-b p-4">
            <SheetTitle>{tr('runHistory.title', 'Run history')}</SheetTitle>
            <SheetDescription className="sr-only">
              {tr('runHistory.description', 'The latest 100 automation run records.')}
            </SheetDescription>
          </div>
          <div className="space-y-3 p-3">
            {isActive && (
              <div className="rounded-md border border-blue-700 bg-blue-50 p-3 text-sm text-blue-950 dark:bg-blue-950/40 dark:text-blue-100">
                {tr(
                  'runHistory.notificationOwner',
                  'Notifications for automation {{workflowName}} are currently being sent to {{userName}}, the person who last updated this automation.',
                  { workflowName: savedWorkflowName, userName: lastModifiedUserName }
                )}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="xs" variant="ghost" className="h-7 gap-1 px-2">
                    {runStatusFilterLabel}
                    <ChevronDown className="size-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-36 p-1">
                  {RUN_STATUS_FILTERS.map((item) => (
                    <button
                      key={item.value}
                      className={cn(
                        'flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-accent',
                        runStatusFilter === item.value && 'bg-accent'
                      )}
                      type="button"
                      onClick={() => setRunStatusFilter(item.value)}
                    >
                      {getLabelOptionText(item, tr)}
                      {runStatusFilter === item.value && <Check className="size-4" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="xs" variant="ghost" className="h-7 gap-1 px-2">
                    {runDurationFilterLabel}
                    <ChevronDown className="size-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-44 p-1">
                  {RUN_DURATION_FILTERS.map((item) => (
                    <button
                      key={item.value}
                      className={cn(
                        'flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-accent',
                        runDurationFilter === item.value && 'bg-accent'
                      )}
                      type="button"
                      onClick={() => setRunDurationFilter(item.value)}
                    >
                      {getLabelOptionText(item, tr)}
                      {runDurationFilter === item.value && <Check className="size-4" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <div className="relative min-w-0 flex-1">
                <DateRangePicker
                  className="h-7 w-full text-xs"
                  placeholder={tr('runHistory.dateRangePlaceholder', 'Select date range')}
                  options={{
                    formatting: {
                      date: DateFormattingPreset.ISO,
                      time: TimeFormatting.Hour24,
                      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone as ITimeZoneString,
                    },
                  }}
                  value={runDateRange}
                  onChange={setRunDateRange}
                />
                {runDateRange && (
                  <Button
                    className="absolute right-1 top-1/2 size-5 -translate-y-1/2 p-0"
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                    onClick={() => setRunDateRange(null)}
                  >
                    <X className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {hasRunHistory ? (
            <>
              <ScrollArea className="min-h-0 flex-1 px-3">
                {runs.length ? (
                  <div className="divide-y pb-3">
                    {runs.map((run) => {
                      const isExpanded = expandedRunId === run.id;
                      const duration = getRunDuration(run);
                      const statusMeta = getRunStatusMeta(run.status, tr);
                      return (
                        <div key={run.id}>
                          <button
                            className="flex w-full items-center gap-2 rounded-none px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => setExpandedRunId(isExpanded ? undefined : run.id)}
                          >
                            <TeableChevronRight
                              className={cn('size-4 shrink-0 transition-transform', {
                                'rotate-90': isExpanded,
                              })}
                            />
                            <span className="w-14 text-xs">{formatDuration(duration)}</span>
                            <span
                              className={cn(
                                'flex min-w-0 flex-1 items-center gap-2 text-[13px]',
                                statusMeta.className
                              )}
                            >
                              <statusMeta.Icon className="size-4 shrink-0" />
                              {statusMeta.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(run.startedTime)}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="border-t">
                              {run.steps?.map((step, index) => {
                                const stepNode = nodeById.get(step.nodeId);
                                const stepPanelId = `${run.id}-${step.nodeId}-${index}`;
                                return (
                                  <WorkflowRunStepDetail
                                    key={stepPanelId}
                                    baseId={baseId}
                                    fields={workflowFields}
                                    node={stepNode}
                                    runStartedTime={run.startedTime}
                                    step={step}
                                    tables={knownTables}
                                  />
                                );
                              })}
                              {run.error && (
                                <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                                  {run.error}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-12 items-center justify-center">
                    <span className="text-xs text-primary/60">
                      {tr(
                        'runHistory.empty',
                        'Run history records will appear here after the automation flow runs.'
                      )}
                    </span>
                  </div>
                )}
              </ScrollArea>
              <Collapsible
                className="shrink-0 border-t"
                open={isRunOverviewOpen}
                onOpenChange={setIsRunOverviewOpen}
              >
                <CollapsibleTrigger asChild>
                  <button
                    className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/50"
                    type="button"
                  >
                    <span>{tr('runHistory.overview', 'Overview')}</span>
                    {isRunOverviewOpen ? (
                      <ChevronUp className="size-4 text-slate-400 dark:text-slate-500" />
                    ) : (
                      <ChevronDown className="size-4 text-slate-400 dark:text-slate-500" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mx-2 mb-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        {
                          label: tr('runStatus.success', 'Run succeeded'),
                          filterValue: 'success',
                          value: runStats.success,
                          Icon: Check,
                          className:
                            'border-green-200/70 bg-green-50/70 hover:border-green-300/80 hover:bg-green-100/80 dark:border-green-800/60 dark:bg-green-950/35 dark:hover:border-green-700/70 dark:hover:bg-green-950/55',
                          selectedClassName:
                            'border-green-300 bg-green-100 shadow-sm ring-1 ring-inset ring-green-300/70 dark:border-green-700/80 dark:bg-green-950/70 dark:ring-green-700/60',
                          iconClassName: 'text-green-600 dark:text-green-300',
                          valueClassName: 'text-green-600 dark:text-green-300',
                        },
                        {
                          label: tr('runStatus.failed', 'Run failed'),
                          filterValue: 'failed',
                          value: runStats.failed,
                          Icon: X,
                          className:
                            'border-red-200/70 bg-red-50/70 hover:border-red-300/80 hover:bg-red-100/80 dark:border-red-800/60 dark:bg-red-950/35 dark:hover:border-red-700/70 dark:hover:bg-red-950/55',
                          selectedClassName:
                            'border-red-300 bg-red-100 shadow-sm ring-1 ring-inset ring-red-300/70 dark:border-red-700/80 dark:bg-red-950/70 dark:ring-red-700/60',
                          iconClassName: 'text-red-600 dark:text-red-300',
                          valueClassName: 'text-red-600 dark:text-red-300',
                        },
                        {
                          label: tr('runStatus.running', 'Running'),
                          filterValue: 'running',
                          value: runStats.running,
                          Icon: ArrowDownUp,
                          className:
                            'border-amber-200/80 bg-amber-50/80 hover:border-amber-300/80 hover:bg-amber-100/80 dark:border-amber-800/60 dark:bg-amber-950/30 dark:hover:border-amber-700/70 dark:hover:bg-amber-950/50',
                          selectedClassName:
                            'border-amber-300 bg-amber-100 shadow-sm ring-1 ring-inset ring-amber-300/80 dark:border-amber-700/80 dark:bg-amber-950/65 dark:ring-amber-700/70',
                          iconClassName: 'text-amber-600 dark:text-amber-300',
                          valueClassName: 'text-amber-600 dark:text-amber-300',
                        },
                        {
                          label: tr('runStatus.waiting', 'Waiting'),
                          filterValue: 'waiting',
                          value: runStats.waiting,
                          Icon: Clock,
                          className:
                            'border-sky-200/80 bg-sky-50/80 hover:border-sky-300/80 hover:bg-sky-100/80 dark:border-sky-800/60 dark:bg-sky-950/30 dark:hover:border-sky-700/70 dark:hover:bg-sky-950/50',
                          selectedClassName:
                            'border-sky-300 bg-sky-100 shadow-sm ring-1 ring-inset ring-sky-300/80 dark:border-sky-700/80 dark:bg-sky-950/65 dark:ring-sky-700/70',
                          iconClassName: 'text-sky-600 dark:text-sky-300',
                          valueClassName: 'text-sky-600 dark:text-sky-300',
                        },
                        {
                          label: tr('runStatus.skipped', 'Canceled'),
                          filterValue: 'skipped',
                          value: runStats.skipped,
                          Icon: CircleMinus,
                          className:
                            'border-zinc-200/80 bg-zinc-50/80 hover:border-zinc-300/80 hover:bg-zinc-100/80 dark:border-zinc-700/70 dark:bg-zinc-900/50 dark:hover:border-zinc-600/70 dark:hover:bg-zinc-900/70',
                          selectedClassName:
                            'border-zinc-300 bg-zinc-100 shadow-sm ring-1 ring-inset ring-zinc-300/80 dark:border-zinc-600/80 dark:bg-zinc-900/75 dark:ring-zinc-600/70',
                          iconClassName: 'text-zinc-600 dark:text-zinc-300',
                          valueClassName: 'text-zinc-600 dark:text-zinc-300',
                        },
                      ].map((item) => (
                        <button
                          key={item.label}
                          className={cn(
                            'inline-flex whitespace-nowrap text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 gap-2 hover:text-accent-foreground group relative h-[72px] flex-col items-start justify-between rounded-lg border px-2.5 py-2 text-left transition-all duration-200',
                            runStatusFilter === item.filterValue
                              ? cn('hover:bg-accent dark:hover:bg-white/10', item.selectedClassName)
                              : cn('hover:shadow-[0_0_0_1px_rgba(15,23,42,0.03)]', item.className)
                          )}
                          onClick={() => setRunStatusFilter(item.filterValue)}
                          type="button"
                        >
                          <item.Icon
                            className={cn(
                              'absolute right-2.5 top-2.5 size-3 opacity-60 transition-opacity duration-200 group-hover:opacity-90',
                              item.iconClassName
                            )}
                          />
                          <span
                            className={cn(
                              'text-2xl font-semibold leading-none tabular-nums',
                              runStatusFilter === item.filterValue
                                ? item.valueClassName
                                : 'text-slate-700 dark:text-slate-100'
                            )}
                          >
                            {item.value}
                          </span>
                          <span
                            className="line-clamp-1 text-xs font-medium text-slate-500 dark:text-slate-300"
                            title={item.label}
                          >
                            {item.label}
                          </span>
                        </button>
                      ))}
                      <div className="relative flex h-[72px] flex-col justify-between rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-2 dark:border-slate-700/70 dark:bg-slate-900/50">
                        <Clock className="absolute right-2.5 top-2.5 size-3 text-slate-500 opacity-70 dark:text-slate-300" />
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-semibold leading-none tabular-nums text-slate-700 dark:text-slate-100">
                            {averageRunDurationAmount}
                          </span>
                          {averageRunDurationUnit && (
                            <span className="text-xs font-medium text-slate-400 dark:text-slate-400">
                              {averageRunDurationUnit}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-300">
                          {tr('runHistory.averageRunTime', 'Average run time')}
                        </span>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <span className="text-xs text-primary/60">
                {tr(
                  'runHistory.empty',
                  'Run history records will appear here after the automation flow runs.'
                )}
              </span>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 flex-1">
        <main
          className={cn(
            'relative min-w-0 flex-1 overflow-hidden bg-muted/20',
            isPanning ? 'cursor-grabbing' : 'cursor-grab'
          )}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerEnd}
          onPointerCancel={handleCanvasPointerEnd}
          onWheel={handleCanvasWheel}
        >
          <div
            className="absolute inset-0 bg-[radial-gradient(circle,_hsl(var(--muted-foreground)/0.24)_1px,_transparent_1px)]"
            style={{
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
              backgroundSize: `${20 * viewport.scale}px ${20 * viewport.scale}px`,
            }}
          />
          <div
            className="absolute left-1/2 top-0 origin-top"
            style={{
              transform: `translate(calc(-50% + ${viewport.x}px), ${viewport.y}px) scale(${viewport.scale})`,
            }}
          >
            {renderCanvas()}
          </div>
          <div
            className="absolute bottom-4 left-4 flex items-center gap-1 rounded-md border bg-background p-1 shadow-sm"
            data-no-pan="true"
          >
            <Button size="icon-xs" variant="ghost" onClick={() => changeZoom(-ZOOM_STEP)}>
              <Minus className="size-4" />
            </Button>
            <div className="w-12 text-center text-xs text-muted-foreground">
              {Math.round(viewport.scale * 100)}%
            </div>
            <Button size="icon-xs" variant="ghost" onClick={() => changeZoom(ZOOM_STEP)}>
              <Plus className="size-4" />
            </Button>
            <Separator className="mx-1 h-5" orientation="vertical" />
            <Button size="sm" variant="ghost" onClick={resetViewport}>
              <RefreshCw className="size-4" />
              {tr('actions.resetViewport', 'Reset')}
            </Button>
          </div>
        </main>

        {selectedNode && (
          <aside className="flex w-[420px] shrink-0 flex-col border-l">
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="text-sm font-medium">{tr('sections.properties', 'Properties')}</div>
                <Button
                  className="h-6 min-w-0 max-w-[300px] gap-1 truncate px-2 text-xs font-normal"
                  size="xs"
                  variant="secondary"
                  title={tr('actions.copyNodeId', 'Click to copy node ID')}
                  onClick={() => copyNodeId(selectedNode.id)}
                >
                  <Copy className="size-3 shrink-0" />
                  ID: {selectedNode.id}
                </Button>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="icon-xs"
                  title={tr('actions.deleteNode', 'Delete node')}
                  variant="ghost"
                  onClick={deleteSelectedNode}
                >
                  <Trash2 className="size-4" />
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => setSelectedNodeId(undefined)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="box-border w-[419px] max-w-full space-y-4 p-3">
                {renderNodeConfig()}
              </div>
            </ScrollArea>
          </aside>
        )}
      </div>
    </div>
  );
});

WorkFlowPanel.displayName = 'WorkFlowPanel';

export { WorkFlowPanel };
