"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_DISTRIBUTOR_MARGIN_SENSITIVITY_RATES,
  DEFAULT_RETAILER_MARGIN_SENSITIVITY_RATES,
  DEFAULT_TRADE_SPEND_SENSITIVITY_RATES,
  computeSensitivityMatrix,
  computeSensitivityTable,
  type SensitivityBaseScenario,
  type SensitivityMetric,
} from "@/lib/pricing-engine";
import {
  formatMoney,
  formatPercent,
  pointsToRateString,
  rateToPointsString,
  tryDec,
} from "@/lib/scenario/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChartTooltipContent } from "./chart-tooltip";
import { EDITABLE_CLASSES, ModeButton } from "./inputs";

/**
 * Sensitivity analysis (PRD §33–36): one-variable tables with a chart, and
 * the two-variable scenario matrix. Every figure is recomputed from the full
 * model; custom ranges are editable (§35).
 */

type RateVariable = "tradeSpendRate" | "retailerMarginRate" | "distributorMarginRate";

const VARIABLE_META: Record<RateVariable, { label: string; defaults: readonly string[] }> = {
  tradeSpendRate: { label: "Trade spend", defaults: DEFAULT_TRADE_SPEND_SENSITIVITY_RATES },
  retailerMarginRate: {
    label: "Retailer margin",
    defaults: DEFAULT_RETAILER_MARGIN_SENSITIVITY_RATES,
  },
  distributorMarginRate: {
    label: "Distributor margin",
    defaults: DEFAULT_DISTRIBUTOR_MARGIN_SENSITIVITY_RATES,
  },
};

const defaultsAsPoints = (variable: RateVariable): string =>
  VARIABLE_META[variable].defaults.map((rate) => rateToPointsString(rate)).join(", ");

const parsePointsList = (points: string): string[] =>
  points
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => pointsToRateString(part))
    .filter((rate) => tryDec(rate) !== null);

export function SensitivityView({ base }: { base: SensitivityBaseScenario }) {
  const hasDistributor = base.distributor !== undefined;
  const hasCurrentSrp = base.currentSrpPerUnit !== undefined;

  const [variable, setVariable] = useState<RateVariable>("tradeSpendRate");
  const [pointsByVariable, setPointsByVariable] = useState<Record<RateVariable, string>>({
    tradeSpendRate: defaultsAsPoints("tradeSpendRate"),
    retailerMarginRate: defaultsAsPoints("retailerMarginRate"),
    distributorMarginRate: defaultsAsPoints("distributorMarginRate"),
  });
  const [rowVariable, setRowVariable] = useState<RateVariable>("tradeSpendRate");
  const [columnVariable, setColumnVariable] = useState<RateVariable>("retailerMarginRate");
  const [metric, setMetric] = useState<SensitivityMetric>("requiredSrp");

  const availableVariables = (Object.keys(VARIABLE_META) as RateVariable[]).filter(
    (key) => key !== "distributorMarginRate" || hasDistributor,
  );

  const table = useMemo(() => {
    const values = parsePointsList(pointsByVariable[variable]);
    if (values.length === 0) return null;
    return computeSensitivityTable(base, variable, values);
  }, [base, variable, pointsByVariable]);

  const chartData = useMemo(() => {
    if (!table) return [];
    return table.rows
      .filter((row) => row.requiredSrpPerUnit !== undefined)
      .map((row) => ({
        label: `${rateToPointsString(row.value.toString())}%`,
        requiredSrp: Number(row.requiredSrpPerUnit!.toFixed(4)),
        contributionMargin:
          row.contributionMarginAtCurrentSrp === undefined
            ? null
            : Number(row.contributionMarginAtCurrentSrp.times(100).toFixed(2)),
      }));
  }, [table]);

  const matrix = useMemo(() => {
    if (rowVariable === columnVariable) return null;
    if (metric === "contributionMarginAtCurrentSrp" && !hasCurrentSrp) return null;
    const rowValues = parsePointsList(pointsByVariable[rowVariable]);
    const columnValues = parsePointsList(pointsByVariable[columnVariable]);
    if (rowValues.length === 0 || columnValues.length === 0) return null;
    return computeSensitivityMatrix(base, rowVariable, rowValues, columnVariable, columnValues, metric);
  }, [base, rowVariable, columnVariable, metric, pointsByVariable, hasCurrentSrp]);

  const targetRate = tryDec(String(base.targetContributionRate));

  return (
    <div className="space-y-3">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">One-variable sensitivity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <div className="flex flex-wrap items-end gap-2">
            {availableVariables.map((key) => (
              <ModeButton key={key} selected={variable === key} onClick={() => setVariable(key)}>
                {VARIABLE_META[key].label}
              </ModeButton>
            ))}
            <label className="ml-auto flex min-w-56 flex-1 flex-col gap-1 sm:max-w-xs">
              <span className="text-[11px] text-muted-foreground">
                Test points (%, comma-separated)
              </span>
              <Input
                value={pointsByVariable[variable]}
                onChange={(event) =>
                  setPointsByVariable((previous) => ({ ...previous, [variable]: event.target.value }))
                }
                className={cn(EDITABLE_CLASSES, "h-8 font-mono text-xs tabular-nums")}
              />
            </label>
          </div>

          {table && chartData.length > 0 && (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={{ stroke: "var(--border)" }}
                  />
                  <YAxis
                    yAxisId="srp"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={{ stroke: "var(--border)" }}
                    tickFormatter={(value: number) => `$${value.toFixed(2)}`}
                    width={56}
                  />
                  <YAxis
                    yAxisId="cm"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={{ stroke: "var(--border)" }}
                    tickFormatter={(value: number) => `${value}%`}
                    width={44}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, dataKey) =>
                          dataKey === "requiredSrp"
                            ? `$${Number(value).toFixed(2)}`
                            : `${String(value)}%`
                        }
                      />
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
                    iconType="plainline"
                    iconSize={12}
                  />
                  <Line
                    yAxisId="srp"
                    type="monotone"
                    dataKey="requiredSrp"
                    name="Required SRP"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                  />
                  {hasCurrentSrp && (
                    <Line
                      yAxisId="cm"
                      type="monotone"
                      dataKey="contributionMargin"
                      name="CM @ current SRP"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {table && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">{VARIABLE_META[variable].label}</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Required invoice</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Required SRP</th>
                    {hasCurrentSrp && (
                      <>
                        <th className="py-1.5 pr-2 text-right font-medium">CM @ current</th>
                        <th className="py-1.5 text-right font-medium">Contribution $</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.value.toString()} className="border-b border-border/50">
                      <td className="py-1.5 pr-2 font-mono tabular-nums">
                        {formatPercent(row.value, 1)}
                      </td>
                      {row.infeasible ? (
                        <td colSpan={hasCurrentSrp ? 4 : 2} className="py-1.5 text-muted-foreground">
                          {row.infeasible}
                        </td>
                      ) : (
                        <>
                          <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                            {formatMoney(row.requiredBrandInvoicePerUnit!)}
                          </td>
                          <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                            {formatMoney(row.requiredSrpPerUnit!)}
                          </td>
                          {hasCurrentSrp && (
                            <>
                              <td
                                className={cn(
                                  "py-1.5 pr-2 text-right font-mono tabular-nums",
                                  cmTone(row.contributionMarginAtCurrentSrp, targetRate).text,
                                )}
                              >
                                {row.contributionMarginAtCurrentSrp
                                  ? formatPercent(row.contributionMarginAtCurrentSrp)
                                  : "—"}
                              </td>
                              <td className="py-1.5 text-right font-mono tabular-nums">
                                {row.contributionDollarsAtCurrentSrp
                                  ? formatMoney(row.contributionDollarsAtCurrentSrp)
                                  : "—"}
                              </td>
                            </>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Two-variable scenario matrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <MatrixSelect
              label="Rows"
              value={rowVariable}
              options={availableVariables}
              onChange={setRowVariable}
            />
            <MatrixSelect
              label="Columns"
              value={columnVariable}
              options={availableVariables}
              onChange={setColumnVariable}
            />
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Cell shows</span>
              <Select value={metric} onValueChange={(value) => value && setMetric(value as SensitivityMetric)}>
                <SelectTrigger size="sm" className={cn(EDITABLE_CLASSES, "w-44 text-xs")}>
                  <SelectValue>
                    {metric === "requiredSrp" ? "Required SRP" : "CM @ current SRP"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="requiredSrp">Required SRP</SelectItem>
                  <SelectItem value="contributionMarginAtCurrentSrp" disabled={!hasCurrentSrp}>
                    CM @ current SRP
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          {rowVariable === columnVariable ? (
            <p className="text-xs text-muted-foreground">Pick two different variables.</p>
          ) : matrix ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-1.5 pr-2 text-left font-medium">
                      {VARIABLE_META[rowVariable].label} ↓ · {VARIABLE_META[columnVariable].label} →
                    </th>
                    {matrix.cells[0].map((cell) => (
                      <th key={cell.columnValue.toString()} className="py-1.5 pl-2 text-right font-medium">
                        {formatPercent(cell.columnValue, 1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.cells.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border/50">
                      <td className="py-1.5 pr-2 font-mono tabular-nums text-muted-foreground">
                        {formatPercent(row[0].rowValue, 1)}
                      </td>
                      {row.map((cell, columnIndex) => (
                        <td
                          key={columnIndex}
                          className={cn(
                            "px-2 py-1.5 text-right font-mono tabular-nums",
                            cell.infeasible && "bg-muted/40 text-muted-foreground",
                            metric === "contributionMarginAtCurrentSrp" &&
                              !cell.infeasible &&
                              cn(
                                cmTone(cell.value, targetRate).text,
                                cmTone(cell.value, targetRate).bg,
                              ),
                          )}
                          title={cell.infeasible}
                          aria-label={cell.infeasible}
                        >
                          {cell.infeasible
                            ? "—"
                            : metric === "requiredSrp"
                              ? formatMoney(cell.value!)
                              : formatPercent(cell.value!)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Set valid test points for both variables to build the matrix.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** CM tone vs the contribution target: text tint + soft heatmap fill. */
function cmTone(
  value: import("decimal.js").default | undefined,
  target: import("decimal.js").default | null,
): { text: string; bg: string } {
  if (!value) return { text: "", bg: "" };
  if (value.lessThan(0)) return { text: "text-negative", bg: "bg-negative-soft" };
  if (target && value.lessThan(target)) return { text: "text-warning", bg: "bg-warning-soft" };
  return { text: "text-positive", bg: "bg-positive-soft" };
}

function MatrixSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: RateVariable;
  options: RateVariable[];
  onChange: (value: RateVariable) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(next) => next && onChange(next as RateVariable)}>
        <SelectTrigger size="sm" className={cn(EDITABLE_CLASSES, "w-40 text-xs")}>
          <SelectValue>{VARIABLE_META[value].label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {VARIABLE_META[option].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
