import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import {
  closeTaxReportMonth,
  getMonthlyTaxReports,
  getTaxMonthCloseStatus
} from '../services/payments/taxReportService.js';

export const adminTaxReportsRouter = Router();

const yearMonthParam = z.string().regex(/^\d{4}-\d{2}$/, 'yearMonth must be YYYY-MM');

adminTaxReportsRouter.get(
  '/:yearMonth',
  asyncHandler(async (req, res) => {
    const parsed = yearMonthParam.safeParse(req.params.yearMonth);
    if (!parsed.success) {
      throw createValidationError(parsed.error.errors[0]?.message ?? 'Invalid yearMonth', 'yearMonth');
    }
    const [reports, closeStatus] = await Promise.all([
      getMonthlyTaxReports(parsed.data),
      getTaxMonthCloseStatus(parsed.data)
    ]);
    res.json({ ...reports, close: closeStatus });
  })
);

adminTaxReportsRouter.get(
  '/:yearMonth/gstr8',
  asyncHandler(async (req, res) => {
    const parsed = yearMonthParam.safeParse(req.params.yearMonth);
    if (!parsed.success) {
      throw createValidationError(parsed.error.errors[0]?.message ?? 'Invalid yearMonth', 'yearMonth');
    }
    const reports = await getMonthlyTaxReports(parsed.data);
    res.json(reports.gstr8);
  })
);

adminTaxReportsRouter.get(
  '/:yearMonth/tds194o',
  asyncHandler(async (req, res) => {
    const parsed = yearMonthParam.safeParse(req.params.yearMonth);
    if (!parsed.success) {
      throw createValidationError(parsed.error.errors[0]?.message ?? 'Invalid yearMonth', 'yearMonth');
    }
    const reports = await getMonthlyTaxReports(parsed.data);
    res.json(reports.tds194o);
  })
);

adminTaxReportsRouter.post(
  '/:yearMonth/close',
  asyncHandler(async (req, res) => {
    const parsed = yearMonthParam.safeParse(req.params.yearMonth);
    if (!parsed.success) {
      throw createValidationError(parsed.error.errors[0]?.message ?? 'Invalid yearMonth', 'yearMonth');
    }
    const closedBy = req.user?.userId ?? req.user?.id ?? req.user?.phoneNumber;
    const result = await closeTaxReportMonth(
      parsed.data,
      typeof closedBy === 'string' ? closedBy : undefined
    );
    res.status(result.alreadyClosed ? 200 : 201).json(result);
  })
);
