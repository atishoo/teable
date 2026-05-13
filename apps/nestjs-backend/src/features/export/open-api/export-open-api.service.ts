import { Readable } from 'stream';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { IAttachmentCellValue, IFieldVo, IRecord } from '@teable/core';
import { FieldType, HttpErrorCode, ViewType } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import { ExportTableFormat, type IExportCsvRo } from '@teable/openapi';
import type { Response } from 'express';
import { keyBy, sortBy } from 'lodash';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { CustomHttpException } from '../../../custom.exception';
import { FieldService } from '../../field/field.service';
import { createFieldInstanceByVo } from '../../field/model/factory';
import { RecordService } from '../../record/record.service';
import { ExportMetricsService } from '../metrics/export-metrics.service';
import { ExportTracingService } from '../metrics/export-tracing.service';

const xlsxMaxRows = 1048576;

type IHeaderInfo = {
  index: number;
  type: FieldType;
  fieldInstance: ReturnType<typeof createFieldInstanceByVo>;
};

type IExportContext = {
  fileName: string;
  sheetName: string;
  viewIdForQuery?: string;
  headers: IFieldVo[];
  headersInfoMap: Map<string, IHeaderInfo>;
  projectionNames?: string[];
  queryFilter?: IExportCsvRo['filter'];
  queryOrderBy?: IExportCsvRo['orderBy'];
  queryGroupBy?: IExportCsvRo['groupBy'];
  ignoreViewQuery?: boolean;
};

@Injectable()
export class ExportOpenApiService {
  private logger = new Logger(ExportOpenApiService.name);
  constructor(
    private readonly fieldService: FieldService,
    private readonly recordService: RecordService,
    private readonly prismaService: PrismaService,
    @Optional() private readonly exportMetrics?: ExportMetricsService,
    @Optional() private readonly exportTracing?: ExportTracingService
  ) {}
  async exportCsvFromTable(response: Response, tableId: string, query?: IExportCsvRo) {
    if (query?.format === ExportTableFormat.Xlsx) {
      return await this.exportXlsxFromTable(response, tableId, query);
    }

    const exportStartTime = Date.now();
    this.exportMetrics?.recordExportStart('csv');
    const context = await this.createExportContext(tableId, query, 'ExportCsv');
    let count = 0;
    let isOver = false;
    const csvStream = new Readable({
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      read() {},
    });

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename=${context.fileName}.csv`);

    csvStream.pipe(response);

    const headerData = Papa.unparse([context.headers.map((h) => h.name)]);

    // add BOM to make sure the csv file can be opened correctly in excel
    csvStream.push('\uFEFF');
    csvStream.push(headerData);

    try {
      while (!isOver) {
        const { records } = await this.recordService.getRecords(
          tableId,
          {
            take: 1000,
            skip: count,
            viewId: context.viewIdForQuery,
            filter: context.queryFilter,
            orderBy: context.queryOrderBy,
            groupBy: context.queryGroupBy,
            ignoreViewQuery: context.ignoreViewQuery,
            projection: context.projectionNames,
          },
          true
        );

        if (records.length === 0) {
          isOver = true;
          // end the stream
          csvStream.push(null);
          this.exportTracing?.setExportAttributes({ rows: count });
          this.exportMetrics?.recordExportComplete({
            format: 'csv',
            durationMs: Date.now() - exportStartTime,
          });
          break;
        }

        const csvData = Papa.unparse(records.map((r) => this.recordToRow(r, context)));

        csvStream.push('\r\n');
        csvStream.push(csvData);
        count += records.length;
      }
    } catch (e) {
      csvStream.push('\r\n');
      csvStream.push(`Export fail reason:, ${(e as Error)?.message}`);
      this.logger.error((e as Error)?.message, `ExportCsv: ${tableId}`);
      this.exportMetrics?.recordExportError({
        format: 'csv',
        errorType: (e as Error)?.name ?? 'unknown',
      });
    }
  }

  private async exportXlsxFromTable(response: Response, tableId: string, query?: IExportCsvRo) {
    const exportStartTime = Date.now();
    this.exportMetrics?.recordExportStart(ExportTableFormat.Xlsx);

    try {
      const context = await this.createExportContext(tableId, query, 'ExportXlsx');
      const rows: unknown[][] = [context.headers.map((h) => h.name)];
      let count = 0;
      let isOver = false;

      while (!isOver) {
        const { records } = await this.recordService.getRecords(
          tableId,
          {
            take: 1000,
            skip: count,
            viewId: context.viewIdForQuery,
            filter: context.queryFilter,
            orderBy: context.queryOrderBy,
            groupBy: context.queryGroupBy,
            ignoreViewQuery: context.ignoreViewQuery,
            projection: context.projectionNames,
          },
          true
        );

        if (records.length === 0) {
          isOver = true;
          break;
        }

        if (rows.length + records.length > xlsxMaxRows) {
          throw new CustomHttpException(
            'XLSX export exceeds Excel row limit',
            HttpErrorCode.VALIDATION_ERROR
          );
        }

        rows.push(...records.map((record) => this.recordToRow(record, context)));
        count += records.length;
      }

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, context.sheetName);
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;

      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      response.setHeader('Content-Disposition', `attachment; filename=${context.fileName}.xlsx`);
      response.end(buffer);

      this.exportTracing?.setExportAttributes({ rows: count });
      this.exportMetrics?.recordExportComplete({
        format: ExportTableFormat.Xlsx,
        durationMs: Date.now() - exportStartTime,
      });
    } catch (e) {
      this.logger.error((e as Error)?.message, `ExportXlsx: ${tableId}`);
      this.exportMetrics?.recordExportError({
        format: ExportTableFormat.Xlsx,
        errorType: (e as Error)?.name ?? 'unknown',
      });
      throw e;
    }
  }

  private async createExportContext(
    tableId: string,
    query: IExportCsvRo | undefined,
    logPrefix: string
  ): Promise<IExportContext> {
    const {
      viewId,
      filter: queryFilter,
      orderBy: queryOrderBy,
      groupBy: queryGroupBy,
      projection,
      ignoreViewQuery,
      columnMeta: queryColumnMeta,
    } = query ?? {};
    let viewRaw: { id: string; type: string; name: string } | null = null;

    const tableRaw = await this.prismaService.tableMeta
      .findUnique({
        where: { id: tableId, deletedTime: null },
        select: { name: true },
      })
      .catch(() => null);

    if (!tableRaw) {
      throw new CustomHttpException('Table not found', HttpErrorCode.NOT_FOUND, {
        localization: {
          i18nKey: 'httpErrors.table.notFound',
        },
      });
    }

    if (viewId && !ignoreViewQuery) {
      viewRaw = await this.prismaService.view
        .findUnique({
          where: {
            id: viewId,
            tableId,
            deletedTime: null,
          },
          select: {
            id: true,
            type: true,
            name: true,
          },
        })
        .catch((e) => {
          this.logger.error(e?.message, `${logPrefix}: ${tableId}`);
          return null;
        });

      if (viewRaw?.type !== ViewType.Grid) {
        throw new CustomHttpException(
          `${viewRaw?.type} is not support to export`,
          HttpErrorCode.VALIDATION_ERROR,
          {
            localization: {
              i18nKey: 'httpErrors.export.notSupportViewType',
              context: {
                viewType: viewRaw?.type,
              },
            },
          }
        );
      }
    }

    const fileName = tableRaw.name
      ? encodeURIComponent(`${tableRaw.name}${viewRaw?.name ? `_${viewRaw.name}` : ''}`)
      : 'export';
    const viewIdForQuery = ignoreViewQuery ? undefined : viewRaw?.id;
    let allFields = await this.fieldService.getFieldsByQuery(tableId, {
      viewId: viewIdForQuery,
      filterHidden: Boolean(viewIdForQuery),
    });

    // Sort fields based on:
    // 1. If ignoreViewQuery is true and queryColumnMeta is provided, sort by queryColumnMeta order
    // 2. If viewId is provided (and ignoreViewQuery is false), getFieldsByQuery already sorted by view columnMeta
    // 3. Otherwise, keep table's original field order
    allFields = this.sortFieldsByColumnMeta(allFields, ignoreViewQuery, queryColumnMeta);

    const fieldsMap = keyBy(allFields, 'id');
    const headers = allFields.filter((field) => !projection || projection.includes(field.id));
    const projectionNames = projection
      ? (projection.map((p) => fieldsMap[p]?.name).filter((p) => Boolean(p)) as string[])
      : undefined;

    const headersInfoMap = new Map(
      headers.map((h, index) => [
        h.name,
        {
          index,
          type: h.type,
          fieldInstance: createFieldInstanceByVo(h),
        },
      ])
    );

    return {
      fileName,
      sheetName: this.getSheetName(viewRaw?.name || tableRaw.name || 'export'),
      viewIdForQuery,
      headers,
      headersInfoMap,
      projectionNames,
      queryFilter,
      queryOrderBy,
      queryGroupBy,
      ignoreViewQuery,
    };
  }

  private recordToRow(record: IRecord, context: IExportContext) {
    const recordsArr = Array.from<unknown>({ length: context.headers.length });
    for (const [key, value] of Object.entries(record.fields)) {
      const { index: hIndex, type, fieldInstance } = context.headersInfoMap.get(key) ?? {};
      if (hIndex !== undefined && type !== undefined) {
        const finalValue =
          type === FieldType.Attachment && Array.isArray(value)
            ? (value as IAttachmentCellValue).map((v) => `${v.name} ${v.presignedUrl}`).join(',')
            : fieldInstance?.cellValue2String(value);
        recordsArr[hIndex] = finalValue;
      }
    }
    return recordsArr;
  }

  private getSheetName(name: string) {
    return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1';
  }

  /**
   * Sort fields based on columnMeta order
   * @param fields - The fields to sort
   * @param ignoreViewQuery - Whether to ignore view query
   * @param queryColumnMeta - The columnMeta from query params for custom sorting
   * @returns Sorted fields
   */
  private sortFieldsByColumnMeta(
    fields: IFieldVo[],
    ignoreViewQuery?: boolean,
    queryColumnMeta?: Record<string, { order: number }>
  ): IFieldVo[] {
    // If ignoreViewQuery is true and queryColumnMeta is provided, sort by queryColumnMeta order
    if (ignoreViewQuery && queryColumnMeta) {
      return sortBy(fields, (field) => queryColumnMeta[field.id]?.order ?? Infinity);
    }
    // Otherwise, keep the order from getFieldsByQuery (either view columnMeta order or table original order)
    return fields;
  }
}
