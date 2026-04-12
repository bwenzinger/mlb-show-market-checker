import {
  memo,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Box,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";

import {
  DEFAULT_TIMELINE_WINDOW_MS,
  formatDateTime,
  formatStubs,
  type OrderBucket,
  type OrderPoint,
  type PricePoint,
} from "../../marketUtils";

export const PriceChart = memo(function PriceChart({
  points,
}: {
  points: PricePoint[];
}) {
  if (points.length === 0) {
    return (
      <Typography color="text.secondary">No daily prices returned.</Typography>
    );
  }

  return (
    <LineChart
      points={points.map((point) => ({
        label: point.label,
        primary: point.sell,
        secondary: point.buy,
      }))}
      primaryLabel="Buy now"
      secondaryLabel="Sell now"
    />
  );
});

export const OrderChart = memo(function OrderChart({
  buckets,
}: {
  buckets: OrderBucket[];
}) {
  if (buckets.length === 0) {
    return (
      <Typography color="text.secondary">
        No completed orders returned.
      </Typography>
    );
  }

  return (
    <LineChart
      points={buckets.map((bucket) => ({
        label: bucket.label,
        primary: bucket.averagePrice,
        secondary: bucket.saleCount,
      }))}
      primaryLabel="Average"
      secondaryLabel="Sales"
    />
  );
});

export const CompletedOrderTimelineChart = memo(function CompletedOrderTimelineChart({
  orders,
}: {
  orders: OrderPoint[];
}) {
  const [visibleRange, setVisibleRange] = useState<[number, number] | null>(
    null,
  );
  const minTime = orders[0]?.date.getTime() ?? 0;
  const maxTime = orders[orders.length - 1]?.date.getTime() ?? 0;

  useEffect(() => {
    if (orders.length === 0) {
      setVisibleRange(null);
      return;
    }

    setVisibleRange([
      Math.max(minTime, maxTime - DEFAULT_TIMELINE_WINDOW_MS),
      maxTime,
    ]);
  }, [maxTime, minTime, orders.length]);

  const visibleOrders = useMemo(() => {
    if (!visibleRange) return orders;

    return orders.filter((order) => {
      const time = order.date.getTime();
      return time >= visibleRange[0] && time <= visibleRange[1];
    });
  }, [orders, visibleRange]);

  if (orders.length === 0) {
    return (
      <Typography color="text.secondary">
        No completed orders returned.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {visibleRange && maxTime > minTime ? (
        <Box sx={{ px: 1 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: { xs: "flex-start", sm: "baseline" }, mb: 0.5 }}
          >
            <Typography color="text.secondary" variant="body2">
              Showing {visibleOrders.length.toLocaleString("en-US")} of{" "}
              {orders.length.toLocaleString("en-US")} orders
            </Typography>
            <Typography color="text.secondary" variant="caption">
              {formatDateTime(new Date(visibleRange[0]))} to{" "}
              {formatDateTime(new Date(visibleRange[1]))}
            </Typography>
          </Stack>
          <Slider
            disableSwap
            max={maxTime}
            min={minTime}
            onChange={(_event, value) => {
              if (Array.isArray(value)) {
                setVisibleRange([value[0], value[1]]);
              }
            }}
            step={60 * 1000}
            value={visibleRange}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => formatDateTime(new Date(value))}
          />
        </Box>
      ) : null}

      <LineChart
        pointRadius={1.75}
        points={visibleOrders.map((order) => ({
          label: order.label,
          primary: order.price,
        }))}
        primaryLabel="Sale price"
      />
    </Stack>
  );
});

function LineChart({
  pointRadius = 3.5,
  points,
  primaryLabel,
  secondaryLabel,
}: {
  pointRadius?: number;
  points: Array<{
    label: string;
    primary: number | null;
    secondary?: number | null;
  }>;
  primaryLabel: string;
  secondaryLabel?: string;
}) {
  const width = 720;
  const height = 260;
  const padding = 28;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const primaryValues = points
    .map((point) => point.primary)
    .filter((value): value is number => value !== null);
  const secondaryValues = secondaryLabel
    ? points
        .map((point) => point.secondary)
        .filter((value): value is number => value !== null)
    : [];
  const allValues = [...primaryValues, ...secondaryValues];

  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex >= points.length) {
      setHoveredIndex(points.length > 0 ? points.length - 1 : null);
    }
  }, [hoveredIndex, points.length]);

  if (allValues.length === 0) {
    return <Typography color="text.secondary">No prices returned.</Typography>;
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const xFor = (index: number) =>
    padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const yFor = (value: number) =>
    height - padding - ((value - min) / range) * (height - padding * 2);
  const getColumnBounds = (index: number) => {
    const currentX = xFor(index);
    const leftX = index === 0 ? 0 : (xFor(index - 1) + currentX) / 2;
    const rightX =
      index === points.length - 1 ? width : (currentX + xFor(index + 1)) / 2;

    return {
      columnWidth: Math.max(rightX - leftX, 1),
      leftX,
    };
  };
  const showPointMarkers = points.length <= 1200;
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex];
  const hoveredColumn =
    hoveredIndex === null ? null : getColumnBounds(hoveredIndex);

  const pathFor = (key: "primary" | "secondary") => {
    let started = false;

    return points
      .map((point, index) => {
        const value = point[key];
        if (value === null || value === undefined) return null;

        const command = started ? "L" : "M";
        started = true;

        return `${command} ${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`;
      })
      .filter(Boolean)
      .join(" ");
  };

  const handleHoverMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (points.length === 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    const relativeX = ((event.clientX - rect.left) / rect.width) * width;
    const clampedX = Math.min(Math.max(relativeX, 0), width);
    const usableWidth = Math.max(width - padding * 2, 1);
    const ratio = (clampedX - padding) / usableWidth;
    const nextIndex = Math.min(
      Math.max(Math.round(ratio * Math.max(points.length - 1, 1)), 0),
      points.length - 1,
    );

    setHoveredIndex((currentIndex) =>
      currentIndex === nextIndex ? currentIndex : nextIndex,
    );
  };

  return (
    <Box>
      <Tooltip
        arrow
        disableInteractive
        enterTouchDelay={0}
        followCursor
        open={hoveredPoint !== null}
        title={
          hoveredPoint ? (
            <ChartTooltipContent
              label={hoveredPoint.label}
              primaryLabel={primaryLabel}
              primaryValue={hoveredPoint.primary}
              secondaryLabel={secondaryLabel}
              secondaryValue={hoveredPoint.secondary}
            />
          ) : (
            ""
          )
        }
      >
        <Box
          aria-label={
            hoveredPoint
              ? formatChartPointAriaLabel({
                  label: hoveredPoint.label,
                  primaryLabel,
                  primaryValue: hoveredPoint.primary,
                  secondaryLabel,
                  secondaryValue: hoveredPoint.secondary,
                })
              : undefined
          }
          onMouseLeave={() => setHoveredIndex(null)}
          onMouseMove={handleHoverMove}
          role="img"
          sx={{ cursor: "crosshair" }}
        >
          <Box
            component="svg"
            role="img"
            aria-label={
              secondaryLabel
                ? `${primaryLabel} and ${secondaryLabel} trend`
                : `${primaryLabel} trend`
            }
            viewBox={`0 0 ${width} ${height}`}
            sx={{
              display: "block",
              height: "auto",
              overflow: "visible",
              width: "100%",
            }}
          >
            <line
              x1={padding}
              x2={width - padding}
              y1={height - padding}
              y2={height - padding}
              stroke="rgba(255,255,255,0.2)"
            />
            <line
              x1={padding}
              x2={padding}
              y1={padding}
              y2={height - padding}
              stroke="rgba(255,255,255,0.2)"
            />
            {hoveredColumn ? (
              <rect
                fill="rgba(125, 211, 167, 0.08)"
                height={height}
                pointerEvents="none"
                width={hoveredColumn.columnWidth}
                x={hoveredColumn.leftX}
                y={0}
              />
            ) : null}
            <path
              d={pathFor("primary")}
              fill="none"
              stroke="#7dd3a7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            {secondaryLabel ? (
              <path
                d={pathFor("secondary")}
                fill="none"
                stroke="#f7c873"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
            ) : null}
            {points.map((point, index) => {
              const currentX = xFor(index);
              const primaryY =
                point.primary === null ? null : yFor(point.primary);
              const secondaryY =
                secondaryLabel &&
                point.secondary !== null &&
                point.secondary !== undefined
                  ? yFor(point.secondary)
                  : null;
              const shouldRenderMarker =
                showPointMarkers || hoveredIndex === index;
              if (
                !shouldRenderMarker ||
                (primaryY === null && secondaryY === null)
              ) {
                return null;
              }

              return (
                <g key={`${point.label}-${index}`} pointerEvents="none">
                  {primaryY !== null ? (
                    <circle
                      cx={currentX}
                      cy={primaryY}
                      fill="#7dd3a7"
                      r={hoveredIndex === index ? pointRadius + 1 : pointRadius}
                    />
                  ) : null}
                  {secondaryY !== null ? (
                    <circle
                      cx={currentX}
                      cy={secondaryY}
                      fill="#f7c873"
                      r={hoveredIndex === index ? pointRadius + 1 : pointRadius}
                    />
                  ) : null}
                </g>
              );
            })}
          </Box>
        </Box>
      </Tooltip>

      <Stack direction="row" spacing={1.75} sx={{ mt: 1 }}>
        <LegendItem color="#7dd3a7" label={primaryLabel} />
        {secondaryLabel ? (
          <LegendItem color="#f7c873" label={secondaryLabel} />
        ) : null}
      </Stack>
    </Box>
  );
}

function ChartTooltipContent({
  label,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
}: {
  label: string;
  primaryLabel: string;
  primaryValue: number | null;
  secondaryLabel?: string;
  secondaryValue?: number | null;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography fontWeight={900} variant="body2">
        {label}
      </Typography>
      <Typography variant="caption">
        {primaryLabel}: {formatStubs(primaryValue)}
      </Typography>
      {secondaryLabel ? (
        <Typography variant="caption">
          {secondaryLabel}: {formatStubs(secondaryValue ?? null)}
        </Typography>
      ) : null}
    </Stack>
  );
}

function formatChartPointAriaLabel({
  label,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
}: {
  label: string;
  primaryLabel: string;
  primaryValue: number | null;
  secondaryLabel?: string;
  secondaryValue?: number | null;
}): string {
  const primaryText = `${primaryLabel} ${formatStubs(primaryValue)}`;
  const secondaryText = secondaryLabel
    ? `, ${secondaryLabel} ${formatStubs(secondaryValue ?? null)}`
    : "";

  return `${label}: ${primaryText}${secondaryText}`;
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Box
        sx={{
          bgcolor: color,
          borderRadius: "50%",
          height: 12,
          width: 12,
        }}
      />
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
    </Stack>
  );
}
